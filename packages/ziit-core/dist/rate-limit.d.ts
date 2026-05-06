/**
 * Create a rate limiter with a per-key cooldown.
 * Returns a function that accepts a key and returns true if the key
 * should be allowed through (not rate-limited), false if within the cooldown.
 */
export declare function createRateLimiter(cooldownMs: number): (key: string) => boolean;
