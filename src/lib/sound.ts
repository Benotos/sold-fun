import { load, save } from './storage'

let ctx: AudioContext | null = null
let muted = load<boolean>('sold:muted', false)

export function isMuted() {
  return muted
}
export function setMuted(m: boolean) {
  muted = m
  save('sold:muted', m)
}

function ac(): AudioContext | null {
  if (muted) return null
  try {
    if (!ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new C()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number) {
  const a = ac()
  if (!a) return
  const t0 = a.currentTime + delay
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(a.destination)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}

export const sfx = {
  /** register bell for a sell */
  cash() {
    tone(1318, 0.12, 'triangle', 0.18)
    tone(1760, 0.35, 'triangle', 0.16, 0.07)
    tone(2637, 0.25, 'sine', 0.06, 0.07)
  },
  half() {
    tone(988, 0.18, 'triangle', 0.15)
  },
  rug() {
    tone(220, 0.6, 'sawtooth', 0.12, 0, 55)
  },
  tick() {
    tone(660, 0.05, 'square', 0.04)
  },
  go() {
    tone(880, 0.12, 'square', 0.07)
    tone(1320, 0.2, 'square', 0.06, 0.1)
  },
  stamp() {
    tone(140, 0.18, 'square', 0.12, 0, 70)
  },
}
