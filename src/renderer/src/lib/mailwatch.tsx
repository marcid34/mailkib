import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode
} from 'react'
import type { MailAccount, MailNotice, MessageSummary } from '../../../shared/types'
import { api, call } from './api'
import { displayName } from './format'
import { useSettings } from './settings-context'

/**
 * Every mailbox is watched, not just the one on screen.
 *
 * Mail arriving in an account you are not looking at used to be invisible until
 * you happened to click on it. This polls the unread counts for every connected
 * account on a short interval -- one cheap request each -- so the sidebar, the
 * account chips and the module rail can all show the same truth. Only when a
 * count actually goes up does it pay for the expensive part: a page of the
 * inbox, to say who wrote and about what.
 */

/** Cheap poll: one folder-metadata request per account. */
const POLL_MS = 45_000
/** Rows fetched to describe an arrival. Enough for a burst, cheap enough to repeat. */
const PEEK = 15
/** Notifications shown for one arrival burst; the rest become a summary. */
const NOTICE_LIMIT = 6

export type FolderCounts = Partial<Record<string, number>>

interface WatchApi {
  /** accountId → folder → count. Inbox is unread; drafts is a total. */
  counts: Record<string, FolderCounts>
  /** Unread in one account's inbox, or 0 while it is still unknown. */
  unreadFor: (accountId: string) => number
  /** Unread across every connected account. */
  totalUnread: number
  /** Re-poll now — after an action that is known to have changed a count. */
  refresh: () => void
  /**
   * Adjust a count locally without waiting for the next poll. Reading a
   * conversation should move the badge immediately, not in forty seconds.
   */
  bump: (accountId: string, folder: string, delta: number) => void
}

const WatchContext = createContext<WatchApi>({
  counts: {},
  unreadFor: () => 0,
  totalUnread: 0,
  refresh: () => {},
  bump: () => {}
})

export function useMailWatch(): WatchApi {
  return useContext(WatchContext)
}

function noticeFor(account: MailAccount, message: MessageSummary): MailNotice {
  return {
    accountId: account.id,
    accountEmail: account.email,
    threadId: message.threadId,
    messageId: message.id,
    from: displayName(message.from),
    subject: message.subject,
    snippet: message.snippet
  }
}

export function MailWatchProvider({
  accounts,
  children
}: {
  accounts: MailAccount[]
  children: ReactNode
}): JSX.Element {
  const { settings } = useSettings()
  const [counts, setCounts] = useState<Record<string, FolderCounts>>({})

  // Read inside the poll loop so changing a setting never restarts the timer.
  const notifications = settings.notifications
  const badgeCount = settings.badgeCount
  const settingsRef = useRef({ notifications, badgeCount })
  settingsRef.current = { notifications, badgeCount }

  const accountsRef = useRef(accounts)
  accountsRef.current = accounts

  const countsRef = useRef(counts)
  countsRef.current = counts

  /**
   * Per account: when we started watching it, and every message we have already
   * announced. A mailbox with no entry here has never been polled, and its first
   * poll only records a baseline -- otherwise every launch would announce the
   * entire standing backlog.
   */
  const seen = useRef(new Map<string, { since: number; ids: Set<string> }>())
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const bump = useCallback((accountId: string, folder: string, delta: number) => {
    setCounts((current) => {
      const forAccount = current[accountId]
      if (!forAccount || forAccount[folder] === undefined) return current
      const next = Math.max(0, (forAccount[folder] ?? 0) + delta)
      if (next === forAccount[folder]) return current
      return { ...current, [accountId]: { ...forAccount, [folder]: next } }
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    /**
     * Say who wrote and about what. Only reached when a count actually went up,
     * so the expensive request is paid for once per arrival rather than once
     * per poll.
     */
    async function announce(account: MailAccount): Promise<void> {
      const known = seen.current.get(account.id)
      if (!known || !settingsRef.current.notifications) return

      let rows: MessageSummary[]
      try {
        const result = await call(
          api.mail.list({ accountId: account.id, folder: 'inbox', limit: PEEK })
        )
        rows = result.messages
      } catch {
        return
      }
      if (cancelled) return

      // Mail that was already sitting there when the app started is not news,
      // and neither is anything we have announced once already.
      const fresh = rows.filter(
        (m) => m.unread && m.date > known.since && !known.ids.has(m.id)
      )
      for (const message of fresh) known.ids.add(message.id)
      // The set would otherwise grow for as long as the app is open.
      if (known.ids.size > 400) {
        known.ids = new Set([...known.ids].slice(-200))
      }
      if (fresh.length === 0) return

      const notices = fresh
        .sort((a, b) => b.date - a.date)
        .slice(0, NOTICE_LIMIT)
        .map((message) => noticeFor(account, message))
      void api.app.notifyMail(notices)
    }

    async function poll(): Promise<void> {
      const list = accountsRef.current
      if (list.length === 0) return

      const results = await Promise.all(
        list.map(async (account) => {
          try {
            return { account, counts: await call(api.mail.counts(account.id)) }
          } catch {
            return null
          }
        })
      )
      if (cancelled) return

      const next: Record<string, FolderCounts> = { ...countsRef.current }
      const arrivals: MailAccount[] = []

      for (const result of results) {
        if (!result) continue
        const previous = countsRef.current[result.account.id]?.inbox
        next[result.account.id] = result.counts
        // A first sighting has nothing to compare against, and costs nothing:
        // it just starts the clock. After that, a rise is mail that landed
        // while we were watching.
        if (!seen.current.has(result.account.id)) {
          seen.current.set(result.account.id, { since: Date.now(), ids: new Set() })
          continue
        }
        if (previous !== undefined && (result.counts.inbox ?? 0) > previous) {
          arrivals.push(result.account)
        }
      }

      setCounts(next)
      countsRef.current = next

      for (const account of arrivals) void announce(account)
    }

    void poll()
    const timer = window.setInterval(() => {
      // A hidden window is still worth polling -- that is exactly when a
      // notification earns its keep.
      void poll()
    }, POLL_MS)

    // Coming back to the window is the moment stale counts are most obvious.
    const onFocus = (): void => void poll()
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [accounts, tick])

  // Forget accounts that have been removed, so a re-added mailbox starts clean.
  useEffect(() => {
    const live = new Set(accounts.map((a) => a.id))
    for (const id of [...seen.current.keys()]) if (!live.has(id)) seen.current.delete(id)
    setCounts((current) => {
      const next: Record<string, FolderCounts> = {}
      for (const [id, value] of Object.entries(current)) if (live.has(id)) next[id] = value
      return next
    })
  }, [accounts])

  const totalUnread = useMemo(
    () => accounts.reduce((sum, account) => sum + (counts[account.id]?.inbox ?? 0), 0),
    [accounts, counts]
  )

  useEffect(() => {
    void api.app.setBadge(badgeCount ? totalUnread : 0)
  }, [totalUnread, badgeCount])

  const value = useMemo<WatchApi>(
    () => ({
      counts,
      unreadFor: (accountId: string) => counts[accountId]?.inbox ?? 0,
      totalUnread,
      refresh,
      bump
    }),
    [counts, totalUnread, refresh, bump]
  )

  return <WatchContext.Provider value={value}>{children}</WatchContext.Provider>
}
