import type { AppUser, MailAccount, MailAccountSecret, OAuthTokens } from '../shared/types'
import { hashPassword, verifyPassword, newId } from './crypto'
import { readJson, writeJson, readEncrypted, writeEncrypted, removeFile } from './store'

interface StoredUser {
  id: string
  username: string
  salt: string
  hash: string
  createdAt: number
}

interface UsersFile {
  version: 1
  users: StoredUser[]
  session: { userId: string; since: number } | null
}

const USERS_FILE = 'users.json'
const EMPTY: UsersFile = { version: 1, users: [], session: null }

const ACCENTS = ['#7aa2f7', '#bb9af7', '#9ece6a', '#e0af68', '#7dcfff', '#f7768e', '#ff9e64']

function load(): UsersFile {
  const f = readJson<UsersFile>(USERS_FILE, EMPTY)
  return { ...EMPTY, ...f, users: f.users ?? [] }
}

function save(f: UsersFile): void {
  writeJson(USERS_FILE, f)
}

function publicUser(u: StoredUser): AppUser {
  return { id: u.id, username: u.username, createdAt: u.createdAt }
}

export function hasUsers(): boolean {
  return load().users.length > 0
}

export function listUsers(): AppUser[] {
  return load().users.map(publicUser)
}

export function validateUsername(username: string): string | null {
  const u = username.trim()
  if (u.length < 2 || u.length > 32) return 'Username must be 2–32 characters.'
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) return 'Use letters, numbers, dot, dash or underscore.'
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (password.length > 512) return 'Password is too long.'
  return null
}

export function register(username: string, password: string): AppUser {
  const nameError = validateUsername(username)
  if (nameError) throw new Error(nameError)
  const passError = validatePassword(password)
  if (passError) throw new Error(passError)

  const f = load()
  const name = username.trim()
  if (f.users.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
    throw new Error('That username is already taken on this device.')
  }
  const { salt, hash } = hashPassword(password)
  const user: StoredUser = { id: newId('u'), username: name, salt, hash, createdAt: Date.now() }
  f.users.push(user)
  f.session = { userId: user.id, since: Date.now() }
  save(f)
  return publicUser(user)
}

export function login(username: string, password: string): AppUser {
  const f = load()
  const user = f.users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase())
  // Hash regardless of whether the user exists so a missing account and a wrong
  // password take the same amount of time.
  const ok = user
    ? verifyPassword(password, user.salt, user.hash)
    : (hashPassword(password), false)
  if (!user || !ok) throw new Error('Incorrect username or password.')
  f.session = { userId: user.id, since: Date.now() }
  save(f)
  return publicUser(user)
}

/** The signed-in user, or null. Sessions persist across restarts by design. */
export function currentUser(): AppUser | null {
  const f = load()
  if (!f.session) return null
  const user = f.users.find((u) => u.id === f.session!.userId)
  return user ? publicUser(user) : null
}

export function logout(): void {
  const f = load()
  f.session = null
  save(f)
}

export function changePassword(oldPassword: string, newPassword: string): void {
  const f = load()
  const me = currentUser()
  if (!me) throw new Error('Not signed in.')
  const user = f.users.find((u) => u.id === me.id)!
  if (!verifyPassword(oldPassword, user.salt, user.hash)) throw new Error('Current password is incorrect.')
  const passError = validatePassword(newPassword)
  if (passError) throw new Error(passError)
  const { salt, hash } = hashPassword(newPassword)
  user.salt = salt
  user.hash = hash
  save(f)
}

/* ------------------------------------------------------------------ */
/* Mail accounts live in a per-user encrypted vault                     */
/* ------------------------------------------------------------------ */

interface Vault {
  accounts: MailAccountSecret[]
}

function vaultName(userId: string): string {
  return `vault-${userId}.enc`
}

function requireUser(): AppUser {
  const me = currentUser()
  if (!me) throw new Error('Not signed in.')
  return me
}

function loadVault(): Vault {
  return readEncrypted<Vault>(vaultName(requireUser().id), { accounts: [] })
}

function saveVault(v: Vault): void {
  writeEncrypted(vaultName(requireUser().id), v)
}

function stripSecrets(a: MailAccountSecret): MailAccount {
  return {
    id: a.id,
    provider: a.provider,
    email: a.email,
    displayName: a.displayName,
    color: a.color,
    addedAt: a.addedAt
  }
}

export function listMailAccounts(): MailAccount[] {
  return loadVault().accounts.map(stripSecrets)
}

export function getMailAccount(id: string): MailAccountSecret {
  const account = loadVault().accounts.find((a) => a.id === id)
  if (!account) throw new Error('Mail account not found.')
  return account
}

export function addMailAccount(input: {
  provider: MailAccountSecret['provider']
  email: string
  displayName?: string
  clientId: string
  clientSecret?: string
  tokens: OAuthTokens
}): MailAccount {
  const v = loadVault()
  const existing = v.accounts.find(
    (a) => a.provider === input.provider && a.email.toLowerCase() === input.email.toLowerCase()
  )
  if (existing) {
    // Re-authorising an account we already have: refresh its credentials in place.
    existing.clientId = input.clientId
    existing.clientSecret = input.clientSecret
    existing.tokens = input.tokens
    existing.displayName = input.displayName ?? existing.displayName
    saveVault(v)
    return stripSecrets(existing)
  }
  const account: MailAccountSecret = {
    id: newId('a'),
    provider: input.provider,
    email: input.email,
    displayName: input.displayName,
    color: ACCENTS[v.accounts.length % ACCENTS.length],
    addedAt: Date.now(),
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    tokens: input.tokens
  }
  v.accounts.push(account)
  saveVault(v)
  return stripSecrets(account)
}

export function updateTokens(accountId: string, tokens: OAuthTokens): void {
  const v = loadVault()
  const account = v.accounts.find((a) => a.id === accountId)
  if (!account) return
  account.tokens = tokens
  saveVault(v)
}

export function removeMailAccount(id: string): void {
  const v = loadVault()
  v.accounts = v.accounts.filter((a) => a.id !== id)
  saveVault(v)
}

export function deleteUserData(userId: string): void {
  removeFile(vaultName(userId))
}
