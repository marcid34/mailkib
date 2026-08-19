import { useEffect, useMemo, useRef, useState, type DragEvent, type JSX } from 'react'
import type { DraftAttachment, MailAccount } from '../../../shared/types'
import { api, call } from '../lib/api'
import { formatBytes, isValidEmail, parseRecipients } from '../lib/format'
import { FORMAT_HINTS, toHtml, toPlain, type BodyFormat } from '../lib/compose-format'
import { useToast } from '../lib/toast'
import { EmailFrame } from './EmailFrame'
import { RecipientField } from './RecipientField'
import { IconCode, IconEye, IconMarkdown, IconPaperclip, IconSend, IconText, IconX } from './Icons'

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
  /** Files already staged for this draft -- what a forward carries over. */
  attachments?: DraftAttachment[]
}

/** Roughly what providers accept once base64 has added its third. */
const SIZE_LIMIT = 24 * 1024 * 1024

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
  const [attachments, setAttachments] = useState<DraftAttachment[]>(init.attachments ?? [])
  const [dragging, setDragging] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (init.to) bodyRef.current?.focus()
  }, [init.to])

  const attached = useRef(attachments)
  attached.current = attachments
  const sent = useRef(false)

  // Staged files are held by the main process, so a draft that is abandoned --
  // closed, dismissed with escape, or thrown away by the window -- has to say so
  // or its bytes sit in the temp directory for the rest of the session.
  useEffect(
    () => () => {
      if (sent.current) return
      const tokens = attached.current.map((a) => a.token)
      if (tokens.length > 0) void api.mail.releaseAttachments(tokens)
    },
    []
  )

  const totalSize = attachments.reduce((sum, a) => sum + a.size, 0)
  const tooLarge = totalSize > SIZE_LIMIT

  function add(files: DraftAttachment[]): void {
    if (files.length === 0) return
    setError(null)
    setAttachments((prev) => [...prev, ...files])
  }

  async function pick(): Promise<void> {
    try {
      add(await call(api.mail.pickAttachments()))
    } catch (err) {
      fail(err)
    }
  }

  function remove(token: string): void {
    setAttachments((prev) => prev.filter((a) => a.token !== token))
    void api.mail.releaseAttachments([token])
  }

  async function onDrop(event: DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault()
    setDragging(false)
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => api.app.pathForFile(file))
      .filter((p): p is string => Boolean(p))
    if (paths.length === 0) return
    try {
      add(await call(api.mail.stagePaths(paths)))
    } catch (err) {
      fail(err)
    }
  }

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
    if (tooLarge) {
      setError(`Those attachments come to ${formatBytes(totalSize)}. The limit is about 25 MB.`)
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
          replySourceId: init.replySourceId,
          attachments
        })
      )
      // The main process drops them once they are on the wire; do not ask it to
      // release them a second time when this component unmounts.
      sent.current = true
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
        className={`panel compose${dragging ? ' is-dropping' : ''}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDragging(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(e) => void onDrop(e)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            void send()
          }
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
            e.preventDefault()
            if (!sending) void pick()
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
            className="iconbtn"
            disabled={sending}
            onClick={() => void pick()}
            title="Attach files (ctrl+shift+A)"
          >
            <IconPaperclip size={15} />
          </button>
          <button
            className={`iconbtn${preview ? ' is-on-accent' : ''}`}
            onClick={() => setPreview((p) => !p)}
            title="Toggle preview"
          >
            <IconEye size={15} />
          </button>
        </div>

        <div className={`compose__body${preview ? ' is-split' : ''}`}>
          {dragging && <div className="compose__drop">Drop files to attach</div>}
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

        {attachments.length > 0 && (
          <div className="compose__files">
            {attachments.map((file) => (
              <span
                key={file.token}
                className="attachment attachment--staged"
                title={`${file.filename} — ${formatBytes(file.size) || '0 B'}`}
              >
                <IconPaperclip size={13} />
                <span className="attachment__name">{file.filename}</span>
                <span className="attachment__size">{formatBytes(file.size)}</span>
                <button
                  className="attachment__remove"
                  disabled={sending}
                  onClick={() => remove(file.token)}
                  title={`Remove ${file.filename}`}
                >
                  <IconX size={12} />
                </button>
              </span>
            ))}
            <span className={`compose__files-total${tooLarge ? ' is-over' : ''}`}>
              {attachments.length} file{attachments.length === 1 ? '' : 's'} ·{' '}
              {formatBytes(totalSize) || '0 B'}
              {tooLarge && ' — over the ~25 MB most providers accept'}
            </span>
          </div>
        )}

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
            <span className="kbd">ctrl</span> <span className="kbd">↵</span> to send ·{' '}
            <span className="kbd">ctrl</span> <span className="kbd">shift</span>{' '}
            <span className="kbd">a</span> to attach
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
