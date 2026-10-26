import { ROUNDS, generateRound, lineup, mulberry32, hashString, type PatternId, type Round, type RoundResult, type SellRules } from './engine'

export type ModeId = 'daily' | 'classic' | 'rugdodge' | 'scaleout' | 'blind' | 'free'
export type Difficulty = 'casual' | 'pro' | 'sweat'

export interface GameSpec {
  mode: ModeId
  seed: string
  difficulty: Difficulty
  bots: boolean
}

export interface ModeDef {
  id: ModeId
  name: string
  tag: string
  blurb: string
  /** null means endless */
  charts: number | null
  rules: SellRules
  steps: { title: string; text: string }[]
  /** how the PB for this mode is measured */
  pb: 'score' | 'streak' | 'none'
  ranked: boolean
}

export const MODES: Record<ModeId, ModeDef> = {
  daily: {
    id: 'daily',
    name: 'Daily Run',
    tag: 'RANKED',
    blurb: 'Same 10 charts for everyone. One shot. Top 10 split the pot.',
    charts: ROUNDS,
    rules: 'std',
    pb: 'score',
    ranked: true,
    steps: [
      { title: 'You start holding a bag', text: '1 SOL bought near launch. No entry to time.' },
      { title: 'Sell before it turns', text: 'Sell 50% to lock profit, then sell the rest. Two clicks max.' },
      { title: 'Scored on the top', text: 'Points for how close you sold to the real high. Holding through a rug wipes them.' },
      { title: 'Every chart counts', text: 'Sign up and each chart you finish goes on the board right away. Play more charts to climb. One attempt per chart.' },
    ],
  },
  classic: {
    id: 'classic',
    name: 'Classic',
    tag: 'SOLO',
    blurb: 'Five fresh charts. Sell the top. Chase your PB.',
    charts: 5,
    rules: 'std',
    pb: 'score',
    ranked: false,
    steps: [
      { title: 'Five random charts', text: 'Every run is new. Runners, rugs, bleeds, all of it.' },
      { title: 'Sell 50% or all', text: 'Same rules as the daily run, so it doubles as practice.' },
      { title: 'Beat your PB', text: 'Your best score shows on the mode card.' },
    ],
  },
  rugdodge: {
    id: 'rugdodge',
    name: 'Rug Dodge',
    tag: 'SURVIVAL',
    blurb: 'Endless charts, half of them rug. Get caught once and the run is over.',
    charts: null,
    rules: 'std',
    pb: 'streak',
    ranked: false,
    steps: [
      { title: 'Charts keep coming', text: 'About half are rugs or dev dumps. The other half run.' },
      { title: 'Get out in time', text: 'Holding through a rug, or selling under 25% of the top, ends the run.' },
      { title: 'Read the tells', text: 'Bundlers, insiders and the dev wallet give the rugs away. Watch the stats panel.' },
      { title: 'Streak is your score', text: 'Every chart you survive adds one to your streak.' },
    ],
  },
  scaleout: {
    id: 'scaleout',
    name: 'Scale Out',
    tag: 'TAKE PROFIT',
    blurb: 'Sell in four 25% clips like a real trader. Scored on your average exit.',
    charts: 5,
    rules: 'scale',
    pb: 'score',
    ranked: false,
    steps: [
      { title: 'Four clips per chart', text: 'Every press sells 25% of the bag. Space sells whatever is left.' },
      { title: 'Average exit counts', text: 'Your score uses the average of all four sells against the top.' },
      { title: 'Ladder into strength', text: 'The pros sell some on the way up and the rest near the top.' },
    ],
  },
  blind: {
    id: 'blind',
    name: 'Blind',
    tag: 'HARD',
    blurb: 'No market cap, no PnL, no numbers. Just candles and your gut.',
    charts: 5,
    rules: 'std',
    pb: 'score',
    ranked: false,
    steps: [
      { title: 'Numbers are hidden', text: 'No price axis, no market cap, no PnL. The feed still runs.' },
      { title: 'Read the shape', text: 'Volume, wicks and momentum are all you get.' },
      { title: 'Revealed at the end', text: 'The numbers come back when the chart finishes.' },
    ],
  },
  free: {
    id: 'free',
    name: 'Free Play',
    tag: 'WARM UP',
    blurb: 'Nonstop charts. Nothing is scored. Quit whenever.',
    charts: null,
    rules: 'std',
    pb: 'none',
    ranked: false,
    steps: [
      { title: 'Endless charts', text: 'A new chart starts right after the last one.' },
      { title: 'Nothing saved', text: 'Use it to warm up before the daily run.' },
    ],
  },
}

export const SOLO_MODES: ModeId[] = ['classic', 'rugdodge', 'scaleout', 'blind']

export const DIFFICULTY: Record<Difficulty, { label: string; tickMs: number; note: string; hints: boolean; countdown: number }> = {
  casual: { label: 'Casual', tickMs: 48, note: 'Slower charts and a danger meter that warns you before rugs.', hints: true, countdown: 3 },
  pro: { label: 'Pro', tickMs: 34, note: 'Real speed. No hints. The daily run always plays Pro.', hints: false, countdown: 3 },
  sweat: { label: 'Sweat', tickMs: 22, note: 'Fast charts, one second countdown and sharper bots.', hints: false, countdown: 1 },
}

const RUG_DODGE_POOL: PatternId[] = ['rug', 'devDump', 'rug', 'devDump', 'runner', 'staircase', 'moonshot', 'doubleTop', 'chop']

/** The i-th chart of a game. Daily and fixed length modes use the shuffled lineup, endless modes draw fresh. */
export function roundFor(spec: GameSpec, i: number): Round {
  const def = MODES[spec.mode]
  if (spec.mode === 'rugdodge') {
    const r = mulberry32(hashString(`${spec.seed}:dodge:${i}`))
    return generateRound(spec.seed, i, RUG_DODGE_POOL[Math.floor(r() * RUG_DODGE_POOL.length)])
  }
  if (def.charts !== null) {
    const l = lineup(spec.seed)
    return generateRound(spec.seed, i, l[i % l.length])
  }
  return generateRound(spec.seed, i)
}

export function newSeed(mode: ModeId) {
  return `${mode}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** Rug Dodge: caught when holding through a rug or exiting with almost nothing */
export const caughtIn = (r: RoundResult) => r.rugged || r.pctOfTop < 0.25

/** ms until the weekly cup resets, Monday 00:00 UTC */
export function msUntilWeekEnd(now = new Date()): number {
  const day = now.getUTCDay() // 0 Sunday
  const daysLeft = (8 - day) % 7 || 7
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysLeft)
  return end - now.getTime()
}