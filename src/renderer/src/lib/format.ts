import type { Recipient } from '../../../shared/types'

const DAY = 86_400_000

export function relativeTime(ts: number): string {
  const now = new Date()
  const date = new Date(ts)
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  if (ts >= midnight) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  if (ts >= midnight - DAY) return 'Yesterday'
  if (ts >= midnight - 6 * DAY) return date.toLocaleDateString(undefined, { weekday: 'short' })
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

export function fullTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function displayName(r: Recipient | undefined): string {
  if (!r) return 'Unknown'
  return r.name?.trim() || r.email.split('@')[0] || r.email || 'Unknown'
}

export function initials(value: string): string {
  // For a bare address, the local part is the identifying bit -- "kib.ssbu@gmail.com"
  // should read as KS, not as K + the domain's initial.
  const source = value.includes('@') && !value.includes(' ') ? value.split('@')[0] : value
  const clean = source.replace(/[^\p{L}\p{N} ]/gu, ' ').trim()
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AVATAR_COLORS = [
  '#7aa2f7',
  '#bb9af7',
  '#9ece6a',
  '#e0af68',
  '#7dcfff',
  '#f7768e',
  '#ff9e64',
  '#2ac3de'
]

export function colorFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function formatBytes(bytes: number): string {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** Loose address parsing for the compose fields: commas or semicolons. */
export function parseRecipients(input: string): Recipient[] {
  return input
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const angle = entry.match(/^(.*)<([^>]+)>$/)
      if (angle) return { name: angle[1].trim().replace(/^"|"$/g, '') || undefined, email: angle[2].trim() }
      return { email: entry }
    })
}

export function formatRecipients(list: Recipient[]): string {
  return list.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)).join(', ')
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}
