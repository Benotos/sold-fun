import { cors, seedFor, todayUtc, type Req, type Res } from './_lib.js'

export default function handler(_req: Req, res: Res) {
  cors(res)
  const day = todayUtc()
  res.setHeader('Cache-Control', 'public, s-maxage=60')
  res.status(200).json({ day, seed: seedFor(day) })
}