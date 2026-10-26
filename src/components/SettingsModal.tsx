import { useEffect, useState } from 'react'
import { setSettings, useSettings, type Settings } from '../lib/settings'
import { isMuted, setMuted } from '../lib/sound'

interface Props {
  onClose: () => void
  onMute: (m: boolean) => void
}

const ROWS: { key: keyof Settings; label: string; note: string }[] = [
  { key: 'shake', label: 'Screen shake', note: 'Shake the terminal when you get rugged.' },
  { key: 'hotkeyHints', label: 'Hotkey hints', note: 'Show SPACE and H labels on the buttons.' },
  { key: 'ctFeed', label: 'CT posts in the feed', note: 'Fake KOL posts that hype tops and panic on dumps.' },
]

export function SettingsModal({ onClose, onMute }: Props) {
  const s = useSettings()
  const [muted, setMute] = useState(isMuted())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="settings-title" className="modal-title">
          Settings
        </h2>
        <div className="settings-list">
          <div className="settings-row">
            <div>
              <b>Sound</b>
              <p className="muted">Register bell on sells, alarm on rugs.</p>
            </div>
            <button
              className={`toggle${muted ? '' : ' on'}`}
              role="switch"
              aria-checked={!muted}
              aria-label="Sound"
              onClick={() => {
                setMuted(!muted)
                setMute(!muted)
                onMute(!muted)
              }}
            >
              <span />
            </button>
          </div>
          {ROWS.map((r) => (
            <div className="settings-row" key={r.key}>
              <div>
                <b>{r.label}</b>
                <p className="muted">{r.note}</p>
              </div>
              <button
                className={`toggle${s[r.key] ? ' on' : ''}`}
                role="switch"
                aria-checked={s[r.key]}
                aria-label={r.label}
                onClick={() => setSettings({ [r.key]: !s[r.key] })}
              >
                <span />
              </button>
            </div>
          ))}
        </div>
        <p className="muted settings-foot">Settings save on this device.</p>
      </div>
    </div>
  )
}