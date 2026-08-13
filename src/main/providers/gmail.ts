import type {
  Attachment,
  DraftPayload,
  FolderId,
  ListQuery,
  ListResult,
  MailFolder,
  MessageFull,
  MessageSummary,
  Recipient,
  ThreadView
} from '../../shared/types'
import { isLabelFolder, providerIdOf, toFolderId } from '../../shared/folders'
import { getMailAccount } from '../accounts'
import { base64url, fromBase64url } from '../crypto'
import { buildMime, decodeWords, parseAddress, parseAddressList, pooled } from '../mime'
import { apiFetch, apiJson } from './session'
import type { AttachmentData, MailProvider, MessageRef } from './types'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const PAGE_SIZE = 60
/** Ceiling on inline (cid:) images we will fetch and embed when opening a thread. */
const INLINE_BUDGET = 8 * 1024 * 1024
const INLINE_MAX_PART = 3 * 1024 * 1024

interface GHeader {
  name: string
  value: string
}

interface GPart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GHeader[]
  body?: { attachmentId?: string; size?: number; data?: string }
  parts?: GPart[]
}

interface GLabel {
  id?: string
  name?: string
  type?: string
  labelListVisibility?: string
  threadsUnread?: number
  threadsTotal?: number
}

interface GMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: GPart
  sizeEstimate?: number
}

function header(part: GPart | undefined, name: string): string | undefined {
  return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value
}

function decodePart(part: GPart): string {
  return part.body?.data ? fromBase64url(part.body.data).toString('utf8') : ''
}

interface Collected {
  text: string[]
  html: string[]
  attachments: Attachment[]
  inline: Map<string, Attachment>
}

function collect(part: GPart | undefined, out: Collected): void {
  if (!part) return
  const mime = (part.mimeType ?? '').toLowerCase()
  const disposition = (header(part, 'content-disposition') ?? '').toLowerCase()
  const cid = header(part, 'content-id')?.replace(/^<|>$/g, '')
  const isAttachment =
    Boolean(part.filename) && (Boolean(part.body?.attachmentId) || disposition.includes('attachment'))

  if (isAttachment) {
    const attachment: Attachment = {
      id: part.body?.attachmentId ?? part.partId ?? '',
      filename: decodeWords(part.filename!),
      mimeType: part.mimeType ?? 'application/octet-stream',
      size: part.body?.size ?? 0,
      cid
    }
    if (cid || disposition.includes('inline')) out.inline.set(cid ?? attachment.filename, attachment)
    if (!disposition.includes('inline') || !cid) out.attachments.push(attachment)
    return
  }

  if (mime === 'text/plain' && !part.filename) out.text.push(decodePart(part))
  else if (mime === 'text/html' && !part.filename) out.html.push(decodePart(part))

  for (const child of part.parts ?? []) collect(child, out)
}

function folderFilter(folder: FolderId, search?: string): { labelIds?: string[]; q?: string } {
  const q = search?.trim()
  const withSearch = (base?: string): string | undefined =>
    [base, q].filter(Boolean).join(' ') || undefined

  if (isLabelFolder(folder)) return { labelIds: [providerIdOf(folder)], q: withSearch() }

  switch (folder) {
    case 'inbox':
      return { labelIds: ['INBOX'], q: withSearch() }
    case 'starred':
      return { labelIds: ['STARRED'], q: withSearch() }
    case 'sent':
      return { labelIds: ['SENT'], q: withSearch() }
    case 'drafts':
      return { labelIds: ['DRAFT'], q: withSearch() }
    case 'spam':
      return { labelIds: ['SPAM'], q: withSearch() }
    case 'trash':
      return { labelIds: ['TRASH'], q: withSearch() }
    case 'archive':
      // Gmail has no "archive" label: it is everything filed away from the inbox.
      return { q: withSearch('-in:inbox -in:sent -in:draft -in:chats') }
    case 'all':
      // No label filter at all. messages.list leaves out spam and trash unless
      // includeSpamTrash is set, so this is exactly Gmail's "All Mail".
      return { q: withSearch('-in:chats') }
  }
}

export class GmailProvider implements MailProvider {
  constructor(private readonly accountId: string) {}

  private get address(): Recipient {
    const account = getMailAccount(this.accountId)
    return { email: account.email, name: account.displayName }
  }

  async profile(): Promise<{ email: string; displayName?: string }> {
    const p = await apiJson<{ emailAddress: string }>(this.accountId, `${BASE}/profile`)
    return { email: p.emailAddress }
  }

  async unreadCounts(): Promise<Partial<Record<string, number>>> {
    const [inbox, drafts] = await Promise.all([
      apiJson<{ threadsUnread?: number }>(this.accountId, `${BASE}/labels/INBOX`).catch(() => ({})),
      apiJson<{ threadsTotal?: number }>(this.accountId, `${BASE}/labels/DRAFT`).catch(() => ({}))
    ])
    return {
      inbox: (inbox as { threadsUnread?: number }).threadsUnread ?? 0,
      drafts: (drafts as { threadsTotal?: number }).threadsTotal ?? 0
    }
  }

