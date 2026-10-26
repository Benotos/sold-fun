import { useEffect, useState } from 'react'
import { CONFIG } from '../config'
import { dayKey, msUntilNextDay } from '../engine'
import { msUntilWeekEnd } from '../modes'
import { getBoard, type Board, type User } from '../lib/api'
import { fmtCountdown, fmtPct } from '../lib/format'

interface Props {
  user: User | null
  go: (route: string) => void
  initialTab?: string
}

type Tab = 'today' | 'yesterday' | 'week'

export function Leaderboard({ user, go, initialTab }: Props) {
  const today = dayKey()
  const yesterday = dayKey(new Date(Date.now() - 86400000))
  const [tab, setTab] = useState<Tab>(initialTab === 'week' ? 'week' : 'today')
  const day = tab === 'yesterday' ? yesterday : today
  const live = tab !== 'yesterday'
  const [board, setBoard] = useState<Board | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading')
  const [left, setLeft] = useState(msUntilNextDay())

  useEffect(() => {
    let alive = true
    setState('loading')
    const load = async () => {
      const b = await getBoard(day, tab === 'week' ? 'week' : 'day')
      if (!alive) return
      setBoard(b)
      setState(b ? 'ready' : 'offline')
    }
    void load()
    const id = live ? setInterval(load, 15000) : undefined
    return () => {
      alive = false
      if (id) clearInterval(id)
    }
  }, [day, tab, live])

  useEffect(() => {
    if (initialTab === 'week') setTab('week')
  }, [initialTab])

  useEffect(() => {
    const id = setInterval(() => setLeft(msUntilNextDay()), 1000)
    return () => clearInterval(id)
  }, [])

  const entries = board?.entries ?? []

  return (
    <section className="board wrap">
      <div className="board-head">
        <div>
          <div className="eyebrow mono">LEADERBOARD</div>
          <h1 className="h-page">{tab === 'week' ? 'Weekly Cup' : 'Who sold the top'}</h1>
          <p className="muted">
            {tab === 'week' ? (
              <>
                Every submitted daily run adds up. Resets in <b className="mono">{fmtWeekLeft(msUntilWeekEnd())}</b>.{' '}
                {CONFIG.weeklyPrize}.
              </>
            ) : tab === 'today' ? (
              <>
                Closes in <b className="mono">{fmtCountdown(left)}</b>. Top 10 split {CONFIG.rewardShareOfFees}% of today&rsquo;s
                creator rewards.
              </>
            ) : (
              'Final standings.'
            )}
          </p>
        </div>
        <div className="tabs" role="tablist">
          {(['today', 'yesterday', 'week'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'today' ? 'Today' : t === 'yesterday' ? 'Yesterday' : 'This week'}
            </button>
          ))}
        </div>
      </div>

      {state === 'loading' && <p className="mono muted pad">Loading the board…</p>}
      {state === 'offline' && (
        <div className="empty">
          <h3>The board goes live at launch</h3>
          <p className="muted">Scores are stored the moment the leaderboard API is connected. Your runs still save on this device.</p>
          <button className="btn btn-gold" onClick={() => go('play')}>
            Play today&rsquo;s run
          </button>
        </div>
      )}
      {state === 'ready' && entries.length === 0 && (
        <div className="empty">
          <h3>Nobody has sold yet</h3>
          <p className="muted">First run of the day takes #1. Go get it.</p>
          <button className="btn btn-gold" onClick={() => go('play')}>
            Play today&rsquo;s run
          </button>
        </div>
      )}
      {state === 'ready' && entries.length > 0 && (
        <>
          <p className="mono muted players">{board?.players ?? entries.length} players</p>
          <div className="table-scroll">
            <table className="lb mono">
              <thead>
                <tr>
                  <th>#</th>
                  <th>TRADER</th>
                  {tab !== 'week' && <th className="hide-sm">RATING</th>}
                  {tab !== 'week' && <th className="r hide-sm">CHARTS</th>}
                  {tab !== 'week' && <th className="r">AVG OF TOP</th>}
                  <th className="r">{tab === 'week' ? 'WEEK TOTAL' : 'SCORE'}</th>
                  {tab !== 'week' && <th className="r">POT</th>}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.user} className={`${e.rank <= 3 ? `podium p${e.rank}` : ''}${e.user === user?.username ? ' me' : ''}`}>
                    <td>{e.rank}</td>
                    <td>@{e.name || e.user}</td>
                    {tab !== 'week' && <td className="hide-sm">{e.rating}</td>}
                    {tab !== 'week' && <td className="r hide-sm muted">{e.charts ?? 10}/10</td>}
                    {tab !== 'week' && <td className="r">{e.avgPct === null ? '' : fmtPct(e.avgPct)}</td>}
                    <td className="r gold">{e.score}</td>
                    {tab !== 'week' && <td className="r">{CONFIG.payoutSplit[e.rank - 1] ? `${CONFIG.payoutSplit[e.rank - 1]}%` : ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function fmtWeekLeft(ms: number) {
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  return d > 0 ? `${d}d ${h}h` : `${h}h`
}