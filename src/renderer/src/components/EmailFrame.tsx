import DOMPurify from 'dompurify'
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { api } from '../lib/api'
import { useTheme } from '../lib/settings-context'
import { useToast } from '../lib/toast'
import { ContextMenu, useContextMenu, type MenuItem } from './ContextMenu'

import type { ThemeColors } from '../lib/themes'

/**
 * The frame is a separate document, so it inherits none of the app's CSS -- and
 * it had been carrying its own `system-ui`-first stack. On Linux that is the
 * stack that sends bare ASCII digits (and the space) to Noto Color Emoji, which
 * covers 0-9 for keycap sequences: numbers come out as wide, uniform-width emoji
 * glyphs wedged between normal letters, and the whole message reads as spaced
 * out and unformatted. Take the families from the theme, which already leads
 * with a concrete text family for exactly this reason, so the two cannot drift.
 */
interface Fonts {
  text: string
  mono: string
}

function fontStacks(): Fonts {
  const root = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string): string =>
    root.getPropertyValue(name).trim() || fallback
  return {
    text: read(
      '--font',
      'Inter, "Adwaita Sans", Cantarell, "Noto Sans", "DejaVu Sans", "Liberation Sans", sans-serif'
    ),
    mono: read('--mono', '"JetBrains Mono", "DejaVu Sans Mono", monospace')
  }
}

/**
 * Reading styles for a message that arrived as plain text and was rebuilt into
 * paragraphs. Scoped to the wrapper so HTML mail, which brings its own layout,
 * is left exactly as the sender wrote it.
 */
const textStyle = (mono: string): string => `
  .mk-text { max-width: 68ch; }
  .mk-text p { margin: 0 0 0.85em; }
  .mk-text p:last-child { margin-bottom: 0; }
  .mk-text blockquote p:last-child { margin-bottom: 0; }
  .mk-text .mk-pre {
    margin: 0 0 0.85em;
    font-family: ${mono};
    font-size: 0.92em;
    white-space: pre-wrap;
  }
`

const baseStyle = (c: ThemeColors, font: Fonts): string => `
  html { color-scheme: dark; overflow-y: hidden; }
  body {
    margin: 0;
    overflow-x: auto;
    background: transparent;
    color: ${c.fg};
    font: 13.5px/1.6 ${font.text};
    font-variant-numeric: proportional-nums;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  a { color: ${c.accent}; }
  img { max-width: 100%; height: auto; border: 0; }
  table { max-width: 100%; border-collapse: collapse; }
  pre { white-space: pre-wrap; font-family: ${font.mono}; }
  blockquote {
    margin: 8px 0;
    padding-left: 12px;
    border-left: 2px solid ${c.borderStrong};
    color: ${c.fgMute};
  }
  hr { border: none; border-top: 1px solid ${c.border}; }
  ${textStyle(font.mono)}
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: ${c.borderStrong}; border-radius: 6px; }
`

/**
 * HTML email is written for a white page: senders set their own dark text and
 * leave the background to the client. Rendering that on a dark surface gives
 * dark-on-dark text and patchwork white blocks wherever they *did* set one. So
 * designed messages get a real white sheet, exactly like every other mail client.
 */
const lightStyle = (font: Fonts): string => `
  html { color-scheme: light; overflow-y: hidden; }
  body {
    margin: 0;
    overflow-x: auto;
    background: #ffffff;
    color: #1c1c22;
    font: 13.5px/1.6 ${font.text};
    font-variant-numeric: proportional-nums;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  a { color: #2563c9; }
  img { max-width: 100%; height: auto; border: 0; }
  table { max-width: 100%; }
  blockquote {
    margin: 8px 0;
    padding-left: 12px;
    border-left: 3px solid #d6d6de;
    color: #55555f;
  }
  hr { border: none; border-top: 1px solid #e2e2e8; }
  ${textStyle(font.mono)}
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #c9c9d2; border-radius: 6px; }
`

export type Surface = 'auto' | 'light' | 'dark'

/** What sits under the pointer when the message body is right-clicked. */
interface FrameTarget {
  href: string
  imageSrc: string
  selection: string
  bodyText: string
}

