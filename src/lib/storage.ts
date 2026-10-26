/** localStorage that never throws. Private windows and blocked storage just fall back to memory. */
const mem = new Map<string, string>()

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw != null) return JSON.parse(raw) as T
  } catch {
    const raw = mem.get(key)
    if (raw != null) {
      try {
        return JSON.parse(raw) as T
      } catch {
        /* ignore */
      }
    }
  }
  return fallback
}

export function save(key: string, value: unknown) {
  const raw = JSON.stringify(value)
  try {
    window.localStorage.setItem(key, raw)
  } catch {
    mem.set(key, raw)
  }
}
