import { useEffect, useMemo, useRef, useState, type DragEvent, type JSX, type MouseEvent } from 'react'
import type { FolderId, MailAccount, MessageSummary } from '../../../shared/types'
import { colorFor, displayName, relativeTime } from '../lib/format'
import { highlight, type SearchScope, type SearchToken, type Suggestion } from '../lib/search'
import {
  IconArchive,
  IconCheck,
  IconMail,
  IconMailOpen,
  IconPaperclip,
  IconSearch,
  IconStar,
  IconTrash,
  IconX
} from './Icons'

/** What the bulk bar can do to everything that is ticked. */
export type BulkAction = 'read' | 'unread' | 'star' | 'archive' | 'trash'

interface Props {
  messages: MessageSummary[]
  accounts: MailAccount[]
  /** Label each row with its mailbox — only useful once they can be mixed. */
  showAccounts: boolean
  loading: boolean
  searching: boolean
  folder: FolderId
  folderName: string
  accountEmail: string
  search: string
  tokens: SearchToken[]
  terms: string[]
  searchScope: SearchScope
  onSearchScope: (scope: SearchScope) => void
  onCycleScope: (step: number) => void
  onCommitSearch: () => void
  suggestions: Suggestion[]
  cursor: number
  openThreadId: string | null
  hasMore: boolean
  loadingMore: boolean
  searchRef: React.RefObject<HTMLInputElement | null>
  onSearch: (value: string) => void
  onRemoveToken: (index: number) => void
  onCursor: (index: number) => void
  onOpen: (index: number) => void
  onLoadMore: () => void
  onRowMenu: (event: MouseEvent, message: MessageSummary) => void
  onDragStart: (event: DragEvent, message: MessageSummary) => void
  /** Ids of the ticked rows. Empty means the list is not in picking mode. */
  selected: Set<string>
  /** `toggle` ticks one row; `range` extends from the cursor to this row. */
  onPick: (index: number, mode: 'toggle' | 'range') => void
  onPickAll: () => void
  onClearPicks: () => void
  onBulk: (action: BulkAction) => void
}

