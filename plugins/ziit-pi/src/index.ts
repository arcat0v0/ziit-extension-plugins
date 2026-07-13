export interface ZiitExtensionAPI {
  on(
    event: "session_start",
    handler: (
      event: unknown,
      context: { cwd: string },
    ) => void | Promise<void>,
  ): void;
  on(
    event: "session_shutdown",
    handler: () => void | Promise<void>,
  ): void;
  on(
    event: "tool_call" | "tool_result",
    handler: (event: {
      toolName: string;
      toolCallId: string;
      input?: Record<string, unknown>;
      isError?: boolean;
    }) => void | Promise<void>,
  ): void;
}

import {
  loadConfig,
  createHeartbeat,
  sendHeartbeat,
  syncOfflineQueue,
  createRateLimiter,
  createLogger,
} from "@arcat/ziit-core";

const MIN_SEND_INTERVAL_MS = 120_000;
const TOOL_CALL_TTL_MS = 300_000;

export function createZiitExtension(
  pi: ZiitExtensionAPI,
  editorName: string,
  platformName: string,
): void {
  let cwd = process.cwd();
  let config: Awaited<ReturnType<typeof loadConfig>> = null;
  const rateLimiter = createRateLimiter(MIN_SEND_INTERVAL_MS);

  const toolCallPaths = new Map<string, string>();
  const toolCallTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearToolCall(toolCallId: string): void {
    toolCallPaths.delete(toolCallId);
    const timer = toolCallTimers.get(toolCallId);
    if (timer) {
      clearTimeout(timer);
      toolCallTimers.delete(toolCallId);
    }
  }

  function storeToolCallPath(toolCallId: string, filePath: string): void {
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
    if (!config) config = await loadConfig();
    if (!config) {
      void createLogger(platformName)("Config not found; heartbeats disabled");
      return;
    }
    void syncOfflineQueue(config, platformName, createLogger(platformName));
  });

  pi.on("session_shutdown", async () => {
    for (const timer of toolCallTimers.values()) clearTimeout(timer);
    toolCallTimers.clear();
    toolCallPaths.clear();
    if (!config) return;
    void syncOfflineQueue(config, platformName, createLogger(platformName));
  });

  pi.on("tool_call", async (event) => {
    if (
      event.toolName !== "read" &&
      event.toolName !== "write" &&
      event.toolName !== "edit"
    )
      return;

    if (!config) config = await loadConfig();
    if (!config) return;

    const path = (event.input as Record<string, unknown> | undefined)?.path;
    if (!path || typeof path !== "string") {
      void createLogger(platformName)(`Skipping heartbeat: missing or invalid path in ${event.toolName} tool_call`);
      return;
    }

    storeToolCallPath(event.toolCallId, path);
  });

  pi.on("tool_result", async (event) => {
    if (
      event.toolName !== "read" &&
      event.toolName !== "write" &&
      event.toolName !== "edit"
    )
      return;

    if (!config) return;

    if (event.isError) {
      clearToolCall(event.toolCallId);
      return;
    }

    const filePath = toolCallPaths.get(event.toolCallId);
    if (!filePath) {
      void createLogger(platformName)(
        `Skipping heartbeat: no path captured for ${event.toolName} tool_result (toolCallId: ${event.toolCallId})`,
      );
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

export default function ziitPi(pi: ZiitExtensionAPI): void {
  createZiitExtension(pi, "Pi", "pi");
}
