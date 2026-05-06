import { basename, isAbsolute, resolve } from "node:path";
import { loadConfig, createHeartbeat, sendHeartbeat, syncOfflineQueue, createRateLimiter, createLogger, } from "@arcat/ziit-core";
const EDITOR_NAME = "OpenCode";
const MIN_SEND_INTERVAL_MS = 45_000;
const MAX_FILES_PER_EVENT = 20;
const IGNORED_DIRS = new Set([
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    ".next",
    ".turbo",
    ".idea",
    ".vscode",
    "dist",
    "build",
    "coverage",
    "target",
    "out",
    "tmp",
    "temp",
    ".cache",
]);
const PATH_HINT_KEYS = new Set([
    "file",
    "files",
    "filepath",
    "file_path",
    "path",
    "paths",
    "filename",
    "target",
    "source",
    "destination",
    "uri",
]);
const sessionState = new Map();
const log = createLogger("opencode");
// ────────────────────────────────────────────
// Helpers (OpenCode-specific path extraction)
// ────────────────────────────────────────────
function isObject(value) {
    return typeof value === "object" && value !== null;
}
function getString(value) {
    return typeof value === "string" ? value : null;
}
function coercePath(value) {
    const trimmed = value.trim().replace(/^['"`]+|['"`]+$/g, "");
    if (!trimmed)
        return "";
    if (trimmed.startsWith("file://")) {
        try {
            return decodeURIComponent(new URL(trimmed).pathname);
        }
        catch {
            return "";
        }
    }
    return trimmed;
}
function looksLikeFilePath(candidate) {
    if (!candidate ||
        candidate.startsWith("http://") ||
        candidate.startsWith("https://"))
        return false;
    if (candidate === "." || candidate === ".." || candidate === "/dev/null")
        return false;
    const name = basename(candidate).toLowerCase();
    if (name === "dockerfile" || name === "makefile")
        return true;
    return /[/.\\]/.test(candidate);
}
function normalizePath(candidate, cwd) {
    const pathValue = coercePath(candidate);
    if (!looksLikeFilePath(pathValue))
        return null;
    const absolute = isAbsolute(pathValue)
        ? resolve(pathValue)
        : resolve(cwd, pathValue);
    const parts = absolute.split(/[\\/]/).filter(Boolean);
    if (parts.some((part) => IGNORED_DIRS.has(part)))
        return null;
    return absolute;
}
function parsePatchPaths(text) {
    const matches = text.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm);
    const files = [];
    for (const match of matches) {
        const value = match[1]?.trim();
        if (value)
            files.push(value);
    }
    return files;
}
function parseInlinePaths(text) {
    const results = [];
    const regex = /(?:^|[\s("'`])((?:\.{1,2}\/|\/)?[^\s"'`(),:;]+\.[A-Za-z0-9]+)(?=$|[\s)"'`,:;])/g;
    for (const match of text.matchAll(regex)) {
        const value = match[1];
        if (value)
            results.push(value);
    }
    if (/\bDockerfile\b/i.test(text))
        results.push("Dockerfile");
    return results;
}
function collectPathCandidates(value, keyHint, into) {
    if (typeof value === "string") {
        if (keyHint && (PATH_HINT_KEYS.has(keyHint) || keyHint.includes("path"))) {
            into.push(value);
        }
        into.push(...parsePatchPaths(value));
        if (!keyHint ||
            keyHint === "command" ||
            keyHint === "text" ||
            keyHint === "input") {
            into.push(...parseInlinePaths(value));
        }
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            collectPathCandidates(item, keyHint, into);
        }
        return;
    }
    if (!isObject(value))
        return;
    for (const [key, nested] of Object.entries(value)) {
        collectPathCandidates(nested, key.toLowerCase(), into);
    }
}
function uniqueStrings(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        if (!seen.has(item)) {
            seen.add(item);
            result.push(item);
        }
    }
    return result;
}
// ────────────────────────────────────────────
// Event extraction helpers
// ────────────────────────────────────────────
function extractEventType(event) {
    if (!isObject(event))
        return "";
    return getString(event.type) ?? "";
}
function extractSessionId(event) {
    if (!isObject(event))
        return "";
    const sessionID = getString(event.sessionID);
    if (sessionID)
        return sessionID;
    if (!isObject(event.properties))
        return "";
    const fromProperties = getString(event.properties.sessionID) ??
        getString(event.properties.sessionId) ??
        getString(event.properties.id);
    return fromProperties ?? "";
}
function extractCwd(event, fallback) {
    if (!isObject(event))
        return fallback;
    const direct = getString(event.cwd);
    if (direct)
        return direct;
    if (!isObject(event.properties))
        return fallback;
    const nested = getString(event.properties.cwd);
    return nested ?? fallback;
}
// ────────────────────────────────────────────
// Session state management
// ────────────────────────────────────────────
function getSession(sessionID) {
    const current = sessionState.get(sessionID);
    if (current)
        return current;
    const fresh = {
        files: new Map(),
        updatedAt: Date.now(),
    };
    sessionState.set(sessionID, fresh);
    return fresh;
}
function pruneSessions(now) {
    const maxAgeMs = 24 * 60 * 60 * 1000;
    for (const [sessionID, data] of sessionState.entries()) {
        if (now - data.updatedAt > maxAgeMs) {
            sessionState.delete(sessionID);
        }
    }
}
function rememberSessionFiles(sessionID, files, nowSeconds) {
    const session = getSession(sessionID);
    for (const filePath of files) {
        session.files.set(filePath, nowSeconds);
    }
    session.updatedAt = Date.now();
}
// ────────────────────────────────────────────
// Event file collection
// ────────────────────────────────────────────
function collectEventFiles(event, cwd) {
    const candidates = [];
    collectPathCandidates(event, null, candidates);
    const normalized = uniqueStrings(candidates)
        .map((candidate) => normalizePath(candidate, cwd))
        .filter((value) => typeof value === "string");
    return uniqueStrings(normalized).slice(0, MAX_FILES_PER_EVENT);
}
// ────────────────────────────────────────────
// Event handlers (OpenCode-specific routing)
// ────────────────────────────────────────────
async function handlePartUpdated(defaultCwd) {
    return; // actual logic handled in event router below
}
// ────────────────────────────────────────────
// Main plugin export
// ────────────────────────────────────────────
export const ZiitOpenCodePlugin = async ({ directory, }) => {
    const defaultDirectory = directory || process.cwd();
    const rateLimiter = createRateLimiter(MIN_SEND_INTERVAL_MS);
    return {
        event: async ({ event }) => {
            const config = await loadConfig();
            if (!config)
                return;
            const eventType = extractEventType(event);
            if (eventType === "message.part.updated") {
                const sessionID = extractSessionId(event) || "default";
                const cwd = extractCwd(event, defaultDirectory);
                const files = collectEventFiles(event, cwd);
                if (files.length === 0) {
                    await log("message.part.updated without file candidates");
                    return;
                }
                const nowSeconds = Date.now() / 1000;
                rememberSessionFiles(sessionID, files, nowSeconds);
                for (const filePath of files) {
                    if (!rateLimiter(filePath))
                        continue;
                    const payload = createHeartbeat(filePath, cwd, EDITOR_NAME);
                    await sendHeartbeat(config, payload, "opencode");
                }
                return;
            }
            if (eventType === "session.idle" || eventType === "session.deleted") {
                if (eventType === "session.deleted") {
                    const sessionID = extractSessionId(event);
                    if (sessionID)
                        sessionState.delete(sessionID);
                }
                await syncOfflineQueue(config, "opencode", log);
                pruneSessions(Date.now());
            }
        },
    };
};
export default ZiitOpenCodePlugin;
