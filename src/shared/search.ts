import type { MessageSummary } from './types'

/**
 * One search grammar, used by both sides: the renderer parses what you type to
 * draw chips and suggestions, and the main process runs the same parse over the
 * local cache. When the two disagree the list flickers between two different
 * ideas of what you asked for, so they share this file rather than each keeping
 * their own tokenizer.
 */

export interface SearchToken {
  /** The raw text as it appears in the query, e.g. `from:mira` or `"status update"`. */
  raw: string
  /** Operator name when the token is scoped, e.g. `from`. */
  operator?: string
  /** The value without the operator, the leading `-`, or surrounding quotes. */
  value: string
  /** True when the user wrapped it in quotes. */
  phrase: boolean
  /** True when the term was prefixed with `-`, meaning "must not match". */
  negated: boolean
}

export const OPERATORS = [
  'from',
  'to',
  'cc',
  'subject',
  'label',
  'in',
  'has',
  'is',
  'before',
  'after',
  'older_than',
  'newer_than',
  'filename'
]

const unquote = (text: string): string => text.replace(/^"(.*)"$/, '$1')

/**
 * Split a query the way a mail search bar should: whitespace separates terms,
 * quotes hold a phrase together, and `op:value` stays attached to its operator.
 */
export function tokenize(query: string): SearchToken[] {
  const tokens: SearchToken[] = []
  let current = ''
  let quoted = false

  const push = (): void => {
    const raw = current.trim()
    current = ''
    if (!raw) return

    const negated = raw.startsWith('-') && raw.length > 1
    const body = negated ? raw.slice(1) : raw
    const match = body.match(/^([a-zA-Z_]+):(.*)$/)

    if (match && OPERATORS.includes(match[1].toLowerCase())) {
      tokens.push({
        raw,
        operator: match[1].toLowerCase(),
        value: unquote(match[2]),
        phrase: /^".*"$/.test(match[2]),
        negated
      })
      return
    }
    tokens.push({ raw, value: unquote(body), phrase: /^".*"$/.test(body), negated })
  }

  for (const ch of query) {
    if (ch === '"') {
      quoted = !quoted
      current += ch
      continue
    }
    if (/\s/.test(ch) && !quoted) {
      push()
      continue
    }
    current += ch
  }
  push()
  return tokens.filter((t) => t.value.length > 0 || Boolean(t.operator))
}

export function detokenize(tokens: SearchToken[]): string {
  return tokens.map((t) => t.raw).join(' ')
}

/** Terms that should be highlighted in the result rows. */
export function highlightTerms(tokens: SearchToken[]): string[] {
  return tokens
    .filter((t) => !t.negated)
    .filter((t) => !t.operator || ['from', 'to', 'cc', 'subject'].includes(t.operator))
    .map((t) => t.value.trim())
    .filter((v) => v.length > 1)
}

/* ------------------------------------------------------------------ */
/* matching                                                            */
/* ------------------------------------------------------------------ */

/**
 * Does `needle` start a word inside `haystack`? Both must already be lowercase.
 *
 * This is the rule mail search actually follows: typing `vox` finds Voxtelesys,
 * but typing `eles` does not -- a plain substring test would match the middle of
 * any word and fill the list with noise, while an exact-word test would fail the
 * half-typed searches people actually run.
 */
export function matchesWordPrefix(haystack: string, needle: string): boolean {
  if (!needle) return true
  for (let from = 0; from <= haystack.length - needle.length; ) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) return false
    const before = at === 0 ? '' : haystack[at - 1]
    if (!before || !/[a-z0-9]/.test(before)) return true
    from = at + 1
  }
  return false
}

/** Everything the local matcher needs beyond the summary itself. */
export interface MatchContext {
  /** System folders this message sits in, as far as the cache knows. */
  folders: Set<string>
  /** Wall clock used for relative dates, so callers can make this testable. */
  now: number
}

const person = (list: { name?: string; email: string }[]): string =>
  list.map((r) => `${r.name ?? ''} ${r.email}`).join(' ').toLowerCase()

/** `2024/03/07`, `2024-03-07`, or `2024/3/7`. */
function parseDate(value: string): number | null {
  const match = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (!match) return null
  const at = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(at) ? null : at
}

/** `3d`, `2w`, `6m`, `1y` -- Gmail's relative age syntax. */
function parseAge(value: string): number | null {
  const match = value.match(/^(\d+)\s*([dwmy])$/i)
  if (!match) return null
  const span = { d: 86_400_000, w: 604_800_000, m: 2_592_000_000, y: 31_536_000_000 }
  return Number(match[1]) * span[match[2].toLowerCase() as 'd' | 'w' | 'm' | 'y']
}

/**
 * Can this token be answered from a cached summary at all? `label:` needs the
 * label's name, which the cache stores by provider id, and `filename:` needs the
 * body. Rather than guess and show wrong rows, the cache declines these and
 * leaves them to the server.
 */
export function locallyAnswerable(token: SearchToken): boolean {
  return token.operator !== 'label' && token.operator !== 'filename'
}

/**
 * Is the whole query something the cache can answer faithfully?
 *
 * A one or two letter term starts a word in almost every message, so answering
 * it locally means answering "everything" -- which buries the provider's real
 * hits under the entire mailbox. Below three characters the reader is still
 * typing, so the cache stays quiet and lets the server speak.
 */
export function locallyAnswerableQuery(tokens: SearchToken[]): boolean {
  if (tokens.length === 0 || !tokens.every(locallyAnswerable)) return false
  return !tokens.some((t) => !t.operator && !t.negated && t.value.length < 3)
}

function matchesToken(
  message: MessageSummary,
  token: SearchToken,
  context: MatchContext
): boolean {
  const value = token.value.toLowerCase()

  switch (token.operator) {
    case 'from':
      return matchesWordPrefix(person([message.from]), value)
    case 'to':
    case 'cc':
      // A summary carries no cc list, so `cc:` falls back to the recipients we
      // do hold rather than dropping every row on the floor.
      return matchesWordPrefix(person(message.to), value)
    case 'subject':
      return matchesWordPrefix(message.subject.toLowerCase(), value)
    case 'in':
      return context.folders.has(value)
    case 'has':
      return value === 'attachment' ? Boolean(message.hasAttachments) : false
    case 'is':
      if (value === 'unread') return Boolean(message.unread)
      if (value === 'read') return !message.unread
      if (value === 'starred') return Boolean(message.starred)
      return false
    case 'before': {
      const at = parseDate(value)
      return at === null ? false : message.date < at
    }
    case 'after': {
      const at = parseDate(value)
      return at === null ? false : message.date > at
    }
    case 'older_than': {
      const span = parseAge(value)
      return span === null ? false : message.date < context.now - span
    }
    case 'newer_than': {
      const span = parseAge(value)
      return span === null ? false : message.date > context.now - span
    }
    default: {
      const haystack = [
        message.subject,
        message.snippet,
        message.from.name ?? '',
        message.from.email,
        ...message.to.map((r) => `${r.name ?? ''} ${r.email}`)
      ]
        .join(' ')
        .toLowerCase()
      return matchesWordPrefix(haystack, value)
    }
  }
}

/** Terms are ANDed, `-term` excludes. */
export function matchesQuery(
  message: MessageSummary,
  tokens: SearchToken[],
  context: MatchContext
): boolean {
  for (const token of tokens) {
    if (!locallyAnswerable(token)) return false
    const hit = matchesToken(message, token, context)
    if (token.negated ? hit : !hit) return false
  }
  return true
}
