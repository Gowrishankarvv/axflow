import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Cache } from './cache'
import { getCached } from './api'

type AppInitialData = {
  me: any
  users: any[]
  projects: any[]
  tasks: any[]
  time_entries: any[]
  tags: any[]
  meta: any
}

type AppDataContextValue = {
  data: AppInitialData | null
  ready: boolean
  refresh: () => Promise<void>
  currentProjectId: number | null
  setCurrentProjectId: (id: number | null) => void
}

const AppDataContext = createContext<AppDataContextValue>({
  data: null,
  ready: false,
  refresh: async () => { },
  currentProjectId: null,
  setCurrentProjectId: () => { }
})

const CACHE_KEY = '/app-initial-data/?lite=1'

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppInitialData | null>(null)
  const [ready, setReady] = useState(false)
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null)

  useEffect(() => {
    if (data?.projects?.length && currentProjectId === null) {
      setCurrentProjectId(data.projects[0].id)
    }
  }, [data, currentProjectId])

  useEffect(() => {
    let mounted = true
      ; (async () => {
        try {
          // If not authenticated, mark ready and skip fetching
          const token = localStorage.getItem('access')
          if (!token) {
            setReady(true)
            return
          }
          // Try cached data for instant UI
          const cached = Cache.get<AppInitialData>(CACHE_KEY)
          if (cached.hit && cached.data && mounted) {
            setData(cached.data)
            setReady(true)
          }
        } finally {
          // Always refresh in background without blocking UI
          try {
            const token = localStorage.getItem('access')
            if (!token) return
            const res = await getCached<AppInitialData>(CACHE_KEY)
            const d = res.data as any
            if (mounted) {
              setData(d)
              setReady(true)
            }
          } catch {
            // Don't block the UI forever if the backend is down.
            if (mounted) setReady(true)
          }
        }
      })()
    return () => { mounted = false }
  }, [])

  const refresh = async () => {
    const res = await getCached<AppInitialData>(CACHE_KEY, undefined, { forceFresh: true })
    setData(res.data as any)
    setReady(true)
  }

  const value = useMemo(() => ({ data, ready, refresh, currentProjectId, setCurrentProjectId }), [data, ready, currentProjectId])

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData() {
  return useContext(AppDataContext)
}
