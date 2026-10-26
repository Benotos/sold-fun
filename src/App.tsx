import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthModal } from './components/AuthModal'
import { SettingsModal } from './components/SettingsModal'
import { CONFIG } from './config'
import { ROUNDS } from './engine'
import { getBoard, getDaily, getMe, logOut, updatePayout, type DailyInfo, type RoundStat, type User } from './lib/api'
import { load } from './lib/storage'
import { Hub } from './pages/Hub'
import { Landing } from './pages/Landing'
import { Leaderboard } from './pages/Leaderboard'
import { Stats } from './pages/Stats'

type Route = 'home' | 'play' | 'daily' | 'leaderboard' | 'stats'
const ROUTES: Route[] = ['home', 'play', 'daily', 'leaderboard', 'stats']

function parseFull(hash: string): { route: Route; sub: string } {
  const [head, sub = ''] = hash.replace(/^#\/?/, '').split('/')
  if (head === 'practice') return { route: 'play', sub: '' }
  return { route: ROUTES.includes(head as Route) ? (head as Route) : 'home', sub }
}
const parse = (hash: string) => parseFull(hash).route

export default function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash))
  const [sub, setSub] = useState(() => parseFull(location.hash).sub)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [playersToday, setPlayersToday] = useState<number | null>(null)
  const [daily, setDaily] = useState<DailyInfo | null>(null)
  const [stats, setStats] = useState<RoundStat[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [auth, setAuth] = useState<null | 'signup' | 'login'>(null)
  const [menu, setMenu] = useState(false)
  const [payout, setPayout] = useState('')
  const [payoutMsg, setPayoutMsg] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const [caCopied, setCaCopied] = useState(false)

  const copyCa = async () => {
    if (!CONFIG.ca) return
    try {
      await navigator.clipboard.writeText(CONFIG.ca)
      setCaCopied(true)
      setTimeout(() => setCaCopied(false), 1500)
    } catch {
      /* CA stays visible in the title tooltip and on the landing page */
    }
  }

  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash))
      setSub(parseFull(location.hash).sub)
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  useEffect(() => {
    void getDaily().then((d) => {
      setDaily(d)
      if (!d.offline)
        void getBoard(d.day).then((b) => {
          if (!b) return
          setStats(b.roundStats)
          setPlayersToday(b.players)
        })
    })
    void getMe().then((u) => u && setUser(u))
  }, [])

  useEffect(() => {
    if (!menu) return
    const off = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [menu])

  const go = useCallback((r: string) => {
    const target = parseFull(r)
    const cur = parseFull(location.hash)
    if (target.route === cur.route && target.sub === cur.sub) {
      setRoute(target.route)
      return
    }
    location.hash = target.sub ? `${target.route}/${target.sub}` : target.route
  }, [])

  const openSignUp = useCallback(() => setAuth('signup'), [])

  const signOut = async () => {
    await logOut()
    setUser(null)
    setMenu(false)
  }

  const savePayout = async () => {
    setPayoutMsg('')
    const r = await updatePayout(payout)
    if (r.ok) {
      setUser(r.user)
      setPayoutMsg('Saved')
    } else setPayoutMsg(r.error)
  }

  const playedToday = daily
    ? load<{ plays?: unknown[] }>(`sold:run:${daily.day}:${daily.seed.slice(0, 10)}`, {}).plays?.length === ROUNDS
    : false

  return (
    <div className={`app route-${route}`}>
      <header className="top">
        <div className="wrap top-inner">
          <a
            href="#home"
            className="logo"
            onClick={(e) => {
              e.preventDefault()
              go('home')
            }}
          >
            <img src="/icon-192.png" alt="" width="30" height="30" className="logo-mark" />
            <span>
              SOLD<span className="gold">.FUN</span>
            </span>
          </a>
          <nav className="nav">
            <button className={route === 'play' || route === 'daily' ? 'on' : ''} onClick={() => go('play')}>
              Play
            </button>
            <button className={route === 'leaderboard' ? 'on' : ''} onClick={() => go('leaderboard')}>
              Leaderboard
            </button>
            <button className={route === 'stats' ? 'on' : ''} onClick={() => go('stats')}>
              Stats
            </button>
          </nav>
          <div className="top-right">
            <button
              className={`ca-pill mono${CONFIG.ca ? '' : ' ca-soon'}`}
              onClick={copyCa}
              disabled={!CONFIG.ca}
              title={CONFIG.ca ? `Copy CA: ${CONFIG.ca}` : 'CA drops at launch'}
            >
              <span className="ca-label">CA</span>
              <span className="ca-val">
                {caCopied ? 'Copied' : CONFIG.ca ? `${CONFIG.ca.slice(0, 4)}…${CONFIG.ca.slice(-4)}` : 'Soon'}
              </span>
              {CONFIG.ca && !caCopied && (
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                  <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              )}
            </button>
            <a
              className="icon-btn"
              href={`https://x.com/${CONFIG.xHandle}`}
              target="_blank"
              rel="noreferrer"
              aria-label="SOLD.FUN on X"
              title={`@${CONFIG.xHandle} on X`}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z"
                />
              </svg>
            </a>
            <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M19.4 13a7.6 7.6 0 000-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 00-1.7-1L14.9 3h-4l-.4 2.9a7.4 7.4 0 00-1.7 1l-2.5-1-2 3.5L6.4 11a7.6 7.6 0 000 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 001.7 1l.4 2.9h4l.4-2.9a7.4 7.4 0 001.7-1l2.5 1 2-3.5zM12.9 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"
                />
              </svg>
            </button>
            {user ? (
              <div className="acct" ref={menuRef}>
                <button
                  className="btn btn-ghost btn-sm"
                  aria-expanded={menu}
                  onClick={() => {
                    setPayout(user.payout ?? '')
                    setPayoutMsg('')
                    setMenu(!menu)
                  }}
                >
                  @{user.display}
                </button>
                {menu && (
                  <div className="acct-menu">
                    <label className="field">
                      <span className="mono muted">PAYOUT ADDRESS</span>
                      <input id="acct-payout" value={payout} placeholder="Solana address" onChange={(e) => setPayout(e.target.value.trim())} />
                    </label>
                    <button className="btn btn-gold btn-sm" onClick={savePayout}>
                      Save address
                    </button>
                    {payoutMsg && <p className={payoutMsg === 'Saved' ? 'note mono' : 'err'}>{payoutMsg}</p>}
                    <button className="btn btn-ghost btn-sm" onClick={signOut}>
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button className="btn-link hide-sm" onClick={() => setAuth('login')}>
                  Log in
                </button>
                <button className="btn btn-gold btn-sm" onClick={openSignUp}>
                  Sign up
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {route === 'home' && <Landing go={go} playedToday={playedToday} />}
        {(route === 'play' || route === 'daily') && (
          <Hub
            daily={daily}
            user={user}
            onSignUp={openSignUp}
            go={go}
            roundStats={stats}
            playersToday={playersToday}
            initial={route === 'daily' ? 'daily' : 'hub'}
            openSettings={() => setSettingsOpen(true)}
          />
        )}
        {route === 'leaderboard' && <Leaderboard user={user} go={go} initialTab={sub} />}
        {route === 'stats' && <Stats go={go} />}
      </main>

      <footer className="foot">
        <div className="wrap foot-inner">
          <div className="logo logo-sm">
            <span>
              SOLD<span className="gold">.FUN</span>
            </span>
          </div>
          <p className="muted">
            Every chart is generated and every trade is simulated. No real money is traded and nothing here is financial advice.
          </p>
          <a className="mono" href={`https://x.com/${CONFIG.xHandle}`} target="_blank" rel="noreferrer">
            @{CONFIG.xHandle}
          </a>
        </div>
      </footer>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onMute={() => undefined} />}

      {auth && (
        <AuthModal
          initial={auth}
          onClose={() => setAuth(null)}
          onDone={(u) => {
            setUser(u)
            setAuth(null)
          }}
        />
      )}
    </div>
  )
}