import type { JSX } from 'react'
import { HUB_ICON, MODULES, type ModuleId } from '../lib/modules'
import { IconPanel } from './Icons'

/**
 * The everyday way between modules. The hub is still a real place you can go
 * back to, but nobody should have to pass through it to read their mail.
 */
export function ModuleRail({
  active,
  unread,
  notesOpen,
  onOpen,
  onHub,
  onToggleNotes
}: {
  active: ModuleId | null
  /** Unread across every mailbox, shown as a counter on the mail button. */
  unread?: number
  notesOpen: boolean
  onOpen: (id: ModuleId) => void
  onHub: () => void
  onToggleNotes: () => void
}): JSX.Element {
  return (
    <nav className="rail" aria-label="Modules">
      <button
        className={`rail__btn rail__btn--hub${active === null ? ' is-active' : ''}`}
        onClick={onHub}
        title="Hub (ctrl+0)"
      >
        <HUB_ICON size={17} />
      </button>

      <div className="rail__divider" />

      {MODULES.map((module, index) => {
        const Icon = module.icon
        const isActive = module.id === active
        return (
          <button
            key={module.id}
            className={`rail__btn${isActive ? ' is-active' : ''}${module.ready ? '' : ' is-soon'}`}
            style={{ ['--hue' as string]: module.hue }}
            disabled={!module.ready}
            onClick={() => onOpen(module.id)}
            title={
              module.ready
                ? `${module.name} (ctrl+${index + 1})`
                : `${module.name} — not built yet`
            }
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={18} />
            {module.id === 'mail' && unread !== undefined && unread > 0 && (
              // Keyed on the number so an arrival replays the pop.
              <span key={unread} className="rail__count">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        )
      })}

      <div style={{ flex: 1 }} />

      <button
        className={`rail__btn${notesOpen ? ' is-active' : ''}`}
        style={{ ['--hue' as string]: 'var(--green)' }}
        onClick={onToggleNotes}
        title="Notes panel (ctrl+\\)"
      >
        <IconPanel size={17} />
      </button>
    </nav>
  )
}
