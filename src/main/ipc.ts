import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import type {
  AppUser,
  DraftAttachment,
  DraftPayload,
  ListQuery,
  ListResult,
  AppSettings,
  CacheStats,
  Contact,
  MailAccount,
  MailFolder,
  OAuthRequest,
  ThreadView
} from '../shared/types'
import * as accounts from './accounts'
import * as cache from './cache'
import {
  MAX_ATTACHMENT_BYTES,
  releaseAttachments,
  resolveAttachments,
  stageBuffer,
  stagePath
} from './staging'
import { getSettings, setSettings } from './settings'
import { keyStorageBackend } from './crypto'
import { authorize, cancelOAuth } from './oauth'
import { GmailProvider } from './providers/gmail'
import { GraphProvider } from './providers/graph'
import type { MailProvider, MessageRef } from './providers/types'
import { appImagePath, desktopStatus, installDesktopEntry } from './desktop'

function providerFor(accountId: string): MailProvider {
  const account = accounts.getMailAccount(accountId)
  return account.provider === 'gmail'
    ? new GmailProvider(accountId)
    : new GraphProvider(accountId)
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function handle<P, R>(channel: string, fn: (payload: P) => R | Promise<R>): void {
  ipcMain.handle(channel, async (_event, payload: P) => {
    try {
      return { ok: true as const, data: await fn(payload) }
    } catch (error) {
      return { ok: false as const, error: message(error) }
    }
  })
}

export type MailAction = 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'inbox' | 'trash'

interface ActPayload {
  accountId: string
  refs: MessageRef[]
  action: MailAction
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  /* ------------------------------ app shell ------------------------------ */

  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    appImage: appImagePath(),
    keyBackend: keyStorageBackend(),
    desktop: desktopStatus()
  }))

  handle('app:window', (action: 'minimize' | 'maximize' | 'close') => {
    const win = getWindow()
    if (!win) return false
    if (action === 'minimize') win.minimize()
    else if (action === 'close') win.close()
    else if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return true
  })

  handle('app:settings', (): AppSettings => getSettings())

  handle('app:setSettings', (patch: Partial<AppSettings>): AppSettings => setSettings(patch))

  handle('app:installDesktopEntry', () => installDesktopEntry(true))

  handle('app:openExternal', async (url: string) => {
    const parsed = new URL(url)
    if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) {
      throw new Error('Refusing to open that link.')
    }
    await shell.openExternal(url)
    return true
  })

  /* -------------------------------- auth -------------------------------- */

  handle('auth:state', () => ({
    hasUsers: accounts.hasUsers(),
    users: accounts.listUsers().map((u) => u.username),
    user: accounts.currentUser()
  }))

  handle('auth:register', (p: { username: string; password: string }): AppUser =>
    accounts.register(p.username, p.password)
  )

  handle('auth:login', (p: { username: string; password: string }): AppUser =>
    accounts.login(p.username, p.password)
  )

  handle('auth:logout', () => {
    accounts.logout()
    return true
  })

  handle('auth:changePassword', (p: { oldPassword: string; newPassword: string }) => {
    accounts.changePassword(p.oldPassword, p.newPassword)
    return true
  })

  /* ---------------------------- mail accounts ---------------------------- */

  handle('accounts:list', (): MailAccount[] => accounts.listMailAccounts())

  handle('accounts:connect', async (req: OAuthRequest): Promise<MailAccount> => {
    if (!req.clientId?.trim()) throw new Error('A client ID is required.')
    const tokens = await authorize({
      provider: req.provider,
      clientId: req.clientId.trim(),
      clientSecret: req.clientSecret?.trim() || undefined
    })

    // Stage the account so the provider can use the normal authenticated path,
    // then correct the address once the profile call tells us who we are.
    const staged = accounts.addMailAccount({
      provider: req.provider,
      email: `pending-${Date.now()}@mailkib.local`,
      clientId: req.clientId.trim(),
      clientSecret: req.clientSecret?.trim() || undefined,
      tokens
    })
    try {
      const profile = await providerFor(staged.id).profile()
      accounts.removeMailAccount(staged.id)
      return accounts.addMailAccount({
        provider: req.provider,
        email: profile.email,
        displayName: profile.displayName,
        clientId: req.clientId.trim(),
        clientSecret: req.clientSecret?.trim() || undefined,
        tokens
      })
    } catch (error) {
      accounts.removeMailAccount(staged.id)
      throw error
    }
  })

  handle('accounts:cancelConnect', () => {
    cancelOAuth()
    return true
  })

  handle('accounts:remove', (id: string) => {
    accounts.removeMailAccount(id)
    cache.forgetAccount(id)
    return true
  })

  /* -------------------------------- mail -------------------------------- */

  handle('mail:list', async (query: ListQuery): Promise<ListResult> => {
    const result = await providerFor(query.accountId).list(query)
    if (!getSettings().cacheEnabled) return result

    const key = cache.listKey(query)
    if (query.pageToken) cache.appendList(query.accountId, key, result.messages)
    else cache.saveList(query.accountId, key, result.messages)
    cache.learnContacts(
      query.accountId,
      result.messages,
      accounts.getMailAccount(query.accountId).email
    )

    // Provider search indexes match whole words; the cache matches word
    // prefixes. On the first page of a search, show the union rather than
    // making the user finish typing a word the server insists on.
    const search = query.search?.trim()
    if (!search || query.pageToken) return result
    const messages = cache.withCachedMatches(
      query.accountId,
      query.folder,
      search,
      result.messages
    )
    if (messages.length !== result.messages.length) cache.saveList(query.accountId, key, messages)
    return { ...result, messages }
  })

  /** Instant, network-free answer used to paint before the sync lands. */
  handle('mail:cached', (query: ListQuery): ListResult => {
    if (!getSettings().cacheEnabled) return { messages: [], fromCache: true }
    const search = query.search?.trim()
    const exact = cache.cachedList(query.accountId, cache.listKey(query))
    if (exact) return { messages: exact, fromCache: true }
    if (search) {
      return {
        messages: cache.searchCached(query.accountId, query.folder, search, query.limit ?? 60),
        fromCache: true
      }
    }
    return { messages: [], fromCache: true }
  })

  handle('mail:cachedThread', (p: { accountId: string; threadId: string }): ThreadView | null =>
    getSettings().cacheEnabled ? cache.cachedThread(p.accountId, p.threadId) : null
  )

  handle(
    'mail:contacts',
    (p: {
      accountId: string
      query?: string
      limit?: number
      includeHidden?: boolean
    }): Contact[] => {
      const all = cache.allContacts(p.accountId, p.includeHidden)
      if (p.includeHidden) {
        // Managing the address book means seeing hidden entries too, so skip the
        // suggestion ranking and just sort them for a browsable list.
        const q = (p.query ?? '').trim().toLowerCase()
        return all
          .filter(
            (c) => !q || c.email.includes(q) || (c.name ?? '').toLowerCase().includes(q)
          )
          .sort((a, b) => b.sent - a.sent || b.seen - a.seen || b.lastSeen - a.lastSeen)
          .slice(0, p.limit ?? 300)
      }
      return cache.rankContacts(all, p.query ?? '', p.limit ?? 8)
    }
  )

  handle(
    'mail:updateContact',
    (p: { accountId: string; email: string; patch: { name?: string; hidden?: boolean } }) =>
      cache.updateContact(p.accountId, p.email, p.patch)
  )

  handle('mail:deleteContact', (p: { accountId: string; email: string }) => {
    cache.deleteContact(p.accountId, p.email)
    return true
  })

  handle('mail:cacheStats', (p: { accountId: string }): CacheStats => cache.cacheStats(p.accountId))

  handle('mail:clearCache', (p: { accountId: string }) => {
    cache.clearCache(p.accountId)
    return true
  })

  handle('mail:thread', async (p: { accountId: string; threadId: string }): Promise<ThreadView> => {
    const thread = await providerFor(p.accountId).thread(p.threadId)
    if (getSettings().cacheEnabled) {
      cache.saveThread(p.accountId, thread)
      cache.learnContacts(p.accountId, thread.messages, accounts.getMailAccount(p.accountId).email)
    }
    return thread
  })

  handle('mail:folders', (p: { accountId: string }): Promise<MailFolder[]> =>
    providerFor(p.accountId).folders()
  )

  handle(
    'mail:label',
    async (p: {
      accountId: string
      refs: MessageRef[]
      folderId: string
      mode: 'move' | 'apply' | 'remove'
    }) => {
      const provider = providerFor(p.accountId)
      if (p.mode === 'move') await provider.moveTo(p.refs, p.folderId)
      else if (p.mode === 'apply') await provider.applyLabel(p.refs, p.folderId)
      else await provider.removeLabel(p.refs, p.folderId)
      return true
    }
  )

  handle(
    'mail:createFolder',
    (p: { accountId: string; name: string; parentPath?: string }): Promise<MailFolder> =>
      providerFor(p.accountId).createFolder(p.name, p.parentPath)
  )

  handle(
    'mail:renameFolder',
    async (p: { accountId: string; folderId: string; name: string; parentPath?: string }) => {
      await providerFor(p.accountId).renameFolder(p.folderId, p.name, p.parentPath)
      return true
    }
  )

  handle('mail:deleteFolder', async (p: { accountId: string; folderId: string }) => {
    await providerFor(p.accountId).deleteFolder(p.folderId)
    return true
  })

  handle('mail:counts', (p: { accountId: string }) => providerFor(p.accountId).unreadCounts())

  handle('mail:act', async (p: ActPayload) => {
    const provider = providerFor(p.accountId)
    switch (p.action) {
      case 'read':
        await provider.setRead(p.refs, true)
        break
      case 'unread':
        await provider.setRead(p.refs, false)
        break
      case 'star':
        await provider.setStar(p.refs, true)
        break
      case 'unstar':
        await provider.setStar(p.refs, false)
        break
      case 'archive':
        await provider.archive(p.refs)
        break
      case 'inbox':
        await provider.moveToInbox(p.refs)
        break
      case 'trash':
        await provider.trash(p.refs)
        break
    }
    if (getSettings().cacheEnabled) {
      const threadIds = p.refs.map((r) => r.threadId)
      const patch: Record<string, Partial<import('../shared/types').MessageSummary>> = {
        read: { unread: false },
        unread: { unread: true },
        star: { starred: true },
        unstar: { starred: false },
        archive: {},
        inbox: {},
        trash: {}
      }
      const dropFrom =
        p.action === 'archive' ? ['inbox'] : p.action === 'trash' ? ['inbox', 'archive'] : []
      cache.patchMessages(p.accountId, threadIds, patch[p.action] ?? {}, dropFrom)
      if (p.action === 'trash') threadIds.forEach((id) => cache.dropThread(p.accountId, id))
    }
    return true
  })

  /** Total encoded size a provider will take; base64 inflates the files by a third. */
  const MAX_MESSAGE_BYTES = 24 * 1024 * 1024

  handle('mail:send', async (draft: DraftPayload) => {
    if (!draft.to.length) throw new Error('Add at least one recipient.')
    const files = resolveAttachments(draft.attachments)
    const total = files.reduce((sum, f) => sum + f.content.length, 0)
    if (total > MAX_MESSAGE_BYTES) {
      throw new Error(
        `Those attachments come to ${Math.round(total / 1024 / 1024)} MB. ` +
          'Mail providers reject anything over about 25 MB.'
      )
    }
    await providerFor(draft.accountId).send(draft, files)
    releaseAttachments((draft.attachments ?? []).map((a) => a.token))
    return true
  })

  /* --------------------------- outgoing files --------------------------- */

  handle('mail:pickAttachments', async (): Promise<DraftAttachment[]> => {
    const win = getWindow()
    const picked = await dialog.showOpenDialog(win!, {
      title: 'Attach files',
      buttonLabel: 'Attach',
      properties: ['openFile', 'multiSelections', 'dontAddToRecent']
    })
    if (picked.canceled) return []
    return picked.filePaths.map(stagePath)
  })

  /** Files dropped onto the compose window, which arrive as paths from the renderer. */
  handle('mail:stagePaths', (paths: string[]): DraftAttachment[] =>
    paths.filter(Boolean).map(stagePath)
  )

  /** Carry an attachment from a message being forwarded into the new draft. */
  handle(
    'mail:stageFromMessage',
    async (p: {
      accountId: string
      messageId: string
      attachmentId: string
      filename: string
      mimeType?: string
      size?: number
    }): Promise<DraftAttachment> => {
      if ((p.size ?? 0) > MAX_ATTACHMENT_BYTES) {
        throw new Error(`"${p.filename}" is too large to forward.`)
      }
      const data = await providerFor(p.accountId).attachment(p.messageId, p.attachmentId)
      return stageBuffer(
        Buffer.from(data.data, 'base64'),
        p.filename || data.filename || 'attachment',
        p.mimeType || data.mimeType
      )
    }
  )

  handle('mail:releaseAttachments', (tokens: string[]) => {
    releaseAttachments(tokens ?? [])
    return true
  })

  /**
   * Hand an attachment's bytes to the renderer so it can be shown in place. The
   * ceiling is about the IPC hop, not the file: a preview that has to serialise
   * a hundred megabytes through the bridge is worse than no preview at all, and
   * saving or opening the file still works at any size.
   */
  const MAX_PREVIEW_BYTES = 25 * 1024 * 1024

  handle(
    'mail:readAttachment',
    async (p: {
      accountId: string
      messageId: string
      attachmentId: string
      filename: string
      mimeType?: string
      size?: number
    }) => {
      if ((p.size ?? 0) > MAX_PREVIEW_BYTES) {
        throw new Error('That file is too large to preview — download it instead.')
      }
      const data = await providerFor(p.accountId).attachment(p.messageId, p.attachmentId)
      if (data.data.length * 0.75 > MAX_PREVIEW_BYTES) {
        throw new Error('That file is too large to preview — download it instead.')
      }
      return {
        // Gmail returns bytes without a type; the part header the reader already
        // has is the better answer, so prefer it over the fetch's guess.
        filename: p.filename || data.filename || 'attachment',
        mimeType: p.mimeType || data.mimeType || 'application/octet-stream',
        data: data.data
      }
    }
  )

  handle(
    'mail:saveAttachment',
    async (p: {
      accountId: string
      messageId: string
      attachmentId: string
      filename: string
    }) => {
      const win = getWindow()
      const target = await dialog.showSaveDialog(win!, {
        defaultPath: path.join(app.getPath('downloads'), p.filename || 'attachment'),
        buttonLabel: 'Save'
      })
      if (target.canceled || !target.filePath) return null
      const data = await providerFor(p.accountId).attachment(p.messageId, p.attachmentId)
      fs.writeFileSync(target.filePath, Buffer.from(data.data, 'base64'))
      return target.filePath
    }
  )

  handle(
    'mail:openAttachment',
    async (p: {
      accountId: string
      messageId: string
      attachmentId: string
      filename: string
    }) => {
      const data = await providerFor(p.accountId).attachment(p.messageId, p.attachmentId)
      const dir = path.join(app.getPath('temp'), 'mailkib-attachments')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, path.basename(p.filename || 'attachment'))
      fs.writeFileSync(file, Buffer.from(data.data, 'base64'), { mode: 0o600 })
      await shell.openPath(file)
      return file
    }
  )
}
