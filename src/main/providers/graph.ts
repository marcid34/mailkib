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
import { cidRefs, htmlToText, normalizeCid, pooled, replaceCidRefs, textToHtml } from '../mime'
import type { OutgoingFile } from '../staging'
import { apiFetch, apiJson } from './session'
import type { AttachmentData, MailProvider, MessageRef } from './types'

const BASE = 'https://graph.microsoft.com/v1.0/me'
const PAGE_SIZE = 50
const INLINE_BUDGET = 8 * 1024 * 1024
const INLINE_MAX_PART = 3 * 1024 * 1024
/** Graph caps a whole request at 4 MB; anything larger needs an upload session. */
const DIRECT_ATTACHMENT_LIMIT = 3 * 1024 * 1024
/** Upload chunks must be a multiple of 320 KiB. */
const UPLOAD_CHUNK = 320 * 1024 * 10

const LIST_SELECT =
  'id,conversationId,receivedDateTime,sentDateTime,subject,bodyPreview,isRead,isDraft,hasAttachments,flag,from,sender,toRecipients,ccRecipients'

const FOLDERS: Partial<Record<FolderId, string>> = {
  inbox: 'inbox',
  sent: 'sentitems',
  drafts: 'drafts',
  archive: 'archive',
  spam: 'junkemail',
  trash: 'deleteditems'
}

interface GraphFolder {
  id: string
  displayName?: string
  unreadItemCount?: number
  childFolderCount?: number
}

interface GraphAddress {
  emailAddress?: { name?: string; address?: string }
}

interface GraphMessage {
  id: string
  conversationId?: string
  receivedDateTime?: string
  sentDateTime?: string
  subject?: string
  bodyPreview?: string
  isRead?: boolean
  hasAttachments?: boolean
  flag?: { flagStatus?: string }
  from?: GraphAddress
  sender?: GraphAddress
  replyTo?: GraphAddress[]
  toRecipients?: GraphAddress[]
  ccRecipients?: GraphAddress[]
  bccRecipients?: GraphAddress[]
  body?: { contentType?: string; content?: string }
  internetMessageId?: string
}

interface GraphAttachment {
  '@odata.type'?: string
  id: string
  name?: string
  contentType?: string
  size?: number
  isInline?: boolean
  contentId?: string
  contentBytes?: string
}

function toRecipient(a?: GraphAddress): Recipient {
  return { name: a?.emailAddress?.name || undefined, email: a?.emailAddress?.address ?? '' }
}

function toRecipients(list?: GraphAddress[]): Recipient[] {
  return (list ?? []).map(toRecipient).filter((r) => r.email)
}

function fromRecipient(r: Recipient): GraphAddress {
  return { emailAddress: { address: r.email, ...(r.name ? { name: r.name } : {}) } }
}

export class GraphProvider implements MailProvider {
  constructor(private readonly accountId: string) {}

  async profile(): Promise<{ email: string; displayName?: string }> {
    const me = await apiJson<{ mail?: string; userPrincipalName?: string; displayName?: string }>(
      this.accountId,
      `${BASE}?$select=mail,userPrincipalName,displayName`
    )
    return { email: me.mail ?? me.userPrincipalName ?? '', displayName: me.displayName }
  }

  async unreadCounts(): Promise<Partial<Record<string, number>>> {
    const [inbox, drafts] = await Promise.all([
      apiJson<{ unreadItemCount?: number }>(
        this.accountId,
        `${BASE}/mailFolders/inbox?$select=unreadItemCount`
      ).catch(() => ({})),
      apiJson<{ totalItemCount?: number }>(
        this.accountId,
        `${BASE}/mailFolders/drafts?$select=totalItemCount`
      ).catch(() => ({}))
    ])
    return {
      inbox: (inbox as { unreadItemCount?: number }).unreadItemCount ?? 0,
      drafts: (drafts as { totalItemCount?: number }).totalItemCount ?? 0
    }
  }

