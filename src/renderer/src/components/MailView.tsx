import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type JSX,
  type MouseEvent
} from 'react'
import type {
  AppInfo,
  AppUser,
  FolderId,
  MailAccount,
  MailFolder,
  MessageFull,
  MessageSummary,
  ThreadView
} from '../../../shared/types'
import { api, call } from '../lib/api'
import { displayName, formatRecipients, fullTime } from '../lib/format'
import {
  cycleScope,
  detokenize,
  highlightTerms,
  suggestions as buildSuggestions,
  tokenize,
  SEARCH_SCOPES,
  type SearchScope
} from '../lib/search'
import { useToast } from '../lib/toast'
import { isLabelFolder, providerIdOf } from '../../../shared/folders'
import { AddressBook } from './AddressBook'
import { isTyping, useKeyScope, useModalScope } from '../lib/keymap'
import { Compose, type ComposeInit } from './Compose'
import { CommandPalette, type Command } from './CommandPalette'
import { ContextMenu, useContextMenu, type MenuItem } from './ContextMenu'
import { MessageList } from './MessageList'
import { Prompt, type PromptSpec } from './Prompt'
import { Reader, type ReplyMode } from './Reader'
import { Settings } from './Settings'
import { Shortcuts } from './Shortcuts'
import { FOLDERS, Sidebar } from './Sidebar'
import {
  IconArchive,
  IconForward,
  IconMailOpen,
  IconMove,
  IconPlus,
  IconReply,
  IconReplyAll,
  IconStar,
  IconTag,
  IconTrash
} from './Icons'

interface MessageRef {
  id: string
  threadId: string
}

interface Props {
  user: AppUser
  info: AppInfo | null
  accounts: MailAccount[]
  /** Hub and module-switching commands, merged into this module's palette. */
  moduleCommands: Command[]
  onAccountsChanged: () => void
  onAddAccount: () => void
  onLogout: () => void
}

const REFRESH_MS = 120_000

/** Rows kept when several accounts are merged into one result list. */
const MERGED_LIMIT = 200

function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
}

