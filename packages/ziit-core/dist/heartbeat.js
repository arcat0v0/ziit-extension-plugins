import { platform } from "node:os";
import { detectBranch, detectProject } from "./git.js";
import { detectLanguage } from "./language.js";
import { createLogger } from "./logger.js";
import { enqueueOffline } from "./queue.js";
function detectOs() {
    const current = platform();
    if (current === "darwin")
        return "macOS";
    if (current === "win32")
        return "Windows";
    if (current === "linux")
        return "Linux";
    return "Unknown";
}
/**
 * Construct a heartbeat payload with all metadata fields populated.
 */
export function createHeartbeat(filePath, cwd, editorName) {
    const branch = detectBranch(cwd);
    return {
        timestamp: new Date().toISOString(),
        project: detectProject(cwd),
        language: detectLanguage(filePath),
        editor: editorName,
        os: detectOs(),
        file: filePath,
        ...(branch ? { branch } : {}),
    };
}
const FETCH_TIMEOUT_MS = 5000;
async function postJson(url, apiKey, payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        return response.ok;
    }
    catch {
        return false;
    }
    finally {
        clearTimeout(timeout);
    }
}
/**
 * Send a single heartbeat to the Ziit API.
 *
 * IMPORTANT: This function is fire-and-forget. It returns immediately
 * and performs the network request in the background so it never blocks
 * the host agent's event loop.
 *
 * On failure, the heartbeat is queued to the offline file for later sync.
 */
export function sendHeartbeat(config, payload, platformName) {
    const logger = createLogger(platformName);
    // Fire-and-forget: do not await the network request
    void (async () => {
        const ok = await postJson(`${config.baseUrl}/api/external/heartbeat`, config.apiKey, payload);
        if (ok) {
            void logger(`Heartbeat sent for ${payload.file}`);
        }
        else {
            await enqueueOffline(payload, platformName, logger);
            void logger(`Queued offline heartbeat for ${payload.file}`);
        }
    })().catch((error) => {
        void logger(`Failed to process heartbeat for ${payload.file}: ${String(error)}`);
    });
}