function Highlighted({ text, terms }: { text: string; terms: string[] }): JSX.Element {
  const parts = highlight(text, terms)
  if (parts.length === 1) return <>{parts[0].text}</>
  return (
    <>
      {parts.map((part, i) =>
        part.hit ? (
          <mark key={i} className="hit">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  )
}

export function MessageList({
  messages,
  accounts,
  showAccounts,
  loading,
  searching,
  folder,
  folderName,
  accountEmail,
  search,
  tokens,
  terms,
  searchScope,
  onSearchScope,
  onCycleScope,
  onCommitSearch,
  suggestions,
  cursor,
  openThreadId,
  hasMore,
  loadingMore,
  searchRef,
  onSearch,
  onRemoveToken,
  onCursor,
  onOpen,
  onLoadMore,
  onRowMenu,
  onDragStart,
  selected,
  onPick,
  onPickAll,
  onClearPicks,
  onBulk
}: Props): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const [suggestionCursor, setSuggestionCursor] = useState(0)

  const showSuggestions = focused && suggestions.length > 0
  const showScope = focused || Boolean(search)

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  )

  // With a single account "this mailbox" and "all mailboxes" are the same
  // search, and offering both only makes Tab look broken.
  const scopeOptions: { scope: SearchScope; label: string; title: string }[] = [
    { scope: 'folder', label: `In ${folderName}`, title: `Search only ${folderName}` },
    { scope: 'mailbox', label: 'This mailbox', title: `Search every folder in ${accountEmail}` },
    ...(accounts.length > 1
      ? [
          {
            scope: 'everywhere' as SearchScope,
            label: 'All mailboxes',
            title: 'Search every folder in every account'
          }
        ]
      : [])
  ]

  const placeholder =
    searchScope === 'everywhere'
      ? 'Search all mailboxes…'
      : searchScope === 'mailbox'
        ? `Search ${accountEmail}…`
        : `Search ${folderName.toLowerCase()}…`

  useEffect(() => setSuggestionCursor(0), [suggestions.length, search])

  useEffect(() => {
    const container = scrollRef.current
    const row = container?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
    if (!container || !row) return
    const top = row.offsetTop
    const bottom = top + row.offsetHeight
    if (top < container.scrollTop) container.scrollTop = top - 8
    else if (bottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = bottom - container.clientHeight + 8
    }
  }, [cursor, messages])

  const picking = selected.size > 0
  const allPicked = picking && selected.size === messages.length

  return (
    <section className={`list${picking ? ' is-picking' : ''}`}>
      <div className="list__head">
        <div className="list__title">
          <h2>{search ? 'Search' : folderName}</h2>
          <span>
            {loading
              ? 'Loading…'
              : `${messages.length}${hasMore ? '+' : ''} conversation${messages.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {showScope && (
          <div className="scope">
            {scopeOptions.map((option) => (
              <button
                key={option.scope}
                className={`scope__btn${searchScope === option.scope ? ' is-on' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSearchScope(option.scope)}
                title={option.title}
              >
                {option.label}
              </button>
            ))}
            <span className="scope__hint" title="Tab widens the search">
              <span className="kbd">tab</span>
            </span>
          </div>
        )}

        <div className="search-wrap">
          <div className={`search${focused ? ' is-focused' : ''}`}>
            <IconSearch size={14} />
            <input
              ref={searchRef}
              value={search}
              placeholder={placeholder}
              spellCheck={false}
              onFocus={() => setFocused(true)}
              onBlur={() => window.setTimeout(() => setFocused(false), 120)}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={(e) => {
                // Tab is the scope dial: this folder → this mailbox → all
                // mailboxes, and shift-Tab walks back. It never moves focus out
                // of the box, so the query survives the widening.
                if (e.key === 'Tab') {
                  e.preventDefault()
                  onCycleScope(e.shiftKey ? -1 : 1)
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  if (showSuggestions) setFocused(false)
                  else if (search) onSearch('')
                  else e.currentTarget.blur()
                  return
                }
                if (showSuggestions && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                  e.preventDefault()
                  const step = e.key === 'ArrowDown' ? 1 : -1
                  setSuggestionCursor(
                    (c) => (c + step + suggestions.length) % suggestions.length
                  )
                  return
                }
                if (e.key === 'Enter') {
                  e.preventDefault()
                  // Only a suggestion the reader actually moved to replaces what
                  // they typed. Enter on its own commits the query as written.
                  if (showSuggestions && suggestionCursor > 0) {
                    onSearch(suggestions[suggestionCursor].query + ' ')
                  } else {
                    onCommitSearch()
                  }
                  setFocused(false)
                  e.currentTarget.blur()
                }
              }}
            />
            {searching && <span className="spinner spinner--tiny" />}
            {search && !searching && (
              <button className="search__clear" title="Clear" onClick={() => onSearch('')}>
                <IconX size={12} />
              </button>
            )}
          </div>

          {showSuggestions && (
            <div className="suggestions">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.query + index}
                  className={`suggestions__item${index === suggestionCursor ? ' is-cursor' : ''}`}
                  onMouseMove={() => setSuggestionCursor(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSearch(suggestion.query + ' ')
                    searchRef.current?.focus()
                  }}
                >
                  <span className={`suggestions__kind is-${suggestion.kind}`} />
                  <span className="suggestions__label">{suggestion.label}</span>
                  <span className="suggestions__detail">{suggestion.detail}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {tokens.length > 0 && (
          <div className="chips">
            {tokens.map((token, index) => (
              <button
                key={token.raw + index}
                className={`chip${token.operator ? ' chip--op' : ''}`}
                title="Remove this term"
                onClick={() => onRemoveToken(index)}
              >
                {token.operator && <span className="chip__op">{token.operator}</span>}
                <span className="chip__value">{token.value}</span>
                <IconX size={10} />
              </button>
            ))}
          </div>
        )}

        {picking && (
          <div className="bulkbar">
            <button className="bulkbar__btn" title="Clear selection (esc)" onClick={onClearPicks}>
              <IconX size={13} />
            </button>
            <span className="bulkbar__count">{selected.size} selected</span>
            <div className="bulkbar__actions">
              <button
                className="bulkbar__btn"
                title={allPicked ? 'All rows selected' : 'Select all (ctrl A)'}
                disabled={allPicked}
                onClick={onPickAll}
              >
                <IconCheck size={13} />
              </button>
              <span className="bulkbar__sep" />
              <button className="bulkbar__btn" title="Mark read" onClick={() => onBulk('read')}>
                <IconMailOpen size={14} />
              </button>
              <button className="bulkbar__btn" title="Mark unread" onClick={() => onBulk('unread')}>
                <IconMail size={14} />
              </button>
              <button className="bulkbar__btn" title="Star" onClick={() => onBulk('star')}>
                <IconStar size={14} />
              </button>
              <span className="bulkbar__sep" />
              <button className="bulkbar__btn" title="Archive (e)" onClick={() => onBulk('archive')}>
                <IconArchive size={14} />
              </button>
              <button
                className="bulkbar__btn is-danger"
                title="Delete (#)"
                onClick={() => onBulk('trash')}
              >
                <IconTrash size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="list__scroll" ref={scrollRef}>
        {messages.length === 0 && !loading && (
          <div className="list__empty">
            <div style={{ fontSize: 26, opacity: 0.4 }}>✦</div>
            <div>{search ? 'Nothing matched that search.' : `${folderName} is empty.`}</div>
            {search && (
              <button className="link-btn" onClick={() => onSearch('')}>
                Clear search
              </button>
            )}
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={message.id}
            data-index={index}
            draggable
            className={[
              'row',
              message.unread ? 'is-unread' : '',
              index === cursor ? 'is-cursor' : '',
              selected.has(message.id) ? 'is-picked' : '',
              message.threadId === openThreadId ? 'is-open' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            onMouseDown={(e) => {
              // Shift-click must not move the cursor: the cursor *is* the
              // anchor a range extends from, and it must not run away as the
              // range is redrawn. It also stops the browser painting a text
              // selection across every row the range crosses.
              if (e.shiftKey) {
                e.preventDefault()
                return
              }
              onCursor(index)
            }}
            onClick={(e) => {
              if (e.shiftKey) {
                onPick(index, 'range')
                return
              }
              if (e.ctrlKey || e.metaKey) {
                onPick(index, 'toggle')
                return
              }
              onOpen(index)
            }}
            onContextMenu={(e) => {
              // Right-clicking inside a selection acts on the selection; on a
              // row outside it, the selection is beside the point.
              if (!selected.has(message.id)) onCursor(index)
              onRowMenu(e, message)
            }}
            onDragStart={(e) => {
              if (!selected.has(message.id)) onCursor(index)
              onDragStart(e, message)
            }}
          >
            <button
              className={`row__pick${selected.has(message.id) ? ' is-on' : ''}`}
              title={selected.has(message.id) ? 'Deselect' : 'Select'}
              aria-pressed={selected.has(message.id)}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
                onPick(index, e.shiftKey ? 'range' : 'toggle')
              }}
            >
              {selected.has(message.id) && <IconCheck size={10} />}
            </button>
            <span className="row__dot" />
            <div className="row__main">
              <div className="row__top">
                <span className="row__from">
                  {folder === 'sent' || folder === 'drafts' ? (
                    <>To: <Highlighted text={message.to.map(displayName).join(', ') || '—'} terms={terms} /></>
                  ) : (
                    <Highlighted text={displayName(message.from)} terms={terms} />
                  )}
                </span>
                {(message.threadCount ?? 1) > 1 && (
                  <span className="row__count">{message.threadCount}</span>
                )}
                {showAccounts && accountById.has(message.accountId) && (
                  <span className="row__acct" title={accountById.get(message.accountId)!.email}>
                    <span
                      className="row__acct-dot"
                      style={{
                        background:
                          accountById.get(message.accountId)!.color ||
                          colorFor(accountById.get(message.accountId)!.email)
                      }}
                    />
                    {accountById.get(message.accountId)!.email.split('@')[0]}
                  </span>
                )}
                {(message.starred || message.hasAttachments) && (
                  <span className="row__flags">
                    {message.starred && (
                      <span className="starred">
                        <IconStar size={12} filled />
                      </span>
                    )}
                    {message.hasAttachments && <IconPaperclip size={12} />}
                  </span>
                )}
                <span className="row__time">{relativeTime(message.date)}</span>
              </div>
              <div className="row__subject">
                <Highlighted text={message.subject} terms={terms} />
              </div>
              {message.snippet && (
                <div className="row__snippet">
                  <Highlighted text={message.snippet} terms={terms} />
                </div>
              )}
            </div>
          </div>
        ))}

        {hasMore && messages.length > 0 && (
          <div className="list__more">
            <button className="btn btn--ghost btn--sm" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? <span className="spinner" /> : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
