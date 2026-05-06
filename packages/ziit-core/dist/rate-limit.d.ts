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
export declare function createRateLimiter(cooldownMs: number): RateLimiter;