  async folders(): Promise<MailFolder[]> {
    // Resolve the well-known folders by id rather than by name: the display
    // names are localised, the ids are not.
    const wellKnown = await Promise.all(
      ['inbox', 'drafts', 'sentitems', 'deleteditems', 'junkemail', 'archive', 'outbox'].map((key) =>
        apiJson<{ id?: string }>(this.accountId, `${BASE}/mailFolders/${key}?$select=id`)
          .then((f) => f.id)
          .catch(() => undefined)
      )
    )
    const skip = new Set(wellKnown.filter(Boolean) as string[])

    const select = '$top=100&$select=id,displayName,unreadItemCount,childFolderCount'
    const out: MailFolder[] = []

    const walk = async (url: string, depth: number, prefix: string): Promise<void> => {
      if (depth > 3) return
      const page = await apiJson<{ value?: GraphFolder[] }>(this.accountId, url).catch(() => ({
        value: [] as GraphFolder[]
      }))
      for (const folder of page.value ?? []) {
        const hidden = skip.has(folder.id)
        const path = prefix ? `${prefix}/${folder.displayName ?? ''}` : (folder.displayName ?? '')
        if (!hidden) {
          out.push({
            id: toFolderId(folder.id),
            name: folder.displayName ?? '(unnamed)',
            path,
            depth,
            unread: folder.unreadItemCount || undefined
          })
        }
        // Subfolders of a well-known folder are still the user's own, so keep
        // descending -- just without contributing a level of indentation.
        if (folder.childFolderCount) {
          await walk(
            `${BASE}/mailFolders/${folder.id}/childFolders?${select}`,
            hidden ? depth : depth + 1,
            hidden ? prefix : path
          )
        }
      }
    }

    await walk(`${BASE}/mailFolders?${select}`, 0, '')
    return out
  }

  private listUrl(query: ListQuery): string {
    const search = query.search?.trim()
    const top = `$top=${query.limit ?? PAGE_SIZE}`
    const select = `$select=${LIST_SELECT}`

    if (isLabelFolder(query.folder)) {
      const id = providerIdOf(query.folder)
      return search
        ? `${BASE}/mailFolders/${id}/messages?${select}&${top}&$search="${encodeURIComponent(search)}"`
        : `${BASE}/mailFolders/${id}/messages?${select}&${top}&$orderby=receivedDateTime desc`
    }

    if (query.folder === 'starred') {
      const filter = "$filter=flag/flagStatus eq 'flagged'"
      return search
        ? `${BASE}/messages?${select}&${top}&$search="${encodeURIComponent(search)}"`
        : `${BASE}/messages?${select}&${top}&${filter}&$orderby=receivedDateTime desc`
    }

    if (query.folder === 'all') {
      return search
        ? `${BASE}/messages?${select}&${top}&$search="${encodeURIComponent(search)}"`
        : `${BASE}/messages?${select}&${top}&$orderby=receivedDateTime desc`
    }

    const folder = FOLDERS[query.folder] ?? 'inbox'
    // $search cannot be combined with $orderby in Graph.
    return search
      ? `${BASE}/mailFolders/${folder}/messages?${select}&${top}&$search="${encodeURIComponent(search)}"`
      : `${BASE}/mailFolders/${folder}/messages?${select}&${top}&$orderby=receivedDateTime desc`
  }

