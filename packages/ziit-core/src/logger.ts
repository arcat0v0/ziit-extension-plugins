import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

const LOG_DIR = resolve(homedir(), ".config", "ziit");

/**
 * Create a logger function for a specific platform.
 * Writes timestamped messages to ~/.config/ziit/<platform>.log.
 * Errors are silently ignored to avoid breaking the host agent.
 */
export function createLogger(
  platform: string,
): (message: string) => Promise<void> {
  return async (message: string) => {
    try {
      await mkdir(LOG_DIR, { recursive: true });
      const timestamp = new Date().toISOString();
      await appendFile(
        resolve(LOG_DIR, `${platform}.log`),
        `[${timestamp}] ${message}\n`,
        "utf-8",
      );
    } catch {
      // Silently ignore log write failures
    }
  };
}
