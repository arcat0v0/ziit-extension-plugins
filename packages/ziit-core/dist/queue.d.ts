import type { ZiitConfig } from "./config.js";
import type { HeartbeatPayload } from "./heartbeat.js";
/**
 * Read the offline heartbeat queue from disk.
 * Returns parsed heartbeats; skips malformed entries.
 */
export declare function loadOfflineQueue(platform: string): Promise<HeartbeatPayload[]>;
/**
 * Append a single heartbeat to the offline queue file.
 */
export declare function enqueueOffline(payload: HeartbeatPayload, platform: string, logger: (msg: string) => void | Promise<void>): Promise<void>;
/**
 * Sync all queued offline heartbeats to the Ziit batch endpoint.
 * Uploads in chunks; retains only the unsent remainder on failure.
 */
export declare function syncOfflineQueue(config: ZiitConfig, platform: string, logger: (msg: string) => void | Promise<void>): Promise<void>;
