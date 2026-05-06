/**
 * Create a rate limiter with a per-key cooldown.
 * Returns a function that accepts a key and returns true if the key
 * should be allowed through (not rate-limited), false if within the cooldown.
 */
export function createRateLimiter(
  cooldownMs: number,
): (key: string) => boolean {
  const lastSeen = new Map<string, number>();

  return (key: string): boolean => {
    const now = Date.now();
    const previous = lastSeen.get(key);
    if (typeof previous === "number" && now - previous < cooldownMs) {
      return false;
    }
    lastSeen.set(key, now);
    return true;
  };
}
