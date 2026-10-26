import { type Round, type RunSummary } from '../engine'
import { CONFIG } from '../config'
import { fmtPct } from './format'

const W = 1200
const H = 675

const C = {
  ink: '#100e0b',
  panel: '#18150f',
  panel2: '#201c15',
  line: '#2e2920',
  fg: '#f3ece0',
  muted: '#918674',
  gold: '#f5b83d',
  up: '#3ecf8e',
  down: '#ff5a4e',
}
const DISPLAY = "'Big Shoulders Display', 'Arial Narrow', Impact, sans-serif"
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace"

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** A dark trading card of the run, built for posting on X. */
export function renderShareCard(
  canvas: HTMLCanvasElement,
  rounds: Round[],
  s: RunSummary,
  label: string,
  who: string,
  headline?: { value: string; caption: string; stamp?: string },
) {
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // ground: spotlight and a faint hatch
  const g = ctx.createRadialGradient(300, -60, 20, 300, 120, 900)
  g.addColorStop(0, '#4a3510')
  g.addColorStop(0.45, '#1a140c')
  g.addColorStop(1, C.ink)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.save()
  ctx.globalAlpha = 0.05
  ctx.strokeStyle = C.gold
  for (let x = -H; x < W; x += 26) {
    ctx.beginPath()
    ctx.moveTo(x, H)
    ctx.lineTo(x + H * 0.7, 0)
    ctx.stroke()
  }
  ctx.restore()

  // brand: stamp mark and wordmark
  ctx.save()
  ctx.translate(82, 78)
  ctx.rotate(-0.14)
  ctx.strokeStyle = C.gold
  ctx.lineWidth = 4
  ctx.strokeRect(-22, -22, 44, 44)
  ctx.lineWidth = 1.5
  ctx.strokeRect(-16, -16, 32, 32)
  ctx.fillStyle = C.gold
  ctx.font = `900 34px ${DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('S', 0, 2)
  ctx.restore()
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = `900 40px ${DISPLAY}`
  ctx.fillStyle = C.fg
  ctx.fillText('SOLD', 120, 92)
  const sw = ctx.measureText('SOLD').width
  ctx.fillStyle = C.gold
  ctx.fillText('.FUN', 120 + sw, 92)

  ctx.font = `600 15px ${MONO}`
  ctx.fillStyle = C.muted
  ctx.fillText(label.replace(/\s{2,}/g, ' · '), 62, 150)
  ctx.fillStyle = C.fg
  ctx.fillText(who ? `TRADER ${who}` : 'TRADER ANON', 62, 176)

  // headline number
  ctx.fillStyle = C.muted
  ctx.font = `700 16px ${MONO}`
  ctx.fillText(headline?.caption ?? 'AVG EXIT, % OF THE TOP', 62, 236)
  ctx.fillStyle = C.fg
  ctx.font = `900 168px ${DISPLAY}`
  ctx.fillText(headline?.value ?? fmtPct(s.avgPct), 54, 392)

  // rating stamp
  const stampText = headline?.stamp ?? s.rating
  const red = stampText === 'EXIT LIQUIDITY' || stampText === 'DIAMOND HANDS' || stampText === 'CAUGHT'
  const col = red ? C.down : C.gold
  ctx.save()
  ctx.translate(310, 470)
  ctx.rotate(-0.07)
  ctx.font = `900 54px ${DISPLAY}`
  const tw = ctx.measureText(stampText).width + 54
  ctx.strokeStyle = col
  ctx.lineWidth = 5
  ctx.strokeRect(-tw / 2, -40, tw, 80)
  ctx.lineWidth = 1.8
  ctx.strokeRect(-tw / 2 + 8, -32, tw - 16, 64)
  ctx.fillStyle = col
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(stampText, 0, 3)
  ctx.restore()

  // stat chips
  const chips: [string, string, string][] = [
    ['SCORE', `${s.total}`, C.gold],
    ['TOPS', `${s.tops}`, C.up],
    ['RUGGED', `${s.ruggedCount}`, s.ruggedCount ? C.down : C.fg],
  ]
  let cx = 62
  for (const [k, v, c] of chips) {
    ctx.font = `900 34px ${DISPLAY}`
    const vw = ctx.measureText(v).width
    ctx.font = `700 12px ${MONO}`
    const kw = ctx.measureText(k).width
    const w = Math.max(vw, kw) + 36
    rr(ctx, cx, 548, w, 70, 10)
    ctx.fillStyle = 'rgba(24,21,15,0.85)'
    ctx.fill()
    ctx.strokeStyle = C.line
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = C.muted
    ctx.textAlign = 'left'
    ctx.fillText(k, cx + 18, 572)
    ctx.font = `900 34px ${DISPLAY}`
    ctx.fillStyle = c
    ctx.fillText(v, cx + 18, 606)
    cx += w + 12
  }

  // exits panel: one bar per chart, length = share of the top captured
  const px = 640
  const py = 52
  const pw = 500
  const ph = 506
  rr(ctx, px, py, pw, ph, 16)
  ctx.fillStyle = 'rgba(24,21,15,0.92)'
  ctx.fill()
  ctx.strokeStyle = C.line
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = C.muted
  ctx.font = `700 14px ${MONO}`
  ctx.textAlign = 'left'
  ctx.fillText('EXITS', px + 24, py + 38)
  ctx.textAlign = 'right'
  ctx.fillText('OF TOP', px + pw - 24, py + 38)

  const shown = s.results.slice(-10)
  const offset = s.results.length - shown.length
  const rowH = Math.min(64, (ph - 90) / Math.max(1, shown.length))
  const barX = px + 150
  const barW = pw - 150 - 86
  shown.forEach((r, j) => {
    const i = j + offset
    const y = py + 74 + j * rowH
    const rugged = r.timing === 'rugged'
    const c = rugged ? C.down : r.timing === 'top' ? C.gold : r.pctOfTop >= 0.7 ? C.up : C.fg
    ctx.textAlign = 'left'
    ctx.font = `600 15px ${MONO}`
    ctx.fillStyle = C.fg
    ctx.fillText(`$${rounds[i]?.ticker ?? ''}`.slice(0, 9), px + 24, y + 6)
    rr(ctx, barX, y - 7, barW, 14, 7)
    ctx.fillStyle = C.panel2
    ctx.fill()
    const fw = Math.max(rugged ? 0 : 6, barW * (rugged ? 0 : r.pctOfTop))
    if (fw > 0) {
      rr(ctx, barX, y - 7, fw, 14, 7)
      ctx.fillStyle = c
      ctx.fill()
    }
    ctx.textAlign = 'right'
    ctx.font = `700 15px ${MONO}`
    ctx.fillStyle = c
    ctx.fillText(rugged ? 'RUG' : fmtPct(r.pctOfTop), px + pw - 24, y + 6)
  })

  // footer
  ctx.textAlign = 'left'
  ctx.fillStyle = C.fg
  ctx.font = `700 20px ${MONO}`
  ctx.fillText('Anyone can buy. Can you sell?', px + 4, 606)
  ctx.fillStyle = C.gold
  ctx.font = `700 16px ${MONO}`
  ctx.fillText(CONFIG.siteUrl.replace(/^https?:\/\//, ''), px + 4, 634)
  ctx.textAlign = 'right'
  ctx.fillStyle = C.muted
  ctx.fillText(`@${CONFIG.xHandle}`, px + pw, 634)
}