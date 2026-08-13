import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { MailAccount } from '../../../shared/types'
import { api, call } from '../lib/api'
import { isValidEmail, parseRecipients } from '../lib/format'
import { FORMAT_HINTS, toHtml, toPlain, type BodyFormat } from '../lib/compose-format'
import { useToast } from '../lib/toast'
import { EmailFrame } from './EmailFrame'
import { RecipientField } from './RecipientField'
import { IconCode, IconEye, IconMarkdown, IconSend, IconText, IconX } from './Icons'

export interface ComposeInit {
  to?: string
  cc?: string
  subject?: string
  body?: string
  /** Original message, appended below the cursor as a quote. */
  quotedHtml?: string
  inReplyTo?: string
  references?: string
  threadId?: string
  replySourceId?: string
}

interface Props {
  account: MailAccount
  init: ComposeInit
  onClose: () => void
  onSent: () => void
}

const FORMATS: { id: BodyFormat; name: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: 'markdown', name: 'Markdown', icon: IconMarkdown },
  { id: 'html', name: 'HTML', icon: IconCode },
  { id: 'plain', name: 'Plain', icon: IconText }
]

export function Compose({ account, init, onClose, onSent }: Props): JSX.Element {
  const { notify, fail } = useToast()
  const [to, setTo] = useState(init.to ?? '')
  const [cc, setCc] = useState(init.cc ?? '')
  const [bcc, setBcc] = useState('')
  const [showExtra, setShowExtra] = useState(Boolean(init.cc))
  const [subject, setSubject] = useState(init.subject ?? '')
  const [body, setBody] = useState(init.body ?? '')
  const [format, setFormat] = useState<BodyFormat>('markdown')
  const [preview, setPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (init.to) bodyRef.current?.focus()
  }, [init.to])

  const previewHtml = useMemo(
    () => (preview ? toHtml(body, format) + (init.quotedHtml ? `<br><br>${init.quotedHtml}` : '') : ''),
    [preview, body, format, init.quotedHtml]
  )

  /** Wrap the selection, so ctrl+b / ctrl+i behave like people expect. */
  function wrapSelection(before: string, after = before): void {
    const el = bodyRef.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end, value } = el
    const selected = value.slice(start, end)
    const next = value.slice(0, start) + before + selected + after + value.slice(end)
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + before.length, end + before.length)
    })
  }

  async function send(): Promise<void> {
    setError(null)
    const recipients = parseRecipients(to)
    if (recipients.length === 0) {
      setError('Add at least one recipient.')
      return
    }
    const invalid = recipients.find((r) => !isValidEmail(r.email))
    if (invalid) {
      setError(`"${invalid.email}" is not a valid address.`)
      return
    }

    setSending(true)
    try {
      const html = toHtml(body, format) + (init.quotedHtml ? `<br><br>${init.quotedHtml}` : '')
      await call(
        api.mail.send({
          accountId: account.id,
          to: recipients,
          cc: parseRecipients(cc),
          bcc: parseRecipients(bcc),
          subject: subject.trim() || '(no subject)',
          body: html,
          text: toPlain(body, format),
          inReplyTo: init.inReplyTo,
          references: init.references,
          threadId: init.threadId,
          replySourceId: init.replySourceId
        })
      )
      notify('Message sent', 'ok')
      onSent()
    } catch (err) {
      fail(err)
      setError(err instanceof Error ? err.message : String(err))
      setSending(false)
    }
  }

  return (
    <div
      className="overlay overlay--center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="panel compose"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            void send()
          }
          if ((e.ctrlKey || e.metaKey) && format === 'markdown') {
            const key = e.key.toLowerCase()
            if (key === 'b') {
              e.preventDefault()
              wrapSelection('**')
            } else if (key === 'i') {
              e.preventDefault()
              wrapSelection('_')
            } else if (key === 'e') {
              e.preventDefault()
              wrapSelection('`')
            }
          }
        }}
      >
        <div className="panel__head">
          <h3>New message</h3>
          <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>from {account.email}</span>
          <div style={{ flex: 1 }} />
          <button className="iconbtn" onClick={onClose} title="Close (esc)">
            <IconX size={15} />
          </button>
        </div>

        <div className="compose__fields">
          <RecipientField
            id="to"
            label="To"
            accountId={account.id}
            value={to}
            onChange={setTo}
            autoFocus={!init.to}
            placeholder="Start typing a name or address…"
          >
            {!showExtra && (
              <button className="link-btn" onClick={() => setShowExtra(true)}>
                Cc/Bcc
              </button>
            )}
          </RecipientField>

          {showExtra && (
            <>
              <RecipientField
                id="cc"
                label="Cc"
                accountId={account.id}
                value={cc}
                onChange={setCc}
              />
              <RecipientField
                id="bcc"
                label="Bcc"
                accountId={account.id}
                value={bcc}
                onChange={setBcc}
              />
            </>
          )}

          <div className="compose__row">
            <label htmlFor="subject">Subject</label>
            <input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
            />
          </div>
        </div>

        <div className="compose__toolbar">
          <div className="segmented">
            {FORMATS.map(({ id, name, icon: Icon }) => (
              <button
                key={id}
                className={`segmented__btn${format === id ? ' is-on' : ''}`}
                onClick={() => setFormat(id)}
                title={`Compose in ${name}`}
              >
                <Icon size={13} />
                {name}
              </button>
            ))}
          </div>
          <span className="compose__hint">{FORMAT_HINTS[format]}</span>
          <div style={{ flex: 1 }} />
          <button
            className={`iconbtn${preview ? ' is-on-accent' : ''}`}
            onClick={() => setPreview((p) => !p)}
            title="Toggle preview"
          >
            <IconEye size={15} />
          </button>
        </div>

        <div className={`compose__body${preview ? ' is-split' : ''}`}>
          <textarea
            ref={bodyRef}
            value={body}
            spellCheck
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              format === 'html' ? '<p>Write HTML…</p>' : 'Write your message…'
            }
          />
          {preview && (
            <div className="compose__preview">
              <div className="compose__preview-label">Preview</div>
              <div className="compose__paper">
                <EmailFrame html={previewHtml} allowRemote trusted surface="light" />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '0 18px 12px' }}>
            <div className="error-line">{error}</div>
          </div>
        )}

        <div className="panel__foot">
          <button className="btn btn--primary" disabled={sending} onClick={() => void send()}>
            {sending ? <span className="spinner" /> : <IconSend size={14} />}
            {sending ? 'Sending…' : 'Send'}
          </button>
          <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>
            <span className="kbd">ctrl</span> <span className="kbd">↵</span> to send
          </span>
          <div style={{ flex: 1 }} />
          {init.quotedHtml && (
            <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>Original quoted below</span>
          )}
        </div>
      </div>
    </div>
  )
}
