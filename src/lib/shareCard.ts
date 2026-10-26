import { PATTERN_INFO, type Round, type RunSummary } from '../engine'
import { CONFIG } from '../config'
import { fmtPct } from './format'

const W = 1200
const H = 675

/** A thermal receipt of the run, built for posting on X. */
export function renderShareCard(canvas: HTMLCanvasElement, rounds: Round[], s: RunSummary, label: string, who: string, headline?: { value: string; caption: string; stamp?: string }) {
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const INK = '#100e0b'
  const PAPER = '#efe6d2'
  const PAPER_INK = '#24201a'
  const GOLD = '#f5b83d'
  const RED = '#e0442f'
  const GREEN = '#1f9c66'
  const DISPLAY = "'Big Shoulders Display', 'Arial Narrow', Impact, sans-serif"
  const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace"

  // background
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = 0.07
  ctx.strokeStyle = GOLD
  for (let x = -H; x < W; x += 28) {
    ctx.beginPath()
    ctx.moveTo(x, H)
    ctx.lineTo(x + H, 0)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // receipt
  const rx = 60
  const ry = 34
  const rw = 470
  const rh = H - 68
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 10
  ctx.fillStyle = PAPER
  ctx.beginPath()
  ctx.moveTo(rx, ry)
  const teeth = 24
  for (let i = 0; i <= teeth; i++) ctx.lineTo(rx + (rw * i) / teeth, ry + (i % 2 ? 7 : 0))
  ctx.lineTo(rx + rw, ry + rh)
  for (let i = teeth; i >= 0; i--) ctx.lineTo(rx + (rw * i) / teeth, ry + rh - (i % 2 ? 7 : 0))
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = PAPER_INK
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  ctx.font = `900 46px ${DISPLAY}`
  ctx.fillText('SOLD.FUN', rx + rw / 2, ry + 66)
  ctx.font = `500 15px ${MONO}`
  ctx.fillText(label, rx + rw / 2, ry + 92)
  ctx.fillText(who ? `TRADER  ${who}` : 'TRADER  ANON', rx + rw / 2, ry + 114)
  dashed(ctx, rx + 24, ry + 132, rw - 48, PAPER_INK)

  ctx.font = `700 14px ${MONO}`
  ctx.textAlign = 'left'
  ctx.fillText('COIN', rx + 28, ry + 156)
  ctx.textAlign = 'right'
  ctx.fillText('OF TOP', rx + rw - 110, ry + 156)
  ctx.fillText('PTS', rx + rw - 28, ry + 156)

  ctx.font = `500 15px ${MONO}`
  const shown = s.results.slice(-10)
  const offset = s.results.length - shown.length
  shown.forEach((r, j) => {
    const i = j + offset
    const y = ry + 184 + j * 29
    ctx.fillStyle = PAPER_INK
    ctx.textAlign = 'left'
    const tag = r.timing === 'rugged' ? ' RUGGED' : r.timing === 'top' ? ' TOP' : ''
    ctx.fillText(`$${rounds[i].ticker}`.slice(0, 10), rx + 28, y)
    ctx.globalAlpha = 0.55
    ctx.fillText(PATTERN_INFO[rounds[i].pattern].label.toUpperCase().slice(0, 10), rx + 158, y)
    ctx.globalAlpha = 1
    ctx.textAlign = 'right'
    ctx.fillStyle = r.timing === 'rugged' ? RED : r.pctOfTop >= 0.85 ? GREEN : PAPER_INK
    ctx.fillText(r.timing === 'rugged' ? '0%' : fmtPct(r.pctOfTop), rx + rw - 110, y)
    ctx.fillStyle = PAPER_INK
    ctx.fillText(String(r.points), rx + rw - 28, y)
    if (tag) {
      ctx.font = `700 10px ${MONO}`
      ctx.fillStyle = r.timing === 'rugged' ? RED : GREEN
      ctx.textAlign = 'left'
      ctx.fillText(tag.trim(), rx + rw - 104, y - 1)
      ctx.font = `500 15px ${MONO}`
    }
  })
  const ty = ry + 184 + Math.max(5, shown.length) * 29 + 4
  dashed(ctx, rx + 24, ty - 14, rw - 48, PAPER_INK)
  ctx.fillStyle = PAPER_INK
  ctx.font = `700 22px ${MONO}`
  ctx.textAlign = 'left'
  ctx.fillText('TOTAL', rx + 28, ty + 16)
  ctx.textAlign = 'right'
  ctx.fillText(`${s.total} / ${s.maxTotal}`, rx + rw - 28, ty + 16)
  ctx.font = `500 13px ${MONO}`
  ctx.textAlign = 'center'
  ctx.fillText('NO REAL MONEY WAS TRADED. ONLY EGOS.', rx + rw / 2, ry + rh - 26)

  // right side
  const cx = 870
  ctx.textAlign = 'center'
  ctx.fillStyle = '#8f8676'
  ctx.font = `600 22px ${MONO}`
  ctx.fillText(headline?.caption ?? 'AVG EXIT', cx, 140)
  ctx.fillStyle = '#f3ece0'
  ctx.font = `900 150px ${DISPLAY}`
  ctx.fillText(headline?.value ?? fmtPct(s.avgPct), cx, 286)
  ctx.fillStyle = '#8f8676'
  ctx.font = `600 22px ${MONO}`
  ctx.fillText(headline ? '' : 'OF THE TOP', cx, 322)

  // stamp
  ctx.save()
  ctx.translate(cx, 460)
  ctx.rotate(-0.09)
  const stampText = headline?.stamp ?? s.rating
  const col = stampText === 'EXIT LIQUIDITY' || stampText === 'DIAMOND HANDS' || stampText === 'CAUGHT' ? RED : GOLD
  ctx.strokeStyle = col
  ctx.lineWidth = 6
  ctx.font = `900 64px ${DISPLAY}`
  const tw = Math.max(380, ctx.measureText(stampText).width + 60)
  ctx.strokeRect(-tw / 2, -54, tw, 108)
  ctx.lineWidth = 2
  ctx.strokeRect(-tw / 2 + 9, -45, tw - 18, 90)
  ctx.fillStyle = col
  ctx.textBaseline = 'middle'
  ctx.fillText(stampText, 0, 4)
  ctx.restore()

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#f3ece0'
  ctx.font = `700 26px ${MONO}`
  ctx.fillText('Anyone can buy. Can you sell?', cx, 590)
  ctx.fillStyle = GOLD
  ctx.font = `600 20px ${MONO}`
  ctx.fillText(CONFIG.siteUrl.replace(/^https?:\/\//, ''), cx, 624)
}

function dashed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.6
  ctx.setLineDash([6, 5])
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  ctx.stroke()
  ctx.restore()
}