  async folders(): Promise<MailFolder[]> {
    const res = await apiJson<{ labels?: GLabel[] }>(this.accountId, `${BASE}/labels`)
    const own = (res.labels ?? []).filter(
      (l) => l.type === 'user' && l.labelListVisibility !== 'labelHide' && l.id && l.name
    )

    // labels.list omits counts, so ask each label for its own. Best effort: a
    // label that fails to report still gets listed, just without a badge.
    const detailed = await pooled(own, 8, async (label) => {
      try {
        return await apiJson<GLabel>(this.accountId, `${BASE}/labels/${label.id}`)
      } catch {
        return label
      }
    })

    return detailed
      .sort((a, b) => a.name!.localeCompare(b.name!))
      .map((label) => {
        const segments = label.name!.split('/')
        return {
          id: toFolderId(label.id!),
          name: segments[segments.length - 1],
          path: label.name!,
          depth: segments.length - 1,
          unread: label.threadsUnread || undefined
        }
      })
  }

  async list(query: ListQuery): Promise<ListResult> {
    const { labelIds, q } = folderFilter(query.folder, query.search)
    const params = new URLSearchParams({ maxResults: String(query.limit ?? PAGE_SIZE) })
    for (const id of labelIds ?? []) params.append('labelIds', id)
    if (q) params.set('q', q)
    if (query.pageToken) params.set('pageToken', query.pageToken)

    const page = await apiJson<{
      messages?: { id: string; threadId: string }[]
      nextPageToken?: string
    }>(this.accountId, `${BASE}/messages?${params}`)

    const stubs = page.messages ?? []
    if (stubs.length === 0) return { messages: [], nextPageToken: page.nextPageToken }

    const detailParams =
      'format=metadata' +
      ['From', 'To', 'Cc', 'Subject', 'Date'].map((h) => `&metadataHeaders=${h}`).join('')

    const details = await pooled(stubs, 10, async (stub) => {
      try {
        return await apiJson<GMessage>(
          this.accountId,
          `${BASE}/messages/${stub.id}?${detailParams}`
        )
      } catch {
        return null
      }
    })

    // One row per conversation: keep the newest message and note the thread size.
    const byThread = new Map<string, MessageSummary>()
    for (const message of details) {
      if (!message) continue
      const summary = this.toSummary(message)
      const existing = byThread.get(summary.threadId)
      if (!existing) byThread.set(summary.threadId, { ...summary, threadCount: 1 })
      else {
        existing.threadCount = (existing.threadCount ?? 1) + 1
        existing.unread = existing.unread || summary.unread
        existing.starred = existing.starred || summary.starred
      }
    }

    return {
      messages: [...byThread.values()].sort((a, b) => b.date - a.date),
      nextPageToken: page.nextPageToken
    }
  }

  private toSummary(message: GMessage): MessageSummary {
    const payload = message.payload
    const labels = message.labelIds ?? []
    const parts = payload?.parts ?? []
    const hasAttachments =
      parts.some((p) => Boolean(p.filename)) ||
      (payload?.mimeType ?? '').toLowerCase() === 'multipart/mixed'

    return {
      id: message.id,
      threadId: message.threadId,
      accountId: this.accountId,
      from: parseAddress(header(payload, 'from')),
      to: parseAddressList(header(payload, 'to')),
      subject: decodeWords(header(payload, 'subject') ?? '') || '(no subject)',
      snippet: decodeHtmlEntities(message.snippet ?? ''),
      date: Number(message.internalDate ?? Date.now()),
      unread: labels.includes('UNREAD'),
      starred: labels.includes('STARRED'),
      hasAttachments
    }
  }

  private toFull(message: GMessage): MessageFull {
    const summary = this.toSummary(message)
    const out: Collected = { text: [], html: [], attachments: [], inline: new Map() }
    collect(message.payload, out)
    const payload = message.payload

    return {
      ...summary,
      cc: parseAddressList(header(payload, 'cc')),
      bcc: parseAddressList(header(payload, 'bcc')),
      replyTo: header(payload, 'reply-to') ? parseAddress(header(payload, 'reply-to')) : undefined,
      html: out.html.join('\n') || undefined,
      text: out.text.join('\n') || undefined,
      attachments: out.attachments,
      hasAttachments: out.attachments.length > 0,
      messageIdHeader: header(payload, 'message-id'),
      references: header(payload, 'references')
    }
  }

