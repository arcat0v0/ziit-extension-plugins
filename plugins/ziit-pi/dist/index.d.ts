import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
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
export default function ziitPi(pi: ExtensionAPI): void;
