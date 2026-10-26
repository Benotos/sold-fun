import { CANDLES, ENTRY_CANDLE, ENTRY_TICK, ROUNDS, TICKS_PER_CANDLE, TOTAL_TICKS } from './constants.js'
import { chance, gauss, hashString, int, mulberry32, pick, range, shuffle, type RNG } from './rng.js'
import type { ChartEvent, EventKind, PatternId, Round } from './types.js'

export const PATTERNS: PatternId[] = [
  'runner',
  'moonshot',
  'doubleTop',
  'slowBleed',
  'fakePump',
  'staircase',
  'rug',
  'devDump',
  'chop',
]

/** Shown to players after a round, so they learn to read the shape next time. */
export const PATTERN_INFO: Record<PatternId, { label: string; lesson: string }> = {
  runner: { label: 'Runner', lesson: 'Two legs up with a pullback in between. The second leg is the one to sell into.' },
  moonshot: { label: 'Moonshot', lesson: 'Vertical blowoff candles are the exit, not the entry. When it goes parabolic, sell into strength.' },
  doubleTop: { label: 'Double top', lesson: 'Second push failed to break the first high. That failure was the signal.' },
  slowBleed: { label: 'Slow bleed', lesson: 'No volume, lower highs. The first pop was the top. Fast exits win these.' },
  fakePump: { label: 'Fake pump', lesson: 'One giant green candle out of nowhere usually gets sold just as fast.' },
  staircase: { label: 'Staircase', lesson: 'Steady steps with flat bases. It pays to hold until a step fails.' },
  rug: { label: 'Rug', lesson: 'Bundled wallets dumped at once. If the holders look too clean, take profit early.' },
  devDump: { label: 'Dev dump', lesson: 'The dev wallet started selling a few candles before the big red one. Watch the feed.' },
  chop: { label: 'Chop', lesson: 'Sideways with one fake breakout. Selling the breakout was the play.' },
}

const PREFIX = [
  'Baby', 'Giga', 'Smol', 'Based', 'Sad', 'Rich', 'Lil', 'Turbo', 'Dark', 'Wise', 'Angry', 'Sleepy',
  'Moon', 'Chad', 'Golden', 'Feral', 'Tiny', 'Super', 'Mega', 'Cursed', 'Holy', 'Broke', 'Wet', 'Cozy',
]
const NOUN = [
  'Frog', 'Cat', 'Dog', 'Hamster', 'Penguin', 'Goat', 'Capybara', 'Monk', 'Wizard', 'Banana', 'Toad',
  'Seal', 'Otter', 'Gnome', 'Duck', 'Raccoon', 'Possum', 'Shrimp', 'Moth', 'Llama', 'Pigeon', 'Worm',
  'Sloth', 'Gecko', 'Crab', 'Owl', 'Mole', 'Yak',
]
const KOLS = ['moonmathdev', 'degenpriest', 'trenchdad', 'lowcapqueen', 'snipergoblin', 'bagholder_x', 'candlemonk']

interface Seg {
  n: number
  mu: number
  sig: number
  dead?: boolean
}
interface Drop {
  tick: number
  amount: number
  spread: number
}

function makeName(r: RNG) {
  const a = pick(r, PREFIX)
  const b = pick(r, NOUN)
  const name = `${a} ${b}`
  const options = [b, a.slice(0, 1) + b, ...(a.length + b.length <= 8 ? [a + b] : [])]
  const ticker = pick(r, options).toUpperCase()
  return { name, ticker }
}

/**
 * Builds one chart. Fully deterministic from (seed, index, pattern).
 * Prices are a random walk in log space, shaped by segments (drift and volatility per stretch)
 * plus discrete drops for rugs and dev dumps.
 */
