import type {
  AppInfo,
  AppSettings,
  CacheStats,
  Contact,
  AppUser,
  AuthState,
  DesktopStatus,
  DraftPayload,
  ListQuery,
  ListResult,
  MailAccount,
  MailFolder,
  OAuthRequest,
  Result,
  ThreadView
} from './types'

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
    contacts: (accountId: string, query?: string, limit?: number) => Promise<Result<Contact[]>>
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
    saveAttachment: (p: AttachmentRequest) => Promise<Result<string | null>>
    openAttachment: (p: AttachmentRequest) => Promise<Result<string>>
  }
}
