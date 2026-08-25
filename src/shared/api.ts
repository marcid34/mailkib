import type {
  AppInfo,
  AppSettings,
  CacheStats,
  Contact,
  AppUser,
  DraftAttachment,
  AuthState,
  DesktopStatus,
  DraftPayload,
  ListQuery,
  ListResult,
  MailAccount,
  MailFolder,
  MailNotice,
  OAuthRequest,
  Result,
  ThreadView
} from './types'
import type { Note, NotePatch, NoteSummary } from './notes'

export type MailAction = 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'inbox' | 'trash'

export interface MessageRef {
  id: string
  threadId: string
}

export interface AttachmentRequest {
  accountId: string
  messageId: string
  attachmentId: string
  filename: string
  mimeType?: string
  size?: number
}

/** An attachment's bytes, for showing it inside the app rather than handing it out. */
export interface AttachmentBytes {
  filename: string
  mimeType: string
  /** base64 */
  data: string
}

/** The full surface the preload bridge exposes as `window.mailkib`. */
export interface MailkibApi {
  app: {
    info: () => Promise<Result<AppInfo>>
    window: (action: 'minimize' | 'maximize' | 'close') => Promise<Result<boolean>>
    settings: () => Promise<Result<AppSettings>>
    setSettings: (patch: Partial<AppSettings>) => Promise<Result<AppSettings>>
    installDesktopEntry: () => Promise<Result<DesktopStatus>>
    openExternal: (url: string) => Promise<Result<boolean>>
    /** Raise desktop notifications for mail that just arrived. */
    notifyMail: (notices: MailNotice[]) => Promise<Result<number>>
    /** Unread total for the launcher icon. */
    setBadge: (count: number) => Promise<Result<boolean>>
    /** Fired when a notification is clicked; carries the thread to open. */
    onOpenMail: (
      cb: (target: { accountId: string; threadId: string; messageId: string }) => void
    ) => () => void
    /** Absolute path of a dropped file, or null when the drop carried no real file. */
    pathForFile: (file: File) => string | null
    onWindowState: (cb: (state: { maximized: boolean }) => void) => () => void
  }
  auth: {
    state: () => Promise<Result<AuthState>>
    register: (username: string, password: string) => Promise<Result<AppUser>>
    login: (username: string, password: string) => Promise<Result<AppUser>>
    logout: () => Promise<Result<boolean>>
    changePassword: (oldPassword: string, newPassword: string) => Promise<Result<boolean>>
  }
  accounts: {
    list: () => Promise<Result<MailAccount[]>>
    connect: (req: OAuthRequest) => Promise<Result<MailAccount>>
    cancelConnect: () => Promise<Result<boolean>>
    remove: (id: string) => Promise<Result<boolean>>
  }
  mail: {
    list: (query: ListQuery) => Promise<Result<ListResult>>
    cached: (query: ListQuery) => Promise<Result<ListResult>>
    cachedThread: (accountId: string, threadId: string) => Promise<Result<ThreadView | null>>
    contacts: (
      accountId: string,
      query?: string,
      limit?: number,
      includeHidden?: boolean
    ) => Promise<Result<Contact[]>>
    updateContact: (
      accountId: string,
      email: string,
      patch: { name?: string; hidden?: boolean }
    ) => Promise<Result<Contact | null>>
    deleteContact: (accountId: string, email: string) => Promise<Result<boolean>>
    cacheStats: (accountId: string) => Promise<Result<CacheStats>>
    clearCache: (accountId: string) => Promise<Result<boolean>>
    thread: (accountId: string, threadId: string) => Promise<Result<ThreadView>>
    folders: (accountId: string) => Promise<Result<MailFolder[]>>
    label: (
      accountId: string,
      refs: MessageRef[],
      folderId: string,
      mode: 'move' | 'apply' | 'remove'
    ) => Promise<Result<boolean>>
    createFolder: (
      accountId: string,
      name: string,
      parentPath?: string
    ) => Promise<Result<MailFolder>>
    renameFolder: (
      accountId: string,
      folderId: string,
      name: string,
      parentPath?: string
    ) => Promise<Result<boolean>>
    deleteFolder: (accountId: string, folderId: string) => Promise<Result<boolean>>
    counts: (accountId: string) => Promise<Result<Partial<Record<string, number>>>>
    act: (accountId: string, refs: MessageRef[], action: MailAction) => Promise<Result<boolean>>
    send: (draft: DraftPayload) => Promise<Result<boolean>>
    /** Read an attachment into the renderer so it can be previewed in place. */
    readAttachment: (p: AttachmentRequest) => Promise<Result<AttachmentBytes>>
    saveAttachment: (p: AttachmentRequest) => Promise<Result<string | null>>
    openAttachment: (p: AttachmentRequest) => Promise<Result<string>>
    /** Opens a file dialog; the chosen files are staged for the next send. */
    pickAttachments: () => Promise<Result<DraftAttachment[]>>
    /** Stage files dropped onto the window. */
    stagePaths: (paths: string[]) => Promise<Result<DraftAttachment[]>>
    /** Carry a received attachment into a draft, for forwarding. */
    stageFromMessage: (p: AttachmentRequest) => Promise<Result<DraftAttachment>>
    /** Discard staged files a draft no longer needs. */
    releaseAttachments: (tokens: string[]) => Promise<Result<boolean>>
  }
  notes: {
    list: () => Promise<Result<NoteSummary[]>>
    search: (query: string) => Promise<Result<NoteSummary[]>>
    get: (id: string) => Promise<Result<Note | null>>
    create: (patch?: NotePatch) => Promise<Result<Note>>
    update: (id: string, patch: NotePatch) => Promise<Result<Note>>
    remove: (id: string) => Promise<Result<boolean>>
  }
}
