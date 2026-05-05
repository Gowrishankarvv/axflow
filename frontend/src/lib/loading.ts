export let loadingCount = 0
export const listeners: ((count: number) => void)[] = []

export function setLoading(delta: number) {
  loadingCount += delta
  if (loadingCount < 0) loadingCount = 0
  listeners.forEach(l => l(loadingCount))
}

export function subscribe(callback: (count: number) => void) {
  listeners.push(callback)
  return () => {
    const index = listeners.indexOf(callback)
    if (index > -1) listeners.splice(index, 1)
  }
}
