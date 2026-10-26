import { useEffect, useRef, useState } from 'react'
import { CANDLES, TICKS_PER_CANDLE, peakOf, type Candle, type Round, type Sell } from '../engine'
import { fmtMc } from '../lib/format'

interface Props {
  round: Round
  /** last visible tick, inclusive */
  upto: number
  sells: Sell[]
  /** after the round: show the top, the rug and the pro exit */
  reveal?: boolean
  proExitTick?: number | null
  compact?: boolean
  label?: string
  /** bot sells drawn as small markers */
  bots?: { t: number; short: string; color: string }[]
  /** hide every number until the reveal */
  blind?: boolean
}

export function aggregate(round: Round, upto: number): Candle[] {
  const out: Candle[] = []
  const last = Math.min(upto, round.ticks.length - 1)
  const n = Math.floor(last / TICKS_PER_CANDLE) + 1
  for (let ci = 0; ci < n; ci++) {
    const start = ci * TICKS_PER_CANDLE
    const end = Math.min(start + TICKS_PER_CANDLE - 1, last)
    const o = ci === 0 ? round.ticks[0] * 0.97 : round.ticks[start - 1]
    let h = o
    let l = o
    let v = 0
    for (let t = start; t <= end; t++) {
      const p = round.ticks[t]
      if (p > h) h = p
      if (p < l) l = p
      v += round.vol[t]
    }
    out.push({ o, h, l, c: round.ticks[end], v })
  }
  return out
}

export function Chart({ round, upto, sells, reveal = false, proExitTick = null, compact = false, label, bots = [], blind = false }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 640, h: 360 })

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize({ w: Math.max(220, Math.floor(r.width)), h: Math.max(160, Math.floor(r.height)) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = cv.current
    if (!canvas) return
    draw(canvas, size.w, size.h, { round, upto, sells, reveal, proExitTick, compact, bots, blind })
  }, [round, upto, sells, reveal, proExitTick, compact, size, bots, blind])

  return (
    <div className="chart" ref={wrap} role="img" aria-label={label ?? `${round.ticker} price chart`}>
      <canvas ref={cv} />
    </div>
  )
}

