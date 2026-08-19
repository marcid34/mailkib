import { useEffect, useState, type JSX } from 'react'
import type { AppUser } from '../../../shared/types'
import { MODULES, type ModuleId } from '../lib/modules'
import { useKeyScope } from '../lib/keymap'
import { Mark } from './Icons'

/** Morning, afternoon, evening — cheap, and it makes the front door feel lived in. */
function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Hub({
  user,
  unread,
  noteCount,
  onOpen
}: {
  user: AppUser
  /** unread mail across every account, when it is known */
  unread?: number
  noteCount?: number
  onOpen: (id: ModuleId) => void
}): JSX.Element {
  const [shown, setShown] = useState(false)

  // One settle on entry rather than a stagger per tile: the hub is a door, not
  // a title sequence.
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), 20)
    return () => window.clearTimeout(timer)
  }, [])

  useKeyScope('hub', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const index = Number(event.key)
    if (index >= 1 && index <= MODULES.length) {
      const target = MODULES[index - 1]
      if (!target.ready) return
      event.preventDefault()
      onOpen(target.id)
      return true
    }
    return undefined
  })

  function countFor(id: ModuleId): string | null {
    if (id === 'mail' && unread !== undefined && unread > 0) {
      return `${unread} unread`
    }
    if (id === 'notes' && noteCount !== undefined) {
      return noteCount === 0 ? 'Nothing yet' : `${noteCount} note${noteCount === 1 ? '' : 's'}`
    }
    return null
  }

  return (
    <div className={`hub${shown ? ' is-shown' : ''}`}>
      <div className="hub__inner">
        <header className="hub__head">
          <Mark size={34} />
          <div>
            <h1 className="hub__title">
              {greeting()}, {user.username}
            </h1>
            <p className="hub__sub">Pick somewhere to be.</p>
          </div>
        </header>

        <div className="hub__grid">
          {MODULES.map((module, index) => {
            const Icon = module.icon
            const count = countFor(module.id)
            return (
              <button
                key={module.id}
                className={`hubcard${module.ready ? '' : ' is-soon'}`}
                style={{ ['--hue' as string]: module.hue }}
                disabled={!module.ready}
                onClick={() => onOpen(module.id)}
                title={module.ready ? `Open ${module.name}` : `${module.name} — not built yet`}
              >
                <span className="hubcard__key">{index + 1}</span>
                <span className="hubcard__icon">
                  <Icon size={26} />
                </span>
                <span className="hubcard__name">{module.name}</span>
                <span className="hubcard__tagline">{module.tagline}</span>
                <span className="hubcard__meta">
                  {module.ready ? (count ?? ' ') : 'Coming later'}
                </span>
              </button>
            )
          })}
        </div>

        <p className="hub__hint">
          <span className="kbd">1</span>–<span className="kbd">5</span> to open ·{' '}
          <span className="kbd">ctrl</span> <span className="kbd">1</span>–<span className="kbd">5</span>{' '}
          from anywhere · <span className="kbd">ctrl</span> <span className="kbd">0</span> back here
        </p>
      </div>
    </div>
  )
}
