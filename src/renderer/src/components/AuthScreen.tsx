import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react'
import type { AppUser } from '../../../shared/types'
import { api, call } from '../lib/api'
import { Mark } from './Icons'

interface Props {
  hasUsers: boolean
  onAuthenticated: (user: AppUser) => void
}

export function AuthScreen({ hasUsers, onAuthenticated }: Props): JSX.Element {
  const [mode, setMode] = useState<'login' | 'register'>(hasUsers ? 'login' : 'register')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const firstField = useRef<HTMLInputElement>(null)

  useEffect(() => firstField.current?.focus(), [mode])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    if (mode === 'register' && password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const user =
        mode === 'register'
          ? await call(api.auth.register(username, password))
          : await call(api.auth.login(username, password))
      onAuthenticated(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const registering = mode === 'register'

  return (
    <div className="centered">
      <div className="auth">
        <div className="auth__head">
          <div className="auth__logo">
            <Mark size={40} />
          </div>
          <h1>{registering ? 'Create your account' : 'Welcome back'}</h1>
          <p>
            {registering
              ? 'This account is local to this machine. It unlocks MailKib, nothing else.'
              : 'Sign in to unlock MailKib.'}
          </p>
        </div>

        <form onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              ref={firstField}
              value={username}
              autoComplete="username"
              spellCheck={false}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="kib"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              autoComplete={registering ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={registering ? 'At least 8 characters' : '••••••••'}
            />
          </div>

          {registering && (
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          )}

          {error && <div className="error-line">{error}</div>}

          <button
            className="btn btn--primary"
            type="submit"
            disabled={busy || !username.trim() || !password}
          >
            {busy ? <span className="spinner" /> : registering ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="auth__switch">
          {registering ? (
            <>
              Already set up?{' '}
              <button
                onClick={() => {
                  setMode('login')
                  setError(null)
                }}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Need an account?{' '}
              <button
                onClick={() => {
                  setMode('register')
                  setError(null)
                }}
              >
                Create one
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
