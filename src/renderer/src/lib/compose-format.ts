import { marked } from 'marked'

export type BodyFormat = 'markdown' | 'html' | 'plain'

/**
 * Many mail clients drop <style> blocks, so the styling that matters has to ride
 * along on the elements themselves. These are applied after Markdown rendering.
 */
const INLINE: Record<string, string> = {
  blockquote:
    'margin:8px 0;padding:2px 0 2px 12px;border-left:3px solid #c7c7d1;color:#5c5c6b',
  pre: 'margin:8px 0;padding:12px;border-radius:6px;background:#f4f4f7;border:1px solid #e2e2ea;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.45',
  code: 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.92em',
  table: 'border-collapse:collapse;margin:8px 0',
  th: 'border:1px solid #dcdce4;padding:6px 10px;text-align:left;background:#f4f4f7',
  td: 'border:1px solid #dcdce4;padding:6px 10px',
  hr: 'border:none;border-top:1px solid #dcdce4;margin:16px 0',
  h1: 'margin:18px 0 8px;font-size:1.5em;line-height:1.25',
  h2: 'margin:16px 0 8px;font-size:1.3em;line-height:1.3',
  h3: 'margin:14px 0 6px;font-size:1.12em',
  ul: 'margin:8px 0;padding-left:22px',
  ol: 'margin:8px 0;padding-left:22px',
  p: 'margin:0 0 12px',
  a: 'color:#2563c9'
}

/** A <code> inside a <pre> should not get the standalone chip treatment. */
function inlineStyles(html: string): string {
  return html.replace(/<(\w+)((?:\s[^>]*)?)>/g, (match, tag: string, attrs: string) => {
    const style = INLINE[tag.toLowerCase()]
    if (!style || /\sstyle=/.test(attrs)) return match
    return `<${tag}${attrs} style="${style}">`
  })
}

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )
}

/** Render the composer body to the HTML that actually goes out on the wire. */
export function toHtml(body: string, format: BodyFormat): string {
  if (format === 'html') return body
  if (format === 'plain') return escapeHtml(body).replace(/\n/g, '<br>')
  const rendered = marked.parse(body, { async: false, gfm: true, breaks: true }) as string
  return inlineStyles(rendered)
}

/** The text/plain alternative. Markdown source reads fine as plain text. */
export function toPlain(body: string, format: BodyFormat): string {
  if (format === 'html') {
    return body
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  return body
}

export const FORMAT_HINTS: Record<BodyFormat, string> = {
  markdown: '**bold**  _italic_  `code`  [link](url)  - list  > quote',
  html: 'Raw HTML and <style> are sent as written.',
  plain: 'Sent as typed, with line breaks preserved.'
}
