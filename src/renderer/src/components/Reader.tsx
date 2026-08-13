import { useEffect, useMemo, useState, type JSX } from 'react'
import type { MailAccount, MessageFull, ThreadView } from '../../../shared/types'
import { api, call } from '../lib/api'
import { colorFor, displayName, formatBytes, fullTime, initials } from '../lib/format'
import { useToast } from '../lib/toast'
import { EmailFrame, hasRemoteImages } from './EmailFrame'
import {
  IconArchive,
  IconArrowLeft,
  IconEye,
  IconForward,
  IconMailOpen,
  IconPaperclip,
  IconReply,
  IconReplyAll,
  IconStar,
  IconTrash,
  Mark
} from './Icons'

export type ReplyMode = 'reply' | 'replyAll' | 'forward'

interface Props {
  account: MailAccount
  thread: ThreadView | null
  loading: boolean
  starred: boolean
  onClose: () => void
  onArchive: () => void
  onTrash: () => void
  onStar: () => void
  onUnread: () => void
  onReply: (mode: ReplyMode, message: MessageFull) => void
}

function MessageBody({
  account,
  message
}: {
  account: MailAccount
  message: MessageFull
}): JSX.Element {
  const { fail, notify } = useToast()
  const [showRemote, setShowRemote] = useState(false)
  const html = useMemo(
    () => message.html || `<pre>${escapeText(message.text ?? '')}</pre>`,
    [message.html, message.text]
  )
  const remote = useMemo(() => hasRemoteImages(html), [html])

  useEffect(() => setShowRemote(false), [message.id])

  async function download(attachmentId: string, filename: string, open: boolean): Promise<void> {
    try {
      const payload = { accountId: account.id, messageId: message.id, attachmentId, filename }
      if (open) {
        await call(api.mail.openAttachment(payload))
      } else {
        const saved = await call(api.mail.saveAttachment(payload))
        if (saved) notify(`Saved to ${saved}`, 'ok')
      }
    } catch (error) {
      fail(error)
    }
  }

  return (
    <div className="msg__body">
      {remote && !showRemote && (
        <div className="images-bar">
          <IconEye size={14} />
          <span>Remote images are blocked.</span>
          <button onClick={() => setShowRemote(true)}>Show images</button>
        </div>
      )}
      <EmailFrame html={html} allowRemote={showRemote} />

      {message.attachments.length > 0 && (
        <div className="attachments">
          {message.attachments.map((attachment) => (
            <button
              key={attachment.id}
              className="attachment"
              title={`${attachment.filename} — click to open, right-click to save`}
              onClick={() => void download(attachment.id, attachment.filename, true)}
              onContextMenu={(e) => {
                e.preventDefault()
                void download(attachment.id, attachment.filename, false)
              }}
            >
              <IconPaperclip size={13} />
              <span className="attachment__name">{attachment.filename}</span>
              <span className="attachment__size">{formatBytes(attachment.size)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
}

export function Reader({
  account,
  thread,
  loading,
  starred,
  onClose,
  onArchive,
  onTrash,
  onStar,
  onUnread,
  onReply
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!thread) return
    const open = new Set<string>()
    const last = thread.messages[thread.messages.length - 1]
    if (last) open.add(last.id)
    for (const message of thread.messages) if (message.unread) open.add(message.id)
    setExpanded(open)
  }, [thread])

  if (loading) {
    return (
      <section className="reader">
        <div className="reader__empty">
          <span className="spinner" />
        </div>
      </section>
    )
  }

  if (!thread) {
    return (
      <section className="reader">
        <div className="reader__empty">
          <Mark size={38} />
          <div>Select a conversation</div>
          <div style={{ fontSize: 11.5 }}>
            <span className="kbd">j</span> <span className="kbd">k</span> to move ·{' '}
            <span className="kbd">↵</span> to open
          </div>
        </div>
      </section>
    )
  }

  const latest = thread.messages[thread.messages.length - 1]

  return (
    <section className="reader">
      <div className="reader__bar">
        <button className="iconbtn" title="Back (u)" onClick={onClose}>
          <IconArrowLeft size={17} />
        </button>
        <div style={{ width: 6 }} />
        <button className="iconbtn" title="Archive (e)" onClick={onArchive}>
          <IconArchive size={16} />
        </button>
        <button className="iconbtn" title="Delete (#)" onClick={onTrash}>
          <IconTrash size={16} />
        </button>
        <button
          className={`iconbtn${starred ? ' is-on' : ''}`}
          title="Star (s)"
          onClick={onStar}
        >
          <IconStar size={16} filled={starred} />
        </button>
        <button className="iconbtn" title="Mark unread (shift+u)" onClick={onUnread}>
          <IconMailOpen size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <button className="iconbtn" title="Reply (r)" onClick={() => onReply('reply', latest)}>
          <IconReply size={16} />
        </button>
        <button
          className="iconbtn"
          title="Reply all (a)"
          onClick={() => onReply('replyAll', latest)}
        >
          <IconReplyAll size={16} />
        </button>
        <button className="iconbtn" title="Forward (f)" onClick={() => onReply('forward', latest)}>
          <IconForward size={16} />
        </button>
      </div>

      <div className="reader__scroll">
        <h1 className="reader__subject">{thread.subject}</h1>

        {thread.messages.map((message) => {
          const isOpen = expanded.has(message.id)
          const name = displayName(message.from)

          if (!isOpen) {
            return (
              <button
                key={message.id}
                className="msg__collapsed"
                onClick={() => setExpanded((s) => new Set(s).add(message.id))}
              >
                <span
                  className="avatar"
                  style={{ width: 22, height: 22, background: colorFor(message.from.email) }}
                >
                  {initials(name)}
                </span>
                <strong style={{ color: 'var(--fg-dim)', fontWeight: 550 }}>{name}</strong>
                <span className="snippet">{message.snippet}</span>
                <span>{fullTime(message.date).split(',').slice(0, 2).join(',')}</span>
              </button>
            )
          }

          return (
            <article key={message.id} className="msg">
              <header className="msg__head">
                <span
                  className="avatar"
                  style={{ width: 32, height: 32, background: colorFor(message.from.email), fontSize: 12 }}
                >
                  {initials(name)}
                </span>
                <div className="msg__who">
                  <div className="msg__from">
                    {name} <span className="msg__email">&lt;{message.from.email}&gt;</span>
                  </div>
                  <div className="msg__to">
                    to {message.to.map(displayName).join(', ') || '—'}
                    {message.cc.length > 0 && `, cc ${message.cc.map(displayName).join(', ')}`}
                  </div>
                </div>
                <div className="msg__date">{fullTime(message.date)}</div>
              </header>
              <MessageBody account={account} message={message} />
            </article>
          )
        })}

        <div className="reader__actions">
          <button className="btn" onClick={() => onReply('reply', latest)}>
            <IconReply size={14} /> Reply
          </button>
          <button className="btn" onClick={() => onReply('replyAll', latest)}>
            <IconReplyAll size={14} /> Reply all
          </button>
          <button className="btn" onClick={() => onReply('forward', latest)}>
            <IconForward size={14} /> Forward
          </button>
        </div>
      </div>
    </section>
  )
}
