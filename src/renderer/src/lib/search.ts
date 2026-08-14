import type { MailFolder } from '../../../shared/types'
import { detokenize, tokenize } from '../../../shared/search'

// The grammar lives in shared/ so the cache in the main process parses a query
// exactly the way the box that typed it does.
export {
  detokenize,
  highlightTerms,
  tokenize,
  type SearchToken
} from '../../../shared/search'

/**
 * How wide the search box casts. Tab walks these in order, starting narrow:
 * the folder you are standing in, then every folder of that account, then
 * every folder of every account.
 */
export type SearchScope = 'folder' | 'mailbox' | 'everywhere'

export const SEARCH_SCOPES: SearchScope[] = ['folder', 'mailbox', 'everywhere']

/**
 * Step through the scopes, wrapping at both ends. `available` lets a single
 * account drop the third stop, which would otherwise repeat the second.
 */
export function cycleScope(
  scope: SearchScope,
  step = 1,
  available: SearchScope[] = SEARCH_SCOPES
): SearchScope {
  const scopes = available.length > 0 ? available : SEARCH_SCOPES
  const at = scopes.indexOf(scope)
  if (at < 0) return scopes[0]
  return scopes[(at + step + scopes.length) % scopes.length]
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