  async thread(threadId: string): Promise<ThreadView> {
    const thread = await apiJson<{ id: string; messages?: GMessage[] }>(
      this.accountId,
      `${BASE}/threads/${threadId}?format=full`
    )
    const raw = thread.messages ?? []
    const messages = raw.map((m) => this.toFull(m))

    // Swap cid: references for data URIs so inline images render in the sandboxed frame.
    let budget = INLINE_BUDGET
    await pooled(raw, 4, async (source, index) => {
      const message = messages[index]
      if (!message.html?.includes('cid:')) return
      const out: Collected = { text: [], html: [], attachments: [], inline: new Map() }
      collect(source.payload, out)
      for (const [cid, attachment] of out.inline) {
        if (!message.html!.includes(`cid:${cid}`)) continue
        if (attachment.size > INLINE_MAX_PART || attachment.size > budget) continue
        try {
          const data = await this.attachment(message.id, attachment.id)
          budget -= attachment.size
          message.html = message.html!.replaceAll(
            `cid:${cid}`,
            `data:${attachment.mimeType};base64,${data.data}`
          )
        } catch {
          /* leave the broken reference; the frame just shows no image */
        }
      }
    })

    return {
      id: thread.id,
      subject: messages[0]?.subject ?? '(no subject)',
      messages: messages.sort((a, b) => a.date - b.date)
    }
  }

  private async batchModify(
    refs: MessageRef[],
    addLabelIds: string[],
    removeLabelIds: string[]
  ): Promise<void> {
    const threadIds = [...new Set(refs.map((r) => r.threadId))]
    await pooled(threadIds, 6, async (threadId) => {
      await apiFetch(this.accountId, `${BASE}/threads/${threadId}/modify`, {
        method: 'POST',
        body: JSON.stringify({ addLabelIds, removeLabelIds })
      })
    })
  }

  setRead(refs: MessageRef[], read: boolean): Promise<void> {
    return this.batchModify(refs, read ? [] : ['UNREAD'], read ? ['UNREAD'] : [])
  }

  setStar(refs: MessageRef[], starred: boolean): Promise<void> {
    return this.batchModify(refs, starred ? ['STARRED'] : [], starred ? [] : ['STARRED'])
  }

  archive(refs: MessageRef[]): Promise<void> {
    return this.batchModify(refs, [], ['INBOX'])
  }

  moveToInbox(refs: MessageRef[]): Promise<void> {
    return this.batchModify(refs, ['INBOX'], ['TRASH', 'SPAM'])
  }

  async trash(refs: MessageRef[]): Promise<void> {
    const threadIds = [...new Set(refs.map((r) => r.threadId))]
    await pooled(threadIds, 6, async (threadId) => {
      await apiFetch(this.accountId, `${BASE}/threads/${threadId}/trash`, { method: 'POST' })
    })
  }

  /* --------------------------- labels as folders -------------------------- */

  moveTo(refs: MessageRef[], folderId: string): Promise<void> {
    return this.batchModify(refs, [folderId], ['INBOX'])
  }

  applyLabel(refs: MessageRef[], folderId: string): Promise<void> {
    return this.batchModify(refs, [folderId], [])
  }

  removeLabel(refs: MessageRef[], folderId: string): Promise<void> {
    return this.batchModify(refs, [], [folderId])
  }

  async createFolder(name: string, parentPath?: string): Promise<MailFolder> {
    // Gmail has no real hierarchy: nesting is just a slash in the name.
    const path = parentPath ? `${parentPath}/${name}` : name
    const label = await apiJson<GLabel>(this.accountId, `${BASE}/labels`, {
      method: 'POST',
      body: JSON.stringify({
        name: path,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show'
      })
    })
    const segments = (label.name ?? path).split('/')
    return {
      id: toFolderId(label.id!),
      name: segments[segments.length - 1],
      path: label.name ?? path,
      depth: segments.length - 1
    }
  }

  async renameFolder(folderId: string, name: string, parentPath?: string): Promise<void> {
    await apiFetch(this.accountId, `${BASE}/labels/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: parentPath ? `${parentPath}/${name}` : name })
    })
  }

  async deleteFolder(folderId: string): Promise<void> {
    await apiFetch(this.accountId, `${BASE}/labels/${folderId}`, { method: 'DELETE' })
  }

  async send(draft: DraftPayload): Promise<void> {
    const { raw } = buildMime(draft, this.address)
    await apiFetch(this.accountId, `${BASE}/messages/send`, {
      method: 'POST',
      body: JSON.stringify({
        raw: base64url(raw),
        ...(draft.threadId ? { threadId: draft.threadId } : {})
      })
    })
  }

  async attachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
    const res = await apiJson<{ data: string; size: number }>(
      this.accountId,
      `${BASE}/messages/${messageId}/attachments/${attachmentId}`
    )
    return {
      filename: '',
      mimeType: 'application/octet-stream',
      data: fromBase64url(res.data).toString('base64')
    }
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}
