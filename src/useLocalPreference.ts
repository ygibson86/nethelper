import { useState } from 'react'

export function useLocalPreference<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
  })
  const update = (next: T) => {
    setValue(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Display preferences must not block work. */ }
  }
  return [value, update] as const
}
