/**
 * Turn a plain-text message body into readable HTML.
 *
 * Dropping the text into a <pre> is faithful but unreadable: mail is hard
 * wrapped at whatever width the sender's client chose, so a narrow reading pane
 * gets a ragged left column of stubs, quoted replies turn into a wall of `>`,
 * and every blank line the sender left is preserved three at a time. What people
 * expect instead is a paragraph: unwrap the sender's line breaks where they were
 * only there to fit a terminal, keep them where they carry meaning, and let the
 * text flow to the pane it is being read in.
 */

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * Lines that must keep their own break: list items, indented or column-aligned
 * text, rules, and the header block of a forwarded message.
 *
 * Deliberately not here: a lone word ending in a colon. It reads like a heading,
 * but mid-paragraph it is just as often the tail of a wrapped sentence -- and a
 * real heading is the first line of its block, which is never joined anyway.
 */
const STRUCTURAL =
  /^(?:\s*(?:[-*+•·]|\d+[.)]|[a-z][.)])\s+|\s{2,}\S|\s*(?:[-=_*~]{3,}|>{1,}\s*$)|\s*(?:from|to|cc|bcc|date|sent|subject|reply-to)\s*:\s)/i

/**
 * Below this the block is too narrow to have been wrapped by anything -- a
 * signature or an address list, where every break was a decision.
 */
const MIN_WRAPPED = 40

/** How far short of the block's widest line a wrapped line may still fall. */
const RAGGED = 10

interface Block {
  depth: number
  lines: string[]
}

/** Peel the `>` markers off a line, returning its quote depth and the rest. */
function unquote(line: string): { depth: number; text: string } {
  let depth = 0
  let rest = line
  for (;;) {
    const match = rest.match(/^\s{0,3}>\s?/)
    if (!match) break
    depth += 1
    rest = rest.slice(match[0].length)
  }
  return { depth, text: rest }
}

/**
 * Group consecutive lines that share a quote depth, splitting on blank lines.
 * A run of blank lines collapses to one break -- senders and their clients are
 * generous with them, and stacked blank lines are most of what reads as "spaced
 * out and strange".
 */
function blocks(text: string): Block[] {
  const out: Block[] = []
  let current: Block | null = null

  for (const raw of text.split('\n')) {
    const { depth, text: line } = unquote(raw.replace(/\s+$/, ''))
    if (!line) {
      current = null
      continue
    }
    if (!current || current.depth !== depth) {
      current = { depth, lines: [] }
      out.push(current)
    }
    current.lines.push(line)
  }
  return out
}

/**
 * Does this block look like something laid out by hand? Tables, ASCII art and
 * code lose all meaning when unwrapped, so they keep every break they came with.
 */
function preformatted(lines: string[]): boolean {
  if (lines.length < 2) return false
  const aligned = lines.filter((l) => /\S\s{2,}\S/.test(l) || /^\s{2,}\S/.test(l)).length
  return aligned >= Math.max(2, Math.ceil(lines.length * 0.6))
}

/**
 * Join the lines a sender's client wrapped, keep the ones they chose. A break is
 * treated as cosmetic when the line before it ran close to a typical wrap width
 * and the line after it continues an ordinary sentence.
 */
function reflow(lines: string[]): string[] {
  // Senders wrap at whatever column their client chose -- 72, 78, sometimes 65.
  // Measuring the block instead of assuming one width is what keeps the last
  // line of a paragraph ("rejected:") attached to the sentence it belongs to.
  const width = Math.max(...lines.map((l) => l.length))
  if (width < MIN_WRAPPED) return lines

  const out: string[] = []
  for (const line of lines) {
    const previous = out[out.length - 1]
    const soft =
      previous !== undefined &&
      previous.length >= width - RAGGED &&
      !STRUCTURAL.test(line) &&
      !/[-–—]$/.test(previous)
    // A trailing space is how format=flowed marks its own soft breaks, and it
    // survives into the body we are handed.
    if (soft) out[out.length - 1] = `${previous.replace(/\s+$/, '')} ${line.replace(/^\s+/, '')}`
    else out.push(line)
  }
  return out
}

/** One pass, so an address inside a URL is not linked twice. */
const LINK_PATTERN =
  /\b(?:(?:https?:\/\/|www\.)[^\s<>()[\]{}"']*[^\s<>()[\]{}"'.,;:!?]|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi

/** Make links clickable, escaping as we go so no source text reaches the page raw. */
function linkify(line: string): string {
  let out = ''
  let index = 0
  for (const match of line.matchAll(LINK_PATTERN)) {
    const at = match.index ?? 0
    const found = match[0]
    out += escapeHtml(line.slice(index, at))
    const href = found.includes('@')
      ? `mailto:${found}`
      : /^www\./i.test(found)
        ? `https://${found}`
        : found
    out += `<a href="${escapeHtml(href)}">${escapeHtml(found)}</a>`
    index = at + found.length
  }
  return out + escapeHtml(line.slice(index))
}

function renderBlock(block: Block): string {
  const fixed = preformatted(block.lines)
  const body = (fixed ? block.lines : reflow(block.lines)).map(linkify)

  let html = fixed
    ? `<pre class="mk-pre">${body.join('\n')}</pre>`
    : `<p>${body.join('<br>')}</p>`

  // Nest the quote wrappers so a reply to a reply indents twice, as it should.
  for (let depth = 0; depth < block.depth; depth++) html = `<blockquote>${html}</blockquote>`
  return html
}

/**
 * Merge neighbouring quote wrappers so a multi-paragraph quotation is one bar
 * down the side rather than one bar per paragraph. Repeats until stable, so
 * nested quotations collapse at every level.
 */
function mergeQuotes(html: string): string {
  let out = html
  for (;;) {
    const next = out.replace(/<\/blockquote><blockquote>/g, '')
    if (next === out) return out
    out = next
  }
}

export function textToHtml(text: string): string {
  // Non-breaking spaces arrive from senders who pasted out of a browser, and
  // they defeat every width and wrapping test above.
  const normalised = text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
  const body = mergeQuotes(blocks(normalised).map(renderBlock).join(''))
  // The wrapper keeps the reading styles off HTML mail, which brings its own.
  return `<div class="mk-text">${body}</div>`
}
