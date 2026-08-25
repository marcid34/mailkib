import { BrowserWindow, Notification, app } from 'electron'
import type { MailNotice } from '../shared/types'

/**
 * Desktop notifications and the launcher badge.
 *
 * The renderer decides *what* is new -- it is the side that already polls every
 * mailbox -- and this module is only responsible for putting it in front of the
 * user and for taking them back to the message when they click it.
 */

let getWindow: () => BrowserWindow | null = () => null

export function initNotifications(get: () => BrowserWindow | null): void {
  getWindow = get
}

/** Beyond this many at once, one summary reads better than a stack of toasts. */
const INDIVIDUAL_LIMIT = 3

function show(options: {
  title: string
  body: string
  silent: boolean
  onClick?: () => void
}): void {
  const notification = new Notification({
    title: options.title,
    body: options.body,
    silent: options.silent,
    urgency: 'normal'
  })
  if (options.onClick) notification.on('click', options.onClick)
  notification.show()
}

/** Bring the window forward and ask the renderer to open a particular thread. */
function reveal(notice: MailNotice): void {
  const win = getWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
  win.webContents.send('mail:open', {
    accountId: notice.accountId,
    threadId: notice.threadId,
    messageId: notice.messageId
  })
}

/**
 * Raise notifications for messages that just arrived. Returns how many were
 * actually shown, which is zero on a desktop with no notification service.
 */
export function notifyMail(notices: MailNotice[], silent: boolean): number {
  if (notices.length === 0 || !Notification.isSupported()) return 0

  if (notices.length > INDIVIDUAL_LIMIT) {
    // Name the mailboxes rather than the senders: with this many at once, which
    // account woke up is the more useful fact.
    const mailboxes = [...new Set(notices.map((n) => n.accountEmail))]
    show({
      title: `${notices.length} new messages`,
      body: mailboxes.join(', '),
      silent,
      onClick: () => reveal(notices[0])
    })
    return 1
  }

  for (const notice of notices) {
    show({
      title: notice.from || notice.accountEmail,
      body: notice.subject || notice.snippet || '(no subject)',
      silent,
      onClick: () => reveal(notice)
    })
  }
  return notices.length
}

/**
 * Unread total on the dock/taskbar icon. Linux only honours this through Unity's
 * launcher API, so a desktop that ignores it is expected rather than a failure.
 */
export function setBadge(count: number): void {
  try {
    app.setBadgeCount(Math.max(0, Math.floor(count)))
  } catch {
    /* not supported here */
  }
}
