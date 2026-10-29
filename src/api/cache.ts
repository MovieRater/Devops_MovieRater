// -------------------------------------------------------------
// GENERIC LOCAL STORAGE CACHE HELPERS
// -------------------------------------------------------------

export function loadCache<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function saveCache<T>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value));
}

export function isCacheExpired(timestampKey: string, ttlMs: number): boolean {
    const timestamp = localStorage.getItem(timestampKey);
    if (!timestamp) return true;

    const age = Date.now() - parseInt(timestamp);
    return age > ttlMs;
}

export function updateCacheTimestamp(timestampKey: string) {
    localStorage.setItem(timestampKey, Date.now().toString());
}
