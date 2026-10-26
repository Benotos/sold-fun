import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chart } from '../components/Chart'
import {
  ENTRY_TICK,
  PATTERN_INFO,
  TICKS_PER_CANDLE,
  TOTAL_TICKS,
  mcAt,
  scoreRound,
  type Round,
  type RoundPlay,
  type RoundResult,
  type Sell,
} from '../engine'
import { DIFFICULTY, MODES, caughtIn, roundFor, type GameSpec } from '../modes'
import { submitRun, type DailyInfo, type RoundStat, type SubmitResult, type User } from '../lib/api'
import { botExits } from '../lib/bots'
import { fakeWallet, fmtMc, fmtPct, fmtPnl } from '../lib/format'
import { useSettings } from '../lib/settings'
import { sfx } from '../lib/sound'
import { load, save } from '../lib/storage'
import { CURVE_DONE_MC, ctPost, tellsFor } from '../lib/tells'
import { Results } from './Results'

type Phase = 'intro' | 'count' | 'live' | 'after' | 'reveal' | 'done'
type Tone = 'up' | 'down' | 'warn' | 'gold' | 'plain' | 'ct' | 'bot'
interface FeedItem {
  id: number
  text: string
  tone: Tone
  tag: string
  color?: string
}
interface Progress {
  plays: RoundPlay[]
  live: { ri: number; sells: Sell[] } | null
}

export interface PlayProps {
  spec: GameSpec
  daily: DailyInfo | null
  user: User | null
  onSignUp: () => void
  go: (route: string) => void
  roundStats: RoundStat[]
  onExit: () => void
  onReplay: () => void
}

const STAMP: Record<RoundResult['timing'], string> = {
  top: 'SOLD THE TOP',
  early: 'PAPER HANDED',
  late: 'ROUND TRIPPED',
  rugged: 'EXIT LIQUIDITY',
}
const STAMP_LINE: Record<RoundResult['timing'], string> = {
  top: 'You sold within a few candles of the high.',
  early: 'You got out before the real move happened.',
  late: 'You watched the top go by and sold on the way down.',
  rugged: 'You were holding when it went to zero.',
}

let feedId = 0

