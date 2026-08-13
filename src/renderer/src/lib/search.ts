import type { MailFolder } from '../../../shared/types'

export interface SearchToken {
  /** The raw text as it appears in the query, e.g. `from:mira` or `"status update"`. */
  raw: string
  /** Operator name when the token is scoped, e.g. `from`. */
  operator?: string
  /** The value without the operator or surrounding quotes. */
  value: string
  /** True when the user wrapped it in quotes. */
  phrase: boolean
}

const OPERATORS = [
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
    const match = raw.match(/^([a-zA-Z_]+):(.*)$/)
    if (match && OPERATORS.includes(match[1].toLowerCase())) {
      const value = match[2].replace(/^"(.*)"$/, '$1')
      tokens.push({ raw, operator: match[1].toLowerCase(), value, phrase: /^".*"$/.test(match[2]) })
      return
    }
    const phrase = /^".*"$/.test(raw)
    tokens.push({ raw, value: raw.replace(/^"(.*)"$/, '$1'), phrase })
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
  return tokens
}

export function detokenize(tokens: SearchToken[]): string {
  return tokens.map((t) => t.raw).join(' ')
}

/** Terms that should be highlighted in the result rows. */
export function highlightTerms(tokens: SearchToken[]): string[] {
  return tokens
    .filter((t) => !t.operator || ['from', 'to', 'cc', 'subject'].includes(t.operator))
    .map((t) => t.value.trim())
    .filter((v) => v.length > 1)
}

export interface Suggestion {
  /** Query text this suggestion produces. */
  query: string
  label: string
  detail: string
  kind: 'term' | 'operator' | 'label'
}

/**
 * Offer scoped refinements for the word being typed. Superhuman-ish: you type a
 * word, and it shows you the sharper searches you probably meant.
 */
export function suggestions(query: string, labels: MailFolder[]): Suggestion[] {
  const tokens = tokenize(query)
  const last = tokens[tokens.length - 1]
  if (!last || last.operator || last.value.length < 2) return []

  const prefix = detokenize(tokens.slice(0, -1))
  const withPrefix = (text: string): string => (prefix ? `${prefix} ${text}` : text)
  const term = last.value
  const quoted = /\s/.test(term) ? `"${term}"` : term

  const out: Suggestion[] = [
    {
      query: withPrefix(quoted),
      label: term,
      detail: 'anywhere in the message',
      kind: 'term'
    },
    {
      query: withPrefix(`from:${quoted}`),
      label: `from: ${term}`,
      detail: 'sender matches',
      kind: 'operator'
    },
    {
      query: withPrefix(`subject:${quoted}`),
      label: `subject: ${term}`,
      detail: 'subject line matches',
      kind: 'operator'
    }
  ]

  for (const label of labels) {
    if (!label.path.toLowerCase().includes(term.toLowerCase())) continue
    out.push({
      query: withPrefix(`label:${label.path.includes(' ') ? `"${label.path}"` : label.path}`),
      label: `label: ${label.path}`,
      detail: 'in this label',
      kind: 'label'
    })
    if (out.length > 7) break
  }

  return out
}

export interface HighlightPart {
  text: string
  hit: boolean
}

/** Split a string into alternating plain / matched runs, for <mark> rendering. */
export function highlight(text: string, terms: string[]): HighlightPart[] {
  if (terms.length === 0 || !text) return [{ text, hit: false }]
  const escaped = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  if (escaped.length === 0) return [{ text, hit: false }]

  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts: HighlightPart[] = []
  let index = 0
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0
    if (at > index) parts.push({ text: text.slice(index, at), hit: false })
    parts.push({ text: match[0], hit: true })
    index = at + match[0].length
  }
  if (index < text.length) parts.push({ text: text.slice(index), hit: false })
  return parts
}
