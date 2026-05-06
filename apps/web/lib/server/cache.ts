/**
 * Process-level TTL cache shared across requests.
 *
 * In dev, the cache is hung off `globalThis` so it survives HMR (otherwise
 * every code change would invalidate the entire cache). In production this
 * is a normal module-level Map that lives for the duration of the
 * Vercel/Node function instance.
 *
 * Use this for data that is expensive to compute and either:
 *   - the same for every request from the same user (auth state), or
 *   - changes infrequently (dashboard rollups, run lists)
 *
 * If you need cross-instance coherency, this is NOT enough — swap in Redis
 * (Upstash). For our scale right now, per-instance caching with short TTLs
 * is the right tradeoff.
 */

type Entry<T> = { value: T; expiresAt: number };

type Store = Map<string, Entry<unknown>>;

const KEY = "__dd_process_cache__";

const globalRef = globalThis as unknown as { [KEY]?: Store };

const store: Store = globalRef[KEY] ?? new Map();
if (!globalRef[KEY]) {
  globalRef[KEY] = store;
}

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key) as Entry<T> | undefined;
  if (!e) return undefined;
  if (e.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return e.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

/**
 * Delete every key with the given prefix. Useful for invalidating an
 * entire namespace (e.g. all dashboard cache entries for one user) when
 * a write happens.
 */
export function cacheInvalidatePrefix(prefix: string): number {
  let n = 0;
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) {
      store.delete(k);
      n++;
    }
  }
  return n;
}

/**
 * Memoize an async function with a TTL. The first call computes and stores;
 * subsequent calls within the TTL return the cached value without running
 * the function. If the function throws, nothing is cached.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await load();
  cacheSet(key, value, ttlMs);
  return value;
}
