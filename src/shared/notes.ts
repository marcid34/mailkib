/**
 * A note is one of three things, and the format decides how it is rendered:
 * `plain` is shown as typed, `markdown` is rendered into the app's own styles,
 * and `html` is a whole little web page served from the `kibnote:` scheme so it
 * can run its own scripts without borrowing the app's origin.
 */
export type NoteFormat = 'plain' | 'markdown' | 'html'

/** What the list and the picker need. Bodies are fetched one at a time. */
export interface NoteSummary {
  id: string
  title: string
  format: NoteFormat
  /** first line or so of the body, for the list */
  excerpt: string
  createdAt: number
  updatedAt: number
  pinned?: boolean
}

export interface Note extends NoteSummary {
  body: string
}

export interface NotePatch {
  title?: string
  body?: string
  format?: NoteFormat
  pinned?: boolean
}

export const NOTE_FORMATS: { id: NoteFormat; name: string; hint: string }[] = [
  { id: 'plain', name: 'Plain', hint: 'Shown exactly as typed.' },
  { id: 'markdown', name: 'Markdown', hint: '**bold**  _italic_  `code`  - list  > quote  # heading' },
  { id: 'html', name: 'HTML', hint: 'A page of its own: HTML, CSS and JS all run.' }
]
