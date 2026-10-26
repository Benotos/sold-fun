import { MAX_POINTS_PER_ROUND, TOP_WINDOW, TOTAL_TICKS } from './constants.js'
import type { Rating, Round, RoundPlay, RoundResult, RunSummary, Sell } from './types.js'

const EPS = 1e-9

/**
 * std:   max two sells, 50% then the rest (daily run and most modes)
 * scale: max four sells, 25% each or the rest (Scale Out mode)
 */
export type SellRules = 'std' | 'scale'

/**
 * Checks a play is something the UI could actually produce.
 * Ascending ticks after entry, allowed fractions only.
 * The server runs this before trusting any score.
 */
export function validatePlay(round: Round, play: RoundPlay | undefined, rules: SellRules = 'std'): Sell[] | null {
  if (!play || !Array.isArray(play.sells)) return null
  const sells = play.sells
  const chunk = rules === 'scale' ? 0.25 : 0.5
  if (sells.length > (rules === 'scale' ? 4 : 2)) return null
  let rem = 1
  let lastT = round.entryTick
  for (const s of sells) {
    if (typeof s?.t !== 'number' || typeof s?.frac !== 'number') return null
    if (!Number.isInteger(s.t) || s.t <= lastT || s.t > TOTAL_TICKS - 1) return null
    const okHalf = Math.abs(s.frac - chunk) < EPS && rem > chunk + EPS
    const okRest = Math.abs(s.frac - rem) < EPS
    if (!okHalf && !okRest) return null
    rem -= s.frac
    lastT = s.t
  }
  return sells.map((s) => ({ t: s.t, frac: s.frac }))
}

export function peakOf(round: Round): { peak: number; peakTick: number } {
  let peak = -Infinity
  let peakTick = round.entryTick
  for (let t = round.entryTick + 1; t < TOTAL_TICKS; t++) {
    if (round.ticks[t] > peak) {
      peak = round.ticks[t]
      peakTick = t
    }
  }
  return { peak, peakTick }
}

export function scoreRound(round: Round, play: RoundPlay | undefined, rules: SellRules = 'std'): RoundResult {
  const sells = validatePlay(round, play, rules) ?? []
  const P = round.ticks
  const entry = P[round.entryTick]
  const { peak, peakTick } = peakOf(round)
  const last = TOTAL_TICKS - 1

  let rem = 1
  let value = 0
  let wTick = 0
  let remAtRug = round.rugTick === null ? 0 : 1
  for (const s of sells) {
    value += s.frac * P[s.t]
    wTick += s.frac * s.t
    rem -= s.frac
    if (round.rugTick !== null && s.t < round.rugTick) remAtRug = rem
  }
  const heldToEnd = rem > EPS
  if (heldToEnd) {
    value += rem * P[last]
    wTick += rem * last
  }
  if (round.rugTick === null) remAtRug = 0
  const rugged = remAtRug > EPS

  const exitPrice = value
  const pct = Math.max(0, Math.min(1, exitPrice / peak))
  let points = Math.round(100 * Math.pow(pct, 1.6))
  if (rugged) points = Math.round(points * (1 - remAtRug))
  const sniped = sells.some((s) => Math.abs(s.t - peakTick) <= TOP_WINDOW) && pct >= 0.9
  const bonus = sniped ? 10 : 0
  points = Math.min(MAX_POINTS_PER_ROUND, points + bonus)

  let timing: RoundResult['timing']
  if (rugged && remAtRug >= 0.5 - EPS) timing = 'rugged'
  else if (wTick < peakTick - TOP_WINDOW) timing = 'early'
  else if (wTick > peakTick + TOP_WINDOW) timing = 'late'
  else timing = 'top'

  return {
    entryPrice: entry,
    exitPrice,
    peakPrice: peak,
    peakTick,
    pctOfTop: pct,
    multiple: exitPrice / entry,
    points,
    bonus,
    rugged,
    heldToEnd,
    timing,
    avgExitTick: Math.round(wTick),
    sells,
  }
}

export function rate(results: RoundResult[]): Rating {
  const n = results.length || 1
  const avg = results.reduce((a, r) => a + r.pctOfTop, 0) / n
  const rugs = results.filter((r) => r.timing === 'rugged').length
  const early = results.filter((r) => r.timing === 'early').length
  const late = results.filter((r) => r.timing === 'late').length
  if (rugs >= 3) return 'EXIT LIQUIDITY'
  if (avg >= 0.85) return 'SOLD THE TOP'
  if (avg >= 0.7) return 'BAG SECURED'
  if (early > late) return 'PAPER HANDS'
  return 'DIAMOND HANDS'
}

export const RATING_COPY: Record<Rating, string> = {
  'SOLD THE TOP': 'You read the chart like you wrote it.',
  'BAG SECURED': 'Green across the board. Your bags thank you.',
  'PAPER HANDS': 'You sold before the party started.',
  'DIAMOND HANDS': 'You held through the top and gave it all back.',
  'EXIT LIQUIDITY': 'Someone had to be. Today it was you.',
}

export function summarize(rounds: Round[], plays: RoundPlay[], rules: SellRules = 'std'): RunSummary {
  const results = rounds.map((r, i) => scoreRound(r, plays[i], rules))
  const total = results.reduce((a, r) => a + r.points, 0)
  const avgPct = results.reduce((a, r) => a + r.pctOfTop, 0) / (results.length || 1)
  return {
    total,
    maxTotal: rounds.length * MAX_POINTS_PER_ROUND,
    avgPct,
    rating: rate(results),
    ruggedCount: results.filter((r) => r.timing === 'rugged').length,
    early: results.filter((r) => r.timing === 'early').length,
    late: results.filter((r) => r.timing === 'late').length,
    tops: results.filter((r) => r.timing === 'top').length,
    best: Math.max(0, ...results.map((r) => r.points)),
    results,
  }
}