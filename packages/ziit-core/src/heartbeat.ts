import { platform } from "node:os";
import type { ZiitConfig } from "./config.js";
import { detectBranch, detectProject } from "./git.js";
import { detectLanguage } from "./language.js";
import { createLogger } from "./logger.js";
import { enqueueOffline } from "./queue.js";

export interface HeartbeatPayload {
  timestamp: string;
  project: string;
  language: string;
  editor: string;
  os: string;
  file: string;
  branch: string | null;
}

function detectOs(): string {
  const current = platform();
  if (current === "darwin") return "macOS";
  if (current === "win32") return "Windows";
  if (current === "linux") return "Linux";
  return "Unknown";
}

/**
 * Construct a heartbeat payload with all metadata fields populated.
 */
export function createHeartbeat(
  filePath: string,
  cwd: string,
  editorName: string,
): HeartbeatPayload {
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

const FETCH_TIMEOUT_MS = 5_000;

async function postJson(
  url: string,
  apiKey: string,
  payload: unknown,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
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
export function sendHeartbeat(
  config: ZiitConfig,
  payload: HeartbeatPayload,
  platformName: string,
): void {
  const logger = createLogger(platformName);

  // Fire-and-forget: do not await the network request
  void (async () => {
    const ok = await postJson(
      `${config.baseUrl}/api/external/heartbeat`,
      config.apiKey,
      payload,
    );

    if (ok) {
      void logger(`Heartbeat sent for ${payload.file}`);
    } else {
      await enqueueOffline(payload, platformName, logger);
      void logger(`Queued offline heartbeat for ${payload.file}`);
    }
  })();
}
