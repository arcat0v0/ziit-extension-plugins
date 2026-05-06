export function createRateLimiter(cooldownMs) {
    const lastSent = new Map();
    let lastFile = "";
    return {
        check(filePath, isWrite = false) {
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
