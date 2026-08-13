import { contextBridge, ipcRenderer } from 'electron'
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
} from '../shared/types'
import type { AttachmentRequest, MailAction, MailkibApi, MessageRef } from '../shared/api'

function invoke<T>(channel: string, payload?: unknown): Promise<Result<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<Result<T>>
}

const api: MailkibApi = {
  app: {
    info: () => invoke<AppInfo>('app:info'),
    window: (action: 'minimize' | 'maximize' | 'close') => invoke<boolean>('app:window', action),
    settings: () => invoke<AppSettings>('app:settings'),
    setSettings: (patch: Partial<AppSettings>) => invoke<AppSettings>('app:setSettings', patch),
    installDesktopEntry: () => invoke<DesktopStatus>('app:installDesktopEntry'),
    openExternal: (url: string) => invoke<boolean>('app:openExternal', url),
    onWindowState: (cb: (state: { maximized: boolean }) => void) => {
      const listener = (_e: unknown, state: { maximized: boolean }): void => cb(state)
      ipcRenderer.on('window:state', listener)
      return (): void => {
        ipcRenderer.removeListener('window:state', listener)
      }
    }
  },
  auth: {
    state: () => invoke<AuthState>('auth:state'),
    register: (username: string, password: string) =>
      invoke<AppUser>('auth:register', { username, password }),
    login: (username: string, password: string) =>
      invoke<AppUser>('auth:login', { username, password }),
    logout: () => invoke<boolean>('auth:logout'),
    changePassword: (oldPassword: string, newPassword: string) =>
      invoke<boolean>('auth:changePassword', { oldPassword, newPassword })
  },
  accounts: {
    list: () => invoke<MailAccount[]>('accounts:list'),
    connect: (req: OAuthRequest) => invoke<MailAccount>('accounts:connect', req),
    cancelConnect: () => invoke<boolean>('accounts:cancelConnect'),
    remove: (id: string) => invoke<boolean>('accounts:remove', id)
  },
  mail: {
    list: (query: ListQuery) => invoke<ListResult>('mail:list', query),
    cached: (query: ListQuery) => invoke<ListResult>('mail:cached', query),
    cachedThread: (accountId: string, threadId: string) =>
      invoke<ThreadView | null>('mail:cachedThread', { accountId, threadId }),
    contacts: (accountId: string, query?: string, limit?: number) =>
      invoke<Contact[]>('mail:contacts', { accountId, query, limit }),
    cacheStats: (accountId: string) => invoke<CacheStats>('mail:cacheStats', { accountId }),
    clearCache: (accountId: string) => invoke<boolean>('mail:clearCache', { accountId }),
    thread: (accountId: string, threadId: string) =>
      invoke<ThreadView>('mail:thread', { accountId, threadId }),
    folders: (accountId: string) => invoke<MailFolder[]>('mail:folders', { accountId }),
    label: (
      accountId: string,
      refs: MessageRef[],
      folderId: string,
      mode: 'move' | 'apply' | 'remove'
    ) => invoke<boolean>('mail:label', { accountId, refs, folderId, mode }),
    createFolder: (accountId: string, name: string, parentPath?: string) =>
      invoke<MailFolder>('mail:createFolder', { accountId, name, parentPath }),
    renameFolder: (accountId: string, folderId: string, name: string, parentPath?: string) =>
      invoke<boolean>('mail:renameFolder', { accountId, folderId, name, parentPath }),
    deleteFolder: (accountId: string, folderId: string) =>
      invoke<boolean>('mail:deleteFolder', { accountId, folderId }),
    counts: (accountId: string) =>
      invoke<Partial<Record<string, number>>>('mail:counts', { accountId }),
    act: (accountId: string, refs: MessageRef[], action: MailAction) =>
      invoke<boolean>('mail:act', { accountId, refs, action }),
    send: (draft: DraftPayload) => invoke<boolean>('mail:send', draft),
    saveAttachment: (p: AttachmentRequest) => invoke<string | null>('mail:saveAttachment', p),
    openAttachment: (p: AttachmentRequest) => invoke<string>('mail:openAttachment', p)
  }
}

contextBridge.exposeInMainWorld('mailkib', api)
