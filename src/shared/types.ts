export type Provider = 'gmail' | 'microsoft'

export interface AppUser {
  id: string
  username: string
  createdAt: number
}

export interface MailAccount {
  id: string
  provider: Provider
  email: string
  displayName?: string
  color: string
  addedAt: number
}

/** Stored privately in the encrypted vault; never crosses the IPC boundary. */
export interface MailAccountSecret extends MailAccount {
  clientId: string
  clientSecret?: string
  tokens: OAuthTokens
}

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  /** epoch ms */
  expiresAt: number
  scope?: string
}

export type SystemFolderId =
  | 'inbox'
  | 'starred'
  | 'sent'
  | 'drafts'
  | 'archive'
  | 'all'
  | 'spam'
  | 'trash'

/**
 * Either one of the built-in views, or a provider-side label/folder addressed as
 * `label:<provider id>`.
 */
export type FolderId = SystemFolderId | `label:${string}`

/** A user-created Gmail label or Outlook folder. */
export interface MailFolder {
  id: FolderId
  /** leaf name, e.g. "Clients" */
  name: string
  /** full path, e.g. "Work/Clients" */
  path: string
  /** nesting level, used for indentation */
  depth: number
  unread?: number
}

export interface Recipient {
  name?: string
  email: string
}

/** One row in the message list. */
export interface MessageSummary {
  id: string
  threadId: string
  accountId: string
  from: Recipient
  to: Recipient[]
  subject: string
  snippet: string
  date: number
  unread: boolean
  starred: boolean
  hasAttachments: boolean
  /** number of messages in the thread, when known */
  threadCount?: number
}

export interface Attachment {
  id: string
  filename: string
  mimeType: string
  size: number
  /** content-id, for inline images */
  cid?: string
}

export interface MessageFull extends MessageSummary {
  cc: Recipient[]
  bcc: Recipient[]
  replyTo?: Recipient
  html?: string
  text?: string
  attachments: Attachment[]
  messageIdHeader?: string
  references?: string
}

export interface ThreadView {
  id: string
  subject: string
  messages: MessageFull[]
}

export interface ListResult {
  messages: MessageSummary[]
  nextPageToken?: string
  /** true when served from the local cache rather than the network */
  fromCache?: boolean
}

export interface ListQuery {
  accountId: string
  folder: FolderId
  search?: string
  pageToken?: string
  limit?: number
}

/**
 * A file staged for sending. The bytes live in the main process; the renderer
 * only ever holds this descriptor, so a draft can carry a 20 MB attachment
 * without any of it crossing the IPC boundary until the message is sent.
 */
export interface DraftAttachment {
  /** Opaque handle into the main-process staging table. */
  token: string
  filename: string
  mimeType: string
  size: number
  /** content-id, when the file is referenced from the body as `cid:` */
  cid?: string
}

export interface DraftPayload {
  accountId: string
  to: Recipient[]
  cc?: Recipient[]
  bcc?: Recipient[]
  subject: string
  body: string
  /** plain-text alternative; generated from body when absent */
  text?: string
  inReplyTo?: string
  references?: string
  threadId?: string
  /** Provider message id being replied to (Microsoft Graph threads replies through it). */
  replySourceId?: string
  attachments?: DraftAttachment[]
}

export interface OAuthRequest {
  provider: Provider
  clientId: string
  clientSecret?: string
}

export interface Ok<T> {
  ok: true
  data: T
}
export interface Err {
  ok: false
  error: string
  code?: string
}
export type Result<T> = Ok<T> | Err

export interface AppSettings {
  themeId: string
  cacheEnabled: boolean
  /** When to fetch images hosted on the sender's servers. */
  remoteImages: 'always' | 'ask' | 'never'
  /**
   * HTML email is authored for a white page. `auto` renders designed messages on
   * a light sheet and leaves plain ones on the app background.
   */
  messageSurface: 'auto' | 'light' | 'dark'
  /** Raise a desktop notification when mail lands while the app is running. */
  notifications: boolean
  /** Let the notification make the system's noise. */
  notificationSound: boolean
  /** Put the unread total on the launcher/taskbar icon. */
  badgeCount: boolean
  /**
   * Which visual language the app wears. `kib` is the rounded, proportional
   * original; `terminal` is the same app drawn like a tiling-WM desktop --
   * monospace, square, framed, bracketed.
   */
  look: LookId
}

export type LookId = 'kib' | 'terminal'

/** One arriving message, described well enough to notify about it. */
export interface MailNotice {
  accountId: string
  /** The mailbox it landed in, so the notification can say which. */
  accountEmail: string
  threadId: string
  messageId: string
  from: string
  subject: string
  snippet: string
}

export interface Contact {
  email: string
  name?: string
  /** times seen in any header */
  seen: number
  /** times we addressed them directly */
  sent: number
  lastSeen: number
  /**
   * Kept out of suggestions. Survives re-learning -- contacts are harvested from
   * every sync, so a plain delete would simply come back.
   */
  hidden?: boolean
}

export interface CacheStats {
  messages: number
  threads: number
  contacts: number
  updatedAt: number
}

export interface DesktopStatus {
  installed: boolean
  path: string
  managed: boolean
}

export interface AppInfo {
  version: string
  platform: string
  appImage: string | null
  keyBackend: string
  desktop: DesktopStatus
}

export interface AuthState {
  hasUsers: boolean
  users: string[]
  user: AppUser | null
}

export interface SyncStatus {
  accountId: string
  state: 'idle' | 'syncing' | 'error'
  message?: string
}
