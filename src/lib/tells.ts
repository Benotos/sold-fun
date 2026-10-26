import { hashString, mulberry32, pick, type Round } from '../engine'

/**
 * Holder breakdown shown in the terminal, like the stat row on Axiom or Photon.
 * Rugs really do show heavy bundling and insiders, so a sharp player can spot them.
 * Built from its own RNG so it never changes the chart itself.
 */
export interface Tells {
  top10: number
  snipers: number
  bundlers: number
  insiders: number
}

export function tellsFor(round: Round): Tells {
  const r = mulberry32(hashString(`${round.name}|${round.index}|${round.entryMc}|tells`))
  const between = (a: number, b: number) => Math.round((a + (b - a) * r()) * 10) / 10
  const shady = round.pattern === 'rug'
  const devRisk = round.pattern === 'devDump'
  return {
    top10: shady ? between(44, 62) : devRisk ? between(30, 42) : between(17, 31),
    snipers: between(3, 14),
    bundlers: shady ? between(21, 38) : between(0.5, 7),
    insiders: shady ? between(14, 29) : devRisk ? between(9, 18) : between(1, 8),
  }
}

/** Bonding curve fill, completes at this market cap and migrates */
export const CURVE_DONE_MC = 69000

const HANDLES = ['moonmathdev', 'degenpriest', 'trenchdad', 'lowcapqueen', 'snipergoblin', 'bagholder_x', 'candlemonk', 'rektangle', 'onchainowl']

const HYPE = [
  'this is the one. sending to 1m',
  'chart is cooking, not selling a single token',
  'just aped more. ${T} is the meta',
  'devs are based, community is huge',
  'if you sold ${T} you will regret it',
  'new ATH and still early lol',
]
const FEAR = [
  'who is dumping ${T}??',
  'big red candle, is the dev selling',
  'that was the top wasn’t it',
  'cooked. ${T} is cooked',
  'still holding... right?',
]
const CALM = ['looking at ${T}, clean chart so far', 'bonding curve filling up on ${T}', '${T} holders growing steady']

export interface CtPost {
  handle: string
  text: string
  mood: 'hype' | 'fear' | 'calm'
}

export function ctPost(round: Round, mood: CtPost['mood'], salt: number): CtPost {
  const r = mulberry32(hashString(`${round.ticker}:${mood}:${salt}`))
  const list = mood === 'hype' ? HYPE : mood === 'fear' ? FEAR : CALM
  return { handle: pick(r, HANDLES), text: pick(r, list).replace('${T}', `$${round.ticker}`), mood }
}