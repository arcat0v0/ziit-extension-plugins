import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { ZiitConfig } from "./config.js";
import type { HeartbeatPayload } from "./heartbeat.js";

const OFFLINE_DIR = resolve(homedir(), ".config", "ziit");
const FETCH_TIMEOUT_MS = 5_000;
const MAX_HEARTBEAT_FIELD_LENGTH = 255;
const MAX_QUEUE_ENTRIES = 5_000;
const UPLOAD_CHUNK_SIZE = 500;

function getOfflineFile(platform: string): string {
  return resolve(OFFLINE_DIR, `offline_${platform}_heartbeats.json`);
}

function isArrayOfObjects(
  value: unknown,
): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) => typeof item === "object" && item !== null,
  );
}

function parseHeartbeat(obj: Record<string, unknown>): HeartbeatPayload | null {
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

  return {
    timestamp,
    project,
    language,
    editor,
    os: osValue,
    file,
    ...(branch ? { branch } : {}),
  };
}

/**
 * Read the offline heartbeat queue from disk.
 * Returns parsed heartbeats; skips malformed entries.
 */
export async function loadOfflineQueue(
  platform: string,
): Promise<HeartbeatPayload[]> {
  try {
    const raw = await readFile(getOfflineFile(platform), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!isArrayOfObjects(parsed)) return [];

    const queue: HeartbeatPayload[] = [];
    for (const item of parsed) {
      const hb = parseHeartbeat(item);
      if (hb) queue.push(hb);
    }
    return queue;
  } catch {
    return [];
  }
}

async function saveOfflineQueue(
  platform: string,
  queue: HeartbeatPayload[],
): Promise<void> {
  await mkdir(OFFLINE_DIR, { recursive: true });
  await writeFile(
    getOfflineFile(platform),
    JSON.stringify(queue, null, 2),
    "utf-8",
  );
}

async function postJson(
  url: string,
  apiKey: string,
  payload: unknown,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Append a single heartbeat to the offline queue file.
 */
export async function enqueueOffline(
  payload: HeartbeatPayload,
  platform: string,
  logger: (msg: string) => void | Promise<void>,
): Promise<void> {
  if (
    payload.file.length === 0 ||
    payload.file.length > MAX_HEARTBEAT_FIELD_LENGTH ||
    payload.file.includes("\0")
  ) {
    await logger(
      `Dropped invalid heartbeat for ${payload.file.slice(0, 64)} (length: ${payload.file.length})`,
    );
    return;
  }
  const queue = await loadOfflineQueue(platform);
  queue.push(payload);
  await saveOfflineQueue(platform, queue.slice(-MAX_QUEUE_ENTRIES));
  await logger(
    `Enqueued offline heartbeat for ${payload.file} (queue size: ${Math.min(queue.length, MAX_QUEUE_ENTRIES)})`,
  );
}

/**
 * Sync all queued offline heartbeats to the Ziit batch endpoint.
 * Uploads in chunks; retains only the unsent remainder on failure.
 */
export async function syncOfflineQueue(
  config: ZiitConfig,
  platform: string,
  logger: (msg: string) => void | Promise<void>,
): Promise<void> {
  const queue = await loadOfflineQueue(platform);
  if (queue.length === 0) return;

  let sentCount = 0;
  while (sentCount < queue.length) {
    const chunk = queue.slice(sentCount, sentCount + UPLOAD_CHUNK_SIZE);
    const ok = await postJson(
      `${config.baseUrl}/api/external/batch`,
      config.apiKey,
      chunk,
    );
    if (!ok) break;
    sentCount += chunk.length;
  }

  if (sentCount === queue.length) {
    await saveOfflineQueue(platform, []);
    await logger(`Synced ${queue.length} offline heartbeats`);
  } else {
    await saveOfflineQueue(platform, queue.slice(sentCount));
    await logger(
      `Failed to sync ${queue.length - sentCount} offline heartbeats`,
    );
  }
}
