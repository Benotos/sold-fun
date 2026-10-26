import { buildRun, ROUNDS, summarize, validatePlay, type RoundPlay } from '../src/engine/index.js'
import {
  authKeys,
  cors,
  hasRedis,
  keys,
  parseBody,
  pipeline,
  redis,
  seedFor,
  sessionUser,
  todayUtc,
  yesterdayUtc,
  type Req,
  type Res,
  type UserRecord,
  safe,
  weekOf,
} from './_lib.js'

/**
 * Accepts a daily run from a signed in player, after any number of charts (1 to 10).
 * The client only sends WHEN it sold. The server rebuilds the same charts from the secret seed
 * and scores the run itself, so a tampered score is impossible.
 * A player can keep extending their entry as they play more charts, but charts already
 * submitted can never change: every new submission must start with the exact sells stored before.
 */
async function handler(req: Req, res: Res) {
  cors(res)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).json({})
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  if (!hasRedis()) return res.status(503).json({ error: 'Leaderboard storage is not configured yet.' })

  const username = await sessionUser(req)
  if (!username) return res.status(401).json({ error: 'Sign in to submit your run.' })
  const raw = await redis<string | null>('GET', authKeys.user(username))
  if (!raw) return res.status(401).json({ error: 'Account not found. Sign up again.' })
  const user = JSON.parse(raw) as UserRecord

  const body = parseBody<{ day: string; plays: RoundPlay[] }>(req)
  if (!body) return res.status(400).json({ error: 'Missing body' })
  const { day, plays } = body

  if (day !== todayUtc() && day !== yesterdayUtc()) {
    return res.status(400).json({ error: 'That daily run has closed. A new one starts every day at 00:00 UTC.' })
  }
  if (typeof day !== 'string' || !Array.isArray(plays) || plays.length < 1 || plays.length > ROUNDS) {
    return res.status(400).json({ error: 'Malformed run' })
  }

  const all = buildRun(seedFor(day))
  for (let i = 0; i < plays.length; i++) {
    if (!validatePlay(all[i], plays[i])) return res.status(400).json({ error: `Chart ${i + 1} has an impossible sell` })
  }
  const clean = plays.map((p, i) => ({ sells: validatePlay(all[i], p) ?? [] }))

  // charts already on the board are locked: the new run has to start with them
  const prevRaw = await redis<string | null>('HGET', keys.entries(day), username)
  const prev = prevRaw ? (JSON.parse(prevRaw) as { plays?: RoundPlay[]; score: number; charts?: number }) : null
  const prevPlays = prev ? prev.plays ?? null : null
  if (prev && !prevPlays) return res.status(409).json({ error: 'Your run for today is already final.' })
  if (prevPlays) {
    if (clean.length < prevPlays.length) {
      return res.status(409).json({ error: 'Your board entry already has more charts than this run.' })
    }
    for (let i = 0; i < prevPlays.length; i++) {
      if (JSON.stringify(prevPlays[i]) !== JSON.stringify(clean[i])) {
        return res.status(409).json({ error: 'Charts already submitted cannot be replayed.' })
      }
    }
  }

  const summary = summarize(all.slice(0, clean.length), clean)
  const at = Date.now()
  // ties break toward whoever submitted first
  const rankScore = summary.total + (1 - at / 1e13)
  const entry = {
    user: username,
    name: user.display,
    score: summary.total,
    avgPct: Math.round(summary.avgPct * 1000) / 1000,
    rating: summary.rating,
    exits: summary.results.map((r) => r.avgExitTick),
    pcts: summary.results.map((r) => Math.round(r.pctOfTop * 1000) / 1000),
    charts: clean.length,
    plays: clean,
    at,
  }
  // the weekly cup only gets what this submission added
  const gained = summary.total - (prev?.score ?? 0)
  const ttl = 60 * 60 * 24 * 30
  await pipeline([
    ['ZADD', keys.board(day), rankScore, username],
    ['HSET', keys.entries(day), username, JSON.stringify(entry)],
    ['EXPIRE', keys.board(day), ttl],
    ['EXPIRE', keys.entries(day), ttl],
    // weekly cup: every submitted daily score adds up
    ['ZINCRBY', keys.week(weekOf(day)), gained, username],
    ['HSET', keys.weekNames(weekOf(day)), username, user.display],
    ['EXPIRE', keys.week(weekOf(day)), 60 * 60 * 24 * 60],
    ['EXPIRE', keys.weekNames(weekOf(day)), 60 * 60 * 24 * 60],
  ])
  const [rank, players] = (await pipeline([
    ['ZREVRANK', keys.board(day), username],
    ['ZCARD', keys.board(day)],
  ])) as [number, number]

  res.status(200).json({
    ok: true,
    score: summary.total,
    charts: clean.length,
    rating: summary.rating,
    rank: Number(rank) + 1,
    players: Number(players),
  })
}

export default safe(handler)