export function generateRound(seed: string, index: number, forcedPattern?: PatternId): Round {
  const r = mulberry32(hashString(`${seed}#${index}`))
  const pattern = forcedPattern ?? pick(r, PATTERNS)
  const { name, ticker } = makeName(r)

  const post = CANDLES - ENTRY_CANDLE
  const segs: Seg[] = [{ n: ENTRY_CANDLE, mu: range(r, 0.035, 0.06), sig: 0.075 }]
  const drops: Drop[] = []
  const evs: { candle: number; kind: EventKind; text: string }[] = []
  let used = 0
  let rugCandle: number | null = null
  let rugDropTick: number | null = null
  let dumpCandle: number | null = null

  const add = (n: number, mu: number, sig: number, dead = false) => {
    const len = Math.max(0, Math.min(Math.round(n), post - used))
    if (len <= 0) return
    segs.push({ n: len, mu, sig, dead })
    used += len
  }
  const fill = (mu: number, sig: number, dead = false) => add(post - used, mu, sig, dead)
  const now = () => ENTRY_CANDLE + used
  const kol = () => evs.push({ candle: now(), kind: 'kol', text: `@${pick(r, KOLS)} posted the CA` })
  const whale = () => evs.push({ candle: now(), kind: 'whale', text: `Whale bought ${range(r, 9, 42).toFixed(1)} SOL` })
  const devWarn = (c: number) => evs.push({ candle: c, kind: 'devwarn', text: `Dev wallet sold ${int(r, 2, 6)}% of supply` })

  switch (pattern) {
    case 'runner': {
      add(int(r, 10, 22), 0.0, 0.05)
      kol()
      add(int(r, 22, 34), range(r, 0.04, 0.055), 0.06)
      add(int(r, 8, 14), -0.04, 0.06)
      if (chance(r, 0.5)) whale()
      add(int(r, 16, 26), range(r, 0.035, 0.05), 0.07)
      if (chance(r, 0.3)) devWarn(now() + int(r, 2, 10))
      fill(-0.022, 0.06)
      break
    }
    case 'moonshot': {
      add(int(r, 6, 12), 0.0, 0.05)
      kol()
      add(int(r, 24, 32), range(r, 0.05, 0.065), 0.07)
      add(int(r, 6, 10), -0.015, 0.06)
      whale()
      add(int(r, 18, 24), range(r, 0.06, 0.075), 0.08)
      add(int(r, 4, 7), 0.13, 0.1)
      fill(-0.05, 0.08)
      break
    }
    case 'doubleTop': {
      add(int(r, 18, 26), range(r, 0.05, 0.065), 0.06)
      add(int(r, 12, 16), -0.045, 0.06)
      if (chance(r, 0.5)) devWarn(now() + int(r, 0, 4))
      add(int(r, 12, 16), 0.05, 0.06)
      add(int(r, 4, 8), 0, 0.05)
      fill(-0.035, 0.06)
      break
    }
    case 'slowBleed': {
      add(int(r, 4, 7), 0.05, 0.05)
      add(int(r, 30, 50), -0.012, 0.055)
      add(int(r, 5, 8), 0.04, 0.06)
      fill(-0.015, 0.05)
      break
    }
    case 'fakePump': {
      add(int(r, 10, 30), 0.005, 0.05)
      whale()
      add(int(r, 4, 6), range(r, 0.16, 0.22), 0.08)
      add(int(r, 5, 8), -0.16, 0.08)
      fill(-0.012, 0.05)
      break
    }
    case 'staircase': {
      const steps = int(r, 4, 6)
      for (let s = 0; s < steps; s++) {
        add(int(r, 4, 7), range(r, 0.06, 0.09), 0.05)
        add(int(r, 8, 14), 0, 0.035)
      }
      if (chance(r, 0.3)) devWarn(ENTRY_CANDLE + int(r, 20, 60))
      fill(-0.015, 0.05)
      break
    }
    case 'rug': {
      add(int(r, 10, 20), 0.01, 0.05)
      if (chance(r, 0.6)) kol()
      add(int(r, 18, 36), range(r, 0.035, 0.05), 0.06)
      rugCandle = now()
      rugDropTick = rugCandle * TICKS_PER_CANDLE + int(r, 0, 2)
      drops.push({ tick: rugDropTick, amount: Math.log(range(r, 0.025, 0.05)), spread: 2 })
      evs.push({ candle: rugCandle, kind: 'rug', text: 'Bundled wallets dumped everything' })
      fill(-0.004, 0.012, true)
      break
    }
    case 'devDump': {
      add(int(r, 20, 34), range(r, 0.04, 0.055), 0.06)
      dumpCandle = now()
      devWarn(dumpCandle - int(r, 2, 5))
      drops.push({ tick: dumpCandle * TICKS_PER_CANDLE + 1, amount: Math.log(range(r, 0.3, 0.45)), spread: 3 })
      evs.push({ candle: dumpCandle, kind: 'devdump', text: `Dev dumped ${int(r, 8, 18)}% of supply` })
      add(int(r, 6, 10), 0.03, 0.07)
      fill(-0.02, 0.05)
      break
    }
    case 'chop': {
      add(int(r, 15, 30), 0, 0.07)
      add(int(r, 10, 14), 0.05, 0.07)
      add(int(r, 10, 14), -0.05, 0.07)
      fill(0.002, 0.07)
      break
    }
  }
  if (used < post) fill(-0.01, 0.05)

  // walk
  const ticks: number[] = new Array(TOTAL_TICKS)
  const vol: number[] = new Array(TOTAL_TICKS)
  const dropAt = new Map<number, Drop>()
  for (const d of drops) dropAt.set(d.tick, d)
  let x = 0
  let t = 0
  let pending: { left: number; per: number } | null = null
  const sq = Math.sqrt(TICKS_PER_CANDLE)
  for (const s of segs) {
    for (let k = 0; k < s.n * TICKS_PER_CANDLE && t < TOTAL_TICKS; k++, t++) {
      let dx = s.mu / TICKS_PER_CANDLE + (s.sig / sq) * gauss(r)
      if (!s.dead && r() < 0.012) dx += gauss(r) * s.sig * 1.4 // fat tails
      const d = dropAt.get(t)
      if (d) pending = { left: d.spread, per: d.amount / d.spread }
      if (pending) {
        dx += pending.per
        pending.left--
        if (pending.left <= 0) pending = null
      }
      x += dx
      ticks[t] = Math.exp(x)
      const base = s.dead ? 0.08 : 0.6 + Math.abs(s.mu) * 18
      vol[t] = Math.max(0.02, base * (0.5 + r()) + Math.abs(dx) * 40)
    }
  }

  const events: ChartEvent[] = evs
    .filter((e) => e.candle > ENTRY_CANDLE && e.candle < CANDLES)
    .map((e) => ({ t: Math.min(TOTAL_TICKS - 1, e.candle * TICKS_PER_CANDLE), kind: e.kind, text: e.text }))
    .sort((a, b) => a.t - b.t)

  return {
    index,
    pattern,
    name,
    ticker,
    ticks,
    vol,
    entryTick: ENTRY_TICK,
    entryMc: Math.round(range(r, 6000, 38000)),
    rugTick: rugDropTick,
    dumpTick: dumpCandle === null ? null : dumpCandle * TICKS_PER_CANDLE,
    events,
    startHolders: int(r, 60, 220),
    devPct: Math.round(range(r, 2.5, 9) * 10) / 10,
  }
}

/** The 10 patterns of a daily run. Every run has at least one rug and one big runner. */
export function lineup(seed: string): PatternId[] {
  const r = mulberry32(hashString(`${seed}:lineup`))
  const base = PATTERNS.slice()
  base.push(pick(r, ['runner', 'rug', 'devDump', 'fakePump', 'doubleTop', 'moonshot'] as PatternId[]))
  return shuffle(r, base).slice(0, ROUNDS)
}

export function buildRun(seed: string): Round[] {
  return lineup(seed).map((p, i) => generateRound(seed, i, p))
}

/** mc at a tick */
export function mcAt(round: Round, t: number): number {
  return (round.entryMc * round.ticks[t]) / round.ticks[round.entryTick]
}