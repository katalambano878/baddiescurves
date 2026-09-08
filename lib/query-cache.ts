/**
 * Simple client-side data cache to avoid re-fetching from Supabase
 * on every page navigation. Data is cached in memory for a configurable TTL.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();
const inFlight = new Map<string, Promise<any>>();

const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes — reduce re-fetches during browsing

/**
 * Get data from cache or fetch it fresh
 */
export async function cachedQuery<T>(
  key: string,
  queryFn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL
): Promise<T> {
  const cached = cache.get(key);
  
  if (cached && (Date.now() - cached.timestamp) < ttlMs) {
    return cached.data;
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = queryFn()
    .then((data) => {
      cache.set(key, { data, timestamp: Date.now() });
      return data;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Invalidate a specific cache key
 */
export function invalidateCache(key: string) {
  cache.delete(key);
  inFlight.delete(key);
}

/**
 * Invalidate all cache keys matching a prefix
 */
export function invalidateCachePrefix(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      inFlight.delete(key);
    }
  }
}

/**
 * Clear the entire cache
 */
export function clearCache() {
  cache.clear();
  inFlight.clear();
}
