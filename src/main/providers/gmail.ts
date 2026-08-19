import { randomBytes } from 'node:crypto'
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
import {
  buildMime,
  cidRefs,
  decodeWords,
  normalizeCid,
  parseAddress,
  parseAddressList,
  pooled,
  replaceCidRefs
} from '../mime'
import type { OutgoingFile } from '../staging'
import { apiFetch, apiJson } from './session'
import type { AttachmentData, MailProvider, MessageRef } from './types'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const UPLOAD = 'https://gmail.googleapis.com/upload/gmail/v1/users/me'
const PAGE_SIZE = 60
/** Above this the message goes up the media endpoint instead of inside a JSON body. */
const SIMPLE_SEND_LIMIT = 4 * 1024 * 1024
/** Gmail refuses anything larger, whichever endpoint it arrives on. */
const MAX_RAW = 35 * 1024 * 1024
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

/** An image the body refers to by content-id rather than by URL. */
interface InlinePart {
  attachment: Attachment
  /** base64url bytes, when the part carried them instead of an attachment id */
  data?: string
}

interface Collected {
  text: string[]
  html: string[]
  /** Body parts Gmail moved out of line; fetched by id when the thread opens. */
  htmlRefs: string[]
  textRefs: string[]
  attachments: Attachment[]
  inline: Map<string, InlinePart>
}

export function emptyCollected(): Collected {
  return { text: [], html: [], htmlRefs: [], textRefs: [], attachments: [], inline: new Map() }
}

/** A name for a part that arrived with nothing but a content-type -- inline images usually do. */
function fallbackName(mime: string, cid?: string): string {
  const subtype = mime.split('/')[1]?.split(';')[0]?.replace(/[^a-z0-9.+-]/gi, '') || 'bin'
  const stem = cid?.replace(/[^a-z0-9._-]/gi, '') || 'inline'
  return `${stem.slice(0, 40)}.${subtype === 'jpeg' ? 'jpg' : subtype}`
}

