import { protocol } from 'electron'
import { currentUser } from './accounts'
import { noteForProtocol } from './notes'

export const NOTE_SCHEME = 'kibnote'

/**
 * An HTML note is a whole little web page, scripts included. Rendering it in a
 * `srcdoc` frame does not work: srcdoc documents inherit the embedding page's
 * CSP on top of their own, so the app's `script-src 'self'` silently wins and
 * nothing runs. Loosening the app's policy to fix that would weaken the window
 * holding the mail tokens, in order to serve notes.
 *
 * So notes get an origin of their own. A privileged scheme means the frame is a
 * real document with its own headers, inheriting nothing, and the policy below
 * is the only one that applies to it: scripts and styles run, the page can show
 * pictures, and it can open no connection of any kind.
 */
const NOTE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  'img-src data: blob: https:',
  'media-src data: blob: https:',
  'font-src data: https:',
  // The one that matters: a note can render whatever it likes and still has no
  // way to send anything anywhere.
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'"
].join('; ')

/** Styling a note inherits before its own CSS runs. Deliberately quiet. */
const BASE_STYLE = `
  :root { color-scheme: dark; }
  html { overflow-y: hidden; }
  body {
    margin: 0;
    padding: 0 2px;
    background: transparent;
    color: #c0caf5;
    font: 14px/1.65 Inter, "Adwaita Sans", Cantarell, "Noto Sans", sans-serif;
    word-break: break-word;
  }
  a { color: #7aa2f7; }
  img, video { max-width: 100%; height: auto; }
  pre, code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 0.9em; }
  pre { white-space: pre-wrap; }
  table { border-collapse: collapse; }
`

/**
 * The frame has no same-origin access to the app, so the app cannot measure it.
 * The document reports its own height instead, and keeps reporting as scripts,
 * images and fonts change it.
 */
const HEIGHT_REPORTER = `
<script>
(function () {
  var last = 0
  function report() {
    var h = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement.scrollHeight
    )
    if (h === last) return
    last = h
    parent.postMessage({ source: 'kibnote', height: h }, '*')
  }
  report()
  addEventListener('load', report)
  addEventListener('resize', report)
  if (window.ResizeObserver && document.body) new ResizeObserver(report).observe(document.body)
  setInterval(report, 500)
})()
</script>`

function documentFor(body: string): string {
  // A note that brought its own <html> or <!doctype> is served as written; the
  // reporter still parses into it. Anything else gets a minimal shell so a bare
  // fragment is readable without the author writing boilerplate.
  const whole = /^\s*(<!doctype|<html)/i.test(body)
  if (whole) return `${body}\n${HEIGHT_REPORTER}`
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_STYLE}</style></head><body>${body}\n${HEIGHT_REPORTER}</body></html>`
}

function reply(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': NOTE_CSP,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}

/** Must run before the app is ready, or the scheme is not privileged. */
export function registerNoteScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: NOTE_SCHEME,
      privileges: {
        // `standard` is what gives the scheme a real origin, which is the whole
        // point: without it the document is opaque and inherits again.
        standard: true,
        secure: true,
        supportFetchAPI: false,
        corsEnabled: false,
        stream: false
      }
    }
  ])
}

/** Serve `kibnote://note/<id>`. Called once the app is ready. */
export function handleNoteScheme(): void {
  protocol.handle(NOTE_SCHEME, (request) => {
    let id = ''
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'note') return reply('<p>Unknown note address.</p>', 404)
      id = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    } catch {
      return reply('<p>Unknown note address.</p>', 400)
    }

    // The scheme is only ever addressed by our own renderer, but it is reachable
    // from any frame in the app, so it answers for the signed-in user only.
    const user = currentUser()
    if (!user) return reply('<p>Not signed in.</p>', 403)

    const note = noteForProtocol(user.id, id)
    if (!note) return reply('<p>That note no longer exists.</p>', 404)
    if (note.format !== 'html') return reply('<p>That note is not an HTML note.</p>', 400)

    return reply(documentFor(note.body))
  })
}
