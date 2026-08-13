import { useEffect, useState, type JSX } from 'react'
import type { MailAccount, Provider } from '../../../shared/types'
import { api, call } from '../lib/api'
import { IconArrowLeft, LogoGoogle, LogoMicrosoft } from './Icons'

interface Props {
  onDone: (account: MailAccount) => void
  onCancel?: () => void
  firstRun: boolean
}

function ExternalLink({ href, children }: { href: string; children: string }): JSX.Element {
  return (
    <a
      onClick={(e) => {
        e.preventDefault()
        void api.app.openExternal(href)
      }}
      href={href}
    >
      {children}
    </a>
  )
}

function GmailSteps(): JSX.Element {
  return (
    <>
      <div className="setup__steps">
        <ol>
          <li>
            Open the{' '}
            <ExternalLink href="https://console.cloud.google.com/projectcreate">
              Google Cloud Console
            </ExternalLink>{' '}
            and create a project.
          </li>
          <li>
            Enable the{' '}
            <ExternalLink href="https://console.cloud.google.com/apis/library/gmail.googleapis.com">
              Gmail API
            </ExternalLink>
            .
          </li>
          <li>
            Go to <code>Google Auth Platform</code> → <code>Audience</code>. Set the user type to{' '}
            <code>External</code> and leave the publishing status on <code>Testing</code>.
          </li>
          <li>
            Still on <code>Audience</code>, under <code>Test users</code>, add the Gmail address you
            are connecting.
          </li>
          <li>
            Under <code>Clients</code>, create an <code>OAuth client ID</code> of type{' '}
            <code>Desktop app</code>.
          </li>
          <li>Paste the client ID and secret below.</li>
          <li>
            When the browser says “Google hasn’t verified this app”, click <code>Advanced</code> →{' '}
            <code>Go to MailKib (unsafe)</code>.
          </li>
        </ol>
      </div>

      <div className="setup__warn">
        <strong>Do not click “Publish app”.</strong> Gmail scopes are <em>restricted</em>, and an
        unverified app in production is blocked outright with “MailKib has not completed the Google
        verification process”. The trade-off for staying in testing is that Google expires the
        refresh token after 7 days, so you will reconnect about once a week.
      </div>
    </>
  )
}

function MicrosoftSteps(): JSX.Element {
  return (
    <div className="setup__steps">
      <ol>
        <li>
          Open{' '}
          <ExternalLink href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade">
            App registrations
          </ExternalLink>{' '}
          and register a new application.
        </li>
        <li>
          For account types pick <code>Accounts in any organizational directory and personal
          Microsoft accounts</code>.
        </li>
        <li>
          Add a platform: <code>Mobile and desktop applications</code>, with the redirect URI{' '}
          <code>http://localhost</code>.
        </li>
        <li>
          Under <code>API permissions</code> add the delegated Microsoft Graph scopes{' '}
          <code>Mail.ReadWrite</code>, <code>Mail.Send</code>, <code>User.Read</code>,{' '}
          <code>offline_access</code>.
        </li>
        <li>Paste the Application (client) ID below. No secret is needed.</li>
      </ol>
    </div>
  )
}

