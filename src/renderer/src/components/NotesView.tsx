import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { NOTE_FORMATS, type Note, type NoteFormat, type NoteSummary } from '../../../shared/notes'
import { api, call } from '../lib/api'
import { relativeTime } from '../lib/format'
import { isTyping, useKeyScope, useModalScope } from '../lib/keymap'
import { useToast } from '../lib/toast'
import { CodeEditor, focusCodeEditor } from './CodeEditor'
import { CommandPalette, type Command } from './CommandPalette'
import { NoteBody } from './NoteBody'
import { Shortcuts } from './Shortcuts'
import {
  IconCode,
  IconEye,
  IconMarkdown,
  IconNote,
  IconPencil,
  IconPin,
  IconPlus,
  IconSearch,
  IconText,
  IconTrash
} from './Icons'

const FORMAT_ICON: Record<NoteFormat, (p: { size?: number }) => JSX.Element> = {
  plain: IconText,
  markdown: IconMarkdown,
  html: IconCode
}

/** Long enough that typing is not a write storm, short enough to feel saved. */
const AUTOSAVE_MS = 600

interface Props {
  moduleCommands: Command[]
  onOpenSettings: () => void
}

export function NotesView({ moduleCommands, onOpenSettings }: Props): JSX.Element {
  const { notify, fail } = useToast()
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Note | null>(null)
  const [cursor, setCursor] = useState(0)
  const [editing, setEditing] = useState(true)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const [dirty, setDirty] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const editorHost = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<number | undefined>(undefined)

  const overlayOpen = paletteOpen || shortcutsOpen
  useModalScope(overlayOpen)

  /** An HTML note has no textarea to focus; reach into the code editor instead. */
  const focusBody = useCallback(() => {
    if (bodyRef.current) bodyRef.current.focus()
    else focusCodeEditor(editorHost.current)
  }, [])

  const refresh = useCallback(
    async (search?: string) => {
      try {
        const term = (search ?? '').trim()
        const list = await call(term ? api.notes.search(term) : api.notes.list())
        setNotes(list)
        return list
      } catch (error) {
        fail(error)
        return []
      } finally {
        setLoading(false)
      }
    },
    [fail]
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Searching is local and instant, but debounce anyway so every keystroke is
  // not a round trip through the bridge.
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(query), 120)
    return () => window.clearTimeout(timer)
  }, [query, refresh])

  useEffect(() => {
    if (cursor >= notes.length) setCursor(Math.max(0, notes.length - 1))
  }, [notes.length, cursor])

  /* ------------------------------- loading ------------------------------- */

  const open = useCallback(
    async (id: string, focus = false) => {
      try {
        const note = await call(api.notes.get(id))
        if (!note) {
          notify('That note is gone.', 'error')
          void refresh(query)
          return
        }
        setActiveId(id)
        setDraft(note)
        setDirty(false)
        setRevision((r) => r + 1)
        if (focus) requestAnimationFrame(focusBody)
      } catch (error) {
        fail(error)
      }
    },
    [fail, notify, refresh, query, focusBody]
  )

  /* -------------------------------- saving ------------------------------- */

  const flush = useCallback(async () => {
    const note = draft
    if (!note || !dirty) return
    window.clearTimeout(saveTimer.current)
    try {
      const saved = await call(
        api.notes.update(note.id, {
          title: note.title,
          body: note.body,
          format: note.format
        })
      )
      setDirty(false)
      setRevision((r) => r + 1)
      setNotes((list) => list.map((n) => (n.id === saved.id ? { ...saved } : n)))
      // A note that named itself should say so in the title field too. Only
      // when the field is still blank, so a title being typed is never clobbered
      // by a save that started before the last keystroke.
      setDraft((n) => (n && n.id === saved.id && !n.title ? { ...n, title: saved.title } : n))
    } catch (error) {
      fail(error)
    }
  }, [draft, dirty, fail])

  // Save shortly after typing stops, and never leave the module holding an
  // unsaved edit.
  useEffect(() => {
    if (!dirty) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void flush(), AUTOSAVE_MS)
    return () => window.clearTimeout(saveTimer.current)
  }, [dirty, flush])

  useEffect(() => {
    return () => {
      window.clearTimeout(saveTimer.current)
    }
  }, [])

  function edit(patch: Partial<Note>): void {
    setDraft((note) => (note ? { ...note, ...patch } : note))
    setDirty(true)
  }

  /* ------------------------------- actions ------------------------------- */

  const create = useCallback(
    async (format: NoteFormat = 'markdown') => {
      try {
        await flush()
        const note = await call(api.notes.create({ format }))
        setNotes((list) => [note, ...list])
        setActiveId(note.id)
        setDraft(note)
        setDirty(false)
        setEditing(true)
        setCursor(0)
        requestAnimationFrame(focusBody)
      } catch (error) {
        fail(error)
      }
    },
    [flush, fail, focusBody]
  )

  const remove = useCallback(
    async (id: string) => {
      try {
        await call(api.notes.remove(id))
        setNotes((list) => list.filter((n) => n.id !== id))
        if (activeId === id) {
          setActiveId(null)
          setDraft(null)
          setDirty(false)
        }
        notify('Note deleted', 'ok')
      } catch (error) {
        fail(error)
      }
    },
    [activeId, notify, fail]
  )

  const togglePin = useCallback(
    async (id: string, pinned: boolean) => {
      try {
        const saved = await call(api.notes.update(id, { pinned }))
        setNotes((list) =>
          [...list.map((n) => (n.id === id ? { ...saved } : n))].sort(
            (a, b) =>
              Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt
          )
        )
        if (draft?.id === id) setDraft((n) => (n ? { ...n, pinned: saved.pinned } : n))
      } catch (error) {
        fail(error)
      }
    },
    [draft, fail]
  )

  /* ------------------------------ shortcuts ------------------------------ */

  const onKey = useCallback(
    (event: KeyboardEvent): boolean | void => {
      const mod = event.ctrlKey || event.metaKey

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
        return true
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void flush()
        return true
      }
      if (overlayOpen) return
      if (mod && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        setEditing((v) => !v)
        return true
      }
      if (mod || event.altKey) return
      if (isTyping(event)) {
        // Escape leaves the editor without leaving the note.
        if (event.key === 'Escape') {
          event.preventDefault()
          ;(event.target as HTMLElement).blur()
          return true
        }
        return
      }

      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          event.preventDefault()
          setCursor((c) => Math.min(c + 1, notes.length - 1))
          return true
        case 'k':
        case 'ArrowUp':
          event.preventDefault()
          setCursor((c) => Math.max(c - 1, 0))
          return true
        case 'Enter':
        case 'o': {
          const note = notes[cursor]
          if (!note) return
          event.preventDefault()
          setEditing(true)
          void open(note.id, true)
          return true
        }
        case 'c':
          event.preventDefault()
          void create()
          return true
        case '/':
          event.preventDefault()
          searchRef.current?.focus()
          searchRef.current?.select()
          return true
        case '#':
        case 'Delete': {
          const note = notes[cursor]
          if (!note) return
          event.preventDefault()
          void remove(note.id)
          return true
        }
        case 'P': {
          const note = notes[cursor]
          if (!note) return
          event.preventDefault()
          void togglePin(note.id, !note.pinned)
          return true
        }
        case '?':
          event.preventDefault()
          setShortcutsOpen(true)
          return true
        default:
          return
      }
    },
    [notes, cursor, overlayOpen, open, create, remove, togglePin, flush]
  )

  useKeyScope('notes', onKey)

  /* ------------------------------ commands ------------------------------- */

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      { id: 'note-new', group: 'Notes', label: 'New note', keys: ['c'], run: () => void create('markdown') },
      { id: 'note-new-md', group: 'Notes', label: 'New Markdown note', run: () => void create('markdown') },
      { id: 'note-new-plain', group: 'Notes', label: 'New plain note', run: () => void create('plain') },
      { id: 'note-new-html', group: 'Notes', label: 'New HTML note', run: () => void create('html') },
      {
        id: 'note-search',
        group: 'Notes',
        label: 'Search notes',
        keys: ['/'],
        run: () => searchRef.current?.focus()
      }
    ]
    if (draft) {
      list.push(
        {
          id: 'note-toggle',
          group: 'Notes',
          label: editing ? 'Preview this note' : 'Edit this note',
          keys: ['ctrl', 'e'],
          run: () => setEditing((v) => !v)
        },
        {
          id: 'note-pin',
          group: 'Notes',
          label: draft.pinned ? 'Unpin this note' : 'Pin this note',
          keys: ['shift', 'p'],
          run: () => void togglePin(draft.id, !draft.pinned)
        },
        {
          id: 'note-delete',
          group: 'Notes',
          label: 'Delete this note',
          keys: ['#'],
          run: () => void remove(draft.id)
        }
      )
    }
    for (const note of notes.slice(0, 20)) {
      list.push({
        id: `open-${note.id}`,
        group: 'Open',
        label: note.title || 'Untitled note',
        run: () => void open(note.id)
      })
    }
    list.push(
      ...moduleCommands,
      { id: 'settings', group: 'App', label: 'Open settings', run: onOpenSettings },
      {
        id: 'shortcuts',
        group: 'App',
        label: 'Keyboard shortcuts',
        keys: ['?'],
        run: () => setShortcutsOpen(true)
      }
    )
    return list
  }, [notes, draft, editing, create, open, remove, togglePin, moduleCommands, onOpenSettings])

  /* -------------------------------- render ------------------------------- */

  return (
    <>
      <div className="body">
        <aside className="notelist">
          <div className="notelist__head">
            <div className="notelist__search">
              <IconSearch size={14} />
              <input
                ref={searchRef}
                value={query}
                spellCheck={false}
                placeholder="Search notes…"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    setQuery('')
                    e.currentTarget.blur()
                  }
                }}
              />
            </div>
            <button className="iconbtn" title="New note (c)" onClick={() => void create()}>
              <IconPlus size={16} />
            </button>
          </div>

          <div className="notelist__scroll">
            {loading && (
              <div className="notelist__empty">
                <span className="spinner" />
              </div>
            )}

            {!loading && notes.length === 0 && (
              <div className="notelist__empty">
                <IconNote size={28} />
                <div>{query ? 'No notes match.' : 'No notes yet.'}</div>
                {!query && (
                  <button className="link-btn" onClick={() => void create()}>
                    Write the first one
                  </button>
                )}
              </div>
            )}

            {notes.map((note, index) => {
              const Icon = FORMAT_ICON[note.format]
              return (
                <button
                  key={note.id}
                  className={`noterow${note.id === activeId ? ' is-active' : ''}${
                    index === cursor ? ' is-cursor' : ''
                  }`}
                  onClick={() => {
                    setCursor(index)
                    void open(note.id)
                  }}
                >
                  <div className="noterow__top">
                    {note.pinned && (
                      <span className="noterow__pin" title="Pinned">
                        <IconPin size={11} />
                      </span>
                    )}
                    <span className="noterow__title">{note.title || 'Untitled note'}</span>
                    <Icon size={12} />
                  </div>
                  <div className="noterow__excerpt">{note.excerpt || 'Empty'}</div>
                  <div className="noterow__when">{relativeTime(note.updatedAt)}</div>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="notepane">
          {!draft && (
            <div className="notepane__empty">
              <IconNote size={38} />
              <div>Select a note</div>
              <div style={{ fontSize: 11.5 }}>
                <span className="kbd">j</span> <span className="kbd">k</span> to move ·{' '}
                <span className="kbd">↵</span> to open · <span className="kbd">c</span> for a new one
              </div>
            </div>
          )}

          {draft && (
            <>
              <div className="notepane__bar">
                <input
                  className="notepane__title"
                  value={draft.title}
                  placeholder="Untitled note"
                  onChange={(e) => edit({ title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      bodyRef.current?.focus()
                    }
                  }}
                />
                <span className={`notepane__state${dirty ? ' is-dirty' : ''}`}>
                  {dirty ? 'Saving…' : 'Saved'}
                </span>
                <button
                  className={`iconbtn${draft.pinned ? ' is-on' : ''}`}
                  title={draft.pinned ? 'Unpin (shift+P)' : 'Pin (shift+P)'}
                  onClick={() => void togglePin(draft.id, !draft.pinned)}
                >
                  <IconPin size={15} />
                </button>
                <button
                  className="iconbtn"
                  title="Delete note (#)"
                  onClick={() => void remove(draft.id)}
                >
                  <IconTrash size={15} />
                </button>
              </div>

              <div className="notepane__toolbar">
                <div className="segmented">
                  {NOTE_FORMATS.map(({ id, name }) => {
                    const Icon = FORMAT_ICON[id]
                    return (
                      <button
                        key={id}
                        className={`segmented__btn${draft.format === id ? ' is-on' : ''}`}
                        onClick={() => edit({ format: id })}
                        title={`Write in ${name}`}
                      >
                        <Icon size={13} />
                        {name}
                      </button>
                    )
                  })}
                </div>
                <span className="compose__hint">
                  {NOTE_FORMATS.find((f) => f.id === draft.format)?.hint}
                </span>
                <div style={{ flex: 1 }} />
                <button
                  className={`iconbtn${editing ? ' is-on-accent' : ''}`}
                  title="Edit (ctrl+e)"
                  onClick={() => setEditing(true)}
                >
                  <IconPencil size={15} />
                </button>
                <button
                  className={`iconbtn${editing ? '' : ' is-on-accent'}`}
                  title="Preview (ctrl+e)"
                  onClick={() => {
                    void flush()
                    setEditing(false)
                  }}
                >
                  <IconEye size={15} />
                </button>
              </div>

              {editing ? (
                <div
                  ref={editorHost}
                  className={`notepane__editor${draft.format === 'html' ? ' is-code' : ''}`}
                >
                  {draft.format === 'html' ? (
                    <CodeEditor
                      key={draft.id}
                      value={draft.body}
                      language="html"
                      placeholder={'<h1>Hello</h1>\n<style>…</style>\n<script>…</script>'}
                      onChange={(body) => edit({ body })}
                      onBlur={() => void flush()}
                    />
                  ) : (
                    <textarea
                      ref={bodyRef}
                      value={draft.body}
                      spellCheck
                      placeholder="Write…"
                      onChange={(e) => edit({ body: e.target.value })}
                      onBlur={() => void flush()}
                    />
                  )}
                </div>
              ) : (
                <div className="notepane__preview">
                  <NoteBody
                    noteId={draft.id}
                    format={draft.format}
                    body={draft.body}
                    revision={revision}
                  />
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <div className="hint-bar">
        <span className="pair">
          <span className="kbd">c</span> new
        </span>
        <span className="pair">
          <span className="kbd">/</span> search
        </span>
        <span className="pair">
          <span className="kbd">ctrl</span>
          <span className="kbd">e</span> edit / preview
        </span>
        <div style={{ flex: 1 }} />
        <span>
          {notes.length} note{notes.length === 1 ? '' : 's'}
        </span>
      </div>

      {paletteOpen && (
        <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />
      )}

      {shortcutsOpen && <Shortcuts onClose={() => setShortcutsOpen(false)} />}
    </>
  )
}
