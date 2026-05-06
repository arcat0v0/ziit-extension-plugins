/**
 * Create a logger function for a specific platform.
 * Writes timestamped messages to ~/.config/ziit/<platform>.log.
 * Errors are silently ignored to avoid breaking the host agent.
 *
 * Returns void (fire-and-forget) so it never blocks the caller.
 */
export declare function createLogger(platform: string): (message: string) => void;
