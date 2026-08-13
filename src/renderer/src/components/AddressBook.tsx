import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { Contact, MailAccount } from '../../../shared/types'
import { api, call } from '../lib/api'
import { colorFor, initials } from '../lib/format'
import { useToast } from '../lib/toast'
import { IconSearch, IconX } from './Icons'

interface Props {
  account: MailAccount
  onClose: () => void
  onCompose: (to: string) => void
}

function lastSeenLabel(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export function AddressBook({ account, onClose, onCompose }: Props): JSX.Element {
  const { fail, notify } = useToast()
  const [query, setQuery] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [cursor, setCursor] = useState(0)
  const [loading, setLoading] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const found = await call(api.mail.contacts(account.id, query, 300))
        if (live) setContacts(found)
      } catch (error) {
        if (live) fail(error)
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => {
      live = false
    }
  }, [account.id, query, fail])

  useEffect(() => setCursor(0), [query])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const grouped = useMemo(() => contacts, [contacts])

  function choose(contact: Contact): void {
    onClose()
    onCompose(contact.name ? `${contact.name} <${contact.email}>` : contact.email)
  }

  return (
    <div
      className="overlay overlay--center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="panel addressbook"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCursor((c) => Math.min(c + 1, grouped.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
          } else if (e.key === 'Enter' && grouped[cursor]) {
            e.preventDefault()
            choose(grouped[cursor])
          }
        }}
      >
        <div className="panel__head">
          <h3>Address book</h3>
          <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
            {loading ? 'reading…' : `${grouped.length} people`}
          </span>
          <div style={{ flex: 1 }} />
          <button className="iconbtn" onClick={onClose}>
            <IconX size={15} />
          </button>
        </div>

        <div className="palette__input">
          <IconSearch size={15} />
          <input
            autoFocus
            value={query}
            spellCheck={false}
            placeholder="Search people…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="addressbook__list" ref={listRef}>
          {grouped.length === 0 && !loading && (
            <div className="list__empty" style={{ padding: '32px 20px' }}>
              <div>
                {query
                  ? 'Nobody matched that.'
                  : 'No contacts yet — they are learned from the mail you read and send.'}
              </div>
            </div>
          )}

          {grouped.map((contact, index) => (
            <button
              key={contact.email}
              data-index={index}
              className={`contact${index === cursor ? ' is-cursor' : ''}`}
              onMouseMove={() => setCursor(index)}
              onClick={() => choose(contact)}
              onContextMenu={(e) => {
                e.preventDefault()
                void navigator.clipboard.writeText(contact.email)
                notify('Address copied', 'ok')
              }}
            >
              <span
                className="avatar"
                style={{
                  width: 28,
                  height: 28,
                  background: colorFor(contact.email),
                  fontSize: 11
                }}
              >
                {initials(contact.name || contact.email)}
              </span>
              <span className="contact__text">
                <span className="contact__name">{contact.name || contact.email.split('@')[0]}</span>
                <span className="contact__email">{contact.email}</span>
              </span>
              <span className="contact__meta">
                {contact.sent > 0 && <span className="contact__sent">{contact.sent} sent</span>}
                <span>{lastSeenLabel(contact.lastSeen)}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="panel__foot">
          <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>
            <span className="kbd">↵</span> compose · right-click to copy the address
          </span>
        </div>
      </div>
    </div>
  )
}