export function AddAccount({ onDone, onCancel, firstRun }: Props): JSX.Element {
  const [provider, setProvider] = useState<Provider | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [stalled, setStalled] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A verification block never redirects back, so the wait just hangs. Offer the
  // likely cause rather than leaving the spinner spinning for five minutes.
  useEffect(() => {
    if (!busy) {
      setStalled(false)
      return
    }
    const timer = setTimeout(() => setStalled(true), 20_000)
    return () => clearTimeout(timer)
  }, [busy])

  async function connect(): Promise<void> {
    if (!provider) return
    setBusy(true)
    setError(null)
    try {
      const account = await call(
        api.accounts.connect({ provider, clientId, clientSecret: clientSecret || undefined })
      )
      onDone(account)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  function cancelConnect(): void {
    void api.accounts.cancelConnect()
    setBusy(false)
  }

  if (!provider) {
    return (
      <div className="centered">
        <div className="onboard">
          <div className="onboard__head">
            <h1>{firstRun ? 'Add your first account' : 'Add an account'}</h1>
            <p>Pick a provider. You will connect it with your own OAuth credentials.</p>
          </div>

          <div className="provider-grid">
            <button className="provider-card" onClick={() => setProvider('gmail')}>
              <div className="provider-card__icon">
                <LogoGoogle size={56} />
              </div>
              <div className="provider-card__name">Gmail</div>
              <div className="provider-card__sub">Google Workspace or personal</div>
            </button>

            <button className="provider-card" onClick={() => setProvider('microsoft')}>
              <div className="provider-card__icon">
                <LogoMicrosoft size={52} />
              </div>
              <div className="provider-card__name">Microsoft</div>
              <div className="provider-card__sub">Outlook, Microsoft 365</div>
            </button>
          </div>

          {onCancel && (
            <div style={{ textAlign: 'center' }}>
              <button className="link-btn" onClick={onCancel}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const isGmail = provider === 'gmail'

  return (
    <div className="centered">
      <div className="setup">
        <div className="onboard__head" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="iconbtn"
            onClick={() => {
              setProvider(null)
              setError(null)
            }}
            title="Back"
          >
            <IconArrowLeft size={17} />
          </button>
          {isGmail ? <LogoGoogle size={26} /> : <LogoMicrosoft size={24} />}
          <h1 style={{ fontSize: 18 }}>Connect {isGmail ? 'Gmail' : 'Microsoft'}</h1>
        </div>

        <p style={{ margin: 0, color: 'var(--fg-faint)', fontSize: 12.5 }}>
          MailKib ships without shared API keys, so each install uses its own OAuth client. This is
          a one-time setup that takes a couple of minutes.
        </p>

        {isGmail ? <GmailSteps /> : <MicrosoftSteps />}

        <div className="field">
          <label htmlFor="clientId">Client ID</label>
          <input
            id="clientId"
            value={clientId}
            spellCheck={false}
            onChange={(e) => setClientId(e.target.value.trim())}
            placeholder={
              isGmail ? '000000000000-xxxxxxxx.apps.googleusercontent.com' : '00000000-0000-0000-…'
            }
          />
        </div>

        <div className="field">
          <label htmlFor="clientSecret">Client secret {isGmail ? '' : '(optional)'}</label>
          <input
            id="clientSecret"
            type="password"
            value={clientSecret}
            spellCheck={false}
            onChange={(e) => setClientSecret(e.target.value.trim())}
            placeholder={isGmail ? 'GOCSPX-…' : 'Leave empty for a public client'}
          />
          <div className="field__hint">
            Stored encrypted on this machine only, alongside your tokens.
          </div>
        </div>

        {error && <div className="error-line">{error}</div>}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn--primary"
            disabled={busy || !clientId.trim() || (isGmail && !clientSecret.trim())}
            onClick={() => void connect()}
          >
            {busy ? <span className="spinner" /> : 'Connect in browser'}
          </button>
          {busy && (
            <>
              <span style={{ fontSize: 12.5, color: 'var(--fg-faint)' }}>
                Waiting for you to finish in the browser…
              </span>
              <button className="btn btn--ghost btn--sm" onClick={cancelConnect}>
                Cancel
              </button>
            </>
          )}
        </div>

        {busy && stalled && isGmail && (
          <div className="setup__warn">
            Still waiting. If the browser said <strong>“Access blocked: MailKib has not completed
            the Google verification process”</strong>, your app is either published to production or
            your address is not on the test-user list. Open{' '}
            <ExternalLink href="https://console.cloud.google.com/auth/audience">
              Google Auth Platform → Audience
            </ExternalLink>
            , switch the status back to <code>Testing</code>, add your address under{' '}
            <code>Test users</code>, then cancel and try again.
          </div>
        )}
      </div>
    </div>
  )
}
