import { useEffect, useState } from 'react'
import { load, save } from './storage'

export interface Settings {
  shake: boolean
  hotkeyHints: boolean
  ctFeed: boolean
}

const KEY = 'sold:settings'
const DEFAULTS: Settings = { shake: true, hotkeyHints: true, ctFeed: true }
const subs = new Set<(s: Settings) => void>()

export function getSettings(): Settings {
  return { ...DEFAULTS, ...load<Partial<Settings>>(KEY, {}) }
}

export function setSettings(patch: Partial<Settings>) {
  const next = { ...getSettings(), ...patch }
  save(KEY, next)
  subs.forEach((f) => f(next))
}

export function useSettings(): Settings {
  const [s, setS] = useState(getSettings)
  useEffect(() => {
    subs.add(setS)
    return () => {
      subs.delete(setS)
    }
  }, [])
  return s
}