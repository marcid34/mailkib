import type {
  Contact,
  FolderId,
  ListQuery,
  MessageSummary,
  Recipient,
  ThreadView
} from '../shared/types'
import { locallyAnswerableQuery, matchesQuery, tokenize } from '../shared/search'
import { readEncrypted, writeEncrypted, removeFile } from './store'

/**
 * A local mirror of what we have already fetched, so opening a folder or a
 * thread paints instantly and search has something to answer from before the
 * network replies. Encrypted at rest with the same device key as the vault --
 * subjects and senders are no less sensitive than tokens.
 */
interface CacheFile {
  version: 1
  /** message id -> summary */
  messages: Record<string, MessageSummary>
  /** folder key -> ordered message ids */
  lists: Record<string, string[]>
  /** thread id -> full thread, capped and pruned by last access */
  threads: Record<string, { view: ThreadView; usedAt: number }>
  contacts: Record<string, Contact>
  updatedAt: number
}

const EMPTY: CacheFile = {
  version: 1,
  messages: {},
  lists: {},
  threads: {},
  contacts: {},
  updatedAt: 0
}

const MAX_THREADS = 250
const MAX_MESSAGES = 6000
const FLUSH_MS = 1500

const memory = new Map<string, CacheFile>()
const pending = new Map<string, NodeJS.Timeout>()

function fileName(accountId: string): string {
  return `cache-${accountId}.enc`
}

function load(accountId: string): CacheFile {
  const cached = memory.get(accountId)
  if (cached) return cached
  const file = readEncrypted<CacheFile>(fileName(accountId), EMPTY)
  const normalised: CacheFile = { ...EMPTY, ...file }
  memory.set(accountId, normalised)
  return normalised
}

/** Coalesce writes: list syncs touch the cache dozens of times in a burst. */
function flushLater(accountId: string): void {
  clearTimeout(pending.get(accountId))
  pending.set(
    accountId,
    setTimeout(() => {
      pending.delete(accountId)
      const file = memory.get(accountId)
      if (!file) return
      prune(file)
      file.updatedAt = Date.now()
      try {
        writeEncrypted(fileName(accountId), file)
      } catch {
        /* a failed cache write must never break the app */
      }
    }, FLUSH_MS)
  )
}

function prune(file: CacheFile): void {
  const threadIds = Object.keys(file.threads)
  if (threadIds.length > MAX_THREADS) {
    threadIds
      .sort((a, b) => file.threads[b].usedAt - file.threads[a].usedAt)
      .slice(MAX_THREADS)
      .forEach((id) => delete file.threads[id])
  }

  const messageIds = Object.keys(file.messages)
  if (messageIds.length > MAX_MESSAGES) {
    const keep = new Set(Object.values(file.lists).flat())
    messageIds
      .sort((a, b) => file.messages[b].date - file.messages[a].date)
      .slice(MAX_MESSAGES)
      .filter((id) => !keep.has(id))
      .forEach((id) => delete file.messages[id])
  }
}

export function listKey(query: Pick<ListQuery, 'folder' | 'search'>): string {
  return query.search?.trim() ? `${query.folder}::${query.search.trim()}` : query.folder
}

export function cachedList(accountId: string, key: string): MessageSummary[] | null {
  const file = load(accountId)
  const ids = file.lists[key]
  if (!ids) return null
  const messages = ids.map((id) => file.messages[id]).filter(Boolean)
  return messages.length > 0 ? messages : null
}

export function saveList(accountId: string, key: string, messages: MessageSummary[]): void {
  const file = load(accountId)
  for (const message of messages) file.messages[message.id] = message
  file.lists[key] = messages.map((m) => m.id)
  flushLater(accountId)
}

export function appendList(accountId: string, key: string, messages: MessageSummary[]): void {
  const file = load(accountId)
  for (const message of messages) file.messages[message.id] = message
  const existing = file.lists[key] ?? []
  const seen = new Set(existing)
  file.lists[key] = [...existing, ...messages.map((m) => m.id).filter((id) => !seen.has(id))]
  flushLater(accountId)
}

