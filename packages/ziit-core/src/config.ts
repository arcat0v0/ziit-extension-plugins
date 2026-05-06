import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

const CONFIG_DIR = resolve(homedir(), ".config", "ziit");
const CONFIG_FILE = resolve(CONFIG_DIR, "config.json");

export interface ZiitConfig {
  apiKey: string;
  baseUrl: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Load the Ziit configuration from ~/.config/ziit/config.json.
 * Returns null if the config file is missing, malformed, or lacks an apiKey.
 * The baseUrl defaults to https://ziit.app with trailing slash stripped.
 */
export async function loadConfig(): Promise<ZiitConfig | null> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return null;

    const apiKey = getString(parsed.apiKey)?.trim() ?? "";
    if (!apiKey) return null;

    const baseUrlRaw = getString(parsed.baseUrl)?.trim() ?? "https://ziit.app";
    const baseUrl = baseUrlRaw.replace(/\/+$/, "");
    return { apiKey, baseUrl };
  } catch {
    return null;
  }
}
