import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { Note, NoteSummary } from '../../../shared/notes'
import { api, call } from '../lib/api'
import { useToast } from '../lib/toast'
import { NoteBody } from './NoteBody'
import { IconEye, IconPencil, IconPlus, IconX } from './Icons'

const AUTOSAVE_MS = 600
const LAST_KEY = 'kib.panelNote'

/**
 * A note beside whatever else you are doing. Deliberately less than the Notes
 * module: pick a note, read it, scribble in it. Anything more and it becomes a
 * second notes app that has to be kept in step with the first.
 */
export function NotesPanel({
  onClose,
  onOpenInNotes
}: {
  onClose: () => void
  onOpenInNotes: (id: string) => void
}): JSX.Element {
  const { fail } = useToast()
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [note, setNote] = useState<Note | null>(null)
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [revision, setRevision] = useState(0)
  const saveTimer = useRef<number | undefined>(undefined)

  const load = useCallback(
    async (id: string) => {
      try {
        const full = await call(api.notes.get(id))
        if (!full) return
        setNote(full)
        setDirty(false)
        setRevision((r) => r + 1)
        try {
          localStorage.setItem(LAST_KEY, id)
        } catch {
          /* nothing depends on remembering it */
        }
      } catch (error) {
        fail(error)
      }
    },
    [fail]
  )

  // Open onto the last note used here, so the panel is never a blank rectangle.
  useEffect(() => {
    void (async () => {
      try {
        const list = await call(api.notes.list())
        setNotes(list)
        let wanted: string | null = null
        try {
          wanted = localStorage.getItem(LAST_KEY)
        } catch {
          wanted = null
        }
        const pinned = list.find((n) => n.pinned)
        const target = list.find((n) => n.id === wanted) ?? pinned ?? list[0]
        if (target) void load(target.id)
      } catch (error) {
        fail(error)
      }
    })()
  }, [load, fail])

  const flush = useCallback(async () => {
    if (!note || !dirty) return
    window.clearTimeout(saveTimer.current)
    try {
      const saved = await call(api.notes.update(note.id, { body: note.body }))
      setDirty(false)
      setRevision((r) => r + 1)
      setNotes((list) => list.map((n) => (n.id === saved.id ? { ...saved } : n)))
    } catch (error) {
      fail(error)
    }
  }, [note, dirty, fail])

  useEffect(() => {
    if (!dirty) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void flush(), AUTOSAVE_MS)
    return () => window.clearTimeout(saveTimer.current)
  }, [dirty, flush])

  // Closing the panel must not eat the last thing typed into it.
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => {
    return () => {
      window.clearTimeout(saveTimer.current)
      void flushRef.current()
    }
  }, [])

  async function create(): Promise<void> {
    try {
      await flush()
      const fresh = await call(api.notes.create({ format: 'markdown' }))
      setNotes((list) => [fresh, ...list])
      setNote(fresh)
      setDirty(false)
      setEditing(true)
    } catch (error) {
      fail(error)
    }
  }

  return (
    <aside className="notespanel" aria-label="Notes">
      <div className="notespanel__head">
        <select
          className="notespanel__picker"
          value={note?.id ?? ''}
          onChange={(e) => {
            void flush()
            void load(e.target.value)
          }}
        >
          {notes.length === 0 && <option value="">No notes yet</option>}
          {notes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.pinned ? '★ ' : ''}
              {n.title || 'Untitled note'}
            </option>
          ))}
        </select>
        <button className="iconbtn" title="New note" onClick={() => void create()}>
          <IconPlus size={15} />
        </button>
        <button
          className="iconbtn"
          title={editing ? 'Preview' : 'Edit'}
          onClick={() => {
            if (editing) void flush()
            setEditing((v) => !v)
          }}
        >
          {editing ? <IconEye size={15} /> : <IconPencil size={15} />}
        </button>
        <button className="iconbtn" title="Close panel (ctrl+\)" onClick={onClose}>
          <IconX size={15} />
        </button>
      </div>

      <div className="notespanel__body">
        {!note && <p className="note__empty">Make a note and it shows up here.</p>}

        {note && editing && (
          <textarea
            className="notespanel__editor"
            value={note.body}
            placeholder="Write…"
            onChange={(e) => {
              setNote((n) => (n ? { ...n, body: e.target.value } : n))
              setDirty(true)
            }}
            onBlur={() => void flush()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                e.currentTarget.blur()
              }
            }}
          />
        )}

        {note && !editing && (
          <NoteBody
            noteId={note.id}
            format={note.format}
            body={note.body}
            revision={revision}
          />
        )}
      </div>

      {note && (
        <div className="notespanel__foot">
          <span>{dirty ? 'Saving…' : 'Saved'}</span>
          <div style={{ flex: 1 }} />
          <button className="link-btn" onClick={() => onOpenInNotes(note.id)}>
            Open in Notes
          </button>
        </div>
      )}
    </aside>
  )
}