export function hasRemoteImages(html: string): boolean {
  return /<img[^>]+src=["']?https?:/i.test(html) || /background(-image)?\s*:\s*url\(['"]?https?:/i.test(html)
}

/**
 * Does this message carry its own design? Two or more signals, so a plain reply
 * that happens to contain one image is not mistaken for a newsletter.
 */
export function looksDesigned(html: string): boolean {
  if (!html) return false
  const signals = [
    /<table/i,
    /<style/i,
    /bgcolor\s*=/i,
    /background(-color)?\s*:/i,
    /<img/i,
    /style\s*=\s*["'][^"']*(?:^|[;\s])color\s*:/i,
    /<(center|font)\b/i
  ]
  return signals.filter((pattern) => pattern.test(html)).length >= 2
}

export function resolveSurface(surface: Surface, html: string): 'light' | 'dark' {
  if (surface === 'light') return 'light'
  if (surface === 'dark') return 'dark'
  return looksDesigned(html) ? 'light' : 'dark'
}

function buildDocument(
  html: string,
  allowRemote: boolean,
  trusted: boolean,
  light: boolean,
  colors: ThemeColors,
  font: Fonts
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
<style>${light ? lightStyle(font) : baseStyle(colors, font)}</style></head><body>${clean}</body></html>`
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
  surface = 'dark'
}: {
  html: string
  allowRemote: boolean
  /** Skip sanitising: used for the compose preview, where the content is the
      user's own and the preview must match exactly what gets sent. */
  trusted?: boolean
  /** `auto` decides per message; see resolveSurface. */
  surface?: Surface
}): JSX.Element {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(48)
  const { theme } = useTheme()
  const { notify } = useToast()
  const menu = useContextMenu()
  const { open: openMenu, close: closeMenu } = menu
  const light = resolveSurface(surface, html) === 'light'
  const doc = useMemo(
    () => buildDocument(html, allowRemote, trusted, light, theme.colors, fontStacks()),
    [html, allowRemote, trusted, light, theme]
  )

  const copy = useCallback(
    (text: string, what: string): void => {
      void navigator.clipboard.writeText(text).then(
        () => notify(`${what} copied`, 'ok'),
        () => notify(`Could not copy the ${what.toLowerCase()}`, 'error')
      )
    },
    [notify]
  )

  /**
   * Electron ships no default context menu, so a right-click inside a message
   * did nothing at all. Build one from whatever is under the pointer, and always
   * leave at least one usable entry so the click is never a dead end.
   */
  const itemsFor = useCallback(
    (target: FrameTarget): MenuItem[] => {
      const items: MenuItem[] = []
      const mailto = /^mailto:/i.test(target.href)
      const web = /^https?:/i.test(target.href)

      if (mailto) {
        const address = target.href.replace(/^mailto:/i, '').split('?')[0]
        items.push({ label: 'Copy email address', run: () => copy(address, 'Address') })
      } else if (web) {
        items.push(
          { label: 'Open link', run: () => void api.app.openExternal(target.href) },
          { label: 'Copy link address', run: () => copy(target.href, 'Link') }
        )
      }

      if (/^https?:/i.test(target.imageSrc)) {
        if (items.length > 0) items.push({})
        items.push(
          { label: 'Open image', run: () => void api.app.openExternal(target.imageSrc) },
          { label: 'Copy image address', run: () => copy(target.imageSrc, 'Image address') }
        )
      }

      if (target.selection) {
        if (items.length > 0) items.push({})
        items.push({
          label: 'Copy selection',
          hint: 'ctrl C',
          run: () => copy(target.selection, 'Selection')
        })
      }

      if (target.bodyText) {
        if (items.length > 0) items.push({})
        items.push({ label: 'Copy message text', run: () => copy(target.bodyText, 'Message text') })
      }

      return items
    },
    [copy]
  )

  useEffect(() => {
    const iframe = ref.current
    if (!iframe) return
    let observer: ResizeObserver | undefined
    let timers: number[] = []

    // The first measurement for a document sets the height outright; later ones
    // may only grow it. Otherwise a transient reflow while images decode makes
    // long messages jitter -- but a genuinely new document still resizes freely.
    let measured = false
    let last = 0

    /**
     * Newsletters are typically laid out at a fixed 600px. When the reading pane
     * is narrower, scale the document down rather than handing the reader a
     * horizontal scrollbar. `zoom` affects layout, so the height measurement
     * below still sees the scaled size.
     */
    const fit = (): void => {
      const d = iframe.contentDocument
      if (!d?.body || !iframe.clientWidth) return
      d.documentElement.style.zoom = '1'
      const overflow = d.body.scrollWidth / iframe.clientWidth
      if (overflow > 1.01) {
        d.documentElement.style.zoom = String(Math.max(0.7, Math.min(1, 1 / overflow)))
      }
    }

    const measure = (): void => {
      const d = iframe.contentDocument
      if (!d?.body) return
      // scrollHeight is reported in the document's own (pre-zoom) pixels, so it
      // has to be scaled back down or the frame keeps a strip of dead space.
      const zoom = Number(d.documentElement.style.zoom) || 1
      const next =
        Math.round(
          Math.max(
            d.body.scrollHeight,
            d.body.offsetHeight,
            d.documentElement.scrollHeight,
            d.documentElement.offsetHeight
          ) * zoom
        ) + 2
      if (measured && next <= last + 1) return
      measured = true
      last = next
      setHeight(next)
    }

    const refit = (): void => {
      fit()
      measure()
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

    const onContext = (event: Event): void => {
      const mouse = event as globalThis.MouseEvent
      const d = iframe.contentDocument
      if (!d) return
      mouse.preventDefault()
      const element = mouse.target as Element | null
      const anchor = element?.closest?.('a[href]') as HTMLAnchorElement | null
      const image = element?.closest?.('img') as HTMLImageElement | null
      const items = itemsFor({
        // `href` resolves relative URLs against the frame; the attribute is what
        // the sender actually wrote, which is what a reader wants to copy.
        href: anchor?.getAttribute('href')?.trim() ?? '',
        imageSrc: image?.getAttribute('src')?.trim() ?? '',
        selection: d.getSelection()?.toString().trim() ?? '',
        bodyText: d.body?.innerText?.trim() ?? ''
      })
      // A scaled-down newsletter reports pointer coordinates in the frame's own
      // units. Rather than assume how `zoom` is reflected there, measure it: the
      // root element spans exactly the frame's width, so their ratio is the
      // correction, and it collapses to 1 when nothing was scaled.
      const box = iframe.getBoundingClientRect()
      const root = d.documentElement.getBoundingClientRect().width
      const scale = root > 0 ? iframe.clientWidth / root : 1
      openMenu(
        {
          clientX: box.left + mouse.clientX * scale,
          clientY: box.top + mouse.clientY * scale,
          preventDefault: () => {}
        },
        items
      )
    }

    const onLoad = (): void => {
      const d = iframe.contentDocument
      if (!d) return
      refit()
      d.addEventListener('click', onClick, true)
      d.addEventListener('contextmenu', onContext, true)
      observer = new ResizeObserver(measure)
      if (d.body) observer.observe(d.body)
      // Images finish decoding after load and change both width and height.
      d.querySelectorAll('img').forEach((img) => img.addEventListener('load', refit))
      timers = [200, 700, 1600].map((ms) => window.setTimeout(refit, ms))
    }

    // Resizing the reading pane changes how much we need to scale down.
    const onWindowResize = (): void => {
      measured = false
      refit()
    }
    window.addEventListener('resize', onWindowResize)

    iframe.addEventListener('load', onLoad)
    if (iframe.contentDocument?.readyState === 'complete') onLoad()

    return () => {
      window.removeEventListener('resize', onWindowResize)
      iframe.removeEventListener('load', onLoad)
      iframe.contentDocument?.removeEventListener('click', onClick, true)
      iframe.contentDocument?.removeEventListener('contextmenu', onContext, true)
      observer?.disconnect()
      timers.forEach(clearTimeout)
      closeMenu()
    }
  }, [doc, itemsFor, openMenu, closeMenu])

  return (
    <div className={light ? 'msg__paper' : undefined}>
      <iframe
        ref={ref}
        className="msg__frame"
        sandbox="allow-same-origin"
        srcDoc={doc}
        style={{ height }}
        title="Message content"
      />
      <ContextMenu state={menu.state} onClose={menu.close} />
    </div>
  )
}