function collect(part: GPart | undefined, out: Collected): void {
  if (!part) return
  const mime = (part.mimeType ?? '').toLowerCase()
  const children = part.parts ?? []
  const disposition = (header(part, 'content-disposition') ?? '').toLowerCase()
  const cid = header(part, 'content-id')?.replace(/^<|>$/g, '').trim()
  const filename = part.filename ? decodeWords(part.filename) : ''
  const attachmentId = part.body?.attachmentId

  // An attached message has parts of its own. Those belong to it, not to the
  // message we are reading, so never fold them into this body.
  if (mime === 'message/rfc822' && attachmentId) {
    out.attachments.push({
      id: attachmentId,
      filename: filename || 'message.eml',
      mimeType: 'message/rfc822',
      size: part.body?.size ?? 0,
      cid
    })
    return
  }

  if (children.length > 0 || mime.startsWith('multipart/')) {
    for (const child of children) collect(child, out)
    return
  }

  const isBody =
    (mime === 'text/plain' || mime === 'text/html') &&
    !filename &&
    !disposition.includes('attachment')
  if (isBody) {
    const html = mime === 'text/html'
    if (part.body?.data) (html ? out.html : out.text).push(decodePart(part))
    // A body over roughly a megabyte comes back as a reference, not as data.
    else if (attachmentId) (html ? out.htmlRefs : out.textRefs).push(attachmentId)
    return
  }

  // Everything else that carries bytes is a file. A filename is not required:
  // inline images routinely arrive with only a Content-ID to identify them.
  if (!attachmentId && !part.body?.data) return
  const attachment: Attachment = {
    id: attachmentId ?? '',
    filename: filename || fallbackName(mime, cid),
    mimeType: part.mimeType || 'application/octet-stream',
    size: part.body?.size ?? 0,
    cid
  }
  if (cid || disposition.includes('inline')) {
    out.inline.set(normalizeCid(cid || attachment.filename), { attachment, data: part.body?.data })
  } else {
    out.attachments.push(attachment)
  }
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

  private toFull(message: GMessage): { message: MessageFull; parts: Collected } {
    const summary = this.toSummary(message)
    const parts = emptyCollected()
    collect(message.payload, parts)
    const payload = message.payload

    return {
      message: {
        ...summary,
        cc: parseAddressList(header(payload, 'cc')),
        bcc: parseAddressList(header(payload, 'bcc')),
        replyTo: header(payload, 'reply-to')
          ? parseAddress(header(payload, 'reply-to'))
          : undefined,
        html: parts.html.join('\n') || undefined,
        text: parts.text.join('\n') || undefined,
        attachments: parts.attachments,
        hasAttachments: parts.attachments.length > 0,
        messageIdHeader: header(payload, 'message-id'),
        references: header(payload, 'references')
      },
      parts
    }
  }

  /**
   * Gmail hands back a reference instead of the bytes once a body part passes
   * roughly a megabyte -- which is exactly the long, image-heavy newsletter a
   * reader most wants to see. Fetch those so the message is not left blank.
   */
  private async fillOutOfLineBodies(message: MessageFull, parts: Collected): Promise<void> {
    if (parts.htmlRefs.length === 0 && parts.textRefs.length === 0) return
    const fetchAll = async (ids: string[]): Promise<string[]> =>
      (
        await pooled(ids, 2, async (id) => {
          try {
            const part = await this.attachment(message.id, id)
            return Buffer.from(part.data, 'base64').toString('utf8')
          } catch {
            return ''
          }
        })
      ).filter(Boolean)

    const [html, text] = await Promise.all([
      fetchAll(parts.htmlRefs),
      fetchAll(parts.textRefs)
    ])
    if (html.length) message.html = [message.html, ...html].filter(Boolean).join('\n')
    if (text.length) message.text = [message.text, ...text].filter(Boolean).join('\n')
  }

  /**
   * Swap `cid:` references for data URIs so inline images render inside the
   * sandboxed frame, which can reach neither Gmail nor the disk. Whatever we
   * cannot embed -- too large, or the fetch failed -- is listed as an ordinary
   * attachment rather than left as a broken image.
   */
  private async inlineImages(
    message: MessageFull,
    parts: Collected,
    budget: { left: number }
  ): Promise<void> {
    const embedded = new Set<string>()

    if (message.html) {
      const resolved = new Map<string, string>()
      for (const ref of cidRefs(message.html)) {
        const part = parts.inline.get(ref)
        if (!part) continue
        if (part.data) {
          const bytes = fromBase64url(part.data)
          resolved.set(ref, `data:${part.attachment.mimeType};base64,${bytes.toString('base64')}`)
          embedded.add(ref)
          continue
        }
        const size = part.attachment.size || 0
        if (!part.attachment.id || size > INLINE_MAX_PART || size > budget.left) continue
        try {
          const data = await this.attachment(message.id, part.attachment.id)
          budget.left -= size
          resolved.set(ref, `data:${part.attachment.mimeType};base64,${data.data}`)
          embedded.add(ref)
        } catch {
          /* listed below as an attachment instead */
        }
      }
      message.html = replaceCidRefs(message.html, (cid) => resolved.get(cid))
    }

    for (const [key, part] of parts.inline) {
      if (embedded.has(key) || !part.attachment.id) continue
      message.attachments.push(part.attachment)
    }
    message.hasAttachments = message.attachments.length > 0
  }

  async thread(threadId: string): Promise<ThreadView> {
    const thread = await apiJson<{ id: string; messages?: GMessage[] }>(
      this.accountId,
      `${BASE}/threads/${threadId}?format=full`
    )
    const parsed = (thread.messages ?? []).map((m) => this.toFull(m))
    const budget = { left: INLINE_BUDGET }

    await pooled(parsed, 4, async ({ message, parts }) => {
      await this.fillOutOfLineBodies(message, parts)
      await this.inlineImages(message, parts, budget)
    })

    const messages = parsed.map((p) => p.message)
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

  async send(draft: DraftPayload, files: OutgoingFile[] = []): Promise<void> {
    const { raw } = buildMime(draft, this.address, files)
    const bytes = Buffer.from(raw, 'utf8')
    if (bytes.length > MAX_RAW) {
      throw new Error('That message is larger than the 35 MB Gmail accepts.')
    }
    const metadata = draft.threadId ? { threadId: draft.threadId } : {}

    if (bytes.length <= SIMPLE_SEND_LIMIT) {
      await apiFetch(this.accountId, `${BASE}/messages/send`, {
        method: 'POST',
        body: JSON.stringify({ raw: base64url(raw), ...metadata })
      })
      return
    }

    // Past a few megabytes the message no longer belongs inside a JSON request:
    // base64url it a second time and Gmail rejects the size. The media endpoint
    // takes the RFC 822 bytes as they are, with the metadata alongside them.
    const mark = `mk_send_${randomBytes(12).toString('hex')}`
    const body = Buffer.concat([
      Buffer.from(
        `--${mark}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
          `${JSON.stringify(metadata)}\r\n--${mark}\r\nContent-Type: message/rfc822\r\n\r\n`,
        'utf8'
      ),
      bytes,
      Buffer.from(`\r\n--${mark}--\r\n`, 'utf8')
    ])
    await apiFetch(this.accountId, `${UPLOAD}/messages/send?uploadType=multipart`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${mark}` },
      body
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