  async list(query: ListQuery): Promise<ListResult> {
    const url = query.pageToken ?? this.listUrl(query)
    const page = await apiJson<{ value?: GraphMessage[]; '@odata.nextLink'?: string }>(
      this.accountId,
      url
    )
    let messages = (page.value ?? []).map((m) => this.toSummary(m))

    // Graph refuses $search alongside $filter, so searching Starred asks the
    // whole mailbox and keeps the flagged answers here instead of quietly
    // widening the scope the user chose.
    if (query.folder === 'starred' && query.search?.trim()) {
      messages = messages.filter((m) => m.starred)
    }

    // Collapse to one row per conversation, newest first.
    const byThread = new Map<string, MessageSummary>()
    for (const summary of messages) {
      const existing = byThread.get(summary.threadId)
      if (!existing) byThread.set(summary.threadId, { ...summary, threadCount: 1 })
      else {
        existing.threadCount = (existing.threadCount ?? 1) + 1
        existing.unread = existing.unread || summary.unread
        existing.starred = existing.starred || summary.starred
        if (summary.date > existing.date) {
          byThread.set(summary.threadId, { ...summary, threadCount: existing.threadCount })
        }
      }
    }

    return {
      messages: [...byThread.values()].sort((a, b) => b.date - a.date),
      nextPageToken: page['@odata.nextLink']
    }
  }

  private toSummary(m: GraphMessage): MessageSummary {
    const when = m.receivedDateTime ?? m.sentDateTime
    return {
      id: m.id,
      threadId: m.conversationId ?? m.id,
      accountId: this.accountId,
      from: toRecipient(m.from ?? m.sender),
      to: toRecipients(m.toRecipients),
      subject: m.subject || '(no subject)',
      snippet: m.bodyPreview ?? '',
      date: when ? Date.parse(when) : Date.now(),
      unread: m.isRead === false,
      starred: m.flag?.flagStatus === 'flagged',
      hasAttachments: Boolean(m.hasAttachments)
    }
  }

  async thread(threadId: string): Promise<ThreadView> {
    const url =
      `${BASE}/messages?$select=${LIST_SELECT},body,internetMessageId,replyTo,bccRecipients` +
      `&$filter=conversationId eq '${threadId.replace(/'/g, "''")}'&$top=50`
    const page = await apiJson<{ value?: GraphMessage[] }>(this.accountId, url)
    const raw = page.value ?? []

    let budget = INLINE_BUDGET
    const messages = await pooled(raw, 4, async (m): Promise<MessageFull> => {
      const summary = this.toSummary(m)
      const isHtml = (m.body?.contentType ?? 'text').toLowerCase() === 'html'
      let html = isHtml ? (m.body?.content ?? '') : textToHtml(m.body?.content ?? '')
      const attachments: Attachment[] = []

      if (m.hasAttachments) {
        const list = await apiJson<{ value?: GraphAttachment[] }>(
          this.accountId,
          `${BASE}/messages/${m.id}/attachments` +
            '?$select=id,name,contentType,size,isInline,contentId'
        ).catch(() => ({ value: [] as GraphAttachment[] }))

        // Match on the ids the body actually references rather than on a literal
        // `cid:` substring: Outlook brackets and percent-encodes them freely, and
        // a plain substring also lets one id swallow the start of another.
        const wanted = new Set(cidRefs(html))
        const resolved = new Map<string, string>()

        for (const a of list.value ?? []) {
          const attachment: Attachment = {
            id: a.id,
            filename: a.name ?? 'attachment',
            mimeType: a.contentType ?? 'application/octet-stream',
            size: a.size ?? 0,
            cid: a.contentId ?? undefined
          }
          const key = a.contentId ? normalizeCid(a.contentId) : ''
          const isFile = !a['@odata.type'] || a['@odata.type'].endsWith('fileAttachment')
          if (key && wanted.has(key) && isFile) {
            if (attachment.size <= INLINE_MAX_PART && attachment.size <= budget) {
              try {
                const data = await this.attachment(m.id, a.id)
                budget -= attachment.size
                resolved.set(key, `data:${attachment.mimeType};base64,${data.data}`)
                continue
              } catch {
                /* fall through and list it as a normal attachment */
              }
            }
          }
          // Everything we did not embed stays reachable, inline flag or not --
          // an image the reader cannot see should at least be downloadable.
          attachments.push(attachment)
        }

        html = replaceCidRefs(html, (cid) => resolved.get(cid))
      }

      return {
        ...summary,
        cc: toRecipients(m.ccRecipients),
        bcc: toRecipients(m.bccRecipients),
        replyTo: m.replyTo?.length ? toRecipient(m.replyTo[0]) : undefined,
        html: html || undefined,
        text: isHtml ? htmlToText(html) : (m.body?.content ?? undefined),
        attachments,
        hasAttachments: attachments.length > 0,
        messageIdHeader: m.internetMessageId
      }
    })

    return {
      id: threadId,
      subject: messages[0]?.subject ?? '(no subject)',
      messages: messages.sort((a, b) => a.date - b.date)
    }
  }

