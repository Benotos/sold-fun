import { TOTAL_TICKS, scoreRound, type Round, type RoundResult } from '../engine'
import type { Difficulty } from '../modes'

export interface Bot {
  id: string
  name: string
  short: string
  color: string
  style: string
}

export const BOTS: Bot[] = [
  { id: 'pete', name: 'Paper Pete', short: 'P', color: '#b8a98c', style: 'Takes the first 2x or runs at the first red.' },
  { id: 'dee', name: 'Diamond Dee', short: 'D', color: '#7aa7ff', style: 'Never sells unless it halves from the high.' },
  { id: 'sol', name: 'Sniper Sol', short: 'S', color: '#e66be0', style: 'Lets it run, then trails the top.' },
]

export interface BotPlay {
  bot: Bot
  t: number
  result: RoundResult
}

/**
 * Each bot only looks at candles that already happened, so they are fair opponents.
 * Sharper difficulties tighten Sniper Sol's trailing stop.
 */
export function botExits(round: Round, difficulty: Difficulty): BotPlay[] {
  const P = round.ticks
  const e = round.entryTick
  const entry = P[e]
  const last = TOTAL_TICKS - 1
  const trail = difficulty === 'sweat' ? 0.1 : difficulty === 'pro' ? 0.16 : 0.22

  const run = (rule: (t: number, hi: number) => boolean) => {
    let hi = entry
    for (let t = e + 1; t < TOTAL_TICKS; t++) {
      if (P[t] > hi) hi = P[t]
      if (t > e + 8 && rule(t, hi)) return t
    }
    return last
  }

  const pete = run((t, hi) => P[t] >= entry * 2 || P[t] < hi * 0.8)
  const dee = run((t, hi) => P[t] < hi * 0.4)
  const sol = run((t, hi) => (hi >= entry * 2.5 && P[t] < hi * (1 - trail)) || P[t] < entry * 0.6)

  return [
    { bot: BOTS[0], t: pete },
    { bot: BOTS[1], t: dee },
    { bot: BOTS[2], t: sol },
  ].map((b) => ({ ...b, result: scoreRound(round, { sells: [{ t: b.t, frac: 1 }] }) }))
}