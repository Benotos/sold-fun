export function fmtMc(n: number): string {
  if (!isFinite(n)) return '$0'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`
  return `$${Math.max(0, n).toFixed(0)}`
}

export function fmtX(x: number): string {
  if (x >= 100) return `${x.toFixed(0)}x`
  if (x >= 10) return `${x.toFixed(1)}x`
  return `${x.toFixed(2)}x`
}

export function fmtPnl(x: number): string {
  const pct = (x - 1) * 100
  const sign = pct >= 0 ? '+' : ''
  if (Math.abs(pct) >= 1000) return `${sign}${Math.round(pct).toLocaleString('en-US')}%`
  return `${sign}${pct.toFixed(1)}%`
}

export function fmtPct(p: number): string {
  return `${Math.round(p * 100)}%`
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':')
}

export function shortAddr(a: string): string {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a
}

const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export function fakeWallet(): string {
  let s = ''
  for (let i = 0; i < 4; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]
  return s
}
