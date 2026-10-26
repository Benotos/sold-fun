import { useState } from 'react'
import type { Rating } from '../engine'
import { DIFFICULTY, MODES, SOLO_MODES, type ModeId } from '../modes'
import { clearHistory, getHistory, pbFor } from '../lib/history'
import { fmtPct } from '../lib/format'

interface Props {
  go: (route: string) => void
}

const RATINGS: Rating[] = ['SOLD THE TOP', 'BAG SECURED', 'PAPER HANDS', 'DIAMOND HANDS', 'EXIT LIQUIDITY']

export function Stats({ go }: Props) {
  const [history, setHistory] = useState(getHistory)
  const [confirm, setConfirm] = useState(false)

  const charts = history.reduce((a, r) => a + r.charts, 0)
  const avg = charts ? history.reduce((a, r) => a + r.avgPct * r.charts, 0) / charts : 0
  const tops = history.reduce((a, r) => a + r.tops, 0)
  const rugged = history.reduce((a, r) => a + r.rugged, 0)
  const beat = history.reduce((a, r) => a + (r.beatBots ?? 0), 0)
  const bestDaily = pbFor('daily', history)
  const counts = RATINGS.map((k) => ({ k, n: history.filter((r) => r.rating === k).length }))
  const maxCount = Math.max(1, ...counts.map((c) => c.n))

  // last 20 runs avg exit, oldest first, for the trend line
  const trend = history.slice(0, 20).reverse().map((r) => r.avgPct)

  if (!history.length) {
    return (
      <section className="stats wrap">
        <div className="eyebrow mono">STATS</div>
        <h1 className="h-page">Your trading record</h1>
        <div className="empty">
          <h3>No runs yet</h3>
          <p className="muted">Finish any run and your exits, PBs and ratings start showing here. Stats stay on this device.</p>
          <button className="btn btn-gold" onClick={() => go('play')}>
            Pick a mode
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="stats wrap">
      <div className="board-head">
        <div>
          <div className="eyebrow mono">STATS · SAVED ON THIS DEVICE</div>
          <h1 className="h-page">Your trading record</h1>
        </div>
        <button className="btn btn-gold" onClick={() => go('play')}>
          Play
        </button>
      </div>

      <div className="stat-tiles">
        <div>
          <div className="big-n">{history.length}</div>
          <div className="mono muted">RUNS</div>
        </div>
        <div>
          <div className="big-n">{charts}</div>
          <div className="mono muted">CHARTS SOLD</div>
        </div>
        <div>
          <div className="big-n">{fmtPct(avg)}</div>
          <div className="mono muted">AVG OF THE TOP</div>
        </div>
        <div>
          <div className="big-n">{tops}</div>
          <div className="mono muted">TOPS SOLD</div>
        </div>
        <div>
          <div className={`big-n ${rugged ? 'down' : ''}`}>{rugged}</div>
          <div className="mono muted">TIMES RUGGED</div>
        </div>
        <div>
          <div className="big-n">{beat}</div>
          <div className="mono muted">CHARTS BEAT THE BOTS</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="panel">
          <h3 className="h-sec h-sm">Personal bests</h3>
          <table className="split mono">
            <tbody>
              <tr>
                <td>Daily Run</td>
                <td className="r gold">{bestDaily.value ?? '—'}</td>
              </tr>
              {SOLO_MODES.map((m) => {
                const pb = pbFor(m, history)
                return (
                  <tr key={m}>
                    <td>{MODES[m].name}</td>
                    <td className="r gold">{pb.value === null ? '—' : m === 'rugdodge' ? `${pb.value} survived` : pb.value}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h3 className="h-sec h-sm">Your ratings</h3>
          <div className="rating-bars mono">
            {counts.map((c) => (
              <div key={c.k}>
                <span>{c.k}</span>
                <span className="rb">
                  <i style={{ width: `${(c.n / maxCount) * 100}%` }} className={`rb-${c.k.replace(/\s/g, '-').toLowerCase()}`} />
                </span>
                <b>{c.n}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="panel panel-wide">
          <h3 className="h-sec h-sm">Exit quality, last {trend.length} runs</h3>
          <Trend values={trend} />
        </div>

        <div className="panel panel-wide">
          <h3 className="h-sec h-sm">Recent runs</h3>
          <div className="table-scroll">
            <table className="lb mono">
              <thead>
                <tr>
                  <th>WHEN</th>
                  <th>MODE</th>
                  <th className="hide-sm">SPEED</th>
                  <th className="r">OF TOP</th>
                  <th className="r">SCORE</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 15).map((r) => (
                  <tr key={r.at}>
                    <td className="muted">{new Date(r.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{MODES[r.mode as ModeId]?.name ?? r.mode}</td>
                    <td className="hide-sm">{DIFFICULTY[r.difficulty]?.label}</td>
                    <td className="r">{fmtPct(r.avgPct)}</td>
                    <td className="r gold">{r.mode === 'rugdodge' ? `${r.streak ?? 0} survived` : `${r.score}/${r.maxScore}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="reset-row">
        {confirm ? (
          <>
            <span className="muted">Delete every run saved on this device?</span>
            <button
              className="btn btn-ghost btn-sm danger"
              onClick={() => {
                clearHistory()
                setHistory([])
                setConfirm(false)
              }}
            >
              Yes, reset
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>
              Keep them
            </button>
          </>
        ) : (
          <button className="btn-link" onClick={() => setConfirm(true)}>
            Reset local stats
          </button>
        )}
      </div>
    </section>
  )
}

function Trend({ values }: { values: number[] }) {
  if (values.length < 2) return <p className="muted">Play a few more runs to see your trend.</p>
  const w = 600
  const h = 140
  const pad = 26
  const X = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2)
  const Y = (v: number) => 12 + (1 - v) * (h - 32)
  const pts = values.map((v, i) => `${X(i)},${Y(v)}`).join(' ')
  const last = values[values.length - 1]
  return (
    <div className="trend">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Average exit as a share of the top, per run">
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={pad} x2={w - pad} y1={Y(g)} y2={Y(g)} className="trend-grid" />
            <text x={pad - 6} y={Y(g) + 4} textAnchor="end" className="trend-label">
              {g * 100}%
            </text>
          </g>
        ))}
        <polygon points={`${X(0)},${Y(0)} ${pts} ${X(values.length - 1)},${Y(0)}`} className="trend-area" />
        <polyline points={pts} className="trend-line" />
        <circle cx={X(values.length - 1)} cy={Y(last)} r="4.5" className="trend-dot" />
        <text x={X(values.length - 1) - 8} y={Y(last) - 10} textAnchor="end" className="trend-label strong">
          {fmtPct(last)}
        </text>
      </svg>
    </div>
  )
}