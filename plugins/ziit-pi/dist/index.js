import { loadConfig, createHeartbeat, sendHeartbeat, syncOfflineQueue, createRateLimiter, createLogger, } from "@arcat/ziit-core";
const EDITOR_NAME = "Pi";
const MIN_SEND_INTERVAL_MS = 120_000; // 2 minutes — WakaTime standard
const TOOL_CALL_TTL_MS = 300_000; // 5 minutes
const log = createLogger("pi");
/**
 * Pi extension for Ziit time tracking.
 *
 * Subscribes to pi's tool events to capture file paths from `read`,
 * `write`, and `edit` tool calls, constructs heartbeat payloads via
 * `ziit-core`, and sends them to the Ziit API.
 *
 * WakaTime-style logic:
 * - 2-minute rate limit per file
 * - File switch always sends immediately
 * - Write/save operations bypass rate limit
 * - All network is fire-and-forget (never blocks pi)
 */
export default function ziitPi(pi) {
    let cwd = process.cwd();
    let config = null;
    const rateLimiter = createRateLimiter(MIN_SEND_INTERVAL_MS);
    // toolCallId → filePath (with TTL)
    const toolCallPaths = new Map();
    const toolCallTimers = new Map();
    function clearToolCall(toolCallId) {
        toolCallPaths.delete(toolCallId);
        const timer = toolCallTimers.get(toolCallId);
        if (timer) {
            clearTimeout(timer);
            toolCallTimers.delete(toolCallId);
        }
    }
    function storeToolCallPath(toolCallId, filePath) {
        clearToolCall(toolCallId);
        toolCallPaths.set(toolCallId, filePath);
        const timer = setTimeout(() => {
            toolCallPaths.delete(toolCallId);
            toolCallTimers.delete(toolCallId);
        }, TOOL_CALL_TTL_MS);
        toolCallTimers.set(toolCallId, timer);
    }
    // ─── Pi lifecycle events ───────────────────────────────
    pi.on("resources_discover", async (event) => {
        if (event.cwd)
            cwd = event.cwd;
    });
    pi.on("session_start", async () => {
        // Lazy config load — avoids blocking pi startup if config is missing
        if (!config)
            config = await loadConfig();
        if (!config) {
            log("Config not found — heartbeats disabled");
            return;
        }
        // Sync offline queue on session start (not on every heartbeat)
        void syncOfflineQueue(config, "pi", log);
    });
    pi.on("session_shutdown", async () => {
        if (!config)
            return;
        void syncOfflineQueue(config, "pi", log);
    });
    // ─── Tool call: capture file path ──────────────────────
    pi.on("tool_call", async (event) => {
        if (event.toolName !== "read" &&
            event.toolName !== "write" &&
            event.toolName !== "edit")
            return;
        if (!config)
            config = await loadConfig();
        if (!config)
            return;
        const path = event.input?.path;
        if (!path || typeof path !== "string") {
            log(`Skipping heartbeat: missing or invalid path in ${event.toolName} tool_call`);
            return;
        }
        storeToolCallPath(event.toolCallId, path);
    });
    // ─── Tool result: send heartbeat on success ────────────
    pi.on("tool_result", async (event) => {
        if (event.toolName !== "read" &&
            event.toolName !== "write" &&
            event.toolName !== "edit")
            return;
        if (!config)
            return;
        // Skip failed tool executions
        if (event.isError) {
            clearToolCall(event.toolCallId);
            return;
        }
        const filePath = toolCallPaths.get(event.toolCallId);
        if (!filePath) {
            log(`Skipping heartbeat: no path captured for ${event.toolName} tool_result (toolCallId: ${event.toolCallId})`);
            return;
        }
        clearToolCall(event.toolCallId);
        // WakaTime-style rate limiting
        const isWrite = event.toolName === "write" || event.toolName === "edit";
        const limit = rateLimiter.check(filePath, isWrite);
        if (!limit.allowed) {
            log(`Rate limited: ${filePath} (${limit.reason})`);
            return;
        }
        const payload = createHeartbeat(filePath, cwd, EDITOR_NAME);
        // Fire-and-forget: never block pi's event loop
        sendHeartbeat(config, payload, "pi");
    });
}