export function Play({ spec, daily, user, onSignUp, go, roundStats, onExit, onReplay }: PlayProps) {
  const def = MODES[spec.mode]
  const diff = DIFFICULTY[spec.mode === 'daily' ? 'pro' : spec.difficulty]
  const settings = useSettings()
  const isDaily = spec.mode === 'daily'
  const blind = spec.mode === 'blind'
  const chunk = def.rules === 'scale' ? 0.25 : 0.5
  const storeKey = isDaily && daily ? `sold:run:${daily.day}:${daily.seed.slice(0, 10)}` : null

  const roundCache = useRef(new Map<number, Round>())
  const getRound = useCallback(
    (i: number) => {
      let r = roundCache.current.get(i)
      if (!r) {
        r = roundFor(spec, i)
        roundCache.current.set(i, r)
      }
      return r
    },
    [spec],
  )

  const [ri, setRi] = useState(0)
  const [phase, setPhase] = useState<Phase>('intro')
  const [plays, setPlays] = useState<RoundPlay[]>([])
  const [tick, setTick] = useState(ENTRY_TICK)
  const [sells, setSells] = useState<Sell[]>([])
  const [count, setCount] = useState(3)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [holders, setHolders] = useState(0)
  const [dev, setDev] = useState(0)
  const [result, setResult] = useState<RoundResult | null>(null)
  const [shake, setShake] = useState(false)
  const [migrated, setMigrated] = useState(false)
  const [escArmed, setEscArmed] = useState(false)
  const [board, setBoard] = useState<SubmitResult | null>(null)

  const tickRef = useRef(ENTRY_TICK)
  const sellsRef = useRef<Sell[]>([])
  const playsRef = useRef<RoundPlay[]>([])
  const evRef = useRef(0)
  const doneRef = useRef(false)
  const hiRef = useRef(0)
  const lastCtRef = useRef(0)
  const migratedRef = useRef(false)
  const botsSeenRef = useRef(new Set<string>())

  const round = getRound(ri)
  const tells = useMemo(() => tellsFor(round), [round])
  const bots = useMemo(() => (spec.bots ? botExits(round, spec.difficulty) : []), [round, spec.bots, spec.difficulty])

  const persist = useCallback(
    (p: Progress) => {
      if (storeKey) save(storeKey, p)
    },
    [storeKey],
  )

  // restore a daily run, a refresh mid chart locks in the sells made so far
  useEffect(() => {
    roundCache.current.clear()
    if (!storeKey) {
      playsRef.current = []
      setPlays([])
      setRi(0)
      setPhase('intro')
      return
    }
    const p = load<Progress>(storeKey, { plays: [], live: null })
    let ps = Array.isArray(p.plays) ? p.plays.slice(0, def.charts ?? 0) : []
    if (p.live && p.live.ri === ps.length && ps.length < (def.charts ?? 0)) {
      ps = [...ps, { sells: p.live.sells ?? [] }]
      save(storeKey, { plays: ps, live: null })
    }
    playsRef.current = ps
    setPlays(ps)
    if (ps.length >= (def.charts ?? 0)) setPhase('done')
    else {
      setRi(ps.length)
      setPhase('intro')
    }
  }, [spec, storeKey, def.charts])

  const resetChart = useCallback((r: Round) => {
    tickRef.current = r.entryTick
    sellsRef.current = []
    evRef.current = 0
    doneRef.current = false
    hiRef.current = r.ticks[r.entryTick]
    lastCtRef.current = r.entryTick
    migratedRef.current = r.entryMc >= CURVE_DONE_MC
    botsSeenRef.current = new Set()
    setMigrated(migratedRef.current)
    setTick(r.entryTick)
    setSells([])
    setResult(null)
    setHolders(r.startHolders)
    setDev(r.devPct)
    setFeed([
      { id: ++feedId, text: `You bought 1.00 SOL at ${blind ? '???' : fmtMc(r.entryMc)} MC`, tone: 'gold', tag: 'YOU' },
      { id: ++feedId, text: `${r.name} launched on the curve`, tone: 'plain', tag: 'NEW' },
    ])
  }, [blind])

  useEffect(() => {
    if (phase === 'intro') resetChart(round)
  }, [round, phase, resetChart])

  const pushFeed = (items: FeedItem[]) => {
    if (!items.length) return
    setFeed((f) => [...items.reverse(), ...f].slice(0, 24))
  }

  const finishRound = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    const play: RoundPlay = { sells: sellsRef.current }
    const res = scoreRound(round, play, def.rules)
    const next = [...playsRef.current, play]
    playsRef.current = next
    setPlays(next)
    setResult(res)
    persist({ plays: next, live: null })
    setPhase('reveal')
    if (res.timing === 'rugged') sfx.rug()
    else sfx.stamp()
    // every finished daily chart goes straight onto the leaderboard for signed in players
    if (isDaily && daily && !daily.offline && user) {
      void submitRun(daily.day, next).then((r) => {
        setBoard(r)
        if (r.ok) save(`sold:submitted:${daily.day}`, r)
      })
    }
  }, [round, persist, def.rules, isDaily, daily, user])

  const onTick = useCallback(
    (t: number) => {
      const P = round.ticks
      const items: FeedItem[] = []
      const holding = sellsRef.current.reduce((a, s) => a + s.frac, 0) < 1

      while (evRef.current < round.events.length && round.events[evRef.current].t <= t) {
        const e = round.events[evRef.current++]
        const tone: Tone = e.kind === 'kol' || e.kind === 'whale' ? 'up' : e.kind === 'devwarn' ? 'warn' : 'down'
        const tag = e.kind === 'kol' ? 'KOL' : e.kind === 'whale' ? 'WHALE' : e.kind === 'devwarn' ? 'DEV' : 'ALERT'
        items.push({ id: ++feedId, text: e.text, tone, tag })
        if (e.kind === 'devwarn') {
          const n = Number(/(\d+)%/.exec(e.text)?.[1] ?? 2)
          setDev((d) => Math.max(0, Math.round((d - n * 0.4) * 10) / 10))
        }
        if (e.kind === 'devdump' || e.kind === 'rug') {
          setDev(0)
          setHolders((h) => Math.round(h * 0.55))
          if (holding) {
            sfx.rug()
            if (settings.shake) {
              setShake(true)
              setTimeout(() => setShake(false), 500)
            }
          }
        }
      }

      for (const b of bots) {
        if (b.t <= t && !botsSeenRef.current.has(b.bot.id)) {
          botsSeenRef.current.add(b.bot.id)
          items.push({
            id: ++feedId,
            text: `${b.bot.name} sold${blind ? '' : ` at ${fmtMc(mcAt(round, b.t))}`}`,
            tone: 'bot',
            tag: 'BOT',
            color: b.bot.color,
          })
        }
      }

      const mc = mcAt(round, t)
      if (!migratedRef.current && mc >= CURVE_DONE_MC) {
        migratedRef.current = true
        setMigrated(true)
        items.push({ id: ++feedId, text: 'Bonding curve complete. Migrated to PumpSwap', tone: 'up', tag: 'CURVE' })
      }

      if (settings.ctFeed) {
        const entry = P[round.entryTick]
        const since = t - lastCtRef.current
        if (P[t] > hiRef.current) hiRef.current = P[t]
        let mood: 'hype' | 'fear' | 'calm' | null = null
        if (since > 70 && P[t] >= hiRef.current && P[t] > entry * 1.8) mood = 'hype'
        else if (since > 60 && P[t] < hiRef.current * 0.7) mood = 'fear'
        else if (t === round.entryTick + 24) mood = 'calm'
        if (mood) {
          lastCtRef.current = t
          const p = ctPost(round, mood, t)
          items.push({ id: ++feedId, text: p.text, tone: 'ct', tag: `@${p.handle}` })
        }
      }

      if (t % TICKS_PER_CANDLE === TICKS_PER_CANDLE - 1 && t >= TICKS_PER_CANDLE) {
        const ch = P[t] / P[t - TICKS_PER_CANDLE]
        const big = Math.abs(ch - 1) > 0.06
        const n = Math.random() < 0.7 ? 1 + (big ? 1 : 0) : 0
        for (let k = 0; k < n; k++) {
          const buy = Math.random() < (ch > 1 ? 0.78 : 0.22)
          const sol = (Math.pow(Math.random(), 2) * 3.5 + 0.05) * (1 + Math.min(4, Math.abs(ch - 1) * 12))
          items.push({
            id: ++feedId,
            text: `${fakeWallet()} ${buy ? 'bought' : 'sold'} ${sol.toFixed(2)} SOL`,
            tone: buy ? 'up' : 'down',
            tag: buy ? 'BUY' : 'SELL',
          })
        }
        setHolders((h) => Math.max(8, h + (ch > 1 ? Math.floor(Math.random() * 7 * ch) : -Math.floor(Math.random() * 4))))
      }
      pushFeed(items)
    },
    [round, bots, blind, settings.shake, settings.ctFeed],
  )

  // the replay loop
  useEffect(() => {
    if (phase !== 'live' && phase !== 'after') return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const ms = phase === 'after' ? diff.tickMs / 6 : diff.tickMs
    const step = (now: number) => {
      // capped so a hidden tab pauses the chart instead of skipping ahead
      acc = Math.min(acc + (now - last), 250)
      last = now
      let t = tickRef.current
      let moved = false
      while (acc >= ms && t < TOTAL_TICKS - 1) {
        acc -= ms
        t++
        onTick(t)
        moved = true
      }
      if (moved) {
        tickRef.current = t
        setTick(t)
      }
      if (t >= TOTAL_TICKS - 1) {
        finishRound()
        return
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [phase, onTick, finishRound, diff.tickMs])

  const start = useCallback(() => {
    if (phase !== 'intro') return
    setPhase('count')
    let n = diff.countdown
    setCount(n)
    sfx.tick()
    const id = setInterval(() => {
      n--
      if (n <= 0) {
        clearInterval(id)
        sfx.go()
        persist({ plays: playsRef.current, live: { ri, sells: [] } })
        setPhase('live')
      } else {
        sfx.tick()
        setCount(n)
      }
    }, 420)
  }, [phase, persist, ri, diff.countdown])

  const sell = useCallback(
    (kind: 'part' | 'all') => {
      if (phase !== 'live') return
      const cur = sellsRef.current
      const rem = 1 - cur.reduce((a, s) => a + s.frac, 0)
      if (rem <= 1e-9) return
      const maxSells = def.rules === 'scale' ? 4 : 2
      if (kind === 'part' && (rem <= chunk + 1e-9 || cur.length >= maxSells - 1)) kind = 'all'
      const frac = kind === 'part' ? chunk : rem
      const lastT = cur.length ? cur[cur.length - 1].t : round.entryTick
      const t = Math.min(TOTAL_TICKS - 1, Math.max(tickRef.current, lastT + 1))
      const next = [...cur, { t, frac }]
      sellsRef.current = next
      setSells(next)
      persist({ plays: playsRef.current, live: { ri, sells: next } })
      const where = blind ? '' : ` at ${fmtMc(mcAt(round, t))} MC`
      const what = frac >= rem - 1e-9 ? (cur.length ? 'the rest' : 'everything') : `${Math.round(frac * 100)}%`
      pushFeed([{ id: ++feedId, text: `You sold ${what}${where}`, tone: 'gold', tag: 'YOU' }])
      if (kind === 'part') sfx.half()
      else sfx.cash()
      if (rem - frac <= 1e-9) setPhase('after')
    },
    [round, phase, persist, ri, chunk, def.rules, blind],
  )

  const caught = spec.mode === 'rugdodge' && result ? caughtIn(result) : false

  const next = useCallback(() => {
    if (phase !== 'reveal') return
    const total = def.charts
    if ((total !== null && ri + 1 >= total) || caught) setPhase('done')
    else {
      setRi(ri + 1)
      setPhase('intro')
    }
  }, [phase, ri, def.charts, caught])

  // free play rolls straight into the next chart
  useEffect(() => {
    if (spec.mode !== 'free' || phase !== 'reveal') return
    const id = setTimeout(next, 2600)
    return () => clearTimeout(id)
  }, [spec.mode, phase, next])

  useEffect(() => {
    if (!escArmed) return
    const id = setTimeout(() => setEscArmed(false), 1800)
    return () => clearTimeout(id)
  }, [escArmed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.repeat) return
      const k = e.key.toLowerCase()
      if (k === 'escape') {
        if (escArmed) onExit()
        else setEscArmed(true)
        return
      }
      if (k === ' ' || k === 'enter') {
        e.preventDefault()
        if (phase === 'intro') start()
        else if (phase === 'live') sell('all')
        else if (phase === 'reveal') next()
      } else if ((k === 'h' || k === 'q') && phase === 'live') {
        sell('part')
      } else if (k === 's' && phase === 'after') {
        tickRef.current = TOTAL_TICKS - 2
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, start, sell, next, escArmed, onExit])

  const results = useMemo(
    () => plays.map((p, i) => scoreRound(getRound(i), p, def.rules)),
    [plays, getRound, def.rules],
  )
  const runningTotal = results.reduce((a, r) => a + r.points, 0)

  if (isDaily && !daily) {
    return (
      <section className="play-loading wrap">
        <p className="mono">Loading today&rsquo;s charts…</p>
      </section>
    )
  }

  if (phase === 'done') {
    const done = playsRef.current.length ? playsRef.current : plays
    return (
      <Results
        spec={spec}
        day={daily?.day ?? ''}
        offline={daily?.offline ?? true}
        rounds={done.map((_, i) => getRound(i))}
        plays={done}
        user={user}
        onSignUp={onSignUp}
        go={go}
        onReplay={onReplay}
        onExit={onExit}
      />
    )
  }

  const P = round.ticks
  const entry = P[round.entryTick]
  const price = P[tick]
  const soldFrac = sells.reduce((a, s) => a + s.frac, 0)
  const remaining = Math.max(0, 1 - soldFrac)
  const secured = sells.reduce((a, s) => a + (s.frac * P[s.t]) / entry, 0)
  const bag = secured + (remaining * price) / entry
  const mc = mcAt(round, tick)
  const progress = (tick - round.entryTick) / (TOTAL_TICKS - 1 - round.entryTick)
  const up = price >= entry
  const live = phase === 'live'
  const maxSells = def.rules === 'scale' ? 4 : 2
  const canPart = live && remaining > chunk + 1e-9 && sells.length < maxSells - 1
  const stat = isDaily ? roundStats[ri] : undefined
  const curve = migrated ? 100 : Math.min(100, (mc / CURVE_DONE_MC) * 100)
  const top10Now = Math.max(8, tells.top10 - (holders - round.startHolders) * 0.03)

  // casual only: warns when a rug or dump is close
  const danger = (() => {
    if (!diff.hints || spec.mode === 'daily') return null
    const bad = round.rugTick ?? round.dumpTick
    if (bad === null || tick >= bad) return 0
    const d = bad - tick
    return d > 80 ? 0 : Math.round((1 - d / 80) * 100)
  })()

  const label = spec.mode === 'free' ? 'FREE PLAY' : def.name.toUpperCase()
  const totalLabel = def.charts === null ? `CHART ${ri + 1}` : `CHART ${ri + 1}/${def.charts}`
  const streak = spec.mode === 'rugdodge' ? results.filter((r) => !caughtIn(r)).length : 0

  return (
    <section className={`play wrap${shake ? ' shake' : ''}`}>
      <div className="play-head">
        <div className="play-left">
          <button className="btn-link" onClick={onExit}>
            ← Menu
          </button>
          {def.charts !== null && (
            <div className="dots" aria-label={totalLabel}>
              {Array.from({ length: def.charts }, (_, i) => {
                const r = results[i]
                const cls = r ? `dot dot-${r.timing}` : i === ri ? 'dot dot-now' : 'dot'
                return <span key={i} className={cls} title={r ? `${STAMP[r.timing]} ${r.points} pts` : `Chart ${i + 1}`} />
              })}
            </div>
          )}
        </div>
        <div className="play-meta mono">
          <span>{label}</span>
          {!isDaily && <span>{DIFFICULTY[spec.difficulty].label.toUpperCase()}</span>}
          <span>{totalLabel}</span>
          {isDaily && board?.ok && <span className="up">BOARD #{board.rank}</span>}
          {spec.mode === 'rugdodge' ? (
            <span className="gold">STREAK {streak}</span>
          ) : spec.mode !== 'free' ? (
            <span className="gold">{runningTotal} PTS</span>
          ) : null}
        </div>
      </div>

      <div className="terminal">
        <div className="term-top">
          <div className="coin">
            <span className="coin-av" aria-hidden="true">
              {round.ticker.slice(0, 1)}
            </span>
            <div>
              <div className="coin-name">{round.name}</div>
              <div className="coin-tick mono">
                ${round.ticker} · {migrated ? 'migrated' : 'bonding curve'} · simulated
              </div>
            </div>
          </div>
          <div className="quote">
            <div className="quote-label mono">MARKET CAP</div>
            <div className={`quote-mc ${up ? 'up' : 'down'}`}>{blind && phase !== 'reveal' ? '$???' : fmtMc(mc)}</div>
          </div>
          <div className="quote">
            <div className="quote-label mono">YOUR BAG</div>
            {blind && phase !== 'reveal' ? (
              <div className="quote-bag">
                {Math.round(remaining * 100)}% <small>HELD</small>
              </div>
            ) : (
              <>
                <div className={`quote-bag ${bag >= 1 ? 'up' : 'down'}`}>
                  {bag.toFixed(3)} <small>SOL</small>
                </div>
                <div className={`quote-pnl mono ${bag >= 1 ? 'up' : 'down'}`}>{fmtPnl(bag)}</div>
              </>
            )}
          </div>
        </div>

        <div className="term-body">
          <div className="chart-col">
            <div className="chart-frame">
              <Chart
                round={round}
                upto={phase === 'reveal' ? TOTAL_TICKS - 1 : tick}
                sells={sells}
                reveal={phase === 'reveal'}
                proExitTick={stat?.medianExitTick ?? null}
                bots={bots.map((b) => ({ t: b.t, short: b.bot.short, color: b.bot.color }))}
                blind={blind}
              />
              <div className="timebar" aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
              </div>

              {phase === 'intro' && (
                <div className="overlay">
                  <div className="intro-card">
                    <div className="eyebrow mono">
                      {label} · {totalLabel}
                    </div>
                    <h2>You&rsquo;re holding ${round.ticker}</h2>
                    <p>
                      1.00 SOL bought at <b className="mono">{blind ? '???' : fmtMc(round.entryMc)}</b> MC. The chart plays live and
                      the future is hidden.{' '}
                      {spec.mode === 'rugdodge' ? 'Get caught by a rug and the run ends.' : 'Sell before it’s too late.'}
                    </p>
                    <button className="btn btn-gold btn-lg" onClick={start} autoFocus>
                      Start chart
                    </button>
                    {settings.hotkeyHints && (
                      <p className="keys mono">
                        <kbd>SPACE</kbd> sell all · <kbd>H</kbd> sell {Math.round(chunk * 100)}% · <kbd>ESC</kbd>
                        <kbd>ESC</kbd> quit
                      </p>
                    )}
                  </div>
                </div>
              )}
              {phase === 'count' && (
                <div className="overlay overlay-clear">
                  <div className="count" key={count}>
                    {count}
                  </div>
                </div>
              )}
              {phase === 'after' && (
                <div className="after-tag mono">
                  <span>BAG SOLD · WATCHING WHAT HAPPENS NEXT</span>
                  <button className="btn-link" onClick={() => (tickRef.current = TOTAL_TICKS - 2)}>
                    Skip <kbd>S</kbd>
                  </button>
                </div>
              )}
              {escArmed && <div className="esc-tag mono">Press ESC again to quit</div>}
            </div>

            <div className="controls">
              <button className="btn btn-sell" onClick={() => sell('all')} disabled={!live}>
                <span>{remaining < 1 && remaining > 0 ? 'SELL REST' : 'SELL ALL'}</span>
                {settings.hotkeyHints && <kbd>SPACE</kbd>}
              </button>
              <button className="btn btn-half" onClick={() => sell('part')} disabled={!canPart}>
                <span>SELL {Math.round(chunk * 100)}%</span>
                {settings.hotkeyHints && <kbd>H</kbd>}
              </button>
              <div className="held mono">
                <div>
                  <span className="muted">HOLDING</span> {Math.round(remaining * 100)}%
                </div>
                <div>
                  <span className="muted">SECURED</span> {blind && phase !== 'reveal' ? '???' : `${secured.toFixed(3)} SOL`}
                </div>
              </div>
            </div>
          </div>

          <aside className="side">
            <div className="side-stats mono">
              <div>
                <span className="muted">HOLDERS</span>
                <b>{holders}</b>
              </div>
              <div>
                <span className="muted">DEV</span>
                <b className={dev === 0 ? 'down' : dev < round.devPct ? 'warn' : ''}>{dev.toFixed(1)}%</b>
              </div>
              <div>
                <span className="muted">TOP 10</span>
                <b className={top10Now > 40 ? 'warn' : ''}>{top10Now.toFixed(1)}%</b>
              </div>
              <div>
                <span className="muted">SNIPERS</span>
                <b>{tells.snipers.toFixed(1)}%</b>
              </div>
              <div>
                <span className="muted">BUNDLERS</span>
                <b className={tells.bundlers > 15 ? 'down' : ''}>{tells.bundlers.toFixed(1)}%</b>
              </div>
              <div>
                <span className="muted">INSIDERS</span>
                <b className={tells.insiders > 12 ? 'warn' : ''}>{tells.insiders.toFixed(1)}%</b>
              </div>
            </div>
            <div className="curve mono">
              <div className="curve-row">
                <span className="muted">{migrated ? 'MIGRATED' : 'BONDING CURVE'}</span>
                <b className={migrated ? 'up' : ''}>{blind && phase !== 'reveal' ? '??' : Math.floor(curve)}%</b>
              </div>
              <div className="curve-bar">
                <span style={{ width: `${blind && phase !== 'reveal' ? 0 : curve}%` }} className={migrated ? 'done' : ''} />
              </div>
              {danger !== null && (
                <>
                  <div className="curve-row">
                    <span className="muted">DANGER</span>
                    <b className={danger > 60 ? 'down' : danger > 25 ? 'warn' : 'up'}>
                      {danger > 60 ? 'HIGH' : danger > 25 ? 'RISING' : 'LOW'}
                    </b>
                  </div>
                  <div className="curve-bar danger-bar">
                    <span style={{ width: `${danger}%` }} />
                  </div>
                </>
              )}
            </div>
            <div className="feed-head mono">
              <span className="live-dot" data-on={live || phase === 'after'} /> LIVE FEED
              {spec.bots && <span className="bot-legend">{bots.map((b) => <i key={b.bot.id} style={{ background: b.bot.color }} title={b.bot.name} />)}</span>}
            </div>
            <ol className="feed mono" aria-live="off">
              {feed.map((f) => (
                <li key={f.id} className={`feed-${f.tone}`}>
                  <span className="feed-tag" style={f.color ? { color: f.color } : undefined}>
                    {f.tag}
                  </span>
                  <span className="feed-text">{f.text}</span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>

      {phase === 'reveal' && result && (
        <div className="reveal">
          <div className={`stamp stamp-${caught ? 'rugged' : result.timing}`}>
            {spec.mode === 'rugdodge' ? (caught ? 'CAUGHT' : 'SURVIVED') : STAMP[result.timing]}
          </div>
          <div className="reveal-body">
            <p className="reveal-line">
              {spec.mode === 'rugdodge' && caught ? 'That one got you. The run is over.' : STAMP_LINE[result.timing]}
            </p>
            <dl className="reveal-stats">
              <div>
                <dt className="mono">YOU SOLD AT</dt>
                <dd className="mono">{fmtMc((round.entryMc * result.exitPrice) / entry)}</dd>
              </div>
              <div>
                <dt className="mono">THE TOP</dt>
                <dd className="mono">{fmtMc((round.entryMc * result.peakPrice) / entry)}</dd>
              </div>
              <div>
                <dt className="mono">OF THE TOP</dt>
                <dd className="mono">{fmtPct(result.pctOfTop)}</dd>
              </div>
              {spec.mode !== 'free' && (
                <div>
                  <dt className="mono">POINTS</dt>
                  <dd className="mono gold">
                    {result.points}
                    {result.bonus > 0 && <small> incl. +{result.bonus} sniped</small>}
                  </dd>
                </div>
              )}
            </dl>
            {bots.length > 0 && (
              <div className="vs-bots mono">
                {[{ name: 'You', color: 'var(--gold)', pct: result.pctOfTop, pts: result.points }, ...bots.map((b) => ({ name: b.bot.name, color: b.bot.color, pct: b.result.pctOfTop, pts: b.result.points }))]
                  .sort((a, b) => b.pts - a.pts)
                  .map((row, i) => (
                    <div key={row.name} className={row.name === 'You' ? 'me' : ''}>
                      <span className="muted">{i + 1}</span>
                      <i style={{ background: row.color }} />
                      <span>{row.name}</span>
                      <span className="r">{fmtPct(row.pct)}</span>
                    </div>
                  ))}
              </div>
            )}
            {isDaily && (
              <p className="board-line mono">
                {user ? (
                  board?.ok ? (
                    <>
                      On the board: <b className="gold">#{board.rank}</b> of {board.players} with {board.score} pts after {board.charts} chart
                      {board.charts === 1 ? '' : 's'}. Keep going to climb.
                    </>
                  ) : board && !board.ok ? (
                    <span className="down">{board.error}</span>
                  ) : (
                    'Saving to the leaderboard…'
                  )
                ) : (
                  <>
                    This chart is not on the leaderboard yet.{' '}
                    <button className="btn-link" onClick={onSignUp}>
                      Sign up
                    </button>{' '}
                    and your next chart puts every chart so far on the board.
                  </>
                )}
              </p>
            )}
            <p className="lesson">
              <b>{PATTERN_INFO[round.pattern].label}.</b> {PATTERN_INFO[round.pattern].lesson}
              {round.pattern === 'rug' && ` Bundlers held ${tells.bundlers.toFixed(0)}% and insiders ${tells.insiders.toFixed(0)}%. That was the tell.`}
              {stat?.medianPct != null && <> Top players sold at {fmtPct(stat.medianPct)} of the top on this one.</>}
            </p>
          </div>
          <button className="btn btn-gold btn-lg" onClick={next} autoFocus>
            {spec.mode === 'free'
              ? 'Next chart'
              : caught || (def.charts !== null && ri + 1 >= def.charts)
                ? 'See my receipt'
                : 'Next chart'}{' '}
            <kbd>SPACE</kbd>
          </button>
        </div>
      )}
    </section>
  )
}