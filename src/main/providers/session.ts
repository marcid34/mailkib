import type { MailAccountSecret } from '../../shared/types'
import { getMailAccount, updateTokens } from '../accounts'
import { refresh } from '../oauth'

const inFlight = new Map<string, Promise<string>>()

async function renew(account: MailAccountSecret): Promise<string> {
  const tokens = await refresh(
    account.provider,
    account.clientId,
    account.clientSecret,
    account.tokens
  )
  updateTokens(account.id, tokens)
  return tokens.accessToken
}

/** Returns a valid access token, refreshing (once, shared) when it is close to expiry. */
export async function accessToken(accountId: string, force = false): Promise<string> {
  const account = getMailAccount(accountId)
  if (!force && account.tokens.expiresAt - 60_000 > Date.now()) return account.tokens.accessToken

  const pending = inFlight.get(accountId)
  if (pending) return pending
  const task = renew(account).finally(() => inFlight.delete(accountId))
  inFlight.set(accountId, task)
  return task
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

async function describe(res: Response): Promise<string> {
  const body = await res.text().catch(() => '')
  try {
    const json = JSON.parse(body)
    return json?.error?.message ?? json?.error_description ?? json?.error ?? body.slice(0, 300)
  } catch {
    return body.slice(0, 300) || `${res.status} ${res.statusText}`
  }
}

/** Authenticated fetch with a single transparent retry after a 401. */
export async function apiFetch(
  accountId: string,
  url: string,
  init: RequestInit = {},
  retry = true
): Promise<Response> {
  const token = await accessToken(accountId)
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string>)
    }
  })
  if (res.status === 401 && retry) {
    await accessToken(accountId, true)
    return apiFetch(accountId, url, init, false)
  }
  if (!res.ok) throw new ApiError(await describe(res), res.status)
  return res
}

export async function apiJson<T>(
  accountId: string,
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await apiFetch(accountId, url, init)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