function draw(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  o: Required<Omit<Props, 'label'>>,
) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const css = getComputedStyle(canvas)
  const c = (n: string, fb: string) => css.getPropertyValue(n).trim() || fb
  const UP = c('--up', '#3ecf8e')
  const DOWN = c('--down', '#ff5a4e')
  const GOLD = c('--gold', '#f5b83d')
  const GRID = c('--grid', 'rgba(255,255,255,0.06)')
  const MUTED = c('--muted', '#8f8676')
  const INK = c('--ink', '#100e0b')
  const FG = c('--fg', '#f3ece0')
  const MONO = "500 11px 'JetBrains Mono', ui-monospace, monospace"

  const { round, upto, sells, reveal, proExitTick, compact, bots } = o
  const hideNums = o.blind && !reveal
  const candles = aggregate(round, upto)
  const entryP = round.ticks[round.entryTick]
  const mc = (p: number) => (round.entryMc * p) / entryP

  const padL = compact ? 6 : 10
  const padR = compact ? 6 : 74
  const padT = compact ? 14 : 22
  const padB = compact ? 8 : 24
  const plotW = w - padL - padR
  const plotH = h - padT - padB

  let lo = Infinity
  let hi = -Infinity
  for (const k of candles) {
    if (k.l < lo) lo = k.l
    if (k.h > hi) hi = k.h
  }
  lo = Math.min(lo, entryP)
  hi = Math.max(hi, entryP)
  const span = hi - lo || hi * 0.1
  hi += span * 0.14
  lo = Math.max(0, lo - span * 0.06)

  const cw = plotW / CANDLES
  const X = (ci: number) => padL + ci * cw + cw / 2
  const Y = (p: number) => padT + (1 - (p - lo) / (hi - lo)) * plotH

  // grid and axis
  ctx.font = MONO
  ctx.textBaseline = 'middle'
  const lines = compact ? 3 : 5
  for (let i = 0; i <= lines; i++) {
    const p = lo + ((hi - lo) * i) / lines
    const y = Y(p)
    ctx.strokeStyle = GRID
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padL, Math.round(y) + 0.5)
    ctx.lineTo(padL + plotW, Math.round(y) + 0.5)
    ctx.stroke()
    if (!compact && !hideNums) {
      ctx.fillStyle = MUTED
      ctx.textAlign = 'left'
      ctx.fillText(fmtMc(mc(p)), padL + plotW + 8, y)
    }
  }

  // volume
  let vmax = 0
  for (const k of candles) vmax = Math.max(vmax, k.v)
  const volH = plotH * 0.16
  candles.forEach((k, i) => {
    const vh = vmax ? (k.v / vmax) * volH : 0
    ctx.fillStyle = k.c >= k.o ? UP : DOWN
    ctx.globalAlpha = 0.16
    ctx.fillRect(X(i) - Math.max(1, cw * 0.31), padT + plotH - vh, Math.max(1, cw * 0.62), vh)
  })
  ctx.globalAlpha = 1

  // entry line
  const ey = Y(entryP)
  const entryCi = Math.floor(round.entryTick / TICKS_PER_CANDLE)
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = GOLD
  ctx.globalAlpha = 0.55
  ctx.beginPath()
  ctx.moveTo(X(entryCi), ey)
  ctx.lineTo(padL + plotW, ey)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  if (!compact) pill(ctx, X(entryCi) - 2, ey, 'YOUR ENTRY', GOLD, INK, 'right')

  // pro exit (median of top players)
  if (reveal && proExitTick != null) {
    const px = X(Math.floor(proExitTick / TICKS_PER_CANDLE))
    ctx.strokeStyle = FG
    ctx.globalAlpha = 0.35
    ctx.setLineDash([2, 5])
    ctx.beginPath()
    ctx.moveTo(px, padT)
    ctx.lineTo(px, padT + plotH)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    ctx.fillStyle = FG
    ctx.textAlign = 'center'
    ctx.fillText('PRO EXIT', px, padT + plotH + 12)
  }

  // candles
  const bw = Math.max(1, cw * 0.62)
  candles.forEach((k, i) => {
    const up = k.c >= k.o
    const col = up ? UP : DOWN
    const x = X(i)
    ctx.strokeStyle = col
    ctx.fillStyle = col
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(Math.round(x) + 0.5, Y(k.h))
    ctx.lineTo(Math.round(x) + 0.5, Y(k.l))
    ctx.stroke()
    const y1 = Y(Math.max(k.o, k.c))
    const y2 = Y(Math.min(k.o, k.c))
    ctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1))
  })

  // rug marker
  const rugT = round.rugTick ?? round.dumpTick
  if (rugT != null && (reveal || upto >= rugT + 4)) {
    const ci = Math.floor(rugT / TICKS_PER_CANDLE)
    if (ci < candles.length) {
      const y = Y(candles[ci].h)
      ctx.fillStyle = DOWN
      ctx.textAlign = 'center'
      ctx.font = "700 11px 'JetBrains Mono', ui-monospace, monospace"
      ctx.fillText(round.rugTick != null ? 'RUG' : 'DEV DUMP', X(ci), Math.max(padT, y - 12))
      ctx.font = MONO
    }
  }

  // the top
  if (reveal) {
    const { peak, peakTick } = peakOf(round)
    const px = X(Math.floor(peakTick / TICKS_PER_CANDLE))
    const py = Y(peak)
    ctx.fillStyle = FG
    ctx.beginPath()
    ctx.moveTo(px, py - 6)
    ctx.lineTo(px - 5, py - 14)
    ctx.lineTo(px + 5, py - 14)
    ctx.closePath()
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.fillText(`TOP ${fmtMc(mc(peak))}`, Math.min(Math.max(px, padL + 40), padL + plotW - 40), Math.max(8, py - 22))
  }

  // bot sells
  for (const b of bots) {
    if (b.t > upto || b.t >= round.ticks.length) continue
    const x = X(Math.floor(b.t / TICKS_PER_CANDLE))
    const y = Y(round.ticks[b.t])
    ctx.fillStyle = b.color
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.arc(x, y - 14, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = INK
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = "700 10px 'JetBrains Mono', ui-monospace, monospace"
    ctx.fillText(b.short, x, y - 13.5)
    ctx.strokeStyle = b.color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y - 6)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  ctx.font = MONO

  // sells
  for (const s of sells) {
    if (s.t > upto) continue
    const ci = Math.floor(s.t / TICKS_PER_CANDLE)
    const x = X(ci)
    const y = Y(round.ticks[s.t])
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, y + 18)
    ctx.stroke()
    ctx.fillStyle = GOLD
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 2
    ctx.stroke()
    if (!compact || sells.length === 1) {
      pill(ctx, x, y + 28, s.frac === 0.5 && sells.length > 1 ? 'SOLD 50%' : 'SOLD', GOLD, INK, 'center')
    }
  }

  // live price tag
  if (!compact && !hideNums && candles.length) {
    const last = candles[candles.length - 1]
    const y = Y(last.c)
    const col = last.c >= entryP ? UP : DOWN
    ctx.setLineDash([1, 3])
    ctx.strokeStyle = col
    ctx.globalAlpha = 0.6
    ctx.beginPath()
    ctx.moveTo(X(candles.length - 1), y)
    ctx.lineTo(padL + plotW, y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    const label = fmtMc(mc(last.c))
    ctx.font = "700 11px 'JetBrains Mono', ui-monospace, monospace"
    const tw = ctx.measureText(label).width + 12
    ctx.fillStyle = col
    roundRect(ctx, padL + plotW + 2, y - 10, tw, 20, 3)
    ctx.fill()
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    ctx.fillText(label, padL + plotW + 8, y + 1)
  }
}

function pill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  bg: string,
  fg: string,
  align: 'left' | 'right' | 'center',
) {
  ctx.font = "700 10px 'JetBrains Mono', ui-monospace, monospace"
  const tw = ctx.measureText(text).width + 10
  const left = align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x
  ctx.fillStyle = bg
  roundRect(ctx, left, y - 8, tw, 16, 3)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + tw / 2, y + 0.5)
  ctx.font = "500 11px 'JetBrains Mono', ui-monospace, monospace"
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}