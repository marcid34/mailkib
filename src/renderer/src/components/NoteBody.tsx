import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { NoteFormat } from '../../../shared/notes'

/**
 * Markdown notes render into the app's own document, and therefore into the
 * app's theme — which is the point. A note is yours, so it should look like the
 * rest of Kib rather than sitting on a white sheet the way mail from a stranger
 * does. It is still sanitised: Markdown permits raw HTML, and a note pasted
 * from a web page brings whatever was on it.
 */
function renderMarkdown(body: string): string {
  const html = marked.parse(body, { async: false, gfm: true, breaks: true }) as string
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style', 'link', 'meta'],
    FORBID_ATTR: ['ping', 'formaction'],
    ALLOW_DATA_ATTR: false
  })
}

/**
 * HTML notes are served from `kibnote://`, an origin of their own, so the page
 * runs its own scripts without inheriting or weakening the app's policy. The
 * frame is deliberately not same-origin, which means the app cannot reach in to
 * measure it -- the served document reports its own height instead.
 */
function HtmlNote({ noteId, revision }: { noteId: string; revision: number }): JSX.Element {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(220)

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (event.source !== ref.current?.contentWindow) return
      const data = event.data as { source?: string; height?: number } | null
      if (data?.source !== 'kibnote' || typeof data.height !== 'number') return
      setHeight(Math.max(80, Math.min(6000, Math.round(data.height) + 4)))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <iframe
      ref={ref}
      className="note__frame"
      // No allow-same-origin: with allow-scripts as well, a frame can reach the
      // parent and strip its own sandbox, which would make all of this theatre.
      sandbox="allow-scripts"
      src={`kibnote://note/${encodeURIComponent(noteId)}?r=${revision}`}
      style={{ height }}
      title="Note"
    />
  )
}

export function NoteBody({
  noteId,
  format,
  body,
  revision
}: {
  noteId: string
  format: NoteFormat
  body: string
  /** bumped on save, so the frame reloads what the main process now holds */
  revision: number
}): JSX.Element {
  const markdown = useMemo(
    () => (format === 'markdown' ? renderMarkdown(body) : ''),
    [format, body]
  )

  if (format === 'html') return <HtmlNote noteId={noteId} revision={revision} />

  if (format === 'markdown') {
    if (!body.trim()) return <p className="note__empty">Nothing written yet.</p>
    return <div className="note__md" dangerouslySetInnerHTML={{ __html: markdown }} />
  }

  if (!body.trim()) return <p className="note__empty">Nothing written yet.</p>
  return <pre className="note__plain">{body}</pre>
}
