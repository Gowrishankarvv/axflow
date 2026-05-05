import axios from 'axios'
import { Cache } from './cache'
import { setLoading } from './loading'

const api = axios.create({ baseURL: (import.meta.env.VITE_API_URL as string || '') + '/api' })

const GLOBAL_INVALIDATIONS = [
  '/app-initial-data',
  '/dashboard/summary',
  '/dashboard/summary/aggregated',
  '/reports/summary',
  '/reports/team-summary',
  '/projects/combined',
]

const mutationInvalidations: Record<string, string[]> = {
  '/time-entries': [
    '/time-entries',
    '/time-entry',
    '/tasks/my_notifications',
    '/tags',
    ...GLOBAL_INVALIDATIONS,
  ],
  '/time-entry': ['/time-entries', ...GLOBAL_INVALIDATIONS],
  '/projects': ['/projects', '/projects/combined', ...GLOBAL_INVALIDATIONS],
  '/tasks': ['/tasks', '/projects/combined', '/tasks/my_notifications', ...GLOBAL_INVALIDATIONS],
  '/project-assignments': ['/projects', '/projects/combined', ...GLOBAL_INVALIDATIONS],
  '/task-assignments': ['/tasks', '/projects/combined', ...GLOBAL_INVALIDATIONS],
  '/users': ['/users', '/users/light', '/org-tree', '/org-hierarchy', '/app-initial-data'],
  '/clock-sessions': [
    '/clock-sessions',
    '/clock-sessions/my_active',
    '/dashboard/summary',
    '/dashboard/summary/aggregated',
    ...GLOBAL_INVALIDATIONS,
  ],
  '/tags': ['/tags', '/app-initial-data', '/reports/team-summary'],
}

type CacheProfile = {
  test: RegExp
  ttlMs: number
  allowStale?: boolean
}

const cacheProfiles: CacheProfile[] = [
  { test: /^\/app-initial-data/, ttlMs: 5 * 60 * 1000, allowStale: true },
  { test: /^\/users\/light/, ttlMs: 5 * 60 * 1000 },
  { test: /^\/users\/?$/, ttlMs: 60 * 1000 },
  { test: /^\/projects(\/|$)/, ttlMs: 2 * 60 * 1000 },
  { test: /^\/tasks(\/|$)/, ttlMs: 60 * 1000 },
  { test: /^\/tasks\/my_notifications/, ttlMs: 30 * 1000 },
  { test: /^\/time-entries(\/|$)/, ttlMs: 15 * 1000 },
  { test: /^\/time-entry/, ttlMs: 15 * 1000 },
  { test: /^\/dashboard\/summary/, ttlMs: 15 * 1000 },
  { test: /^\/dashboard\/summary\/aggregated/, ttlMs: 15 * 1000 },
  { test: /^\/reports\//, ttlMs: 15 * 1000 },
  { test: /^\/clock-sessions/, ttlMs: 5 * 1000 },
  { test: /^\/org-/, ttlMs: 5 * 60 * 1000 },
  { test: /^\/auth\/me/, ttlMs: 30 * 1000 },
]

export type CacheRequestOptions = {
  ttlMs?: number
  allowStale?: boolean
  forceFresh?: boolean
}

function resolveCacheBehavior(path: string): { ttlMs: number, allowStale: boolean } {
  const normalized = path.split('?')[0] || path
  const profile = cacheProfiles.find(p => p.test.test(normalized))
  return {
    ttlMs: profile?.ttlMs ?? Cache.DEFAULT_TTL_MS,
    allowStale: profile?.allowStale ?? false,
  }
}

function normalizePath(url?: string | null): string | null {
  if (!url) return null
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url)
      return parsed.pathname.replace(/^\/api/, '') + (parsed.search || '')
    }
    const path = url.startsWith('/') ? url : `/${url}`
    return path.replace(/^\/api/, '')
  } catch {
    return null
  }
}

function clearCachesFor(path: string | null) {
  if (!path) return
  const basePath = path.split('?')[0]
  const targets = new Set<string>()
  targets.add(basePath)
  Object.entries(mutationInvalidations).forEach(([prefix, extras]) => {
    if (basePath.startsWith(prefix)) {
      extras.forEach(e => targets.add(e))
    }
  })
  Cache.clearMatching((key) => {
    for (const t of targets) {
      if (key === t || key.startsWith(`${t}/`) || key.startsWith(`${t}?`)) return true
    }
    return false
  })
  if (targets.size > 1) {
    console.info('[cache] Cleared caches for', Array.from(targets).join(', '))
  }
}

