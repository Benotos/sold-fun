import { useEffect, useState } from 'react'
import { CONFIG } from '../config'
import { DemoChart } from '../components/DemoChart'
import { ROUNDS, msUntilNextDay } from '../engine'
import { MODES, SOLO_MODES } from '../modes'
import { BOTS } from '../lib/bots'
import { fmtCountdown } from '../lib/format'

interface Props {
  go: (route: string) => void
  playedToday: boolean
}

const STAMPS = [
  { name: 'SOLD THE TOP', cls: 'gold', line: 'Average exit above 85% of the high.' },
  { name: 'BAG SECURED', cls: 'up', line: 'Solid exits, green all day.' },
  { name: 'PAPER HANDS', cls: 'plain', line: 'Out before the real move, every time.' },
  { name: 'DIAMOND HANDS', cls: 'down', line: 'Held through the top and round tripped it.' },
  { name: 'EXIT LIQUIDITY', cls: 'down', line: 'Holding when three of them went to zero.' },
]

export function Landing({ go, playedToday }: Props) {
  const [left, setLeft] = useState(msUntilNextDay())
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setLeft(msUntilNextDay()), 1000)
    return () => clearInterval(id)
  }, [])

  const copyCa = async () => {
    if (!CONFIG.ca) return
    try {
      await navigator.clipboard.writeText(CONFIG.ca)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* the CA stays visible and selectable */
    }
  }

  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow mono">DAILY EXIT GAME FOR THE TRENCHES</div>
          <h1>
            Anyone can buy.
            <br />
            <span className="gold">Can you sell?</span>
          </h1>
          <p className="lede">
            You already hold the bag. The chart is live and the future is hidden. You get one job: sell before the dev does.
          </p>
          <div className="hero-cta">
            <button className="btn btn-gold btn-lg" onClick={() => go('daily')}>
              {playedToday ? 'See today’s results' : 'Play today’s run'}
            </button>
            <button className="btn btn-ghost btn-lg" onClick={() => go('play')}>
              All game modes
            </button>
          </div>
          <div className="hero-facts mono">
            <span>
              <b>{ROUNDS}</b> charts
            </span>
            <span>
              <b>1</b> button
            </span>
            <span>
              <b>0</b> real money
            </span>
            <span>
              next run <b>{fmtCountdown(left)}</b>
            </span>
          </div>
        </div>
        <DemoChart />
      </section>

      <section className="strip">
        <div className="wrap strip-inner mono">
          <span>RUNNERS</span>
          <span>RUGS</span>
          <span>DEV DUMPS</span>
          <span>DOUBLE TOPS</span>
          <span>SLOW BLEEDS</span>
          <span>FAKE PUMPS</span>
          <span>STAIRCASES</span>
          <span>MOONSHOTS</span>
        </div>
      </section>

      <section className="how wrap" id="how">
        <h2 className="h-sec">How a run works</h2>
        <ol className="steps">
          <li>
            <div className="step-n mono">1</div>
            <h3>You start in the trade</h3>
            <p>Every chart opens with 1 SOL already bought near launch. No entries to time, no FOMO. Just a bag.</p>
          </li>
          <li>
            <div className="step-n mono">2</div>
            <h3>The chart plays live</h3>
            <p>About twenty seconds of candles, trades and dev wallet moves. Sell half to de risk, or sell it all at once.</p>
          </li>
          <li>
            <div className="step-n mono">3</div>
            <h3>You&rsquo;re scored on the top</h3>
            <p>Points come from how close you sold to the real high. Sell within a few candles of it for a sniper bonus.</p>
          </li>
          <li>
            <div className="step-n mono">4</div>
            <h3>Ten charts, one shot a day</h3>
            <p>Everyone gets the same ten charts. One run per account. The board resets at 00:00 UTC.</p>
          </li>
        </ol>
      </section>

      <section className="modes-land wrap">
        <h2 className="h-sec">More ways to sell</h2>
        <div className="mode-grid">
          {SOLO_MODES.map((m) => (
            <button key={m} className={`mode-card mode-${m}`} onClick={() => go('play')}>
              <div className="mode-tag mono">
                <span>{MODES[m].tag}</span>
              </div>
              <h3>{MODES[m].name}</h3>
              <p>{MODES[m].blurb}</p>
            </button>
          ))}
        </div>
        <div className="free-row">
          <div>
            <b>Race the bots.</b>
            <span className="muted">
              {' '}
              {BOTS.map((b) => b.name).join(', ')} sell every chart with you. Their exits show live, and your results show who won.
            </span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => go('play')}>
            Pick a mode
          </button>
        </div>
      </section>

      <section className="ratings wrap">
        <h2 className="h-sec">Which trader are you</h2>
        <div className="stamp-row">
          {STAMPS.map((s) => (
            <div key={s.name} className="stamp-card">
              <div className={`stamp stamp-sm stamp-c-${s.cls}`}>{s.name}</div>
              <p>{s.line}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pot wrap">
        <div className="pot-copy">
          <h2 className="h-sec">The daily pot</h2>
          <p>
            {CONFIG.rewardShareOfFees}% of {CONFIG.ticker} creator rewards go to the top ten sellers of each day. The rest funds
            development and the next build. Scores are recomputed on the server from your sells, so the board can&rsquo;t be faked.
          </p>
          <button className="btn btn-ghost" onClick={() => go('leaderboard')}>
            See today&rsquo;s board
          </button>
        </div>
        <table className="split mono">
          <thead>
            <tr>
              <th>RANK</th>
              <th className="r">SHARE OF POT</th>
            </tr>
          </thead>
          <tbody>
            {CONFIG.payoutSplit.map((p, i) => (
              <tr key={i}>
                <td>#{i + 1}</td>
                <td className="r">
                  <span className="bar" style={{ width: `${p * 3}%` }} />
                  {p}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ca wrap">
        <div className="ca-box">
          <span className="mono muted">CA</span>
          <code className="mono">{CONFIG.ca || 'Dropping at launch'}</code>
          {CONFIG.ca && (
            <button className="btn btn-ghost btn-sm" onClick={copyCa}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </section>
    </>
  )
}