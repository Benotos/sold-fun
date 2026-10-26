export const TICKS_PER_CANDLE = 4
export const CANDLES = 170
export const ENTRY_CANDLE = 24
export const TOTAL_TICKS = CANDLES * TICKS_PER_CANDLE
/** last tick of the entry candle, your bag fills here */
export const ENTRY_TICK = ENTRY_CANDLE * TICKS_PER_CANDLE - 1
export const ROUNDS = 10
/** real time per tick while a chart plays */
export const TICK_MS = 34
/** a sell within this many ticks of the top counts as sniping it */
export const TOP_WINDOW = 12
export const MAX_POINTS_PER_ROUND = 110
