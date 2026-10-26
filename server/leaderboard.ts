import { ROUNDS } from '../src/engine/index.js'
import { authKeys, cors, hasRedis, keys, pipeline, redis, todayUtc, type Req, type Res, type UserRecord, safe, weekOf } from './_lib.js'

interface Stored {
  user: string
  name: string | null
  score: number
  avgPct: number
  rating: string
  exits: number[]
  pcts: number[]
  charts?: number
  at: number
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = xs.slice().sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

async function handler(req: Req, res: Res) {
  cors(res)
  const qDay = typeof req.query.day === 'string' ? req.query.day : todayUtc()
  const day = /^\d{4}-\d{2}-\d{2}$/.test(qDay) ? qDay : todayUtc()
  if (!hasRedis()) return res.status(200).json({ day, configured: false, players: 0, entries: [], roundStats: [] })

  if (req.query.scope === 'week') {
    const w = weekOf(day)
    const flat = ((await redis<(string | number)[]>('ZREVRANGE', keys.week(w), 0, 99, 'WITHSCORES')) ?? []).map(String)
    const ids: string[] = []
    const scores: number[] = []
    for (let i = 0; i < flat.length; i += 2) {
      ids.push(flat[i])
      scores.push(Number(flat[i + 1]))
    }
    const [count, names] = (await pipeline([
      ['ZCARD', keys.week(w)],
      ids.length ? ['HMGET', keys.weekNames(w), ...ids] : ['ECHO', ''],
    ])) as [number, (string | null)[] | string]
    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30')
    return res.status(200).json({
      day: w,
      scope: 'week',
      players: Number(count) || 0,
      entries: ids.map((u, i) => ({
        rank: i + 1,
        user: u,
        name: (Array.isArray(names) && names[i]) || u,
        score: scores[i],
        avgPct: null,
        rating: '',
        at: 0,
      })),
      roundStats: [],
    })
  }

  const ids = (await redis<string[]>('ZREVRANGE', keys.board(day), 0, 99)) ?? []
  const [players, raw] = (await pipeline([
    ['ZCARD', keys.board(day)],
    ids.length ? ['HMGET', keys.entries(day), ...ids] : ['ECHO', ''],
  ])) as [number, (string | null)[] | string]

  const rows: Stored[] = Array.isArray(raw) ? raw.filter(Boolean).map((r) => JSON.parse(r as string) as Stored) : []

  // how the best players exited each chart, shown after a round as the "pro exit" marker
  const top = rows.slice(0, 20)
  const roundStats = Array.from({ length: ROUNDS }, (_, i) => ({
    medianExitTick: median(top.map((r) => r.exits[i]).filter((x) => typeof x === 'number')),
    medianPct: median(top.map((r) => r.pcts[i]).filter((x) => typeof x === 'number')),
  }))

  // payout view for the team: /api/leaderboard?day=YYYY-MM-DD&key=ADMIN_KEY
  const admin = Boolean(process.env.ADMIN_KEY) && req.query.key === process.env.ADMIN_KEY
  let payouts: (string | null)[] = []
  if (admin && rows.length) {
    const recs = (await pipeline(rows.slice(0, 10).map((r) => ['GET', authKeys.user(r.user)]))) as (string | null)[]
    payouts = recs.map((x) => (x ? (JSON.parse(x) as UserRecord).payout : null))
  }

  res.setHeader('Cache-Control', admin ? 'no-store' : 'public, s-maxage=10, stale-while-revalidate=30')
  res.status(200).json({
    day,
    players: Number(players) || 0,
    entries: rows.map((r, i) => ({
      rank: i + 1,
      user: r.user,
      name: r.name ?? r.user,
      ...(admin && i < 10 ? { payout: payouts[i] ?? null } : {}),
      score: r.score,
      charts: r.charts ?? 10,
      avgPct: r.avgPct,
      rating: r.rating,
      at: r.at,
    })),
    roundStats,
  })
}

export default safe(handler)