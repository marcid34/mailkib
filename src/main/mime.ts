import { randomBytes } from 'node:crypto'
import type { DraftPayload, Recipient } from '../shared/types'
import type { OutgoingFile } from './staging'

const CRLF = '\r\n'

/* ------------------------------ decoding ------------------------------ */

function decodeQuotedPrintableWord(s: string): Buffer {
  const bytes: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '_') bytes.push(0x20)
    else if (c === '=' && i + 2 < s.length) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16))
      i += 2
    } else bytes.push(c.charCodeAt(0))
  }
  return Buffer.from(bytes)
}

/** RFC 2047 encoded-words, e.g. `=?UTF-8?B?SGVsbG8=?=`. */
export function decodeWords(input: string): string {
  if (!input || !input.includes('=?')) return input ?? ''
  return input
    .replace(/(\?=)\s+(=\?)/g, '$1$2') // adjacent words: whitespace between them is not content
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, charset: string, enc: string, text: string) => {
      try {
        const buf = enc.toUpperCase() === 'B' ? Buffer.from(text, 'base64') : decodeQuotedPrintableWord(text)
        const cs = charset.toLowerCase().split('*')[0]
        const label = cs === 'utf-8' || cs === 'utf8' ? 'utf8' : cs === 'us-ascii' ? 'ascii' : cs
        return buf.toString((['utf8', 'ascii', 'latin1', 'utf16le'].includes(label) ? label : 'latin1') as BufferEncoding)
      } catch {
        return _m
      }
    })
}

/** Split an address list on commas that are not inside quotes or angle brackets. */
function splitAddresses(header: string): string[] {
  const out: string[] = []
  let depth = 0
  let quoted = false
  let current = ''
  for (const ch of header) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch === '<') depth++
    else if (!quoted && ch === '>') depth = Math.max(0, depth - 1)
    if (ch === ',' && !quoted && depth === 0) {
      out.push(current)
      current = ''
    } else current += ch
  }
  if (current.trim()) out.push(current)
  return out.map((s) => s.trim()).filter(Boolean)
}

export function parseAddressList(header?: string): Recipient[] {
  if (!header) return []
  return splitAddresses(header)
    .map((raw) => {
      const angle = raw.match(/^(.*)<([^>]+)>\s*$/)
      if (angle) {
        const name = decodeWords(angle[1].trim().replace(/^"(.*)"$/, '$1')).trim()
        return { name: name || undefined, email: angle[2].trim() }
      }
      return { email: raw.replace(/^"(.*)"$/, '$1').trim() }
    })
    .filter((r) => r.email.length > 0)
}

export function parseAddress(header?: string): Recipient {
  return parseAddressList(header)[0] ?? { email: '' }
}

/* ------------------------------ content-ids ------------------------------ */

/**
 * Normalise a content-id for matching. Senders bracket, quote, percent-encode
 * and case them however they like, so compare on a single canonical form rather
 * than on the literal text of the reference.
 */
