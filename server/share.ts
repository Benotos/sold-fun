import { randomBytes } from 'node:crypto'
import { authKeys, clientIp, cors, hasRedis, parseBody, redis, safe, type Req, type Res } from './_lib.js'

/**
 * Share cards for X.
 *   POST { image: 'data:image/jpeg;base64,...', title, text }  stores the card, returns { id }
 *   GET  /s/:id      tiny page with og and twitter tags, so the link unfurls into the card on X
 *   GET  /s/img/:id  the card image itself
 * Cards expire after 30 days.
 */
const TTL = 60 * 60 * 24 * 30
const MAX_BYTES = 450_000
const ID_RE = /^[a-z0-9]{10}$/

interface Stored {
  img: string
  title: string
  text: string
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

const clean = (s: unknown, max: number) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, max)

function origin(req: Req) {
  const h = req.headers['x-forwarded-host'] ?? req.headers.host
  const host = (Array.isArray(h) ? h[0] : h) ?? 'sold-fun.xyz'
  return `https://${host}`
}

async function handler(req: Req, res: Res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).json({})
  if (!hasRedis()) return res.status(503).json({ error: 'Sharing goes live at launch.' })

  if (req.method === 'POST') {
    const k = authKeys.shareLimit(clientIp(req))
    const n = await redis<number>('INCR', k)
    if (n === 1) await redis('EXPIRE', k, 3600)
    if (n > 40) return res.status(429).json({ error: 'Too many cards this hour.' })

    const body = parseBody<{ image: string; title: string; text: string }>(req)
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body?.image ?? ''))
    if (!m) return res.status(400).json({ error: 'Card must be a JPEG.' })
    const bytes = Buffer.from(m[1], 'base64')
    // real JPEGs start with FF D8 FF
    if (bytes.length > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      return res.status(400).json({ error: 'Card image is not valid.' })
    }
    const id = randomBytes(8).toString('hex').replace(/[^a-z0-9]/g, '').slice(0, 10).padEnd(10, '0')
    const rec: Stored = { img: m[1], title: clean(body?.title, 90), text: clean(body?.text, 200) }
    await redis('SET', authKeys.share(id), JSON.stringify(rec), 'EX', TTL)
    return res.status(200).json({ id })
  }

  const imgId = typeof req.query.img === 'string' ? req.query.img : ''
  const pageId = typeof req.query.id === 'string' ? req.query.id : ''
  const id = imgId || pageId
  const raw = ID_RE.test(id) ? await redis<string | null>('GET', authKeys.share(id)) : null
  const base = origin(req)

  if (imgId) {
    if (!raw) return res.status(404).json({ error: 'Card not found' })
    const rec = JSON.parse(raw) as Stored
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable')
    res.status(200)
    return res.end(Buffer.from(rec.img, 'base64'))
  }

  const rec: Stored | null = raw ? (JSON.parse(raw) as Stored) : null
  const title = esc(rec?.title || 'SOLD.FUN | Anyone can buy. Can you sell?')
  const text = esc(rec?.text || 'A daily exit timing game for the trenches. Sell the top before the dev does.')
  const image = rec ? `${base}/s/img/${id}` : ''
  const url = `${base}/s/${id}`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.status(200)
  res.end(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${text}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SOLD.FUN">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${text}">
${image ? `<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="675">
<meta name="twitter:image" content="${image}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${text}">
<meta name="twitter:site" content="@SoldDotFun">
<style>body{background:#100e0b;color:#f3ece0;font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}a{color:#f5b83d}</style>
</head><body>
${image ? `<img src="${image}" alt="" width="600" style="max-width:90vw;border-radius:8px;display:block;margin:0 auto 16px">` : ''}
<p style="text-align:center">Opening <a href="${base}/#play">SOLD.FUN</a>…</p>
<script>setTimeout(function(){location.replace(${JSON.stringify('/#play')})},1200)</script>
</body></html>`)
}

export default safe(handler)