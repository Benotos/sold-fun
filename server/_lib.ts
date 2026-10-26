import { createHmac } from 'node:crypto'

/**
 * Upstash Redis over REST. Set in Vercel:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, SOLD_SEED_SECRET
 * Upstash scales per request, so a launch spike will not take the site down.
 */
/**
 * Finds the Upstash REST credentials whatever prefix Vercel gave them
 * (UPSTASH_REDIS_REST_URL, KV_REST_API_URL, STORAGE_KV_REST_API_URL, ...).
 * The read only token is skipped because the game needs to write.
 */
function findEnv(suffixes: string[]): { key: string; value: string } | null {
  for (const sfx of suffixes) {
    for (const [k, v] of Object.entries(process.env)) {
      if (v && k.endsWith(sfx) && !k.includes('READ_ONLY')) return { key: k, value: v }
    }
  }
  return null
}

export function redisEnv() {
  const url = findEnv(['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL', 'REDIS_REST_URL'])
  const token = findEnv(['UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN', 'REDIS_REST_TOKEN'])
  return { url: url?.value ?? '', token: token?.value ?? '', urlKey: url?.key ?? null, tokenKey: token?.key ?? null }
}

const env = () => redisEnv()

export const hasRedis = () => Boolean(env().url && env().token)

export async function redis<T = unknown>(...cmd: (string | number)[]): Promise<T> {
  const { url, token } = env()
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  })
  if (!res.ok && res.status !== 400) throw new Error(`Database returned ${res.status}. Check the Upstash URL and token in Vercel.`)
  const j = (await res.json()) as { result?: T; error?: string }
  if (j.error) throw new Error(j.error)
  return j.result as T
}

export async function pipeline(cmds: (string | number)[][]): Promise<unknown[]> {
  const { url, token } = env()
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  })
  if (!res.ok && res.status !== 400) throw new Error(`Database returned ${res.status}. Check the Upstash URL and token in Vercel.`)
  const j = (await res.json()) as { result?: unknown; error?: string }[]
  return j.map((x) => {
    if (x.error) throw new Error(x.error)
    return x.result
  })
}

/**
 * The daily seed is derived from a server secret, so nobody can generate tomorrow's
 * charts from the client bundle. Without a secret it falls back to the public seed.
 */
export function seedFor(day: string): string {
  const secret = process.env.SOLD_SEED_SECRET
  if (!secret) return `sold-public-${day}`
  return createHmac('sha256', secret).update(`daily:${day}`).digest('hex').slice(0, 32)
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export function yesterdayUtc(): string {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10)
}

export const keys = {
  board: (day: string) => `sold:lb:${day}`,
  entries: (day: string) => `sold:entries:${day}`,
  played: (day: string, user: string) => `sold:played:${day}:${user}`,
  stats: (day: string) => `sold:stats:${day}`,
  week: (w: string) => `sold:week:${w}`,
  weekNames: (w: string) => `sold:weeknames:${w}`,
}

/** Weekly cup id: the date of that week's Monday, UTC */
export function weekOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  const back = (d.getUTCDay() + 6) % 7
  return new Date(d.getTime() - back * 86400000).toISOString().slice(0, 10)
}

// Minimal request/response shapes so we do not depend on @vercel/node types
export interface Req {
  method?: string
  query: Record<string, string | string[] | undefined>
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}
export interface Res {
  status(code: number): Res
  setHeader(name: string, value: string): void
  json(body: unknown): void
  end(body?: string | Uint8Array): void
}

export function cors(res: Res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
}

export const authKeys = {
  user: (u: string) => `sold:user:${u}`,
  session: (t: string) => `sold:sess:${t}`,
  limit: (ip: string) => `sold:rl:${ip}`,
  share: (id: string) => `sold:share:${id}`,
  shareLimit: (ip: string) => `sold:srl:${ip}`,
}

export const SESSION_TTL = 60 * 60 * 24 * 30

export interface UserRecord {
  username: string
  display: string
  hash: string
  salt: string
  payout: string | null
  createdAt: number
}

export function bearer(req: Req): string | null {
  const h = req.headers.authorization
  const v = Array.isArray(h) ? h[0] : h
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(v ?? '')
  return m ? m[1].toLowerCase() : null
}

/** username of a valid session, or null */
export async function sessionUser(req: Req): Promise<string | null> {
  const t = bearer(req)
  if (!t) return null
  return (await redis<string | null>('GET', authKeys.session(t))) ?? null
}

export function clientIp(req: Req): string {
  const f = req.headers['x-forwarded-for']
  const v = Array.isArray(f) ? f[0] : f
  return (v ?? 'unknown').split(',')[0].trim()
}

export function parseBody<T>(req: Req): Partial<T> | null {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Partial<T>
    } catch {
      return null
    }
  }
  return (req.body as Partial<T>) ?? null
}

/** Turns any crash into a readable JSON error instead of a bare 500 */
export function safe(fn: (req: Req, res: Res) => unknown) {
  return async (req: Req, res: Res) => {
    try {
      await fn(req, res)
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : String(e)
      res.status(500).json({ error: `Server error: ${msg}` })
    }
  }
}