export function normalizeCid(raw: string): string {
  let value = raw.trim()
  if (value.includes('%')) {
    try {
      value = decodeURIComponent(value)
    } catch {
      /* not percent-encoding after all; match on what was written */
    }
  }
  return value.replace(/^[<"']+|[>"']+$/g, '').trim().toLowerCase()
}

/**
 * Rewrite every `cid:` reference in `html` through `lookup`, leaving the ones it
 * does not recognise untouched. Tokenising each reference is what keeps
 * `cid:image1` from also eating the start of `cid:image10`.
 */
export function replaceCidRefs(
  html: string,
  lookup: (cid: string) => string | undefined
): string {
  return html.replace(/\bcid:(<[^<>"'\s]*>|[^"'\s>)\]}\\]*)/gi, (match, ref: string) => {
    const id = ref.replace(/[.,;:!]+$/, '')
    const url = lookup(normalizeCid(id))
    return url === undefined ? match : url + ref.slice(id.length)
  })
}

/** Every distinct content-id the body actually references. */
export function cidRefs(html: string): string[] {
  const found = new Set<string>()
  replaceCidRefs(html, (cid) => {
    if (cid) found.add(cid)
    return undefined
  })
  return [...found]
}

/* ------------------------------ encoding ------------------------------ */

function needsEncoding(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x20-\x7e]/.test(s)
}

export function encodeHeaderValue(s: string): string {
  return needsEncoding(s) ? `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=` : s
}

export function formatAddress(r: Recipient): string {
  if (!r.name) return r.email
  const name = needsEncoding(r.name) ? encodeHeaderValue(r.name) : `"${r.name.replace(/"/g, '\\"')}"`
  return `${name} <${r.email}>`
}

export function formatAddressList(list: Recipient[]): string {
  return list.map(formatAddress).join(', ')
}

function base64Body(s: string): string {
  return (Buffer.from(s, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join(CRLF)
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )
}

export function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>')
}

export function makeMessageId(domain: string): string {
  return `<${randomBytes(12).toString('hex')}.${Date.now()}@${domain || 'mailkib.local'}>`
}

/** RFC 5987, for the `filename*` parameter that carries non-ASCII names intact. */
function encodeExtendedValue(s: string): string {
  return encodeURIComponent(s).replace(/['()!*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/**
 * Name a file for a header parameter. Every client understands the quoted ASCII
 * form, so send that as the fallback and add RFC 2231's `filename*` alongside it
 * whenever the real name needs more than ASCII.
 */
function filenameParams(key: string, name: string): string {
  const safe = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'attachment'
  const base = `${key}="${safe}"`
  return needsEncoding(name) ? `${base}; ${key}*=UTF-8''${encodeExtendedValue(name)}` : base
}

function boundary(): string {
  return `--=_mk_${randomBytes(12).toString('hex')}`
}

function filePart(file: OutgoingFile): string[] {
  const inline = Boolean(file.cid)
  const lines = [
    `Content-Type: ${file.mimeType || 'application/octet-stream'}; ${filenameParams('name', file.filename)}`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: ${inline ? 'inline' : 'attachment'}; ${filenameParams('filename', file.filename)}`
  ]
  if (inline) lines.push(`Content-ID: <${file.cid}>`)
  lines.push('', (file.content.toString('base64').match(/.{1,76}/g) ?? []).join(CRLF))
  return lines
}

/** Wrap a set of already-built body parts in one multipart container. */
function multipart(subtype: string, parts: string[][], extra = ''): string[] {
  const mark = boundary()
  const lines = [`Content-Type: multipart/${subtype}; boundary="${mark}"${extra}`, '']
  for (const part of parts) lines.push(`--${mark}`, ...part)
  lines.push(`--${mark}--`)
  return lines
}

/**
 * Build an RFC 5322 message.
 *
 * The body is always a multipart/alternative of text and html. Files the body
 * references inline wrap that in a multipart/related, and ordinary attachments
 * wrap whatever came out of that in a multipart/mixed -- the nesting every mail
 * client expects, and the reason an attached file shows up as an attachment
 * rather than as a second copy of the message.
 */
export function buildMime(
  draft: DraftPayload,
  from: Recipient,
  files: OutgoingFile[] = []
): { raw: string; messageId: string } {
  const messageId = makeMessageId(from.email.split('@')[1] ?? '')
  const text = draft.text?.trim() || htmlToText(draft.body)

  const headers: string[] = [
    `From: ${formatAddress(from)}`,
    `To: ${formatAddressList(draft.to)}`
  ]
  if (draft.cc?.length) headers.push(`Cc: ${formatAddressList(draft.cc)}`)
  if (draft.bcc?.length) headers.push(`Bcc: ${formatAddressList(draft.bcc)}`)
  headers.push(`Subject: ${encodeHeaderValue(draft.subject)}`)
  headers.push(`Date: ${new Date().toUTCString().replace('GMT', '+0000')}`)
  headers.push(`Message-ID: ${messageId}`)
  if (draft.inReplyTo) headers.push(`In-Reply-To: ${draft.inReplyTo}`)
  if (draft.references) headers.push(`References: ${draft.references}`)
  headers.push('MIME-Version: 1.0')

  let body = multipart('alternative', [
    ['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', base64Body(text)],
    ['Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', base64Body(draft.body)]
  ])

  const inline = files.filter((f) => f.cid)
  const attached = files.filter((f) => !f.cid)
  if (inline.length > 0) {
    body = multipart('related', [body, ...inline.map(filePart)], '; type="multipart/alternative"')
  }
  if (attached.length > 0) {
    body = multipart('mixed', [body, ...attached.map(filePart)])
  }

  // The outermost container's own Content-Type belongs in the message headers.
  const raw = [...headers, ...body, ''].join(CRLF)
  return { raw, messageId }
}

/** Run tasks with bounded concurrency, preserving input order. */
export async function pooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}
