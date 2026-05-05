import React, { createContext, useContext, useEffect, useState } from 'react'
import { subscribe, loadingCount } from './loading'

const LoadingContext = createContext<number>(0)

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(loadingCount)

  useEffect(() => {
    const unsubscribe = subscribe(setLoading)
    return unsubscribe
  }, [])

  return (
    <LoadingContext.Provider value={loading}>
      {children}
    </LoadingContext.Provider>
  )
}

export function useLoading() {
  return useContext(LoadingContext)
}