export function cachedThread(accountId: string, threadId: string): ThreadView | null {
  const file = load(accountId)
  const entry = file.threads[threadId]
  if (!entry) return null
  entry.usedAt = Date.now()
  return entry.view
}

export function saveThread(accountId: string, thread: ThreadView): void {
  const file = load(accountId)
  file.threads[thread.id] = { view: thread, usedAt: Date.now() }
  flushLater(accountId)
}

/** Reflect a local action so the cached view does not lie until the next sync. */
export function patchMessages(
  accountId: string,
  threadIds: string[],
  patch: Partial<MessageSummary>,
  removeFromKeys: string[] = []
): void {
  const file = load(accountId)
  const targets = new Set(threadIds)
  for (const message of Object.values(file.messages)) {
    if (targets.has(message.threadId)) Object.assign(message, patch)
  }
  for (const key of removeFromKeys) {
    const ids = file.lists[key]
    if (!ids) continue
    file.lists[key] = ids.filter((id) => !targets.has(file.messages[id]?.threadId ?? ''))
  }
  flushLater(accountId)
}

export function dropThread(accountId: string, threadId: string): void {
  const file = load(accountId)
  delete file.threads[threadId]
  for (const key of Object.keys(file.lists)) {
    file.lists[key] = file.lists[key].filter((id) => file.messages[id]?.threadId !== threadId)
  }
  flushLater(accountId)
}

/** How many rows the cache may add to a provider's search answer. */
const CACHE_FILL_LIMIT = 25

const NO_FOLDERS: Set<string> = new Set()

/** Which system folders the cache has seen each message in, for `in:` and scoping. */
function folderIndex(file: CacheFile): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()
  for (const [key, ids] of Object.entries(file.lists)) {
    // Skip search results (`inbox::vox`): they say what matched, not where it lives.
    if (key.includes('::')) continue
    for (const id of ids) {
      const set = index.get(id)
      if (set) set.add(key)
      else index.set(id, new Set([key]))
    }
  }
  return index
}

/**
 * Search what we already hold, honouring the folder we were asked about.
 *
 * `folder` is the scope, not a hint: `inbox` looks only at what the inbox has
 * cached, while `all` looks at the whole account. Getting that wrong makes every
 * search scope return the same rows in a different order.
 */
export function searchCached(
  accountId: string,
  folder: FolderId,
  query: string,
  limit = 60
): MessageSummary[] {
  const file = load(accountId)
  const tokens = tokenize(query)
  if (!locallyAnswerableQuery(tokens)) return []

  const index = folderIndex(file)
  const scoped = folder === 'all' ? null : new Set(file.lists[folder] ?? [])
  const now = Date.now()
  const hits: MessageSummary[] = []

  for (const message of Object.values(file.messages)) {
    if (scoped && !scoped.has(message.id)) continue
    if (!matchesQuery(message, tokens, { folders: index.get(message.id) ?? NO_FOLDERS, now })) {
      continue
    }
    hits.push(message)
  }

  return hits.sort((a, b) => b.date - a.date).slice(0, limit)
}

/**
 * Fold locally known matches into a server answer. The cache holds no bodies,
 * but it does hold every summary we have seen, and it matches word prefixes --
 * so a half-typed name the provider's index refuses to match still finds the
 * mail you were looking for. Server rows win on conflict.
 */
export function withCachedMatches(
  accountId: string,
  folder: FolderId,
  query: string,
  messages: MessageSummary[]
): MessageSummary[] {
  const local = searchCached(accountId, folder, query, CACHE_FILL_LIMIT)
  const seen = new Set(messages.map((m) => m.threadId))
  const extra = local.filter((m) => !seen.has(m.threadId))
  if (extra.length === 0) return messages

  return [...messages, ...extra].sort((a, b) => b.date - a.date)
}

/* ------------------------------------------------------------------ */
/* address book                                                        */
/* ------------------------------------------------------------------ */

