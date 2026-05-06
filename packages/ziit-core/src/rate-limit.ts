/**
 * WakaTime-style rate limiter.
 *
 * - Default cooldown: 2 minutes (120_000 ms) for the same file.
 * - isWrite=true (file saved): bypasses cooldown, always allowed.
 * - File changed (different from last sent): bypasses cooldown, always allowed.
 */
export interface RateLimitResult {
  allowed: boolean;
  reason?: "cooldown" | "allowed";
}

export interface RateLimiter {
  check(filePath: string, isWrite?: boolean): RateLimitResult;
}

export function createRateLimiter(cooldownMs: number): RateLimiter {
  const lastSent = new Map<string, number>();
  let lastFile = "";

  return {
    check(filePath: string, isWrite = false): RateLimitResult {
      const now = Date.now();

      // Always send on save/write
      if (isWrite) {
        lastSent.set(filePath, now);
        lastFile = filePath;
        return { allowed: true, reason: "allowed" };
      }

      // Always send when switching to a different file
      if (filePath !== lastFile) {
        lastSent.set(filePath, now);
        lastFile = filePath;
        return { allowed: true, reason: "allowed" };
      }

      // Same file: check cooldown
      const previous = lastSent.get(filePath);
      if (typeof previous === "number" && now - previous < cooldownMs) {
        return { allowed: false, reason: "cooldown" };
      }

      lastSent.set(filePath, now);
      lastFile = filePath;
      return { allowed: true, reason: "allowed" };
    },
  };
}
