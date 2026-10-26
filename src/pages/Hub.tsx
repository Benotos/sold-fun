import { useCallback, useEffect, useState } from 'react'
import { CONFIG } from '../config'
import { ROUNDS, msUntilNextDay, summarize, buildRun, type RoundPlay } from '../engine'
import { DIFFICULTY, MODES, SOLO_MODES, msUntilWeekEnd, newSeed, type Difficulty, type GameSpec, type ModeId } from '../modes'
import type { DailyInfo, RoundStat, User } from '../lib/api'
import { BOTS } from '../lib/bots'
import { fmtCountdown } from '../lib/format'
import { pbFor } from '../lib/history'
import { load, save } from '../lib/storage'
import { Play } from './Play'

interface Props {
  daily: DailyInfo | null
  user: User | null
  onSignUp: () => void
  go: (route: string) => void
  roundStats: RoundStat[]
  playersToday: number | null
  initial: 'hub' | 'daily'
  openSettings: () => void
}

type View = { kind: 'hub' } | { kind: 'setup'; mode: ModeId } | { kind: 'game'; spec: GameSpec }

interface Prefs {
  difficulty: Difficulty
  bots: boolean
}

const prefKey = (m: ModeId) => `sold:prefs:${m}`
const getPrefs = (m: ModeId): Prefs => ({ difficulty: 'pro', bots: true, ...load<Partial<Prefs>>(prefKey(m), {}) })

/** Tiny shape for each mode card, drawn as a polyline in a 100 x 40 box */
const GLYPH: Record<ModeId, string> = {
  daily: '0,36 12,30 22,32 34,18 44,22 58,8 66,12 74,6 84,20 100,26',
  classic: '0,36 14,30 26,24 38,26 52,12 62,6 72,14 86,24 100,30',
  rugdodge: '0,34 14,28 28,22 42,18 56,12 64,10 66,38 100,38',
  scaleout: '0,36 16,36 16,28 34,28 34,20 52,20 52,12 72,12 72,6 100,6',
  blind: '0,30 10,26 20,28 30,20 40,22 50,14 60,18 70,10 80,16 90,12 100,20',
  free: '0,24 10,18 20,26 30,16 40,22 50,12 60,20 70,14 80,22 90,16 100,20',
}

function Glyph({ mode }: { mode: ModeId }) {
  return (
    <svg className={`glyph glyph-${mode}`} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={GLYPH[mode]} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray={mode === 'blind' ? '3 4' : undefined} />
    </svg>
  )
}