api.interceptors.request.use((config) => {
  setLoading(1)
  const token = localStorage.getItem('access')
  if (token) {
    config.headers = config.headers || {}
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => {
    setLoading(-1)
    try {
      const method = (response.config?.method || 'get').toLowerCase()
      if (method !== 'get') {
        clearCachesFor(normalizePath(response.config?.url))
      }
    } catch { }
    return response
  },
  async (error) => {
    setLoading(-1)
    const original = error.config
    const status = error?.response?.status
    if (status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh')
      if (refresh) {
        try {
          const refreshUrl = (import.meta.env.VITE_API_URL as string || '') + '/api/auth/token/refresh/'
          const { data } = await axios.post(refreshUrl, { refresh })
          localStorage.setItem('access', data.access)
          original.headers = original.headers || {}
          original.headers['Authorization'] = `Bearer ${data.access}`
          return api(original)
        } catch (e) {
          // fall through to logout
        }
      }
      localStorage.removeItem('access')
      localStorage.removeItem('refresh')
      try { Cache.clearAll(); console.info('[cache] Cleared all cache due to 401/logout redirect') } catch { }
      if (window.location.pathname !== '/login') window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Preemptively refresh access token close to expiry to reduce 401s during active use
let refreshTimer: any
export function scheduleTokenRefresh() {
  clearTimeout(refreshTimer)
  const access = localStorage.getItem('access')
  const refresh = localStorage.getItem('refresh')
  if (!access || !refresh) return
  // schedule for 25 minutes (given 30 min lifetime) to be safe
  refreshTimer = setTimeout(async () => {
    try {
      const refreshUrl = (import.meta.env.VITE_API_URL as string || '') + '/api/auth/token/refresh/'
      const { data } = await axios.post(refreshUrl, { refresh })
      localStorage.setItem('access', data.access)
    } catch {
      // ignore; interceptor will handle on next request
    }
  }, 25 * 60 * 1000)
}

export function clearTokenRefresh() {
  clearTimeout(refreshTimer)
}

export async function logout() {
  // Clear the refresh timer to prevent automatic token refresh
  clearTokenRefresh()

  // Get refresh token before clearing localStorage
  const refreshToken = localStorage.getItem('refresh')

  // Clear all tokens from localStorage
  localStorage.removeItem('access')
  localStorage.removeItem('refresh')

  // Clear app data cache
  try { Cache.clearAll(); console.info('[cache] Cleared all cache on logout') } catch { }

  // Call logout endpoint to blacklist the refresh token
  try {
    if (refreshToken) {
      await api.post('/auth/logout/', { refresh: refreshToken })
    }
  } catch {
    // Ignore logout endpoint errors - tokens are already cleared locally
  }
}

// Cache-backed GET with stale-while-revalidate behavior
export async function getCached<T = any>(
  path: string,
  config?: any,
  options?: number | CacheRequestOptions
): Promise<{ data: T, from: 'cache' | 'expired' | 'miss' | 'server' }> {
  const resolvedOptions: CacheRequestOptions = typeof options === 'number' ? { ttlMs: options } : (options || {})
  const profile = resolveCacheBehavior(path)
  const ttlMs = resolvedOptions.ttlMs ?? profile.ttlMs
  const allowStale = resolvedOptions.allowStale ?? profile.allowStale
  const forceFresh = resolvedOptions.forceFresh ?? false

  const params = config?.params
  const key = Cache.key(path, params)
  const fetcher = async () => {
    const { data } = await api.get(path, config)
    return data
  }

  if (forceFresh) {
    const data = await fetcher()
    if (ttlMs > 0) {
      Cache.set(key, data, ttlMs)
    } else {
      Cache.remove(key)
    }
    return { data: data as T, from: 'server' }
  }

  const result = await Cache.swrFetch<T>(key, fetcher, allowStale, ttlMs)
  return { data: result.data as T, from: result.from }
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me/')
  return data
}

export async function checkNewUser(username: string): Promise<any> {
  return api.post('/auth/check-new-user/', { username })
}

export async function setNewPassword(username: string, password: string, confirmPassword: string): Promise<any> {
  return api.post('/auth/set-new-password/', { username, password, confirm_password: confirmPassword })
}

export default api
