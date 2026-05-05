// Simple localStorage cache with TTL and namespaced keys

const CACHE_PREFIX = 'tt_cache:'
const DEFAULT_TTL_MS = 60 * 1000 // 60 seconds

export type CacheEntry<T> = {
  cachedAt: number
  ttlMs: number
  data: T
}

function buildKey(key: string): string {
  return `${CACHE_PREFIX}${key}`
}

export function setCache<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    removeCache(key)
    return
  }
  try {
    const entry: CacheEntry<T> = { cachedAt: Date.now(), ttlMs, data }
    localStorage.setItem(buildKey(key), JSON.stringify(entry))
  } catch {
    // Ignore storage errors (quota, serialization)
  }
}

export function getCache<T>(key: string): { hit: boolean, data: T | null, source: 'cache' | 'expired' | 'miss' } {
  try {
    const raw = localStorage.getItem(buildKey(key))
    if (!raw) return { hit: false, data: null, source: 'miss' }
    const entry = JSON.parse(raw) as CacheEntry<T>
    const isValid = Date.now() - entry.cachedAt < (entry.ttlMs ?? DEFAULT_TTL_MS)
    if (!isValid) {
      // Leave expired value until overwritten to allow stale-while-revalidate use cases
      return { hit: false, data: entry.data, source: 'expired' }
    }
    return { hit: true, data: entry.data, source: 'cache' }
  } catch {
    return { hit: false, data: null, source: 'miss' }
  }
}

export function removeCache(key: string): void {
  try {
    localStorage.removeItem(buildKey(key))
  } catch {
    // ignore
  }
}

export function clearAllCache(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch {
    // ignore
  }
}

export function clearMatchingCache(predicate: (key: string) => boolean): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(CACHE_PREFIX)) {
        const logicalKey = k.replace(CACHE_PREFIX, '')
        if (predicate(logicalKey)) keys.push(k)
      }
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch {
    // ignore
  }
}

export function makeCacheKey(path: string, params?: Record<string, any>): string {
  if (!params || Object.keys(params).length === 0) return path
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return
    usp.append(k, String(v))
  })
  return `${path}?${usp.toString()}`
}

// Stale-While-Revalidate helper
export type SWRResult<T> = {
  data: T | null
  from: 'cache' | 'expired' | 'miss' | 'server'
}

export async function swrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  allowStale: boolean = false,
  ttlMs: number = DEFAULT_TTL_MS,
  onRevalidated?: (data: T) => void
): Promise<SWRResult<T>> {
  const cached = getCache<T>(key)
  if (cached.hit) {
    console.info(`[cache] Loaded ${key} from cache`)
    return { data: cached.data, from: 'cache' }
  }

  if (cached.source === 'expired' && cached.data !== null) {
    if (allowStale) {
      fetcher()
        .then(data => {
          setCache(key, data, ttlMs)
          onRevalidated && onRevalidated(data)
          console.info(`[cache] Revalidated ${key} from server`)
        })
        .catch(() => {})
      console.info(`[cache] Loaded ${key} from expired cache (stale)`)
      return { data: cached.data, from: 'expired' }
    }
  }

  // No cache, fetch
  const data = await fetcher()
  setCache(key, data, ttlMs)
  console.info(`[cache] Fetched ${key} from server`)
  return { data, from: 'server' }
}

export const Cache = {
  set: setCache,
  get: getCache,
  remove: removeCache,
  clearAll: clearAllCache,
  clearMatching: clearMatchingCache,
  key: makeCacheKey,
  swrFetch,
  DEFAULT_TTL_MS
}
