import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { IconCommand } from './Icons'

export interface Command {
  id: string
  label: string
  group: string
  keys?: string[]
  run: () => void
}

export function CommandPalette({
  commands,
  onClose
}: {
  commands: Command[]
  onClose: () => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => `${c.group} ${c.label}`.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => setCursor(0), [query])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  function run(index: number): void {
    const command = matches[index]
    if (!command) return
    onClose()
    command.run()
  }

  let lastGroup = ''

  return (
    <div
      className="overlay overlay--top"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="panel palette"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          } else if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
            e.preventDefault()
            setCursor((c) => Math.min(c + 1, matches.length - 1))
          } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
            e.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            run(cursor)
          }
        }}
      >
        <div className="palette__input">
          <IconCommand size={16} />
          <input
            autoFocus
            value={query}
            spellCheck={false}
            placeholder="Type a command…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="palette__list" ref={listRef}>
          {matches.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--fg-faint)' }}>
              No matching commands
            </div>
          )}
          {matches.map((command, index) => {
            const header = command.group !== lastGroup ? command.group : null
            lastGroup = command.group
            return (
              <div key={command.id}>
                {header && <div className="palette__group">{header}</div>}
                <button
                  data-index={index}
                  className={`palette__item${index === cursor ? ' is-cursor' : ''}`}
                  onMouseMove={() => setCursor(index)}
                  onClick={() => run(index)}
                >
                  {command.label}
                  {command.keys && (
                    <span className="hint">
                      {command.keys.map((key) => (
                        <span className="kbd" key={key}>
                          {key}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