function keyFor(email: string): string {
  return email.trim().toLowerCase()
}

function remember(file: CacheFile, person: Recipient, outgoing: boolean, when: number): void {
  const email = keyFor(person.email)
  if (!email || !email.includes('@')) return
  const existing = file.contacts[email]
  if (existing) {
    // A hidden contact stays hidden no matter how often they turn up again --
    // that is the whole point of hiding rather than deleting.
    existing.seen += 1
    if (outgoing) existing.sent += 1
    if (when > existing.lastSeen) existing.lastSeen = when
    // A real display name beats a bare address, and a newer one beats an older.
    if (person.name && (!existing.name || when >= existing.lastSeen)) existing.name = person.name
  } else {
    file.contacts[email] = {
      email,
      name: person.name,
      seen: 1,
      sent: outgoing ? 1 : 0,
      lastSeen: when
    }
  }
}

/** Harvest correspondents from a page of messages. */
export function learnContacts(
  accountId: string,
  messages: MessageSummary[],
  selfEmail: string
): void {
  const file = load(accountId)
  const self = keyFor(selfEmail)
  for (const message of messages) {
    if (keyFor(message.from.email) !== self) remember(file, message.from, false, message.date)
    for (const person of message.to) {
      if (keyFor(person.email) === self) continue
      // Anyone we addressed directly is a stronger signal than a sender.
      remember(file, person, keyFor(message.from.email) === self, message.date)
    }
  }
  flushLater(accountId)
}

export function allContacts(accountId: string, includeHidden = false): Contact[] {
  const all = Object.values(load(accountId).contacts)
  return includeHidden ? all : all.filter((c) => !c.hidden)
}

export function updateContact(
  accountId: string,
  email: string,
  patch: { name?: string; hidden?: boolean }
): Contact | null {
  const file = load(accountId)
  const contact = file.contacts[keyFor(email)]
  if (!contact) return null
  if (patch.name !== undefined) contact.name = patch.name.trim() || undefined
  if (patch.hidden !== undefined) contact.hidden = patch.hidden || undefined
  flushLater(accountId)
  return contact
}

/**
 * Remove the record outright. Contacts are re-learned from every sync, so this
 * only sticks until they appear in your mail again -- hide instead, to be rid of
 * someone for good.
 */
export function deleteContact(accountId: string, email: string): void {
  const file = load(accountId)
  delete file.contacts[keyFor(email)]
  flushLater(accountId)
}

/** Rank by how often you write to them, then how often you see them, then recency. */
export function rankContacts(contacts: Contact[], query: string, limit = 8): Contact[] {
  const q = query.trim().toLowerCase()
  const visible = contacts.filter((c) => !c.hidden)
  const pool = q
    ? visible.filter((c) => c.email.includes(q) || (c.name ?? '').toLowerCase().includes(q))
    : visible

  return pool
    .map((contact) => {
      const name = (contact.name ?? '').toLowerCase()
      const starts = q && (contact.email.startsWith(q) || name.startsWith(q)) ? 1 : 0
      const age = Math.max(1, (Date.now() - contact.lastSeen) / 86_400_000)
      return {
        contact,
        score: starts * 1000 + contact.sent * 30 + contact.seen * 3 + 60 / age
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.contact)
}

export function forgetAccount(accountId: string): void {
  memory.delete(accountId)
  clearTimeout(pending.get(accountId))
  pending.delete(accountId)
  removeFile(fileName(accountId))
}

export function clearCache(accountId: string): void {
  memory.set(accountId, { ...EMPTY, contacts: load(accountId).contacts })
  flushLater(accountId)
}

export function cacheStats(accountId: string): {
  messages: number
  threads: number
  contacts: number
  updatedAt: number
} {
  const file = load(accountId)
  return {
    messages: Object.keys(file.messages).length,
    threads: Object.keys(file.threads).length,
    contacts: Object.keys(file.contacts).length,
    updatedAt: file.updatedAt
  }
}
