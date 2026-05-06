import { platform } from "node:os";
import { detectBranch, detectProject } from "./git.js";
import { detectLanguage } from "./language.js";
import { createLogger } from "./logger.js";
import { enqueueOffline, syncOfflineQueue } from "./queue.js";
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
    return {
        timestamp: new Date().toISOString(),
        project: detectProject(cwd),
        language: detectLanguage(filePath),
        editor: editorName,
        os: detectOs(),
        file: filePath,
        branch: detectBranch(cwd),
    };
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
 * Send a single heartbeat to the Ziit API.
 * On failure, queues the heartbeat to the offline file for later sync.
 */
export async function sendHeartbeat(config, payload, platformName) {
    const logger = createLogger(platformName);
    // Sync any previously queued heartbeats first
    await syncOfflineQueue(config, platformName, logger);
    const ok = await postJson(`${config.baseUrl}/api/external/heartbeat`, config.apiKey, payload);
    if (ok) {
        await logger(`Heartbeat sent for ${payload.file}`);
    }
    else {
        await enqueueOffline(payload, platformName, logger);
        await logger(`Queued offline heartbeat for ${payload.file}`);
    }
}
