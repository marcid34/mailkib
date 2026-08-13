import http from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { shell } from 'electron'
import type { OAuthRequest, OAuthTokens, Provider } from '../shared/types'
import { base64url } from './crypto'

interface ProviderConfig {
  authUrl: string
  tokenUrl: string
  scopes: string
  /** Google wants the loopback IP; Azure only accepts the literal `localhost`. */
  redirectHost: 'localhost' | '127.0.0.1'
  extraAuthParams: Record<string, string>
}

export const PROVIDERS: Record<Provider, ProviderConfig> = {
  gmail: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: 'https://www.googleapis.com/auth/gmail.modify',
    redirectHost: '127.0.0.1',
    // offline + consent is what actually gets us a refresh token back.
    extraAuthParams: { access_type: 'offline', prompt: 'consent' }
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: 'offline_access openid email profile User.Read Mail.ReadWrite Mail.Send',
    redirectHost: 'localhost',
    extraAuthParams: { response_mode: 'query', prompt: 'select_account' }
  }
}

const PAGE = (title: string, body: string, accent: string): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>MailKib</title><style>
  :root { color-scheme: dark }
  body { margin:0; height:100vh; display:grid; place-items:center; background:#24283b;
         color:#c0caf5; font: 15px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif }
  .card { text-align:center; padding:44px 56px; background:#1f2335; border:1px solid #2f344d;
          border-radius:14px; box-shadow:0 18px 50px rgba(0,0,0,.35); max-width:420px }
  h1 { margin:0 0 10px; font-size:19px; font-weight:600; color:${accent} }
  p { margin:0; color:#a9b1d6 }
  .mark { font-size:26px; margin-bottom:14px }
</style></head>
<body><div class="card"><div class="mark">✉</div><h1>${title}</h1><p>${body}</p></div></body></html>`

function isLoopback(address: string | undefined): boolean {
  if (!address) return false
  const a = address.replace(/^::ffff:/, '')
  return a === '127.0.0.1' || a === '::1' || a.startsWith('127.')
}

let activeServer: http.Server | null = null

export function cancelOAuth(): void {
  activeServer?.close()
  activeServer = null
}

interface CodeResult {
  code: string
  redirectUri: string
  verifier: string
}

/** Serve one loopback request and resolve with the authorization code. */
function awaitAuthorizationCode(
  provider: Provider,
  clientId: string,
  timeoutMs = 5 * 60_000
): Promise<CodeResult> {
  const cfg = PROVIDERS[provider]
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))

  return new Promise<CodeResult>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // Give the browser a moment to receive the response page before we drop
      // the socket, then stop listening.
      setTimeout(() => {
        server.close()
        if (activeServer === server) activeServer = null
      }, 300)
      fn()
    }

    const server = http.createServer((req, res) => {
      if (!isLoopback(req.socket.remoteAddress)) {
        res.writeHead(403).end()
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      if (!code && !error) {
        res.writeHead(404).end()
        return
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      if (error) {
        const description = url.searchParams.get('error_description') ?? error
        res.end(PAGE('Authorization failed', escapeHtml(description), '#f7768e'))
        finish(() => reject(new Error(description)))
        return
      }
      if (url.searchParams.get('state') !== state) {
        res.end(PAGE('Authorization failed', 'State mismatch — please try again.', '#f7768e'))
        finish(() => reject(new Error('OAuth state mismatch.')))
        return
      }
      res.end(PAGE('You’re connected', 'You can close this tab and return to MailKib.', '#9ece6a'))
      finish(() => resolve({ code: code!, redirectUri, verifier }))
    })

    let redirectUri = ''
    const timer = setTimeout(
      () => finish(() => reject(new Error('Timed out waiting for authorization.'))),
      timeoutMs
    )

    server.on('error', (err) => finish(() => reject(err)))
    // No host: binds dual-stack so both `localhost` (::1) and 127.0.0.1 resolve.
    server.listen(0, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        finish(() => reject(new Error('Could not open a local callback port.')))
        return
      }
      activeServer = server
      redirectUri = `http://${cfg.redirectHost}:${address.port}`
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: cfg.scopes,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        ...cfg.extraAuthParams
      })
      void shell.openExternal(`${cfg.authUrl}?${params.toString()}`)
    })
  })
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

async function postToken(url: string, body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  const json = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok || json.error) {
    throw new Error(json.error_description ?? json.error ?? `Token request failed (${res.status}).`)
  }
  return json
}

function toTokens(r: TokenResponse, previousRefresh?: string): OAuthTokens {
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token ?? previousRefresh,
    expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000,
    scope: r.scope
  }
}

/** Full interactive flow: browser consent, then code -> tokens. */
export async function authorize(req: OAuthRequest): Promise<OAuthTokens> {
  const cfg = PROVIDERS[req.provider]
  const { code, redirectUri, verifier } = await awaitAuthorizationCode(req.provider, req.clientId)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: req.clientId,
    redirect_uri: redirectUri,
    code_verifier: verifier
  })
  if (req.clientSecret) body.set('client_secret', req.clientSecret)
  const tokens = toTokens(await postToken(cfg.tokenUrl, body))
  if (!tokens.refreshToken && req.provider === 'gmail') {
    throw new Error(
      'Google did not return a refresh token. Revoke MailKib at myaccount.google.com/permissions and connect again.'
    )
  }
  return tokens
}

export async function refresh(
  provider: Provider,
  clientId: string,
  clientSecret: string | undefined,
  tokens: OAuthTokens
): Promise<OAuthTokens> {
  if (!tokens.refreshToken) throw new Error('Session expired — reconnect this account.')
  const cfg = PROVIDERS[provider]
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: clientId
  })
  if (provider === 'microsoft') body.set('scope', cfg.scopes)
  if (clientSecret) body.set('client_secret', clientSecret)
  return toTokens(await postToken(cfg.tokenUrl, body), tokens.refreshToken)
}