  private async patchEach(refs: MessageRef[], body: unknown): Promise<void> {
    await pooled(refs, 6, async (ref) => {
      await apiFetch(this.accountId, `${BASE}/messages/${ref.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      })
    })
  }

  private async moveEach(refs: MessageRef[], destinationId: string): Promise<void> {
    await pooled(refs, 6, async (ref) => {
      await apiFetch(this.accountId, `${BASE}/messages/${ref.id}/move`, {
        method: 'POST',
        body: JSON.stringify({ destinationId })
      })
    })
  }

  setRead(refs: MessageRef[], read: boolean): Promise<void> {
    return this.patchEach(refs, { isRead: read })
  }

  setStar(refs: MessageRef[], starred: boolean): Promise<void> {
    return this.patchEach(refs, { flag: { flagStatus: starred ? 'flagged' : 'notFlagged' } })
  }

  archive(refs: MessageRef[]): Promise<void> {
    return this.moveEach(refs, 'archive')
  }

  moveToInbox(refs: MessageRef[]): Promise<void> {
    return this.moveEach(refs, 'inbox')
  }

  trash(refs: MessageRef[]): Promise<void> {
    return this.moveEach(refs, 'deleteditems')
  }

  /* ------------------------------- folders -------------------------------- */

  moveTo(refs: MessageRef[], folderId: string): Promise<void> {
    return this.moveEach(refs, folderId)
  }

  /** Outlook has no labels, so "apply" is the same as moving. */
  applyLabel(refs: MessageRef[], folderId: string): Promise<void> {
    return this.moveEach(refs, folderId)
  }

  async removeLabel(): Promise<void> {
    throw new Error('Outlook folders are exclusive — move the message instead.')
  }

  async createFolder(name: string, parentPath?: string): Promise<MailFolder> {
    const parentId = parentPath ? await this.folderIdForPath(parentPath) : undefined
    const url = parentId
      ? `${BASE}/mailFolders/${parentId}/childFolders`
      : `${BASE}/mailFolders`
    const created = await apiJson<GraphFolder>(this.accountId, url, {
      method: 'POST',
      body: JSON.stringify({ displayName: name })
    })
    return {
      id: toFolderId(created.id),
      name: created.displayName ?? name,
      path: parentPath ? `${parentPath}/${name}` : name,
      depth: parentPath ? parentPath.split('/').length : 0
    }
  }

  async renameFolder(folderId: string, name: string): Promise<void> {
    await apiFetch(this.accountId, `${BASE}/mailFolders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ displayName: name })
    })
  }

  async deleteFolder(folderId: string): Promise<void> {
    await apiFetch(this.accountId, `${BASE}/mailFolders/${folderId}`, { method: 'DELETE' })
  }

  private async folderIdForPath(path: string): Promise<string | undefined> {
    const all = await this.folders()
    const match = all.find((f) => f.path === path)
    return match ? providerIdOf(match.id as `label:${string}`) : undefined
  }

  /** Hang one file off a draft, taking the chunked path when it is too big to post. */
  private async addAttachment(messageId: string, file: OutgoingFile): Promise<void> {
    if (file.content.length <= DIRECT_ATTACHMENT_LIMIT) {
      await apiFetch(this.accountId, `${BASE}/messages/${messageId}/attachments`, {
        method: 'POST',
        body: JSON.stringify({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: file.filename,
          contentType: file.mimeType || 'application/octet-stream',
          isInline: Boolean(file.cid),
          ...(file.cid ? { contentId: file.cid } : {}),
          contentBytes: file.content.toString('base64')
        })
      })
      return
    }

    const session = await apiJson<{ uploadUrl: string }>(
      this.accountId,
      `${BASE}/messages/${messageId}/attachments/createUploadSession`,
      {
        method: 'POST',
        body: JSON.stringify({
          AttachmentItem: {
            attachmentType: 'file',
            name: file.filename,
            size: file.content.length,
            contentType: file.mimeType || 'application/octet-stream',
            isInline: Boolean(file.cid),
            ...(file.cid ? { contentId: file.cid } : {})
          }
        })
      }
    )

    // The upload URL carries its own credentials in the query string, so it must
    // be called without our Authorization header.
    const total = file.content.length
    for (let start = 0; start < total; start += UPLOAD_CHUNK) {
      const end = Math.min(start + UPLOAD_CHUNK, total) - 1
      // Content-Length is set from the body; naming it here as well is a
      // forbidden header in fetch and would be dropped or fought over.
      const res = await fetch(session.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${start}-${end}/${total}` },
        body: file.content.subarray(start, end + 1)
      })
      if (!res.ok) {
        throw new Error(`Uploading "${file.filename}" failed (${res.status}).`)
      }
    }
  }

  /**
   * Attach every file to a saved draft and send it. A draft left half-built in
   * the mailbox reads like a message that went out, so tear it down on failure.
   */
  private async attachAndSend(messageId: string, files: OutgoingFile[]): Promise<void> {
    try {
      for (const file of files) await this.addAttachment(messageId, file)
    } catch (error) {
      await apiFetch(this.accountId, `${BASE}/messages/${messageId}`, {
        method: 'DELETE'
      }).catch(() => undefined)
      throw error
    }
    await apiFetch(this.accountId, `${BASE}/messages/${messageId}/send`, { method: 'POST' })
  }

  async send(draft: DraftPayload, files: OutgoingFile[] = []): Promise<void> {
    const message = {
      subject: draft.subject,
      body: { contentType: 'HTML', content: draft.body },
      toRecipients: draft.to.map(fromRecipient),
      ccRecipients: (draft.cc ?? []).map(fromRecipient),
      bccRecipients: (draft.bcc ?? []).map(fromRecipient)
    }

    // Replying through the source message is what keeps Outlook's conversation intact.
    if (draft.replySourceId) {
      const created = await apiJson<{ id: string }>(
        this.accountId,
        `${BASE}/messages/${draft.replySourceId}/createReply`,
        { method: 'POST', body: JSON.stringify({}) }
      )
      await apiFetch(this.accountId, `${BASE}/messages/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify(message)
      })
      await this.attachAndSend(created.id, files)
      return
    }

    if (files.length === 0) {
      await apiFetch(this.accountId, `${BASE}/sendMail`, {
        method: 'POST',
        body: JSON.stringify({ message, saveToSentItems: true })
      })
      return
    }

    // sendMail is one request, and Graph caps a request at 4 MB. Files have to
    // hang off a saved draft so each one can be uploaded on its own.
    const created = await apiJson<{ id: string }>(this.accountId, `${BASE}/messages`, {
      method: 'POST',
      body: JSON.stringify(message)
    })
    await this.attachAndSend(created.id, files)
  }

  async attachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
    const a = await apiJson<GraphAttachment>(
      this.accountId,
      `${BASE}/messages/${messageId}/attachments/${attachmentId}`
    )
    // Only fileAttachment carries bytes. A linked file or an embedded item has
    // no contentBytes, and silently writing an empty file is worse than saying so.
    if (!a.contentBytes) {
      throw new Error(`"${a.name ?? 'That attachment'}" is a link or an embedded item, not a file.`)
    }
    return {
      filename: a.name ?? 'attachment',
      mimeType: a.contentType ?? 'application/octet-stream',
      data: a.contentBytes
    }
  }
}
