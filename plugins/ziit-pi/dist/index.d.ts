import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
/**
 * Pi extension for Ziit time tracking.
 *
 * Subscribes to pi's tool events to capture file paths from `read`,
 * `write`, and `edit` tool calls, constructs heartbeat payloads via
 * `ziit-core`, and sends them to the Ziit API. Uses a two-phase
 * pattern: capture on `tool_call`, send on successful `tool_result`.
 */
export default function ziitPi(pi: ExtensionAPI): void;