export function MailView({
  user,
  info,
  accounts,
  moduleCommands,
  onAccountsChanged,
  onAddAccount,
  onLogout
}: Props): JSX.Element {
  const { notify, fail } = useToast()

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [folder, setFolder] = useState<FolderId>('inbox')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  // `/` always starts narrow — the folder you are looking at. Tab widens: this
  // folder → the whole mailbox → every mailbox. Widening is one keystroke, so
  // starting narrow costs nothing and keeps the first result set legible.
  const [searchScope, setSearchScope] = useState<SearchScope>('folder')

  const [messages, setMessages] = useState<MessageSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pageToken, setPageToken] = useState<string | undefined>()
  const [counts, setCounts] = useState<Partial<Record<string, number>>>({})
  const [labels, setLabels] = useState<MailFolder[]>([])
  const [labelsLoading, setLabelsLoading] = useState(false)

  const [cursor, setCursor] = useState(0)
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadView | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)

  const [compose, setCompose] = useState<ComposeInit | null>(null)
  // A reply to a row found in another mailbox must go out from that mailbox.
  const [composeAccountId, setComposeAccountId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [prompt, setPrompt] = useState<PromptSpec | null>(null)
  const [addressBookOpen, setAddressBookOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<MessageRef | null>(null)
  const menu = useContextMenu()

  const searchRef = useRef<HTMLInputElement>(null)
  const requestId = useRef(0)
  /** The account/folder/query the rows currently on screen answer. */
  const shownFor = useRef('')
  const goPending = useRef(0)

  const account = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? accounts[0],
    [accounts, accountId]
  )

  /** One account has nowhere wider to go than its own mailbox. */
  const scopes = useMemo<SearchScope[]>(
    () => (accounts.length > 1 ? SEARCH_SCOPES : ['folder', 'mailbox']),
    [accounts.length]
  )

  /** What the provider is actually asked for: a widened search leaves the folder. */
  const queryFolder: FolderId = search && searchScope !== 'folder' ? 'all' : folder

  /** True while a search is being answered by every account at once. */
  const everywhere = Boolean(search) && searchScope === 'everywhere'

  /** The account a row belongs to, which is not always the selected one. */
  const accountFor = useCallback(
    (summary?: MessageSummary | MessageFull): MailAccount | undefined =>
      accounts.find((a) => a.id === summary?.accountId) ?? account,
    [accounts, account]
  )

  useEffect(() => {
    if (!accounts.some((a) => a.id === accountId)) setAccountId(accounts[0]?.id ?? '')
  }, [accounts, accountId])

  useEffect(() => {
    setSearchScope((scope) => (scopes.includes(scope) ? scope : 'mailbox'))
  }, [scopes])

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 180)
    return () => clearTimeout(timer)
  }, [searchInput])

  /* ----------------------------- data loading ---------------------------- */

  const load = useCallback(
    async (silent = false) => {
      if (!account) return
      const id = ++requestId.current
      // One account, unless the search has been widened to every mailbox.
      const targets = everywhere ? accounts : [account]

      // Rows already carry the account that produced them, so merging is just a
      // matter of putting the newest first.
      const merge = (lists: MessageSummary[][]): MessageSummary[] =>
        lists.length === 1
          ? lists[0]
          : lists
              .flat()
              .sort((a, b) => b.date - a.date)
              .slice(0, MERGED_LIMIT)

      // What the rows on screen are currently an answer to. Anything else must
      // not be left standing in for this query -- showing a whole folder while a
      // search runs reads as "the search returned everything".
      const asking = `${everywhere ? '*' : account.id}|${queryFolder}|${search}`
      const stale = shownFor.current !== asking

      // Paint whatever we already hold, then let the network correct it. This is
      // what makes switching folders and typing a search feel immediate.
      if (!silent) {
        setLoading(true)
        try {
          const lists = await Promise.all(
            targets.map((a) =>
              call(
                api.mail.cached({
                  accountId: a.id,
                  folder: queryFolder,
                  search: search || undefined
                })
              )
                .then((result) => result.messages)
                .catch(() => [])
            )
          )
          if (requestId.current !== id) return
          const cached = merge(lists)
          if (cached.length > 0) {
            setMessages(cached)
            setCursor(0)
            shownFor.current = asking
          } else if (stale) {
            setMessages([])
          }
        } catch {
          /* cache is an optimisation; ignore and wait for the network */
        }
      }

      const unreachable: string[] = []
      try {
        const results = await Promise.all(
          targets.map((a) =>
            call(
              api.mail.list({
                accountId: a.id,
                folder: queryFolder,
                search: search || undefined
              })
            ).catch((error) => {
              // One sick account should not blank out an all-mailbox search, but
              // the gap has to be visible rather than silently missing.
              if (targets.length === 1) throw error
              unreachable.push(a.email)
              return { messages: [] as MessageSummary[], nextPageToken: undefined }
            })
          )
        )
        if (requestId.current !== id) return
        const merged = merge(results.map((r) => r.messages))
        setMessages(merged)
        shownFor.current = asking
        // Paging a merged list would need a page token per account; an
        // all-mailbox search shows the freshest matches and stops there.
        setPageToken(everywhere ? undefined : results[0]?.nextPageToken)
        if (unreachable.length > 0) notify(`Could not search ${unreachable.join(', ')}`, 'error')
        if (!silent) {
          setCursor((c) => Math.min(c, Math.max(0, merged.length - 1)))
          setOpenThreadId(null)
          setThread(null)
        }
      } catch (error) {
        if (requestId.current !== id) return
        fail(error)
        // A failed search must not leave the folder listing sitting there
        // looking like its result.
        if (stale) {
          setMessages([])
          setPageToken(undefined)
        }
      } finally {
        if (requestId.current === id) setLoading(false)
      }
    },
    [account, accounts, everywhere, queryFolder, search, fail, notify]
  )

  const loadCounts = useCallback(async () => {
    if (!account) return
    try {
      setCounts(await call(api.mail.counts(account.id)))
    } catch {
      /* counts are decoration; a failure here should not shout */
    }
  }, [account])

  useEffect(() => {
    void load()
  }, [load])

  const loadLabels = useCallback(async () => {
    if (!account) return
    setLabelsLoading(true)
    try {
      setLabels(await call(api.mail.folders(account.id)))
    } catch {
      // A provider that will not enumerate labels should not stop the mail from
      // loading; the built-in folders still work.
      setLabels([])
    } finally {
      setLabelsLoading(false)
    }
  }, [account])

  useEffect(() => {
    void loadCounts()
  }, [loadCounts])

  useEffect(() => {
    void loadLabels()
  }, [loadLabels])

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return
      void load(true)
      void loadCounts()
      void loadLabels()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load, loadCounts, loadLabels])

  async function loadMore(): Promise<void> {
    if (!account || !pageToken) return
    setLoadingMore(true)
    try {
      const result = await call(
        api.mail.list({
          accountId: account.id,
          folder: queryFolder,
          search: search || undefined,
          pageToken
        })
      )
      setMessages((current) => {
        const seen = new Set(current.map((m) => m.threadId))
        return [...current, ...result.messages.filter((m) => !seen.has(m.threadId))]
      })
      setPageToken(result.nextPageToken)
    } catch (error) {
      fail(error)
    } finally {
      setLoadingMore(false)
    }
  }

  /* ------------------------------- actions ------------------------------- */

  const act = useCallback(
    async (
      refs: MessageRef[],
      action: Parameters<typeof api.mail.act>[2],
      onAccountId?: string
    ) => {
      const owner = onAccountId ?? account?.id
      if (!owner || refs.length === 0) return
      try {
        await call(api.mail.act(owner, refs, action))
      } catch (error) {
        fail(error)
        void load(true)
      }
    },
    [account, fail, load]
  )

  const openAt = useCallback(
    async (index: number) => {
      const summary = messages[index]
      const owner = accountFor(summary)
      if (!owner || !summary) return
      setCursor(index)
      setOpenThreadId(summary.threadId)
      setThread(null)
      setThreadLoading(true)
      try {
        const cached = await call(api.mail.cachedThread(owner.id, summary.threadId))
        if (cached) {
          setThread(cached)
          setThreadLoading(false)
        }
      } catch {
        /* no cached copy; the spinner stays up */
      }
      try {
        const view = await call(api.mail.thread(owner.id, summary.threadId))
        setThread(view)
        if (summary.unread) {
          setMessages((list) =>
            list.map((m) => (m.threadId === summary.threadId ? { ...m, unread: false } : m))
          )
          // The sidebar counts belong to the selected account only.
          if (owner.id === account?.id) {
            setCounts((c) => ({ ...c, inbox: Math.max(0, (c.inbox ?? 1) - 1) }))
          }
          void act([{ id: summary.id, threadId: summary.threadId }], 'read', owner.id)
        }
      } catch (error) {
        fail(error)
        setOpenThreadId(null)
      } finally {
        setThreadLoading(false)
      }
    },
    [messages, account, accountFor, act, fail]
  )

  const folderName = useMemo(
    () =>
      FOLDERS.find((f) => f.id === folder)?.name ??
      labels.find((l) => l.id === folder)?.name ??
      'Mail',
    [folder, labels]
  )

  const currentSummary = messages[cursor]

  const removeRow = useCallback(
    (threadId: string) => {
      setMessages((list) => list.filter((m) => m.threadId !== threadId))
      setCursor((c) => Math.max(0, Math.min(c, messages.length - 2)))
      if (openThreadId === threadId) {
        setOpenThreadId(null)
        setThread(null)
      }
    },
    [openThreadId, messages.length]
  )

  const archive = useCallback(
    (summary?: MessageSummary) => {
      const target = summary ?? currentSummary
      if (!target) return
      const ref = { id: target.id, threadId: target.threadId }
      // Archiving only removes the conversation from the inbox. In a label or
      // search view it legitimately stays put, so don't drop the row there.
      if (folder === 'inbox') removeRow(target.threadId)
      void act([ref], 'archive', target.accountId).then(() => {
        if (folder !== 'inbox') void load(true)
      })
      notify('Archived', 'info', {
        label: 'Undo',
        run: () => {
          void act([ref], 'inbox', target.accountId).then(() => load(true))
        }
      })
    },
    [currentSummary, removeRow, act, notify, load, folder]
  )

  const trash = useCallback(
    (summary?: MessageSummary) => {
      const target = summary ?? currentSummary
      if (!target) return
      removeRow(target.threadId)
      void act([{ id: target.id, threadId: target.threadId }], 'trash', target.accountId)
      notify('Moved to trash')
    },
    [currentSummary, removeRow, act, notify]
  )

  const toggleStar = useCallback(
    (summary?: MessageSummary) => {
      const target = summary ?? currentSummary
      if (!target) return
      const next = !target.starred
      setMessages((list) =>
        list.map((m) => (m.threadId === target.threadId ? { ...m, starred: next } : m))
      )
      void act([{ id: target.id, threadId: target.threadId }], next ? 'star' : 'unstar', target.accountId)
    },
    [currentSummary, act]
  )

  const markUnread = useCallback(
    (summary?: MessageSummary) => {
      const target = summary ?? currentSummary
      if (!target) return
      setMessages((list) =>
        list.map((m) => (m.threadId === target.threadId ? { ...m, unread: true } : m))
      )
      void act([{ id: target.id, threadId: target.threadId }], 'unread', target.accountId)
      setOpenThreadId(null)
      setThread(null)
    },
    [currentSummary, act]
  )

  const moveToInbox = useCallback(() => {
    const target = currentSummary
    if (!target) return
    removeRow(target.threadId)
    void act([{ id: target.id, threadId: target.threadId }], 'inbox', target.accountId)
    notify('Moved to inbox')
  }, [currentSummary, removeRow, act, notify])

  /* -------------------------------- search -------------------------------- */

  const tokens = useMemo(() => tokenize(searchInput), [searchInput])
  const terms = useMemo(() => highlightTerms(tokens), [tokens])
  const searchSuggestions = useMemo(
    () => buildSuggestions(searchInput, labels),
    [searchInput, labels]
  )
  const searching = loading && Boolean(search)

  const removeToken = useCallback(
    (index: number) => {
      setSearchInput(detokenize(tokens.filter((_, i) => i !== index)))
    },
    [tokens]
  )

  /**
   * Enter means "I have finished typing": run this query now rather than after
   * the debounce, so the list stops showing the folder a keystroke longer than
   * it has to.
   */
  const commitSearch = useCallback(() => {
    setSearch(searchInput.trim())
  }, [searchInput])

  /** `/` always lands in the narrowest scope; Tab from there widens it. */
  const focusSearch = useCallback(() => {
    setSearchScope('folder')
    searchRef.current?.focus()
    searchRef.current?.select()
  }, [])

  const widenScope = useCallback(
    (step: number) => {
      setSearchScope((scope) => cycleScope(scope, step, scopes))
    },
    [scopes]
  )

  /* ------------------------- labels: move and manage ---------------------- */

  const labelOp = useCallback(
    async (
      target: MessageSummary,
      label: MailFolder,
      mode: 'move' | 'apply' | 'remove'
    ): Promise<void> => {
      // Labels are per-account, so this only ever applies to the selected one.
      if (!account || target.accountId !== account.id) return
      const ref = { id: target.id, threadId: target.threadId }
      if (mode === 'move' && folder !== label.id) removeRow(target.threadId)
      try {
        await call(api.mail.label(account.id, [ref], providerIdOf(label.id as `label:${string}`), mode))
        notify(
          mode === 'remove' ? `Removed from ${label.name}` : `${mode === 'move' ? 'Moved' : 'Labelled'} → ${label.path}`,
          'ok'
        )
        void loadLabels()
      } catch (error) {
        fail(error)
        void load(true)
      }
    },
    [account, folder, removeRow, notify, loadLabels, fail, load]
  )

  const promptNewLabel = useCallback(
    (parent?: MailFolder) => {
      if (!account) return
      const isGmail = account.provider === 'gmail'
      setPrompt({
        title: parent ? `New sub-${isGmail ? 'label' : 'folder'}` : `New ${isGmail ? 'label' : 'folder'}`,
        label: 'Name',
        placeholder: isGmail ? 'Clients' : 'Projects',
        hint: parent ? `Will be created inside ${parent.path}.` : undefined,
        confirmLabel: 'Create',
        validate: (value) =>
          value.includes('/') && !parent ? 'Use the sub-label option instead of a slash.' : null,
        onSubmit: (value) => {
          void (async () => {
            try {
              const created = await call(api.mail.createFolder(account.id, value, parent?.path))
              notify(`Created ${created.path}`, 'ok')
              await loadLabels()
            } catch (error) {
              fail(error)
            }
          })()
        }
      })
    },
    [account, notify, loadLabels, fail]
  )

  const promptRenameLabel = useCallback(
    (label: MailFolder) => {
      if (!account) return
      const segments = label.path.split('/')
      const parentPath = segments.slice(0, -1).join('/') || undefined
      setPrompt({
        title: 'Rename',
        label: 'Name',
        initial: label.name,
        confirmLabel: 'Rename',
        onSubmit: (value) => {
          void (async () => {
            try {
              await call(
                api.mail.renameFolder(
                  account.id,
                  providerIdOf(label.id as `label:${string}`),
                  value,
                  parentPath
                )
              )
              notify('Renamed', 'ok')
              await loadLabels()
            } catch (error) {
              fail(error)
            }
          })()
        }
      })
    },
    [account, notify, loadLabels, fail]
  )

  const promptDeleteLabel = useCallback(
    (label: MailFolder) => {
      if (!account) return
      setPrompt({
        title: `Delete ${label.name}?`,
        label: `Type the name to confirm`,
        placeholder: label.name,
        hint: 'Messages are not deleted — they just lose this label.',
        confirmLabel: 'Delete',
        danger: true,
        validate: (value) => (value === label.name ? null : 'That does not match.'),
        onSubmit: () => {
          void (async () => {
            try {
              await call(
                api.mail.deleteFolder(account.id, providerIdOf(label.id as `label:${string}`))
              )
              notify(`Deleted ${label.name}`, 'ok')
              if (folder === label.id) setFolder('inbox')
              await loadLabels()
            } catch (error) {
              fail(error)
            }
          })()
        }
      })
    },
    [account, notify, loadLabels, fail, folder]
  )

  /* -------------------------------- reply -------------------------------- */

  const buildReply = useCallback(
    (mode: ReplyMode, message: MessageFull): ComposeInit => {
      const self = (accountFor(message)?.email ?? '').toLowerCase()
      const bodyHtml = message.html ?? `<pre>${escapeText(message.text ?? '')}</pre>`
      const quotedHtml =
        `<div style="color:#848cad;font-size:12px">On ${fullTime(message.date)}, ` +
        `${escapeText(displayName(message.from))} &lt;${escapeText(message.from.email)}&gt; wrote:</div>` +
        `<blockquote style="border-left:2px solid #3b4261;padding-left:12px;margin:8px 0">${bodyHtml}</blockquote>`

      const base = {
        quotedHtml,
        inReplyTo: message.messageIdHeader,
        references: [message.references, message.messageIdHeader].filter(Boolean).join(' ') || undefined
      }

      if (mode === 'forward') {
        return {
          ...base,
          inReplyTo: undefined,
          references: undefined,
          subject: /^fwd:/i.test(message.subject) ? message.subject : `Fwd: ${message.subject}`
        }
      }

      const replyTo = message.replyTo ?? message.from
      const others = [...message.to, ...message.cc].filter(
        (r) =>
          r.email.toLowerCase() !== self && r.email.toLowerCase() !== replyTo.email.toLowerCase()
      )

      return {
        ...base,
        to: formatRecipients([replyTo]),
        cc: mode === 'replyAll' ? formatRecipients(others) : '',
        subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`,
        threadId: message.threadId,
        replySourceId: message.id
      }
    },
    [accountFor]
  )

  const startReply = useCallback(
    async (mode: ReplyMode, message?: MessageFull) => {
      let source = message
      if (!source) {
        if (thread) source = thread.messages[thread.messages.length - 1]
        else if (currentSummary) {
          const owner = accountFor(currentSummary)
          if (!owner) return
          try {
            const view = await call(api.mail.thread(owner.id, currentSummary.threadId))
            source = view.messages[view.messages.length - 1]
          } catch (error) {
            fail(error)
            return
          }
        }
      }
      if (!source) return
      const init = buildReply(mode, source)

      // A forward that quietly drops the files is worse than a slow one, so
      // stage them before the window opens. One that cannot be copied is
      // reported and the rest still come along.
      if (mode === 'forward' && source.attachments.length > 0) {
        const message = source
        const staged = await Promise.all(
          message.attachments.map((attachment) =>
            call(
              api.mail.stageFromMessage({
                accountId: message.accountId,
                messageId: message.id,
                attachmentId: attachment.id,
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                size: attachment.size
              })
            ).catch((error: unknown) => {
              fail(error)
              return null
            })
          )
        )
        init.attachments = staged.filter((a) => a !== null)
      }

      // Reply from the mailbox that holds the message, not the selected one.
      setComposeAccountId(source.accountId)
      setCompose(init)
    },
    [thread, currentSummary, accountFor, buildReply, fail]
  )

  /* ----------------------------- context menus ---------------------------- */

  const labelSubmenu = useCallback(
    (target: MessageSummary, mode: 'move' | 'apply'): MenuItem[] => {
      if (labels.length === 0) {
        return [{ label: 'No labels yet', disabled: true }]
      }
      return labels.map((label) => ({
        label: label.path,
        icon: <IconTag size={13} />,
        run: () => void labelOp(target, label, mode)
      }))
    },
    [labels, labelOp]
  )

  const openRowMenu = useCallback(
    (event: MouseEvent, target: MessageSummary) => {
      const isGmail = account?.provider === 'gmail'
      // An all-mailbox search can surface rows the sidebar's labels know nothing
      // about; those get a jump to their own account instead of filing options.
      const owner = accountFor(target)
      const foreign = Boolean(owner) && owner!.id !== account?.id
      const items: MenuItem[] = [
        { label: 'Open', hint: '↵', run: () => void openAt(messages.indexOf(target)) },
        {},
        { label: 'Reply', icon: <IconReply size={13} />, hint: 'r', run: () => void startReply('reply') },
        { label: 'Reply all', icon: <IconReplyAll size={13} />, hint: 'a', run: () => void startReply('replyAll') },
        { label: 'Forward', icon: <IconForward size={13} />, hint: 'f', run: () => void startReply('forward') },
        {},
        { label: 'Archive', icon: <IconArchive size={13} />, hint: 'e', run: () => archive(target) },
        { label: 'Delete', icon: <IconTrash size={13} />, hint: '#', danger: true, run: () => trash(target) },
        {},
        {
          label: target.starred ? 'Unstar' : 'Star',
          icon: <IconStar size={13} filled={target.starred} />,
          hint: 's',
          run: () => toggleStar(target)
        },
        {
          label: target.unread ? 'Mark read' : 'Mark unread',
          icon: <IconMailOpen size={13} />,
          hint: target.unread ? '' : '⇧U',
          run: () => {
            if (target.unread) {
              setMessages((list) =>
                list.map((m) => (m.threadId === target.threadId ? { ...m, unread: false } : m))
              )
              void act([{ id: target.id, threadId: target.threadId }], 'read', target.accountId)
            } else markUnread(target)
          }
        },
        {}
      ]
      if (foreign) {
        items.push({
          label: `Switch to ${owner!.email}`,
          run: () => setAccountId(owner!.id)
        })
      } else {
        items.push({
          label: 'Move to',
          icon: <IconMove size={13} />,
          submenu: labelSubmenu(target, 'move')
        })
        if (isGmail) {
          items.push({
            label: 'Apply label',
            icon: <IconTag size={13} />,
            submenu: labelSubmenu(target, 'apply')
          })
        }
      }
      items.push(
        {},
        {
          label: 'Copy sender address',
          run: () => void navigator.clipboard.writeText(target.from.email)
        },
        { label: 'Copy subject', run: () => void navigator.clipboard.writeText(target.subject) }
      )
      menu.open(event, items)
    },
    [
      account,
      accountFor,
      messages,
      openAt,
      startReply,
      archive,
      trash,
      toggleStar,
      markUnread,
      act,
      labelSubmenu,
      menu
    ]
  )

  const openNavMenu = useCallback(
    (event: MouseEvent) => {
      const isGmail = account?.provider === 'gmail'
      menu.open(event, [
        {
          label: `New ${isGmail ? 'label' : 'folder'}…`,
          icon: <IconPlus size={13} />,
          run: () => promptNewLabel()
        },
        {},
        { label: 'Refresh', hint: 'ctrl R', run: () => { void load(); void loadCounts(); void loadLabels() } }
      ])
    },
    [account, menu, promptNewLabel, load, loadCounts, loadLabels]
  )

  const openLabelMenu = useCallback(
    (event: MouseEvent, label: MailFolder) => {
      const isGmail = account?.provider === 'gmail'
      menu.open(event, [
        { label: 'Open', run: () => setFolder(label.id) },
        {},
        {
          label: `New sub-${isGmail ? 'label' : 'folder'}…`,
          icon: <IconPlus size={13} />,
          run: () => promptNewLabel(label)
        },
        { label: 'Rename…', run: () => promptRenameLabel(label) },
        {},
        {
          label: `Delete ${isGmail ? 'label' : 'folder'}`,
          icon: <IconTrash size={13} />,
          danger: true,
          run: () => promptDeleteLabel(label)
        }
      ])
    },
    [account, menu, promptNewLabel, promptRenameLabel, promptDeleteLabel]
  )

  /* ------------------------------ drag & drop ----------------------------- */

  const onDragStart = useCallback((event: DragEvent, target: MessageSummary) => {
    dragRef.current = { id: target.id, threadId: target.threadId }
    setDragging(true)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', target.subject)
    const end = (): void => {
      setDragging(false)
      window.removeEventListener('dragend', end)
    }
    window.addEventListener('dragend', end)
  }, [])

  const onDropOnFolder = useCallback(
    (destination: FolderId) => {
      const ref = dragRef.current
      dragRef.current = null
      setDragging(false)
      if (!ref || !account || destination === folder) return
      const target = messages.find((m) => m.threadId === ref.threadId)
      if (!target) return

      if (isLabelFolder(destination)) {
        const label = labels.find((l) => l.id === destination)
        if (!label) return
        if (target.accountId !== account.id) {
          notify('That message lives in another mailbox. Switch to it to file it.')
          return
        }
        void labelOp(target, label, 'move')
        return
      }
      if (destination === 'archive') return archive(target)
      if (destination === 'trash') return trash(target)
      if (destination === 'starred') {
        if (!target.starred) toggleStar(target)
        return
      }
      if (destination === 'inbox') {
        removeRow(target.threadId)
        void act([ref], 'inbox', target.accountId)
        notify('Moved to inbox')
      }
    },
    [account, folder, messages, labels, labelOp, archive, trash, toggleStar, removeRow, act, notify]
  )

  /* ------------------------------ shortcuts ------------------------------ */

  const overlayOpen =
    Boolean(compose) ||
    paletteOpen ||
    shortcutsOpen ||
    settingsOpen ||
    addressBookOpen ||
    Boolean(prompt) ||
    Boolean(menu.state)

  // Two modules share this window, so keys go through the registry rather than
  // straight onto `window`: whichever scope mounted last is asked first, and
  // this one stands down entirely while one of its own dialogs is open.
  useModalScope(overlayOpen)

  const onKey = useCallback(
    (event: KeyboardEvent): void => {
      const typing = isTyping(event)

      const mod = event.ctrlKey || event.metaKey

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (overlayOpen || typing) return

      if (mod && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        void load()
        void loadCounts()
        void loadLabels()
        return
      }
      if (mod || event.altKey) return

      // `g` starts a two-key sequence: g i, g s, g t, …
      if (Date.now() - goPending.current < 1200) {
        goPending.current = 0
        const map: Record<string, FolderId> = {
          i: 'inbox',
          s: 'starred',
          t: 'sent',
          d: 'drafts',
          a: 'all',
          e: 'archive',
          x: 'trash',
          p: 'spam'
        }
        if (event.key.toLowerCase() === 'c') {
          event.preventDefault()
          setAddressBookOpen(true)
          return
        }
        const next = map[event.key.toLowerCase()]
        if (next) {
          event.preventDefault()
          setFolder(next)
          return
        }
      }

      switch (event.key) {
        case 'g':
          goPending.current = Date.now()
          return
        case 'j':
        case 'n':
        case 'ArrowDown':
          event.preventDefault()
          setCursor((c) => Math.min(c + 1, messages.length - 1))
          return
        case 'k':
        case 'p':
        case 'ArrowUp':
          event.preventDefault()
          setCursor((c) => Math.max(c - 1, 0))
          return
        case 'Enter':
        case 'o':
          event.preventDefault()
          void openAt(cursor)
          return
        case 'u':
        case 'Escape':
          event.preventDefault()
          setOpenThreadId(null)
          setThread(null)
          return
        case 'e':
          event.preventDefault()
          archive()
          return
        case '#':
        case 'Delete':
        case 'Backspace':
          event.preventDefault()
          trash()
          return
        case 's':
          event.preventDefault()
          toggleStar()
          return
        case 'U':
          event.preventDefault()
          markUnread()
          return
        case 'I':
          event.preventDefault()
          moveToInbox()
          return
        case 'c':
          event.preventDefault()
          setCompose({})
          return
        case 'r':
          event.preventDefault()
          void startReply('reply')
          return
        case 'a':
          event.preventDefault()
          void startReply('replyAll')
          return
        case 'f':
          event.preventDefault()
          void startReply('forward')
          return
        case '/':
          event.preventDefault()
          focusSearch()
          return
        case '?':
          event.preventDefault()
          setShortcutsOpen(true)
          return
        default:
      }
    },
    [
    overlayOpen,
    messages.length,
    cursor,
    openAt,
    archive,
    trash,
    toggleStar,
    markUnread,
    moveToInbox,
    startReply,
    focusSearch,
    load,
    loadCounts,
    loadLabels
    ]
  )

  useKeyScope('mail', onKey)

  /* ------------------------------- commands ------------------------------ */

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      { id: 'compose', group: 'Actions', label: 'Compose new message', keys: ['c'], run: () => setCompose({}) },
      { id: 'refresh', group: 'Actions', label: 'Refresh', keys: ['ctrl', 'r'], run: () => void load() },
      { id: 'search', group: 'Actions', label: 'Search', keys: ['/'], run: focusSearch },
      {
        id: 'search-everywhere',
        group: 'Actions',
        label: 'Search all mailboxes',
        run: () => {
          searchRef.current?.focus()
          setSearchScope('everywhere')
        }
      }
    ]
    if (currentSummary) {
      list.push(
        { id: 'archive', group: 'Actions', label: 'Archive conversation', keys: ['e'], run: () => archive() },
        { id: 'trash', group: 'Actions', label: 'Delete conversation', keys: ['#'], run: () => trash() },
        { id: 'star', group: 'Actions', label: currentSummary.starred ? 'Unstar' : 'Star', keys: ['s'], run: () => toggleStar() },
        { id: 'reply', group: 'Actions', label: 'Reply', keys: ['r'], run: () => void startReply('reply') }
      )
    }
    for (const f of FOLDERS) {
      list.push({
        id: `go-${f.id}`,
        group: 'Go to',
        label: f.name,
        run: () => setFolder(f.id)
      })
    }
    for (const label of labels) {
      list.push({
        id: `go-${label.id}`,
        group: 'Go to',
        label: label.path,
        run: () => setFolder(label.id)
      })
    }
    for (const a of accounts) {
      list.push({
        id: `acct-${a.id}`,
        group: 'Accounts',
        label: a.email,
        run: () => setAccountId(a.id)
      })
    }
    list.push(
      {
        id: 'new-label',
        group: 'App',
        label: accounts.find((a) => a.id === accountId)?.provider === 'gmail' ? 'New label…' : 'New folder…',
        run: () => promptNewLabel()
      },
      { id: 'add-account', group: 'App', label: 'Add mail account', run: onAddAccount },
      { id: 'settings', group: 'App', label: 'Open settings', run: () => setSettingsOpen(true) },
      { id: 'contacts', group: 'App', label: 'Address book', keys: ['g', 'c'], run: () => setAddressBookOpen(true) },
      { id: 'shortcuts', group: 'App', label: 'Keyboard shortcuts', keys: ['?'], run: () => setShortcutsOpen(true) },
      { id: 'logout', group: 'App', label: 'Sign out', run: onLogout }
    )
    list.push(...moduleCommands)
    return list
  }, [
    currentSummary,
    accounts,
    labels,
    accountId,
    promptNewLabel,
    focusSearch,
    load,
    archive,
    trash,
    toggleStar,
    startReply,
    onAddAccount,
    onLogout,
    moduleCommands
  ])

  if (!account) return <div className="centered">No account selected.</div>

  return (
    <>
      <div className="body">
        <Sidebar
          accounts={accounts}
          activeAccountId={account.id}
          folder={folder}
          counts={counts}
          labels={labels}
          labelsLoading={labelsLoading}
          onSelectAccount={setAccountId}
          onSelectFolder={setFolder}
          onAddAccount={onAddAccount}
          onAddressBook={() => setAddressBookOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onLogout={onLogout}
          onLabelMenu={openLabelMenu}
          onNavMenu={openNavMenu}
          onDropOnFolder={onDropOnFolder}
          dragging={dragging}
        />

        <MessageList
          messages={messages}
          accounts={accounts}
          showAccounts={everywhere}
          loading={loading}
          searching={searching}
          folder={folder}
          folderName={folderName}
          accountEmail={account.email}
          search={searchInput}
          tokens={tokens}
          terms={terms}
          searchScope={searchScope}
          onSearchScope={setSearchScope}
          onCycleScope={widenScope}
          onCommitSearch={commitSearch}
          suggestions={searchSuggestions}
          cursor={cursor}
          openThreadId={openThreadId}
          hasMore={Boolean(pageToken)}
          loadingMore={loadingMore}
          searchRef={searchRef}
          onSearch={setSearchInput}
          onRemoveToken={removeToken}
          onCursor={setCursor}
          onOpen={(index) => void openAt(index)}
          onLoadMore={() => void loadMore()}
          onRowMenu={openRowMenu}
          onDragStart={onDragStart}
        />

        <Reader
          account={accountFor(currentSummary) ?? account}
          thread={openThreadId ? thread : null}
          loading={threadLoading}
          starred={Boolean(currentSummary?.starred)}
          onClose={() => {
            setOpenThreadId(null)
            setThread(null)
          }}
          onArchive={() => archive()}
          onTrash={() => trash()}
          onStar={() => toggleStar()}
          onUnread={() => markUnread()}
          onReply={(mode, message) => void startReply(mode, message)}
        />
      </div>

      <div className="hint-bar">
        <span className="pair">
          <span className="kbd">j</span>
          <span className="kbd">k</span> move
        </span>
        <span className="pair">
          <span className="kbd">↵</span> open
        </span>
        <span className="pair">
          <span className="kbd">e</span> archive
        </span>
        <span className="pair">
          <span className="kbd">c</span> compose
        </span>
        <span className="pair">
          <span className="kbd">/</span> search
        </span>
        <span className="pair">
          <span className="kbd">ctrl</span>
          <span className="kbd">k</span> commands
        </span>
        <span className="pair">
          <span className="kbd">ctrl</span>
          <span className="kbd">\</span> notes
        </span>
        <div style={{ flex: 1 }} />
        <span>{account.email}</span>
      </div>

      {compose && (
        <Compose
          account={accounts.find((a) => a.id === composeAccountId) ?? account}
          init={compose}
          onClose={() => {
            setCompose(null)
            setComposeAccountId(null)
          }}
          onSent={() => {
            setCompose(null)
            setComposeAccountId(null)
            void load(true)
          }}
        />
      )}

      {paletteOpen && (
        <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />
      )}

      {shortcutsOpen && <Shortcuts onClose={() => setShortcutsOpen(false)} />}

      {addressBookOpen && (
        <AddressBook
          account={account}
          onClose={() => setAddressBookOpen(false)}
          onCompose={(to) => setCompose({ to: `${to}, ` })}
        />
      )}

      {prompt && <Prompt spec={prompt} onClose={() => setPrompt(null)} />}

      <ContextMenu state={menu.state} onClose={menu.close} />

      {settingsOpen && (
        <Settings
          user={user}
          info={info}
          accounts={accounts}
          onClose={() => setSettingsOpen(false)}
          onAccountsChanged={onAccountsChanged}
          onAddAccount={() => {
            setSettingsOpen(false)
            onAddAccount()
          }}
          onAddressBook={() => {
            setSettingsOpen(false)
            setAddressBookOpen(true)
          }}
        />
      )}
    </>
  )
}
