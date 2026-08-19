import type { Note, NoteFormat, NotePatch, NoteSummary } from '../shared/notes'
import { requireUser } from './accounts'
import { newId } from './crypto'
import { readEncrypted, writeEncrypted, removeFile } from './store'

/**
 * Notes live in two kinds of file rather than one. The index carries everything
 * the list, the search and the picker need; each body sits on its own. Typing
 * into a note then rewrites one small file instead of every note you own, which
 * is the difference between a notes app and a notes app that stutters.
 *
 * Both are encrypted with the device key and keyed by user id, the same shape
 * the mail vault and cache already use.
 */
interface IndexFile {
  version: 1
  notes: NoteSummary[]
}

const EMPTY: IndexFile = { version: 1, notes: [] }

/** Writes are coalesced: an editor fires a change on every keystroke. */
const FLUSH_MS = 900

const indexes = new Map<string, IndexFile>()
const bodies = new Map<string, string>()
const pendingIndex = new Map<string, NodeJS.Timeout>()
const pendingBody = new Map<string, NodeJS.Timeout>()

function indexName(userId: string): string {
  return `notes-${userId}.enc`
}

function bodyName(userId: string, noteId: string): string {
  return `note-${userId}-${noteId}.enc`
}

function loadIndex(userId: string): IndexFile {
  const cached = indexes.get(userId)
  if (cached) return cached
  const file = readEncrypted<IndexFile>(indexName(userId), EMPTY)
  const normalised: IndexFile = { ...EMPTY, ...file, notes: file.notes ?? [] }
  indexes.set(userId, normalised)
  return normalised
}

function saveIndexLater(userId: string): void {
  clearTimeout(pendingIndex.get(userId))
  pendingIndex.set(
    userId,
    setTimeout(() => {
      pendingIndex.delete(userId)
      const file = indexes.get(userId)
      if (file) writeEncrypted(indexName(userId), file)
    }, FLUSH_MS)
  )
}

function saveBodyLater(userId: string, noteId: string): void {
  const key = `${userId}:${noteId}`
  clearTimeout(pendingBody.get(key))
  pendingBody.set(
    key,
    setTimeout(() => {
      pendingBody.delete(key)
      const body = bodies.get(key)
      if (body !== undefined) writeEncrypted(bodyName(userId, noteId), { body })
    }, FLUSH_MS)
  )
}

/** Write everything still queued. Called before the app goes away. */
export function flushNotes(): void {
  for (const [userId, timer] of pendingIndex) {
    clearTimeout(timer)
    const file = indexes.get(userId)
    if (file) writeEncrypted(indexName(userId), file)
  }
  pendingIndex.clear()
  for (const [key, timer] of pendingBody) {
    clearTimeout(timer)
    const [userId, noteId] = key.split(':')
    const body = bodies.get(key)
    if (body !== undefined) writeEncrypted(bodyName(userId, noteId), { body })
  }
  pendingBody.clear()
}

function readBody(userId: string, noteId: string): string {
  const key = `${userId}:${noteId}`
  const cached = bodies.get(key)
  if (cached !== undefined) return cached
  const body = readEncrypted<{ body: string }>(bodyName(userId, noteId), { body: '' }).body
  bodies.set(key, body)
  return body
}

function writeBody(userId: string, noteId: string, body: string): void {
  bodies.set(`${userId}:${noteId}`, body)
  saveBodyLater(userId, noteId)
}

/** Strip enough markup that the list shows words rather than angle brackets. */
function toExcerpt(body: string, format: NoteFormat): string {
  let text = body
  if (format !== 'plain') {
    text = text
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  }
  if (format === 'markdown') {
    text = text.replace(/^#{1,6}\s+/gm, '').replace(/[*_`>]/g, '')
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, 160)
}

/**
 * An untitled note names itself after its first line, the way people expect.
 * Off the raw body, not the excerpt -- the excerpt has already collapsed the
 * newlines, which would make the title the whole note run together.
 */
function deriveTitle(body: string, format: NoteFormat): string {
  const firstLine = body.split('\n').map((line) => line.trim()).find(Boolean)
  if (!firstLine) return ''
  return toExcerpt(firstLine, format).slice(0, 72).trim()
}

/** Pinned first, then most recently touched. */
function order(notes: NoteSummary[]): NoteSummary[] {
  return [...notes].sort(
    (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt
  )
}

export function listNotes(): NoteSummary[] {
  return order(loadIndex(requireUser().id).notes)
}

export function getNote(id: string): Note | null {
  const userId = requireUser().id
  const summary = loadIndex(userId).notes.find((n) => n.id === id)
  if (!summary) return null
  return { ...summary, body: readBody(userId, id) }
}

export function createNote(patch: NotePatch = {}): Note {
  const userId = requireUser().id
  const file = loadIndex(userId)
  const now = Date.now()
  const format = patch.format ?? 'markdown'
  const body = patch.body ?? ''

  const summary: NoteSummary = {
    id: newId('note'),
    title: patch.title?.trim() || deriveTitle(body, format),
    format,
    excerpt: toExcerpt(body, format),
    createdAt: now,
    updatedAt: now,
    pinned: patch.pinned || undefined
  }
  file.notes.push(summary)
  indexes.set(userId, file)
  writeBody(userId, summary.id, body)
  saveIndexLater(userId)
  return { ...summary, body }
}

export function updateNote(id: string, patch: NotePatch): Note {
  const userId = requireUser().id
  const file = loadIndex(userId)
  const summary = file.notes.find((n) => n.id === id)
  if (!summary) throw new Error('That note no longer exists.')

  const format = patch.format ?? summary.format
  const body = patch.body ?? readBody(userId, id)

  summary.format = format
  summary.excerpt = toExcerpt(body, format)
  // A name the user typed wins. An empty one is not an instruction to stay
  // nameless -- the editor sends the title field on every save, so treating
  // blank as "derive it" is what lets a new note name itself after its first
  // line while you write, and lets clearing the field hand that job back.
  const wanted = patch.title !== undefined ? patch.title.trim() : summary.title
  summary.title = wanted || deriveTitle(body, format)
  if (patch.pinned !== undefined) summary.pinned = patch.pinned || undefined
  summary.updatedAt = Date.now()

  if (patch.body !== undefined) writeBody(userId, id, body)
  saveIndexLater(userId)
  return { ...summary, body }
}

export function deleteNote(id: string): void {
  const userId = requireUser().id
  const file = loadIndex(userId)
  file.notes = file.notes.filter((n) => n.id !== id)
  indexes.set(userId, file)

  const key = `${userId}:${id}`
  clearTimeout(pendingBody.get(key))
  pendingBody.delete(key)
  bodies.delete(key)
  removeFile(bodyName(userId, id))
  saveIndexLater(userId)
}

/**
 * Match on the index alone -- title and excerpt -- so searching never has to
 * decrypt every body. Word prefixes match, like the mail cache does.
 */
export function searchNotes(query: string): NoteSummary[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return listNotes()
  return order(
    loadIndex(requireUser().id).notes.filter((note) => {
      const haystack = `${note.title} ${note.excerpt}`.toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
  )
}

/** Used by the `kibnote:` handler, which has no renderer to ask. */
export function noteForProtocol(userId: string, id: string): Note | null {
  const summary = loadIndex(userId).notes.find((n) => n.id === id)
  if (!summary) return null
  return { ...summary, body: readBody(userId, id) }
}

export function forgetUserNotes(userId: string): void {
  const file = loadIndex(userId)
  for (const note of file.notes) removeFile(bodyName(userId, note.id))
  removeFile(indexName(userId))
  indexes.delete(userId)
}
