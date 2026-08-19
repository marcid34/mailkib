import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import type { DraftAttachment } from '../shared/types'

/**
 * Files waiting to be sent. The renderer holds only opaque tokens, so a draft
 * can carry large attachments without shuttling their bytes across IPC, and a
 * compose window that is closed without sending leaves nothing behind.
 */
interface Staged {
  path: string
  filename: string
  mimeType: string
  size: number
  /** true when we wrote the file ourselves and may delete it on release */
  temp: boolean
}

const staged = new Map<string, Staged>()

/** Providers cap a single message well below this; the guard is against typos. */
export const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024

const TYPES: Record<string, string> = {
  '7z': 'application/x-7z-compressed',
  aac: 'audio/aac',
  avif: 'image/avif',
  bmp: 'image/bmp',
  css: 'text/css',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  eml: 'message/rfc822',
  epub: 'application/epub+zip',
  flac: 'audio/flac',
  gif: 'image/gif',
  gz: 'application/gzip',
  heic: 'image/heic',
  htm: 'text/html',
  html: 'text/html',
  ics: 'text/calendar',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  md: 'text/markdown',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  odp: 'application/vnd.oasis.opendocument.presentation',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odt: 'application/vnd.oasis.opendocument.text',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  pdf: 'application/pdf',
  png: 'image/png',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  rtf: 'application/rtf',
  svg: 'image/svg+xml',
  tar: 'application/x-tar',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  txt: 'text/plain',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xml: 'application/xml',
  zip: 'application/zip'
}

export function guessMimeType(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase()
  return TYPES[ext] ?? 'application/octet-stream'
}

function describe(entry: Staged, token: string): DraftAttachment {
  return {
    token,
    filename: entry.filename,
    mimeType: entry.mimeType,
    size: entry.size
  }
}

function remember(entry: Staged): DraftAttachment {
  const token = `att_${randomBytes(12).toString('hex')}`
  staged.set(token, entry)
  return describe(entry, token)
}

/** Stage a file the user chose from disk. Read lazily, at send time. */
export function stagePath(target: string): DraftAttachment {
  const stat = fs.statSync(target)
  if (!stat.isFile()) throw new Error(`${path.basename(target)} is not a file.`)
  if (stat.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${path.basename(target)} is too large to attach.`)
  }
  const filename = path.basename(target)
  return remember({
    path: target,
    filename,
    mimeType: guessMimeType(filename),
    size: stat.size,
    temp: false
  })
}

/** Stage bytes we already hold -- an attachment being carried into a forward. */
export function stageBuffer(data: Buffer, filename: string, mimeType?: string): DraftAttachment {
  if (data.length > MAX_ATTACHMENT_BYTES) throw new Error(`${filename} is too large to attach.`)
  const dir = path.join(os.tmpdir(), 'mailkib-outgoing')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${randomBytes(8).toString('hex')}-${path.basename(filename)}`)
  fs.writeFileSync(file, data, { mode: 0o600 })
  return remember({
    path: file,
    filename: path.basename(filename) || 'attachment',
    mimeType: mimeType || guessMimeType(filename),
    size: data.length,
    temp: true
  })
}

export interface OutgoingFile {
  filename: string
  mimeType: string
  content: Buffer
  /** content-id, for a file the body references inline */
  cid?: string
}

/** Resolve a draft's descriptors to real bytes, in the order the user added them. */
export function resolveAttachments(list: DraftAttachment[] | undefined): OutgoingFile[] {
  return (list ?? []).map((wanted) => {
    const entry = staged.get(wanted.token)
    if (!entry) throw new Error(`"${wanted.filename}" is no longer available — attach it again.`)
    return {
      filename: entry.filename,
      mimeType: entry.mimeType,
      content: fs.readFileSync(entry.path),
      cid: wanted.cid
    }
  })
}

/** Forget staged files, deleting the copies we made ourselves. */
export function releaseAttachments(tokens: string[]): void {
  for (const token of tokens) {
    const entry = staged.get(token)
    if (!entry) continue
    staged.delete(token)
    if (entry.temp) {
      try {
        fs.unlinkSync(entry.path)
      } catch {
        /* already gone, or a temp dir cleaned under us */
      }
    }
  }
}

export function releaseAll(): void {
  releaseAttachments([...staged.keys()])
}
