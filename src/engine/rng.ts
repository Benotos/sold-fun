export type RNG = () => number

/** Small, fast, deterministic PRNG. Same seed, same charts, on client and server. */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV 1a string hash */
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const range = (r: RNG, a: number, b: number) => a + (b - a) * r()
export const int = (r: RNG, a: number, b: number) => Math.floor(range(r, a, b + 1))
export const pick = <T,>(r: RNG, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]
export const chance = (r: RNG, p: number) => r() < p

export function gauss(r: RNG): number {
  let u = 0
  let v = 0
  while (u === 0) u = r()
  while (v === 0) v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function shuffle<T>(r: RNG, arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** UTC day key, YYYY-MM-DD. A new daily run starts at 00:00 UTC. */
export function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

export function msUntilNextDay(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return next - now.getTime()
}