export function Hub({ daily, user, onSignUp, go, roundStats, playersToday, initial, openSettings }: Props) {
  const [view, setView] = useState<View>(() => (initial === 'daily' ? { kind: 'setup', mode: 'daily' } : { kind: 'hub' }))
  const [left, setLeft] = useState(msUntilNextDay())
  const [weekLeft, setWeekLeft] = useState(msUntilWeekEnd())

  useEffect(() => {
    setView(initial === 'daily' ? { kind: 'setup', mode: 'daily' } : { kind: 'hub' })
  }, [initial])

  useEffect(() => {
    const id = setInterval(() => {
      setLeft(msUntilNextDay())
      setWeekLeft(msUntilWeekEnd())
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [view.kind])

  const dailyKey = daily ? `sold:run:${daily.day}:${daily.seed.slice(0, 10)}` : null
  const dailyPlays = dailyKey ? load<{ plays?: RoundPlay[] }>(dailyKey, {}).plays ?? [] : []
  const dailyDone = dailyPlays.length >= ROUNDS
  const dailyStarted = dailyPlays.length > 0 && !dailyDone
  const dailyScore = dailyDone && daily ? summarize(buildRun(daily.seed), dailyPlays).total : null

  const launch = useCallback(
    (mode: ModeId) => {
      const p = getPrefs(mode)
      if (mode === 'daily') {
        if (!daily) return
        setView({ kind: 'game', spec: { mode, seed: daily.seed, difficulty: 'pro', bots: p.bots } })
      } else setView({ kind: 'game', spec: { mode, seed: newSeed(mode), difficulty: p.difficulty, bots: p.bots } })
    },
    [daily],
  )

  const toHub = useCallback(() => {
    setView({ kind: 'hub' })
    if (location.hash !== '#play') location.hash = 'play'
  }, [])

  // hub hotkeys
  useEffect(() => {
    if (view.kind !== 'hub') return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return
      const k = e.key.toLowerCase()
      const idx = ['1', '2', '3', '4'].indexOf(k)
      if (idx >= 0) setView({ kind: 'setup', mode: SOLO_MODES[idx] })
      else if (k === 'd') setView({ kind: 'setup', mode: 'daily' })
      else if (k === 'f') launch('free')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view.kind, launch])

  if (view.kind === 'game') {
    return (
      <Play
        key={view.spec.seed + view.spec.mode}
        spec={view.spec}
        daily={daily}
        user={user}
        onSignUp={onSignUp}
        go={go}
        roundStats={roundStats}
        onExit={toHub}
        onReplay={() => setView({ kind: 'game', spec: { ...view.spec, seed: view.spec.mode === 'daily' ? view.spec.seed : newSeed(view.spec.mode) } })}
      />
    )
  }

  if (view.kind === 'setup') {
    return <Setup mode={view.mode} daily={daily} dailyDone={dailyDone} dailyStarted={dailyStarted} onBack={toHub} onStart={launch} />
  }

  return (
    <section className="hub wrap">
      <div className="hub-head">
        <div>
          <div className="eyebrow mono">PICK YOUR GAME</div>
          <h1 className="h-page">Choose your exit</h1>
        </div>
        <div className="hub-who mono">
          {user ? (
            <>
              <span className="muted">PLAYING AS</span> <b>@{user.display}</b>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={onSignUp}>
              Guest · sign up to get ranked
            </button>
          )}
        </div>
      </div>

      <button className={`daily-card${dailyDone ? ' is-done' : ''}`} onClick={() => setView({ kind: 'setup', mode: 'daily' })}>
        <div className="daily-main">
          <div className="mode-tag mono">
            <span className="tag-ranked">RANKED</span> <kbd>D</kbd>
          </div>
          <h2>Daily Run</h2>
          <p>{MODES.daily.blurb}</p>
          <div className="chips mono">
            <span>10 charts</span>
            <span>Pro speed</span>
            <span>1 attempt</span>
            <span>Top 10 paid</span>
          </div>
        </div>
        <div className="daily-glyph">
          <Glyph mode="daily" />
        </div>
        <div className="daily-side mono">
          <div>
            <span className="muted">STATUS</span>
            <b className={dailyDone ? 'up' : dailyStarted ? 'warn' : ''}>
              {dailyDone ? `PLAYED · ${dailyScore} PTS` : dailyStarted ? `IN PROGRESS · ${dailyPlays.length}/${ROUNDS}` : 'NOT PLAYED'}
            </b>
          </div>
          <div>
            <span className="muted">CLOSES IN</span>
            <b>{fmtCountdown(left)}</b>
          </div>
          <div>
            <span className="muted">PLAYED TODAY</span>
            <b>{playersToday ?? '—'}</b>
          </div>
          <span className="btn btn-gold daily-cta">{dailyDone ? 'See receipt' : dailyStarted ? 'Continue' : 'Play today’s run'} →</span>
        </div>
      </button>

      <div className="mode-grid">
        {SOLO_MODES.map((m, i) => {
          const d = MODES[m]
          const pb = pbFor(m)
          return (
            <button key={m} className={`mode-card mode-${m}`} onClick={() => setView({ kind: 'setup', mode: m })}>
              <div className="mode-tag mono">
                <span>{d.tag}</span> <kbd>{i + 1}</kbd>
              </div>
              <h3>{d.name}</h3>
              <p>{d.blurb}</p>
              <Glyph mode={m} />
              <div className="mode-foot mono">
                <span className={pb.value === null ? 'muted' : 'gold'}>{pb.label}</span>
                <span className="go">Play →</span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="free-row">
        <div>
          <b>Free Play</b>
          <span className="muted"> {MODES.free.blurb}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => launch('free')}>
          Start <kbd>F</kbd>
        </button>
      </div>

      <div className="cup">
        <div className="cup-badge mono" aria-hidden="true">
          CUP
        </div>
        <div className="cup-text">
          <b>Weekly Cup</b>
          <span className="muted">
            {' '}
            Every daily run you submit adds to your weekly total. {CONFIG.weeklyPrize}. Resets in{' '}
            <span className="mono">{fmtWeek(weekLeft)}</span>.
          </span>
        </div>
        <button className="btn btn-gold btn-sm" onClick={() => go('leaderboard/week')}>
          Standings
        </button>
      </div>

      <nav className="hub-links mono">
        <button className="btn-link" onClick={() => go('stats')}>
          Stats
        </button>
        <button className="btn-link" onClick={openSettings}>
          Settings
        </button>
        <button className="btn-link" onClick={() => go('leaderboard')}>
          Leaderboard
        </button>
        <button className="btn-link" onClick={() => go('home')}>
          How it works
        </button>
      </nav>
    </section>
  )
}

function fmtWeek(ms: number) {
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`
}

interface SetupProps {
  mode: ModeId
  daily: DailyInfo | null
  dailyDone: boolean
  dailyStarted: boolean
  onBack: () => void
  onStart: (m: ModeId) => void
}

function Setup({ mode, daily, dailyDone, dailyStarted, onBack, onStart }: SetupProps) {
  const def = MODES[mode]
  const isDaily = mode === 'daily'
  const [prefs, setPrefs] = useState<Prefs>(() => getPrefs(mode))
  const pb = pbFor(mode)
  const update = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p }
    setPrefs(next)
    save(prefKey(mode), next)
  }
  const disabled = isDaily && !daily

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!disabled) onStart(mode)
      } else if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, onStart, onBack, disabled])

  return (
    <section className="setup wrap">
      <div className="setup-head">
        <button className="btn-link" onClick={onBack}>
          ← Menu
        </button>
        <div className="setup-steps mono">
          <span>1 PICK</span>
          <span className="on">2 SET UP</span>
          <span>3 SELL</span>
        </div>
      </div>

      <div className="setup-card">
        <div className="setup-title">
          <Glyph mode={mode} />
          <div>
            <div className="eyebrow mono">{def.tag} · HOW TO PLAY</div>
            <h1 className="h-page">{def.name}</h1>
          </div>
          <span className="mono muted setup-pb">{isDaily ? (dailyDone ? 'Played today' : `${ROUNDS} charts`) : pb.label}</span>
        </div>

        <div className="setup-grid">
          <div>
            <p className="setup-blurb">{def.blurb}</p>
            <div className="setup-box">
              <div className="setup-box-h mono">
                YOUR SETUP{' '}
                <b>
                  {def.name} · {isDaily ? 'Pro' : DIFFICULTY[prefs.difficulty].label} · bots {prefs.bots ? 'on' : 'off'}
                </b>
              </div>
              <div className="setup-row">
                <span className="mono muted">SPEED</span>
                {isDaily ? (
                  <div className="seg">
                    <button className="on" disabled>
                      Pro
                    </button>
                  </div>
                ) : (
                  <div className="seg" role="radiogroup" aria-label="Difficulty">
                    {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                      <button key={d} role="radio" aria-checked={prefs.difficulty === d} className={prefs.difficulty === d ? `on on-${d}` : ''} onClick={() => update({ difficulty: d })}>
                        {DIFFICULTY[d].label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="setup-note">{isDaily ? 'Everyone plays the daily run at the same speed.' : DIFFICULTY[prefs.difficulty].note}</span>
              </div>
              <div className="setup-row">
                <span className="mono muted">BOTS</span>
                <button
                  className={`toggle${prefs.bots ? ' on' : ''}`}
                  role="switch"
                  aria-checked={prefs.bots}
                  onClick={() => update({ bots: !prefs.bots })}
                >
                  <span />
                </button>
                <span className="setup-note">{prefs.bots ? 'Three bots sell the same chart. Their exits show live.' : 'Off. Just you and the chart.'}</span>
              </div>
              {prefs.bots && (
                <ul className="bot-list">
                  {BOTS.map((b) => (
                    <li key={b.id}>
                      <i style={{ background: b.color }}>{b.short}</i>
                      <b>{b.name}</b>
                      <span className="muted">{b.style}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="setup-how">
            <ol>
              {def.steps.map((s, i) => (
                <li key={s.title}>
                  <span className="n mono">{i + 1}</span>
                  <div>
                    <b>{s.title}</b>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="hotkeys mono">
              <span>
                <kbd>SPACE</kbd> sell all
              </span>
              <span>
                <kbd>H</kbd> sell {def.rules === 'scale' ? '25%' : '50%'}
              </span>
              <span>
                <kbd>S</kbd> skip after selling
              </span>
              <span>
                <kbd>ESC</kbd>
                <kbd>ESC</kbd> quit
              </span>
            </div>
          </div>
        </div>

        <div className="setup-foot">
          <button className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
          <button className="btn btn-gold btn-lg" onClick={() => onStart(mode)} disabled={disabled}>
            {isDaily ? (dailyDone ? 'See my receipt' : dailyStarted ? 'Continue run' : 'Start daily run') : 'Start run'} <kbd>SPACE</kbd>
          </button>
        </div>
      </div>
    </section>
  )
}