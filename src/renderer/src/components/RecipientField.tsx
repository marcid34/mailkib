import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import type { Contact } from '../../../shared/types'
import { api, call } from '../lib/api'
import { colorFor, initials } from '../lib/format'

interface Props {
  id: string
  label: string
  accountId: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  children?: JSX.Element | false
}

/** The address currently being typed: everything after the last separator. */
function activeFragment(value: string): { prefix: string; term: string } {
  const cut = Math.max(value.lastIndexOf(','), value.lastIndexOf(';'))
  return { prefix: value.slice(0, cut + 1), term: value.slice(cut + 1).trim() }
}

export function RecipientField({
  id,
  label,
  accountId,
  value,
  onChange,
  placeholder,
  autoFocus,
  children
}: Props): JSX.Element {
  const [matches, setMatches] = useState<Contact[]>([])
  const [cursor, setCursor] = useState(0)
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const { term } = activeFragment(value)

  useEffect(() => {
    if (term.length < 1 || term.includes('<')) {
      setMatches([])
      return
    }
    let live = true
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const found = await call(api.mail.contacts(accountId, term, 6))
          if (live) {
            setMatches(found)
            setCursor(0)
          }
        } catch {
          if (live) setMatches([])
        }
      })()
    }, 90)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [term, accountId])

  const showing = open && matches.length > 0 && term.length > 0

  function accept(contact: Contact): void {
    const { prefix } = activeFragment(value)
    const formatted = contact.name ? `${contact.name} <${contact.email}>` : contact.email
    onChange(`${prefix ? `${prefix} ` : ''}${formatted}, `)
    setMatches([])
    input.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (!showing) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((c) => (c + 1) % matches.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((c) => (c - 1 + matches.length) % matches.length)
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      // Stop Enter here so it completes the address instead of sending.
      event.stopPropagation()
      accept(matches[cursor])
    } else if (event.key === 'Escape') {
      event.stopPropagation()
      setMatches([])
    }
  }

  return (
    <div className="compose__row compose__row--autocomplete">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        ref={input}
        value={value}
        autoFocus={autoFocus}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 130)}
        onKeyDown={onKeyDown}
      />
      {children}

      {showing && (
        <div className="autocomplete">
          {matches.map((contact, index) => (
            <button
              key={contact.email}
              className={`autocomplete__item${index === cursor ? ' is-cursor' : ''}`}
              onMouseMove={() => setCursor(index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => accept(contact)}
            >
              <span
                className="avatar"
                style={{ width: 22, height: 22, background: colorFor(contact.email), fontSize: 10 }}
              >
                {initials(contact.name || contact.email)}
              </span>
              <span className="autocomplete__name">
                {contact.name || contact.email.split('@')[0]}
              </span>
              <span className="autocomplete__email">{contact.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
