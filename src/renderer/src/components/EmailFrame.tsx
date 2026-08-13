import DOMPurify from 'dompurify'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { api } from '../lib/api'
import { useTheme } from '../lib/theme-context'

import type { ThemeColors } from '../lib/themes'

const baseStyle = (c: ThemeColors): string => `
  html { color-scheme: dark; }
  body {
    margin: 0;
    background: transparent;
    color: ${c.fg};
    font: 13.5px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  a { color: ${c.accent}; }
  img { max-width: 100%; height: auto; border: 0; }
  table { max-width: 100%; border-collapse: collapse; }
  pre { white-space: pre-wrap; font-family: ui-monospace, monospace; }
  blockquote {
    margin: 8px 0;
    padding-left: 12px;
    border-left: 2px solid ${c.borderStrong};
    color: ${c.fgMute};
  }
  hr { border: none; border-top: 1px solid ${c.border}; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: ${c.borderStrong}; border-radius: 6px; }
`

/** Most recipients read on a white background, so the compose preview uses one. */
const LIGHT_STYLE = `
  html { color-scheme: light; }
  body {
    margin: 0;
    background: #ffffff;
    color: #1c1c22;
    font: 13.5px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  a { color: #2563c9; }
  img { max-width: 100%; height: auto; border: 0; }
  table { max-width: 100%; }
`

export function hasRemoteImages(html: string): boolean {
  return /<img[^>]+src=["']?https?:/i.test(html) || /background(-image)?\s*:\s*url\(['"]?https?:/i.test(html)
}

function buildDocument(
  html: string,
  allowRemote: boolean,
  trusted: boolean,
  light: boolean,
  colors: ThemeColors
): string {
  // `style` is not in DOMPurify's default allowlist, but HTML email leans on it
  // heavily -- without it most newsletters render as unstyled text. Allowing it
  // is safe here because the frame runs no scripts and carries its own CSP.
  const clean = trusted
    ? html
    : DOMPurify.sanitize(html, {
        ADD_TAGS: ['style'],
        ADD_ATTR: ['style', 'target', 'bgcolor', 'align', 'valign', 'width', 'height'],
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'base', 'link', 'meta'],
        FORBID_ATTR: ['ping', 'formaction', 'srcset'],
        ALLOW_DATA_ATTR: false
      })
  const imgSrc = allowRemote ? 'data: blob: https: http:' : 'data: blob:'
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src ${imgSrc}; media-src ${imgSrc}; font-src data:; frame-src 'none'; form-action 'none'">
<style>${light ? LIGHT_STYLE : baseStyle(colors)}</style></head><body>${clean}</body></html>`
}

/**
 * Renders message HTML in a script-free sandboxed frame. `allow-same-origin`
 * is safe here precisely because scripts are not permitted: nothing inside can
 * run, while the parent can still measure the content and intercept clicks.
 */
export function EmailFrame({
  html,
  allowRemote,
  trusted = false,
  light = false
}: {
  html: string
  allowRemote: boolean
  /** Skip sanitising: used for the compose preview, where the content is the
      user's own and the preview must match exactly what gets sent. */
  trusted?: boolean
  /** Render on white, as the recipient will most likely see it. */
  light?: boolean
}): JSX.Element {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(48)
  const { theme } = useTheme()
  const doc = useMemo(
    () => buildDocument(html, allowRemote, trusted, light, theme.colors),
    [html, allowRemote, trusted, light, theme]
  )

  useEffect(() => {
    const iframe = ref.current
    if (!iframe) return
    let observer: ResizeObserver | undefined
    let timers: number[] = []

    const measure = (): void => {
      const d = iframe.contentDocument
      if (!d?.body) return
      setHeight(Math.max(d.body.scrollHeight, d.documentElement.scrollHeight) + 4)
    }

    const onClick = (event: Event): void => {
      const target = (event.target as Element | null)?.closest?.('a[href]') as
        | HTMLAnchorElement
        | null
      if (!target) return
      event.preventDefault()
      const href = target.getAttribute('href') ?? ''
      if (/^(https?|mailto):/i.test(href)) void api.app.openExternal(href)
    }

    const onLoad = (): void => {
      const d = iframe.contentDocument
      if (!d) return
      measure()
      d.addEventListener('click', onClick, true)
      observer = new ResizeObserver(measure)
      if (d.body) observer.observe(d.body)
      // Images finish decoding after load and change the layout height.
      d.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure))
      timers = [200, 700, 1600].map((ms) => window.setTimeout(measure, ms))
    }

    iframe.addEventListener('load', onLoad)
    if (iframe.contentDocument?.readyState === 'complete') onLoad()

    return () => {
      iframe.removeEventListener('load', onLoad)
      iframe.contentDocument?.removeEventListener('click', onClick, true)
      observer?.disconnect()
      timers.forEach(clearTimeout)
    }
  }, [doc])

  return (
    <iframe
      ref={ref}
      className="msg__frame"
      sandbox="allow-same-origin"
      srcDoc={doc}
      style={{ height }}
      title="Message content"
    />
  )
}
