import type { RoundPlay } from './types'

/** The exact text a wallet signs to submit a run. Shared by client and server. */
export function submitMessage(day: string, wallet: string, plays: RoundPlay[]): string {
  const compact = plays.map((p) => p.sells.map((s) => `${s.t}:${s.frac}`).join(',')).join('|')
  return `SOLD.FUN daily run\nday: ${day}\nwallet: ${wallet}\nsells: ${compact}`
}
