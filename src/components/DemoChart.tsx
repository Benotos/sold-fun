import { useEffect, useMemo, useState } from 'react'
import { TOTAL_TICKS, generateRound, mcAt, peakOf, type PatternId } from '../engine'
import { fmtMc } from '../lib/format'
import { Chart } from './Chart'

const DEMOS: PatternId[] = ['runner', 'staircase', 'moonshot', 'doubleTop']

/** Attract mode for the landing page: a chart plays, someone sells the top, it rolls over. */
export function DemoChart() {
  const [n, setN] = useState(0)
  const round = useMemo(() => generateRound('demo-reel', n, DEMOS[n % DEMOS.length]), [n])
  const peak = useMemo(() => peakOf(round), [round])
  const [t, setT] = useState(round.entryTick)

  useEffect(() => {
    setT(round.entryTick)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setT(TOTAL_TICKS - 1)
      return
    }
    let raf = 0
    let last = performance.now()
    let acc = 0
    let cur = round.entryTick
    let hold = 0
    const step = (now: number) => {
      const dt = Math.min(100, now - last)
      last = now
      if (cur >= TOTAL_TICKS - 1) {
        hold += dt
        if (hold > 2600) {
          setN((x) => x + 1)
          return
        }
      } else {
        acc += dt
        while (acc >= 22 && cur < TOTAL_TICKS - 1) {
          acc -= 22
          cur++
        }
        setT(cur)
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [round])

  const sellT = Math.min(TOTAL_TICKS - 1, peak.peakTick + 3)
  const sold = t >= sellT
  const mc = mcAt(round, Math.min(t, TOTAL_TICKS - 1))

  return (
    <div className="demo">
      <div className="demo-top mono">
        <span>${round.ticker}</span>
        <span className={mc >= round.entryMc ? 'up' : 'down'}>{fmtMc(mc)}</span>
      </div>
      <div className="demo-chart">
        <Chart round={round} upto={t} sells={sold ? [{ t: sellT, frac: 1 }] : []} compact label="Example chart replay" />
      </div>
      <div className={`demo-stamp${sold ? ' on' : ''}`} aria-hidden={!sold}>
        SOLD AT {fmtMc(mcAt(round, sellT))}
      </div>
    </div>
  )
}
