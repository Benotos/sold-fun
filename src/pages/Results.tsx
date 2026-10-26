import { useEffect, useMemo, useRef, useState } from 'react'
import { CONFIG } from '../config'
import { PATTERN_INFO, RATING_COPY, msUntilNextDay, summarize, type Round, type RoundPlay } from '../engine'
import { DIFFICULTY, MODES, caughtIn, type GameSpec } from '../modes'
import { submitRun, uploadShare, type SubmitResult, type User } from '../lib/api'
import { BOTS, botExits } from '../lib/bots'
import { fmtCountdown, fmtMc, fmtPct } from '../lib/format'
import { addRun, getHistory, pbFor } from '../lib/history'
import { renderShareCard } from '../lib/shareCard'
import { load, save } from '../lib/storage'

interface Props {
  spec: GameSpec
  day: string
  offline: boolean
  rounds: Round[]
  plays: RoundPlay[]
  user: User | null
  onSignUp: () => void
  go: (route: string) => void
  onReplay: () => void
  onExit: () => void
}

const TIMING_LABEL = { top: 'TOP', early: 'EARLY', late: 'LATE', rugged: 'RUGGED' } as const

export function Results({ spec, day, offline, rounds, plays, user, onSignUp, go, onReplay, onExit }: Props) {
  const def = MODES[spec.mode]
  const isDaily = spec.mode === 'daily'
  const isDodge = spec.mode === 'rugdodge'
  const s = useMemo(() => summarize(rounds, plays, def.rules), [rounds, plays, def.rules])
  const streak = isDodge ? s.results.filter((r) => !caughtIn(r)).length : 0
  const card = useRef<HTMLCanvasElement>(null)
  const subKey = `sold:submitted:${day}`
  const [busy, setBusy] = useState(false)
  const [sub, setSub] = useState<SubmitResult | null>(() => (isDaily ? load<SubmitResult | null>(subKey, null) : null))
  const [note, setNote] = useState('')
  const [left, setLeft] = useState(msUntilNextDay())

  // everyone gets compared with the bots on the receipt, even when bots were hidden during play
  const botTotals = useMemo(() => {
    const per = rounds.map((r) => botExits(r, spec.mode === 'daily' ? 'pro' : spec.difficulty))
    const totals = BOTS.map((b, i) => ({ bot: b, pts: per.reduce((a, x) => a + x[i].result.points, 0) }))
    const beat = s.results.filter((r, i) => per[i].every((b) => r.points > b.result.points)).length
    return { totals, beat, best: per.map((x) => Math.max(...x.map((b) => b.result.points))) }
  }, [rounds, spec.mode, spec.difficulty, s.results])

  // PB is read before this run is saved so a new record can be celebrated
  const [prevPb] = useState(() => pbFor(spec.mode))
  const newPb = isDodge ? prevPb.value === null || streak > prevPb.value : prevPb.value === null || s.total > prevPb.value

  useEffect(() => {
    if (spec.mode === 'free') return
    const key = isDaily ? `sold:recorded:${day}` : `sold:recorded:${spec.seed}`
    if (load<boolean>(key, false)) return
    save(key, true)
    addRun({
      mode: spec.mode,
      difficulty: isDaily ? 'pro' : spec.difficulty,
      at: Date.now(),
      score: s.total,
      maxScore: s.maxTotal,
      avgPct: s.avgPct,
      rating: s.rating,
      charts: s.results.length,
      tops: s.tops,
      rugged: s.ruggedCount,
      streak: isDodge ? streak : undefined,
      beatBots: botTotals.beat,
    })
  }, [spec, isDaily, isDodge, day, s, streak, botTotals.beat])

  const who = user ? `@${user.display}` : ''
  const cardLabel = isDaily ? `DAILY RUN  ${day}` : `${def.name.toUpperCase()}  ${DIFFICULTY[spec.difficulty].label.toUpperCase()}`

  const shareTitle = isDodge ? `Survived ${streak} charts in Rug Dodge` : `${s.rating} · ${s.total}/${s.maxTotal} on SOLD.FUN`
  const shareText = isDodge
    ? 'Half the charts rug. One mistake ends the run. How long can you last?'
    : `Sold at ${fmtPct(s.avgPct)} of the top. Anyone can buy. Can you sell?`
  // the card is uploaded once per run so the X link unfurls into it
  const shareKey = `sold:share:${isDaily ? `${day}:${who}` : spec.seed}`
  const [shareUrl, setShareUrl] = useState<string | null>(() => load<string | null>(shareKey, null))
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    const headline = isDodge ? { value: String(streak), caption: 'CHARTS SURVIVED', stamp: streak >= 5 ? 'RUG PROOF' : 'CAUGHT' } : undefined
    const draw = () => card.current && renderShareCard(card.current, rounds, s, cardLabel, who, headline)
    draw()
    let alive = true
    const ready = document.fonts?.ready ?? Promise.resolve()
    void ready.then(async () => {
      draw()
      if (!alive || !card.current || load<string | null>(shareKey, null)) return
      setSharing(true)
      const url = await uploadShare(card.current.toDataURL('image/jpeg', 0.86), shareTitle, shareText)
      if (!alive) return
      setSharing(false)
      if (url) {
        save(shareKey, url)
        setShareUrl(url)
      }
    })
    return () => {
      alive = false
    }
  }, [rounds, s, cardLabel, who, isDodge, streak, shareKey, shareTitle, shareText])

  useEffect(() => {
    const id = setInterval(() => setLeft(msUntilNextDay()), 1000)
    return () => clearInterval(id)
  }, [])

  const postText = isDodge
    ? `Survived ${streak} charts in Rug Dodge on @${CONFIG.xHandle} before one got me.\n\nAnyone can buy. Can you sell?`
    : `${s.rating}. I sold at ${fmtPct(s.avgPct)} of the top and scored ${s.total}/${s.maxTotal} on ${isDaily ? "today's" : `a ${def.name}`} @${CONFIG.xHandle} run.\n\nAnyone can buy. Can you sell?`
  const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(postText)}&url=${encodeURIComponent(shareUrl ?? CONFIG.siteUrl)}`

  const saveImage = () => {
    const c = card.current
    if (!c) return
    c.toBlob((b) => {
      if (!b) return
      const url = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = url
      a.download = `sold-fun-${isDaily ? day : spec.mode}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      setNote('Image saved. Attach it to your post.')
    }, 'image/png')
  }

  // a ready made PNG so clicks can use it instantly (clipboard and share sheets need the click to still be fresh)
  const pngRef = useRef<Blob | null>(null)
  useEffect(() => {
    const ready = document.fonts?.ready ?? Promise.resolve()
    void ready.then(() => card.current?.toBlob((b) => (pngRef.current = b), 'image/png'))
  }, [rounds, s, cardLabel, who, isDodge, streak])

  const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

  /**
   * X does not let a website attach an image to a post. So on click:
   *  phones: open the share sheet with the image attached, pick X
   *  desktop: copy the image, open X, the player pastes it with Ctrl+V
   * The link in the post also unfurls into the same card once X reads it.
   */
  const postToX = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const blob = pngRef.current
    if (isTouch && blob && 'canShare' in navigator) {
      const file = new File([blob], 'sold-fun.png', { type: 'image/png' })
      if (navigator.canShare({ files: [file] })) {
        e.preventDefault()
        navigator
          .share({ files: [file], text: `${postText} ${shareUrl ?? CONFIG.siteUrl}` })
          .catch(() => window.open(xUrl, '_blank', 'noopener'))
        return
      }
    }
    try {
      if (!('ClipboardItem' in window) || !card.current) throw new Error('unsupported')
      const c = card.current
      const item = new ClipboardItem({
        'image/png': blob ? Promise.resolve(blob) : new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/png')),
      })
      navigator.clipboard
        .write([item])
        .then(() => setNote('Card copied. In the X post box press Ctrl+V (Cmd+V on Mac) to attach it.'))
        .catch(() => setNote('Could not copy the card. Use Save image and attach it to your post.'))
    } catch {
      setNote('Use Save image and attach it to your post.')
    }
    // the link opens X in a new tab as normal
  }

  const copyImage = async () => {
    const c = card.current
    if (!c) return
    try {
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
      if (!blob || !('ClipboardItem' in window)) throw new Error('unsupported')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setNote('Image copied. Paste it straight into your post.')
    } catch {
      setNote('Your browser blocked copying images. Use Save image instead.')
    }
  }

  // signed in players get the finished run on the board without a click
  useEffect(() => {
    if (!isDaily || offline || !user) return
    if (sub?.ok && sub.charts >= plays.length) return
    void submitRun(day, plays).then((r) => {
      setSub(r)
      if (r.ok) save(subKey, r)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDaily, offline, user, day, plays.length])

  const submit = async () => {
    if (!user) return onSignUp()
    setBusy(true)
    const r = await submitRun(day, plays)
    setBusy(false)
    setSub(r)
    if (r.ok) save(subKey, r)
  }

  const runs = getHistory().filter((r) => r.mode === spec.mode).length
  const table = [{ name: 'You', color: 'var(--gold)', pts: s.total }, ...botTotals.totals.map((t) => ({ name: t.bot.name, color: t.bot.color, pts: t.pts }))].sort(
    (a, b) => b.pts - a.pts,
  )

  return (
    <section className="results wrap">
      <div className="results-hero">
        <div>
          <div className="eyebrow mono">
            {isDaily ? `DAILY RUN · ${day}` : `${def.name.toUpperCase()} · ${DIFFICULTY[spec.difficulty].label.toUpperCase()}`}
            {newPb && !isDaily && runs > 0 && <span className="pb-badge">NEW PB</span>}
          </div>
          {isDodge ? (
            <>
              <div className={`stamp stamp-big ${streak >= 5 ? 'stamp-r-sold-the-top' : 'stamp-r-exit-liquidity'}`}>
                {streak >= 5 ? 'RUG PROOF' : 'CAUGHT'}
              </div>
              <p className="results-copy">
                You survived {streak} chart{streak === 1 ? '' : 's'} before one got you.
                {prevPb.value !== null && !newPb && ` Your best is ${prevPb.value}.`}
              </p>
            </>
          ) : (
            <>
              <div className={`stamp stamp-big stamp-r-${s.rating.replace(/\s/g, '-').toLowerCase()}`}>{s.rating}</div>
              <p className="results-copy">{RATING_COPY[s.rating]}</p>
            </>
          )}
          <div className="big-stats">
            {isDodge ? (
              <div>
                <div className="big-n">{streak}</div>
                <div className="mono muted">SURVIVED</div>
              </div>
            ) : (
              <div>
                <div className="big-n">{s.total}</div>
                <div className="mono muted">POINTS OF {s.maxTotal}</div>
              </div>
            )}
            <div>
              <div className="big-n">{fmtPct(s.avgPct)}</div>
              <div className="mono muted">AVG OF THE TOP</div>
            </div>
            <div>
              <div className="big-n">{s.tops}</div>
              <div className="mono muted">TOPS SOLD</div>
            </div>
            <div>
              <div className="big-n">
                {botTotals.beat}
                <small className="muted">/{s.results.length}</small>
              </div>
              <div className="mono muted">BEAT ALL BOTS</div>
            </div>
          </div>
        </div>

        <div className="submit-box">
          {isDaily && CONFIG.leaderboardEnabled ? (
            sub?.ok ? (
              <>
                <div className="eyebrow mono">ON THE BOARD</div>
                <div className="rank">#{sub.rank}</div>
                <p className="muted">of {sub.players} players today. Top 10 at 00:00 UTC split the daily pot.</p>
                <button className="btn btn-ghost" onClick={() => go('leaderboard')}>
                  Open leaderboard
                </button>
              </>
            ) : (
              <>
                <div className="eyebrow mono">CLAIM YOUR SPOT</div>
                <p>
                  {user
                    ? 'Lock this run on today’s leaderboard. One run per account per day.'
                    : 'Sign up to lock this run on today’s leaderboard. It takes ten seconds.'}
                </p>
                <button className="btn btn-gold" onClick={submit} disabled={busy || offline}>
                  {busy ? 'Submitting…' : user ? `Submit as @${user.display}` : 'Sign up to submit'}
                </button>
                {user && !user.payout && <p className="note mono">Add a payout address under your username so winnings can reach you.</p>}
                {offline && <p className="err">The leaderboard is offline right now. Your run is saved on this device.</p>}
                {sub && !sub.ok && <p className="err">{sub.error}</p>}
              </>
            )
          ) : (
            <>
              <div className="eyebrow mono">{def.tag}</div>
              <p>
                {isDodge ? 'Every chart you survive adds to the streak. ' : ''}Solo runs count toward your PB and stats, not the pot.
              </p>
              <button className="btn btn-gold" onClick={onReplay}>
                Run it back
              </button>
              <button className="btn btn-ghost" onClick={onExit}>
                Pick another mode
              </button>
            </>
          )}

          <div className="bot-table mono">
            <div className="muted bot-table-h">RUN VS THE BOTS</div>
            {table.map((row, i) => (
              <div key={row.name} className={row.name === 'You' ? 'me' : ''}>
                <span className="muted">{i + 1}</span>
                <i style={{ background: row.color }} />
                <span>{row.name}</span>
                <span className="r">{row.pts}</span>
              </div>
            ))}
          </div>

          <div className="next-run mono">
            <span className="muted">NEXT DAILY RUN IN</span> {fmtCountdown(left)}
          </div>
        </div>
      </div>

      <div className="results-grid">
        <div className="receipt-wrap">
          <h3 className="h-sec">Your receipt</h3>
          <table className="receipt mono">
            <thead>
              <tr>
                <th>#</th>
                <th>COIN</th>
                <th className="hide-sm">CHART</th>
                <th className="r">SOLD</th>
                <th className="r hide-sm">TOP</th>
                <th className="r">OF TOP</th>
                <th className="r hide-sm">BEST BOT</th>
                <th className="r">PTS</th>
              </tr>
            </thead>
            <tbody>
              {s.results.map((r, i) => {
                const rd = rounds[i]
                const k = rd.entryMc / r.entryPrice
                const timing = isDodge && caughtIn(r) ? 'rugged' : r.timing
                return (
                  <tr key={i}>
                    <td className="muted">{i + 1}</td>
                    <td>
                      ${rd.ticker} <span className={`chip chip-${timing}`}>{isDodge && caughtIn(r) ? 'CAUGHT' : TIMING_LABEL[r.timing]}</span>
                    </td>
                    <td className="hide-sm muted">{PATTERN_INFO[rd.pattern].label}</td>
                    <td className="r">{fmtMc(r.exitPrice * k)}</td>
                    <td className="r hide-sm muted">{fmtMc(r.peakPrice * k)}</td>
                    <td className="r">{fmtPct(r.pctOfTop)}</td>
                    <td className="r hide-sm muted">{botTotals.best[i]}</td>
                    <td className="r gold">{r.points}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>TOTAL</td>
                <td className="hide-sm" />
                <td />
                <td className="hide-sm" />
                <td className="r">{fmtPct(s.avgPct)}</td>
                <td className="hide-sm" />
                <td className="r gold">{s.total}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="share">
          <h3 className="h-sec">Flex it on CT</h3>
          <canvas ref={card} className="share-card" aria-label="Share card for this run" />
          <div className="share-actions">
            <a className="btn btn-gold" href={xUrl} target="_blank" rel="noreferrer" onClick={postToX}>
              {sharing ? 'Preparing card…' : 'Post on X'}
            </a>
            <button className="btn btn-ghost" onClick={saveImage}>
              Save image
            </button>
            <button className="btn btn-ghost" onClick={copyImage}>
              Copy image
            </button>
          </div>
          <p className="note mono">
            {isTouch
              ? 'Post on X opens your share sheet with the card attached. Pick X.'
              : 'Post on X copies your card. Paste it into the post with Ctrl+V.'}
            {sharing ? ' Preparing the link…' : ''}
          </p>
          {note && <p className="note mono">{note}</p>}
        </div>
      </div>
    </section>
  )
}