import { loadConfig, createHeartbeat, sendHeartbeat, syncOfflineQueue, createRateLimiter, createLogger, } from "@arcat/ziit-core";
const MIN_SEND_INTERVAL_MS = 120000;
const TOOL_CALL_TTL_MS = 300000;
export function createZiitExtension(pi, editorName, platformName) {
    let cwd = process.cwd();
    let config = null;
    const rateLimiter = createRateLimiter(MIN_SEND_INTERVAL_MS);
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
    pi.on("session_start", async (_event, ctx) => {
        cwd = ctx.cwd;
        if (!config)
            config = await loadConfig();
        if (!config) {
            void createLogger(platformName)("Config not found; heartbeats disabled");
            return;
        }
        void syncOfflineQueue(config, platformName, createLogger(platformName));
    });
    pi.on("session_shutdown", async () => {
        for (const timer of toolCallTimers.values())
            clearTimeout(timer);
        toolCallTimers.clear();
        toolCallPaths.clear();
        if (!config)
            return;
        void syncOfflineQueue(config, platformName, createLogger(platformName));
    });
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
            void createLogger(platformName)(`Skipping heartbeat: missing or invalid path in ${event.toolName} tool_call`);
            return;
        }
        storeToolCallPath(event.toolCallId, path);
    });
    pi.on("tool_result", async (event) => {
        if (event.toolName !== "read" &&
            event.toolName !== "write" &&
            event.toolName !== "edit")
            return;
        if (!config)
            return;
        if (event.isError) {
            clearToolCall(event.toolCallId);
            return;
        }
        const filePath = toolCallPaths.get(event.toolCallId);
        if (!filePath) {
            void createLogger(platformName)(`Skipping heartbeat: no path captured for ${event.toolName} tool_result (toolCallId: ${event.toolCallId})`);
            return;
        }
        clearToolCall(event.toolCallId);
        const isWrite = event.toolName === "write" || event.toolName === "edit";
        const limit = rateLimiter.check(filePath, isWrite);
        if (!limit.allowed) {
            void createLogger(platformName)(`Rate limited: ${filePath} (${limit.reason})`);
            return;
        }
        const payload = createHeartbeat(filePath, cwd, editorName);
        sendHeartbeat(config, payload, platformName);
    });
}
export default function ziitPi(pi) {
    createZiitExtension(pi, "Pi", "pi");
}
