import type { ZiitConfig } from "./config.js";
export interface HeartbeatPayload {
    timestamp: string;
    project: string;
    language: string;
    editor: string;
    os: string;
    file: string;
    branch: string | null;
}
/**
 * Construct a heartbeat payload with all metadata fields populated.
 */
export declare function createHeartbeat(filePath: string, cwd: string, editorName: string): HeartbeatPayload;
/**
 * Send a single heartbeat to the Ziit API.
 *
 * IMPORTANT: This function is fire-and-forget. It returns immediately
 * and performs the network request in the background so it never blocks
 * the host agent's event loop.
 *
 * On failure, the heartbeat is queued to the offline file for later sync.
 */
export declare function sendHeartbeat(config: ZiitConfig, payload: HeartbeatPayload, platformName: string): void;
