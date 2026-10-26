import type { Rating } from '../engine'
import type { Difficulty, ModeId } from '../modes'
import { load, save } from './storage'

export interface RunRecord {
  mode: ModeId
  difficulty: Difficulty
  at: number
  score: number
  maxScore: number
  avgPct: number
  rating: Rating | null
  charts: number
  tops: number
  rugged: number
  streak?: number
  beatBots?: number
}

const KEY = 'sold:history'

export function getHistory(): RunRecord[] {
  const h = load<RunRecord[]>(KEY, [])
  return Array.isArray(h) ? h : []
}

export function addRun(r: RunRecord) {
  save(KEY, [r, ...getHistory()].slice(0, 300))
}

export function clearHistory() {
  save(KEY, [])
}

export interface ModePb {
  label: string
  value: number | null
}

export function pbFor(mode: ModeId, history = getHistory()): ModePb {
  const runs = history.filter((r) => r.mode === mode)
  if (!runs.length) return { label: 'No PB yet', value: null }
  if (mode === 'rugdodge') {
    const best = Math.max(...runs.map((r) => r.streak ?? 0))
    return { label: `PB ${best} survived`, value: best }
  }
  const best = Math.max(...runs.map((r) => r.score))
  return { label: `PB ${best} pts`, value: best }
}