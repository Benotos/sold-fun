export type PatternId =
  | 'runner'
  | 'moonshot'
  | 'doubleTop'
  | 'slowBleed'
  | 'fakePump'
  | 'staircase'
  | 'rug'
  | 'devDump'
  | 'chop'

export type EventKind = 'devwarn' | 'devdump' | 'rug' | 'kol' | 'whale'

export interface ChartEvent {
  t: number
  kind: EventKind
  text: string
}

export interface Candle {
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface Round {
  index: number
  pattern: PatternId
  name: string
  ticker: string
  /** relative price per tick */
  ticks: number[]
  /** relative volume per tick */
  vol: number[]
  /** tick where your bag was bought */
  entryTick: number
  entryMc: number
  rugTick: number | null
  dumpTick: number | null
  events: ChartEvent[]
  startHolders: number
  devPct: number
}

export interface Sell {
  /** tick index the sell filled on */
  t: number
  /** fraction of the ORIGINAL bag sold */
  frac: number
}

export interface RoundPlay {
  sells: Sell[]
}

export type Timing = 'early' | 'top' | 'late' | 'rugged'

export interface RoundResult {
  entryPrice: number
  exitPrice: number
  peakPrice: number
  peakTick: number
  pctOfTop: number
  multiple: number
  points: number
  bonus: number
  rugged: boolean
  heldToEnd: boolean
  timing: Timing
  avgExitTick: number
  sells: Sell[]
}

export type Rating = 'SOLD THE TOP' | 'BAG SECURED' | 'PAPER HANDS' | 'DIAMOND HANDS' | 'EXIT LIQUIDITY'

export interface RunSummary {
  total: number
  maxTotal: number
  avgPct: number
  rating: Rating
  ruggedCount: number
  early: number
  late: number
  tops: number
  best: number
  results: RoundResult[]
}
