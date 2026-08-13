import { useEffect, useRef, useState, type DragEvent, type JSX, type MouseEvent } from 'react'
import type { FolderId, MessageSummary } from '../../../shared/types'
import { displayName, relativeTime } from '../lib/format'
import { highlight, type SearchToken, type Suggestion } from '../lib/search'
import { IconPaperclip, IconSearch, IconStar, IconX } from './Icons'

interface Props {
  messages: MessageSummary[]
  loading: boolean
  searching: boolean
  folder: FolderId
  folderName: string
  search: string
  tokens: SearchToken[]
  terms: string[]
  searchScope: 'all' | 'folder'
  onSearchScope: (scope: 'all' | 'folder') => void
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
  loading,
  searching,
  folder,
  folderName,
  search,
  tokens,
  terms,
  searchScope,
  onSearchScope,
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
  onDragStart
}: Props): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const [suggestionCursor, setSuggestionCursor] = useState(0)

  const showSuggestions = focused && suggestions.length > 0

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

  return (
    <section className="list">
      <div className="list__head">
        <div className="list__title">
          <h2>{search ? 'Search' : folderName}</h2>
          <span>
            {loading
              ? 'Loading…'
              : `${messages.length}${hasMore ? '+' : ''} conversation${messages.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {search && (
          <div className="scope">
            <button
              className={`scope__btn${searchScope === 'all' ? ' is-on' : ''}`}
              onClick={() => onSearchScope('all')}
              title="Search every message, including archived"
            >
              Everywhere
            </button>
            <button
              className={`scope__btn${searchScope === 'folder' ? ' is-on' : ''}`}
              onClick={() => onSearchScope('folder')}
              title={`Search only ${folderName}`}
            >
              In {folderName}
            </button>
          </div>
        )}

        <div className="search-wrap">
          <div className={`search${focused ? ' is-focused' : ''}`}>
            <IconSearch size={14} />
            <input
              ref={searchRef}
              value={search}
              placeholder={`Search ${folderName.toLowerCase()}…`}
              spellCheck={false}
              onFocus={() => setFocused(true)}
              onBlur={() => window.setTimeout(() => setFocused(false), 120)}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={(e) => {
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
                  if (showSuggestions) {
                    onSearch(suggestions[suggestionCursor].query + ' ')
                    setFocused(false)
                  }
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
              message.threadId === openThreadId ? 'is-open' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            onMouseDown={() => onCursor(index)}
            onClick={() => onOpen(index)}
            onContextMenu={(e) => {
              onCursor(index)
              onRowMenu(e, message)
            }}
            onDragStart={(e) => {
              onCursor(index)
              onDragStart(e, message)
            }}
          >
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
