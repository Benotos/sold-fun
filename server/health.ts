import { cors, hasRedis, redis, redisEnv, todayUtc, keys, type Req, type Res } from './_lib.js'

/**
 * Setup check. Open /api/health after deploying.
 * Shows which settings are present and whether the database answers.
 * Never prints secret values, only names.
 */
export default async function handler(_req: Req, res: Res) {
  cors(res)
  res.setHeader('Cache-Control', 'no-store')
  const env = redisEnv()
  const out: Record<string, unknown> = {
    database_url_setting: env.urlKey ?? 'MISSING',
    database_token_setting: env.tokenKey ?? 'MISSING',
    seed_secret: process.env.SOLD_SEED_SECRET ? 'set' : 'MISSING (daily charts use the public seed)',
    admin_key: process.env.ADMIN_KEY ? 'set' : 'not set (optional)',
    // a plain redis:// address cannot be used, the game talks to Upstash over REST
    other_redis_settings: Object.keys(process.env).filter((k) => /REDIS|KV_/.test(k) && k !== env.urlKey && k !== env.tokenKey),
    day: todayUtc(),
  }
  if (!hasRedis()) {
    out.database = 'NOT CONNECTED: add an Upstash Redis database in Vercel Storage and connect it to this project, then redeploy'
    return res.status(200).json(out)
  }
  try {
    const pong = await redis<string>('PING')
    out.database = pong === 'PONG' ? 'connected' : `unexpected reply: ${pong}`
    out.players_today = await redis<number>('ZCARD', keys.board(todayUtc()))
    const users = await redis<[string, string[]]>('SCAN', 0, 'MATCH', 'sold:user:*', 'COUNT', 1000)
    out.accounts_sample = Array.isArray(users?.[1]) ? users[1].length : 0
  } catch (e) {
    out.database = `ERROR: ${e instanceof Error ? e.message : String(e)}`
  }
  res.status(200).json(out)
}