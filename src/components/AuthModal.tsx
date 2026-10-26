import { useEffect, useRef, useState } from 'react'
import { logIn, signUp, type User } from '../lib/api'

interface Props {
  initial: 'signup' | 'login'
  onClose: () => void
  onDone: (u: User) => void
}

export function AuthModal({ initial, onClose, onDone }: Props) {
  const [mode, setMode] = useState(initial)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [payout, setPayout] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (mode === 'signup') {
      if (!/^@?[A-Za-z0-9_]{3,15}$/.test(username)) return setError('Username must be 3 to 15 characters: letters, numbers or underscores.')
      if (password.length < 8) return setError('Password must be at least 8 characters.')
    }
    setBusy(true)
    const r = mode === 'signup' ? await signUp(username, password, payout) : await logIn(username, password)
    setBusy(false)
    if (r.ok) onDone(r.user)
    else setError(r.error)
  }

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="tabs tabs-full" role="tablist">
          <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>
            Sign up
          </button>
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
            Log in
          </button>
        </div>
        <h2 id="auth-title" className="modal-title">
          {mode === 'signup' ? 'Get on the board' : 'Welcome back'}
        </h2>
        <p className="muted modal-sub">
          {mode === 'signup'
            ? 'Pick a name for the leaderboard. Top 10 every day split the pot.'
            : 'Log in to submit today’s run.'}
        </p>
        <form className="modal-form" onSubmit={submit}>
          <label className="field">
            <span className="mono muted">USERNAME</span>
            <input
              id="auth-username"
              ref={first}
              value={username}
              autoComplete="username"
              maxLength={16}
              placeholder="toptrader"
              onChange={(e) => setUsername(e.target.value.replace(/[^\w@]/g, ''))}
            />
          </label>
          <label className="field">
            <span className="mono muted">PASSWORD</span>
            <input
              id="auth-password"
              type="password"
              value={password}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {mode === 'signup' && (
            <label className="field">
              <span className="mono muted">SOLANA ADDRESS FOR PAYOUTS (OPTIONAL)</span>
              <input
                id="auth-payout"
                value={payout}
                placeholder="Where your winnings get sent"
                onChange={(e) => setPayout(e.target.value.trim())}
              />
            </label>
          )}
          {error && <p className="err">{error}</p>}
          <button className="btn btn-gold btn-lg" type="submit" disabled={busy}>
            {busy ? 'One sec…' : mode === 'signup' ? 'Create account' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}