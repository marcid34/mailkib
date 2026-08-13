import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { Contact, MailAccount } from '../../../shared/types'
import { api, call } from '../lib/api'
import { colorFor, initials } from '../lib/format'
import { useToast } from '../lib/toast'
import { ContextMenu, useContextMenu } from './ContextMenu'
import { Prompt, type PromptSpec } from './Prompt'
import { IconEye, IconEyeOff, IconPencil, IconSearch, IconTrash, IconX } from './Icons'

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
  const menu = useContextMenu()
  const [query, setQuery] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [cursor, setCursor] = useState(0)
  const [loading, setLoading] = useState(true)
  const [prompt, setPrompt] = useState<PromptSpec | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(async () => {
    try {
      setContacts(await call(api.mail.contacts(account.id, query, 400, true)))
    } catch (error) {
      fail(error)
    } finally {
      setLoading(false)
    }
  }, [account.id, query, fail])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => setCursor(0), [query])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  function choose(contact: Contact): void {
    onClose()
    onCompose(contact.name ? `${contact.name} <${contact.email}>` : contact.email)
  }

  const setHidden = useCallback(
    async (contact: Contact, hidden: boolean) => {
      try {
        await call(api.mail.updateContact(account.id, contact.email, { hidden }))
        notify(
          hidden ? `${contact.email} hidden from suggestions` : `${contact.email} restored`,
          'ok'
        )
        await reload()
      } catch (error) {
        fail(error)
      }
    },
    [account.id, notify, reload, fail]
  )

  const rename = useCallback(
    (contact: Contact) => {
      setPrompt({
        title: 'Rename contact',
        label: 'Display name',
        initial: contact.name ?? '',
        placeholder: contact.email.split('@')[0],
        hint: 'Only affects how they appear in MailKib.',
        confirmLabel: 'Save',
        onSubmit: (value) => {
          void (async () => {
            try {
              await call(api.mail.updateContact(account.id, contact.email, { name: value }))
              await reload()
            } catch (error) {
              fail(error)
            }
          })()
        }
      })
    },
    [account.id, reload, fail]
  )

  const forget = useCallback(
    async (contact: Contact) => {
      try {
        await call(api.mail.deleteContact(account.id, contact.email))
        notify('Contact forgotten — it returns if they appear in your mail again')
        await reload()
      } catch (error) {
        fail(error)
      }
    },
    [account.id, notify, reload, fail]
  )

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
          if (menu.state || prompt) return
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCursor((c) => Math.min(c + 1, contacts.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
          } else if (e.key === 'Enter' && contacts[cursor]) {
            e.preventDefault()
            choose(contacts[cursor])
          }
        }}
      >
        <div className="panel__head">
          <h3>Address book</h3>
          <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
            {loading ? 'reading…' : `${contacts.length} people`}
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
          {contacts.length === 0 && !loading && (
            <div className="list__empty" style={{ padding: '32px 20px' }}>
              <div>
                {query
                  ? 'Nobody matched that.'
                  : 'No contacts yet — they are learned from the mail you read and send.'}
              </div>
            </div>
          )}

          {contacts.map((contact, index) => (
            <div
              key={contact.email}
              data-index={index}
              className={[
                'contact',
                index === cursor ? 'is-cursor' : '',
                contact.hidden ? 'is-hidden' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseMove={() => setCursor(index)}
              onClick={() => choose(contact)}
              onContextMenu={(e) =>
                menu.open(e, [
                  { label: 'Compose to', run: () => choose(contact) },
                  {
                    label: 'Copy address',
                    run: () => {
                      void navigator.clipboard.writeText(contact.email)
                      notify('Address copied', 'ok')
                    }
                  },
                  {},
                  { label: 'Rename…', icon: <IconPencil size={13} />, run: () => rename(contact) },
                  contact.hidden
                    ? {
                        label: 'Show in suggestions',
                        icon: <IconEye size={13} />,
                        run: () => void setHidden(contact, false)
                      }
                    : {
                        label: 'Hide from suggestions',
                        icon: <IconEyeOff size={13} />,
                        run: () => void setHidden(contact, true)
                      },
                  {},
                  {
                    label: 'Forget contact',
                    icon: <IconTrash size={13} />,
                    danger: true,
                    run: () => void forget(contact)
                  }
                ])
              }
            >
              <span
                className="avatar"
                style={{ width: 28, height: 28, background: colorFor(contact.email), fontSize: 11 }}
              >
                {initials(contact.name || contact.email)}
              </span>
              <span className="contact__text">
                <span className="contact__name">{contact.name || contact.email.split('@')[0]}</span>
                <span className="contact__email">{contact.email}</span>
              </span>
              <span className="contact__meta">
                {contact.hidden && <span className="contact__tag">hidden</span>}
                {contact.sent > 0 && <span className="contact__sent">{contact.sent} sent</span>}
                <span>{lastSeenLabel(contact.lastSeen)}</span>
              </span>
              <button
                className="contact__action"
                title={contact.hidden ? 'Show in suggestions' : 'Hide from suggestions'}
                onClick={(e) => {
                  e.stopPropagation()
                  void setHidden(contact, !contact.hidden)
                }}
              >
                {contact.hidden ? <IconEye size={14} /> : <IconEyeOff size={14} />}
              </button>
            </div>
          ))}
        </div>

        <div className="panel__foot">
          <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>
            <span className="kbd">↵</span> compose · right-click to rename, hide or forget ·
            hidden people never appear in autocomplete
          </span>
        </div>
      </div>

      {prompt && <Prompt spec={prompt} onClose={() => setPrompt(null)} />}
      <ContextMenu state={menu.state} onClose={menu.close} />
    </div>
  )
}
