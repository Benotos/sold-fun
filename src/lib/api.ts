import { dayKey, type RoundPlay } from '../engine'
import { load, save } from './storage'

export interface DailyInfo {
  day: string
  seed: string
  /** true when the API is unreachable and we fall back to a public seed (dev, preview) */
  offline: boolean
}

export interface BoardEntry {
  rank: number
  user: string
  name: string
  score: number
  charts?: number
  avgPct: number | null
  rating: string
  at: number
}

export interface RoundStat {
  /** median exit tick of the top 20 players, null when nobody submitted */
  medianExitTick: number | null
  medianPct: number | null
}

export interface Board {
  day: string
  players: number
  entries: BoardEntry[]
  roundStats: RoundStat[]
}

async function timed(input: string, init?: RequestInit, ms = 4000): Promise<Response> {
  const c = new AbortController()
  const id = setTimeout(() => c.abort(), ms)
  try {
    return await fetch(input, { ...init, signal: c.signal })
  } finally {
    clearTimeout(id)
  }
}

export function publicSeed(day: string) {
  return `sold-public-${day}`
}

export async function getDaily(): Promise<DailyInfo> {
  const day = dayKey()
  try {
    const res = await timed('/api/daily')
    if (!res.ok) throw new Error(String(res.status))
    const j = (await res.json()) as { day: string; seed: string }
    if (typeof j.seed !== 'string') throw new Error('bad seed')
    return { day: j.day, seed: j.seed, offline: false }
  } catch {
    return { day, seed: publicSeed(day), offline: true }
  }
}

export async function getBoard(day: string, scope: 'day' | 'week' = 'day'): Promise<Board | null> {
  try {
    const res = await timed(`/api/leaderboard?day=${encodeURIComponent(day)}${scope === 'week' ? '&scope=week' : ''}`)
    if (!res.ok) return null
    const b = (await res.json()) as Board & { configured?: boolean }
    // the API answers but has no database yet, treat it as offline
    return b.configured === false ? null : b
  } catch {
    return null
  }
}

export interface User {
  username: string
  display: string
  payout: string | null
}

const TOKEN_KEY = 'sold:token'
export const getToken = () => load<string | null>(TOKEN_KEY, null)
const setToken = (t: string | null) => save(TOKEN_KEY, t)

function authHeaders(): Record<string, string> {
  const t = getToken()
  return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' }
}

export type AuthResult = { ok: true; user: User } | { ok: false; error: string }

async function authPost(payload: Record<string, unknown>): Promise<AuthResult> {
  try {
    const res = await timed('/api/auth', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) }, 8000)
    const j = (await res.json().catch(() => ({}))) as { token?: string; user?: User; error?: string }
    if (!res.ok || !j.user) {
      if (res.status === 404) return { ok: false, error: 'Accounts go live at launch.' }
      return { ok: false, error: j.error ?? `Server returned ${res.status}` }
    }
    if (j.token) setToken(j.token)
    return { ok: true, user: j.user }
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' }
  }
}

export const signUp = (username: string, password: string, payout: string) =>
  authPost({ action: 'signup', username, password, payout })
export const logIn = (username: string, password: string) => authPost({ action: 'login', username, password })
export const updatePayout = (payout: string) => authPost({ action: 'payout', payout })

export async function getMe(): Promise<User | null> {
  if (!getToken()) return null
  try {
    const res = await timed('/api/auth', { headers: authHeaders() })
    if (res.status === 401) setToken(null)
    if (!res.ok) return null
    return ((await res.json()) as { user: User }).user
  } catch {
    return null
  }
}

export async function logOut() {
  try {
    await timed('/api/auth', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'logout' }) })
  } catch {
    /* the local token is dropped either way */
  }
  setToken(null)
}

export type SubmitResult =
  | { ok: true; rank: number; score: number; players: number; charts: number }
  | { ok: false; error: string }

export async function submitRun(day: string, plays: RoundPlay[]): Promise<SubmitResult> {
  try {
    const res = await timed('/api/submit', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ day, plays }) }, 8000)
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return { ok: false, error: String(j.error ?? `Server returned ${res.status}`) }
    return { ok: true, rank: Number(j.rank), score: Number(j.score), players: Number(j.players), charts: Number(j.charts) }
  } catch {
    return { ok: false, error: 'Could not reach the leaderboard. Check your connection and try again.' }
  }
}

/** Stores the share card and returns a link that unfurls into it on X, or null if sharing is offline */
export async function uploadShare(image: string, title: string, text: string): Promise<string | null> {
  try {
    const res = await timed(
      '/api/share',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, title, text }) },
      10000,
    )
    if (!res.ok) return null
    const j = (await res.json()) as { id?: string }
    return j.id ? `${location.origin}/s/${j.id}` : null
  } catch {
    return null
  }
}