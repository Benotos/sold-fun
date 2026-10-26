import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import {
  SESSION_TTL,
  authKeys,
  bearer,
  clientIp,
  cors,
  hasRedis,
  parseBody,
  redis,
  sessionUser,
  type Req,
  type Res,
  type UserRecord,
  safe,
} from './_lib.js'

/**
 * Accounts.
 *   GET                         current user from the Bearer token
 *   POST { action: 'signup', username, password, payout? }
 *   POST { action: 'login', username, password }
 *   POST { action: 'logout' }
 *   POST { action: 'payout', payout }   update the payout address
 */
const USER_RE = /^[a-z0-9_]{3,15}$/
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 32).toString('hex')
}

async function newSession(username: string) {
  const token = randomBytes(32).toString('hex')
  await redis('SET', authKeys.session(token), username, 'EX', SESSION_TTL)
  return token
}

function publicUser(u: UserRecord) {
  return { username: u.username, display: u.display, payout: u.payout }
}

async function getUser(username: string): Promise<UserRecord | null> {
  const raw = await redis<string | null>('GET', authKeys.user(username))
  return raw ? (JSON.parse(raw) as UserRecord) : null
}

/** 20 signup or login attempts per IP per 10 minutes */
async function limited(req: Req) {
  const k = authKeys.limit(clientIp(req))
  const n = await redis<number>('INCR', k)
  if (n === 1) await redis('EXPIRE', k, 600)
  return n > 20
}

async function handler(req: Req, res: Res) {
  cors(res)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).json({})
  if (!hasRedis()) return res.status(503).json({ error: 'Accounts go live at launch.' })

  if (req.method === 'GET') {
    const name = await sessionUser(req)
    const u = name ? await getUser(name) : null
    if (!u) return res.status(401).json({ error: 'Not signed in' })
    return res.status(200).json({ user: publicUser(u) })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST' })

  const body = parseBody<{ action: string; username: string; password: string; payout: string }>(req)
  if (!body) return res.status(400).json({ error: 'Missing body' })
  const action = body.action

  if (action === 'logout') {
    const t = bearer(req)
    if (t) await redis('DEL', authKeys.session(t))
    return res.status(200).json({ ok: true })
  }

  if (action === 'payout') {
    const name = await sessionUser(req)
    const u = name ? await getUser(name) : null
    if (!u) return res.status(401).json({ error: 'Sign in again to change your payout address.' })
    const payout = String(body.payout ?? '').trim()
    if (payout && !SOL_RE.test(payout)) return res.status(400).json({ error: 'That is not a valid Solana address.' })
    u.payout = payout || null
    await redis('SET', authKeys.user(u.username), JSON.stringify(u))
    return res.status(200).json({ user: publicUser(u) })
  }

  if (action !== 'signup' && action !== 'login') return res.status(400).json({ error: 'Unknown action' })
  if (await limited(req)) return res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' })

  const display = String(body.username ?? '').trim().replace(/^@/, '')
  const username = display.toLowerCase()
  const password = String(body.password ?? '')

  if (action === 'signup') {
    if (!USER_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3 to 15 characters: letters, numbers or underscores.' })
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    if (password.length > 128) return res.status(400).json({ error: 'Password is too long.' })
    const payout = String(body.payout ?? '').trim()
    if (payout && !SOL_RE.test(payout)) return res.status(400).json({ error: 'That is not a valid Solana address.' })

    const salt = randomBytes(16).toString('hex')
    const rec: UserRecord = {
      username,
      display,
      salt,
      hash: hashPassword(password, salt),
      payout: payout || null,
      createdAt: Date.now(),
    }
    const ok = await redis<string | null>('SET', authKeys.user(username), JSON.stringify(rec), 'NX')
    if (ok !== 'OK') return res.status(409).json({ error: 'That username is taken.' })
    const token = await newSession(username)
    return res.status(200).json({ token, user: publicUser(rec) })
  }

  // login
  const u = USER_RE.test(username) ? await getUser(username) : null
  const fail = () => res.status(401).json({ error: 'Wrong username or password.' })
  if (!u) return fail()
  const a = Buffer.from(hashPassword(password, u.salt), 'hex')
  const b = Buffer.from(u.hash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return fail()
  const token = await newSession(u.username)
  return res.status(200).json({ token, user: publicUser(u) })
}

export default safe(handler)