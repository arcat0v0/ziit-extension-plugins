import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
const OFFLINE_DIR = resolve(homedir(), ".config", "ziit");
function getOfflineFile(platform) {
    return resolve(OFFLINE_DIR, `offline_${platform}_heartbeats.json`);
}
function isArrayOfObjects(value) {
    if (!Array.isArray(value))
        return false;
    return value.every((item) => typeof item === "object" && item !== null);
}
function parseHeartbeat(obj) {
    const timestamp = typeof obj.timestamp === "string" ? obj.timestamp : null;
    const project = typeof obj.project === "string" ? obj.project : null;
    const language = typeof obj.language === "string" ? obj.language : null;
    const editor = typeof obj.editor === "string" ? obj.editor : null;
    const osValue = typeof obj.os === "string" ? obj.os : null;
    const file = typeof obj.file === "string" ? obj.file : null;
    const branch = typeof obj.branch === "string" ? obj.branch : null;
    if (!timestamp || !project || !language || !editor || !osValue || !file) {
        return null;
    }
    return { timestamp, project, language, editor, os: osValue, file, branch };
}
/**
 * Read the offline heartbeat queue from disk.
 * Returns parsed heartbeats; skips malformed entries.
 */
export async function loadOfflineQueue(platform) {
    try {
        const raw = await readFile(getOfflineFile(platform), "utf-8");
        const parsed = JSON.parse(raw);
        if (!isArrayOfObjects(parsed))
            return [];
        const queue = [];
        for (const item of parsed) {
            const hb = parseHeartbeat(item);
            if (hb)
                queue.push(hb);
        }
        return queue;
    }
    catch {
        return [];
    }
}
async function saveOfflineQueue(platform, queue) {
    await mkdir(OFFLINE_DIR, { recursive: true });
    await writeFile(getOfflineFile(platform), JSON.stringify(queue, null, 2), "utf-8");
}
async function postJson(url, apiKey, payload) {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        return response.ok;
    }
    catch {
        return false;
    }
}
/**
 * Append a single heartbeat to the offline queue file.
 */
export async function enqueueOffline(payload, platform, logger) {
    const queue = await loadOfflineQueue(platform);
    queue.push(payload);
    await saveOfflineQueue(platform, queue);
    await logger(`Enqueued offline heartbeat for ${payload.file} (queue size: ${queue.length})`);
}
/**
 * Sync all queued offline heartbeats to the Ziit batch endpoint.
 * Clears the queue file on successful sync; retains on failure.
 */
export async function syncOfflineQueue(config, platform, logger) {
    const queue = await loadOfflineQueue(platform);
    if (queue.length === 0)
        return;
    const ok = await postJson(`${config.baseUrl}/api/external/batch`, config.apiKey, queue);
    if (ok) {
        await saveOfflineQueue(platform, []);
        await logger(`Synced ${queue.length} offline heartbeats`);
    }
    else {
        await logger(`Failed to sync ${queue.length} offline heartbeats`);
    }
}
