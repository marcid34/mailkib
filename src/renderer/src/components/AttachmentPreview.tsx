import { useEffect, useState, type JSX } from 'react'
import type { Attachment, MailAccount } from '../../../shared/types'
import { api, call } from '../lib/api'
import { formatBytes } from '../lib/format'
import { useToast } from '../lib/toast'
import { IconDownload, IconExternal, IconFile, IconX } from './Icons'

/**
 * What the app can show itself, without handing the file to another program.
 * PDFs are deliberately not on this list: Electron ships no PDF viewer, so an
 * iframe renders an empty plugin document rather than the file. They open in
 * whatever the system uses instead, which is a real reader.
 */
type Kind = 'image' | 'text' | 'none'

const TEXT_TYPES = /^(application\/(json|xml|x-yaml|javascript)|text\/)/i
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml', 'csv', 'tsv', 'log',
  'ini', 'conf', 'toml', 'ts', 'tsx', 'js', 'jsx', 'css', 'html', 'sh', 'py'
])
/** Past this, a text file stops being something anyone reads in a dialog. */
const MAX_TEXT_BYTES = 2 * 1024 * 1024

export function previewKind(mimeType: string, filename: string): Kind {
  const mime = (mimeType || '').toLowerCase()
  const extension = filename.toLowerCase().split('.').pop() ?? ''

  if (mime.startsWith('image/')) return 'image'
  if (TEXT_TYPES.test(mime) || TEXT_EXTENSIONS.has(extension)) return 'text'
  // A generic octet-stream is common for attachments a provider never sniffed,
  // so fall back to what the name says rather than refusing outright.
  if (mime === 'application/octet-stream' || !mime) {
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(extension)) return 'image'
  }
  return 'none'
}

interface Props {
  account: MailAccount
  messageId: string
  attachment: Attachment
  onClose: () => void
}

interface Loaded {
  kind: Kind
  /** object URL, for an image preview */
  url?: string
  text?: string
}

export function AttachmentPreview({ account, messageId, attachment, onClose }: Props): JSX.Element {
  const { notify, fail } = useToast()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const request = {
    accountId: account.id,
    messageId,
    attachmentId: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size
  }

  const kind = previewKind(attachment.mimeType, attachment.filename)

  useEffect(() => {
    if (kind === 'none') {
      setLoaded({ kind })
      return
    }

    let url: string | undefined
    let cancelled = false

    void (async () => {
      try {
        const file = await call(api.mail.readAttachment(request))
        if (cancelled) return
        const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0))

        if (kind === 'text') {
          if (bytes.length > MAX_TEXT_BYTES) {
            setError('That file is too long to show here — download it instead.')
            return
          }
          setLoaded({ kind, text: new TextDecoder().decode(bytes) })
          return
        }

        url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }))
        setLoaded({ kind, url })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
    // The attachment identifies the request; the account and message never
    // change while one preview is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, messageId, attachment.id, kind])

  async function download(): Promise<void> {
    setBusy(true)
    try {
      const saved = await call(api.mail.saveAttachment(request))
      if (saved) notify(`Saved to ${saved}`, 'ok')
    } catch (err) {
      fail(err)
    }
    setBusy(false)
  }

  async function openExternally(): Promise<void> {
    setBusy(true)
    try {
      await call(api.mail.openAttachment(request))
    } catch (err) {
      fail(err)
    }
    setBusy(false)
  }

  return (
    <div
      className="overlay overlay--center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="panel preview"
        tabIndex={-1}
        ref={(node) => node?.focus()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="panel__head">
          <IconFile size={15} />
          <h3 className="preview__name">{attachment.filename}</h3>
          <span style={{ fontSize: 12, color: 'var(--fg-faint)', flex: 'none' }}>
            {formatBytes(attachment.size)}
          </span>
          <div style={{ flex: 1 }} />
          <button
            className="iconbtn"
            disabled={busy}
            onClick={() => void openExternally()}
            title="Open with the system default application"
          >
            <IconExternal size={15} />
          </button>
          <button
            className="iconbtn"
            disabled={busy}
            onClick={() => void download()}
            title="Download"
          >
            <IconDownload size={15} />
          </button>
          <button className="iconbtn" onClick={onClose} title="Close (esc)">
            <IconX size={15} />
          </button>
        </div>

        <div className="preview__body">
          {error && <div className="error-line">{error}</div>}

          {!error && !loaded && <span className="spinner" />}

          {!error && loaded?.kind === 'image' && (
            <img className="preview__image" src={loaded.url} alt={attachment.filename} />
          )}

          {!error && loaded?.kind === 'text' && <pre className="preview__text">{loaded.text}</pre>}

          {!error && loaded?.kind === 'none' && (
            <div className="preview__empty">
              <IconFile size={30} />
              <div>MailKib previews images and text files in place.</div>
              <div style={{ fontSize: 11.5 }}>
                Open {attachment.mimeType || 'this file'} with another application, or download it.
              </div>
            </div>
          )}
        </div>

        <div className="panel__foot">
          <button className="btn" disabled={busy} onClick={() => void openExternally()}>
            <IconExternal size={14} /> Open
          </button>
          <button className="btn btn--primary" disabled={busy} onClick={() => void download()}>
            <IconDownload size={14} /> Download
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>
            <span className="kbd">esc</span> to close
          </span>
        </div>
      </div>
    </div>
  )
}
