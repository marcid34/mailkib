import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode
} from 'react'
import { IconChevronRight } from './Icons'

export interface MenuItem {
  /** A separator when omitted. */
  label?: string
  icon?: ReactNode
  hint?: string
  danger?: boolean
  disabled?: boolean
  run?: () => void
  submenu?: MenuItem[]
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

const ITEM_H = 29
const PAD = 8

/** Clamp a menu box to the viewport, flipping when it would overflow. */
function place(x: number, y: number, w: number, h: number): { left: number; top: number } {
  const left = x + w + PAD > window.innerWidth ? Math.max(PAD, x - w) : x
  const top = y + h + PAD > window.innerHeight ? Math.max(PAD, window.innerHeight - h - PAD) : y
  return { left, top }
}

function MenuList({
  items,
  x,
  y,
  onClose,
  depth = 0
}: {
  items: MenuItem[]
  x: number
  y: number
  onClose: () => void
  depth?: number
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [openSub, setOpenSub] = useState<{ index: number; x: number; y: number } | null>(null)
  const [cursor, setCursor] = useState(-1)

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect()
    setPos(place(x, y, box?.width ?? 220, box?.height ?? items.length * ITEM_H))
  }, [x, y, items.length])

  const selectable = items.filter((i) => i.label && !i.disabled)

  useEffect(() => {
    if (depth > 0) return
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setCursor((c) => {
          let next = c
          for (let i = 0; i < items.length; i++) {
            next = (next + step + items.length) % items.length
            if (items[next].label && !items[next].disabled) return next
          }
          return c
        })
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const item = items[cursor]
        if (item?.run) {
          onClose()
          item.run()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [items, cursor, onClose, depth, selectable.length])

  return (
    <div className="menu" ref={ref} style={{ left: pos.left, top: pos.top }}>
      {items.map((item, index) =>
        !item.label ? (
          <div className="menu__sep" key={`sep-${index}`} />
        ) : (
          <button
            key={item.label + index}
            className={[
              'menu__item',
              item.danger ? 'is-danger' : '',
              item.disabled ? 'is-disabled' : '',
              index === cursor ? 'is-cursor' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={item.disabled}
            onMouseEnter={(e) => {
              setCursor(index)
              if (item.submenu) {
                const box = e.currentTarget.getBoundingClientRect()
                setOpenSub({ index, x: box.right - 4, y: box.top - 5 })
              } else setOpenSub(null)
            }}
            onClick={() => {
              if (item.submenu || !item.run) return
              onClose()
              item.run()
            }}
          >
            <span className="menu__icon">{item.icon}</span>
            <span className="menu__label">{item.label}</span>
            {item.hint && <span className="menu__hint">{item.hint}</span>}
            {item.submenu && <IconChevronRight size={13} />}
          </button>
        )
      )}

      {openSub && items[openSub.index]?.submenu && (
        <MenuList
          items={items[openSub.index].submenu!}
          x={openSub.x}
          y={openSub.y}
          onClose={onClose}
          depth={depth + 1}
        />
      )}
    </div>
  )
}

export function ContextMenu({
  state,
  onClose
}: {
  state: MenuState | null
  onClose: () => void
}): JSX.Element | null {
  if (!state) return null
  return (
    <div
      className="menu__scrim"
      onMouseDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
      onWheel={onClose}
    >
      <div onMouseDown={(e) => e.stopPropagation()}>
        <MenuList items={state.items} x={state.x} y={state.y} onClose={onClose} />
      </div>
    </div>
  )
}

/** Small helper so callers just do `const menu = useContextMenu()`. */
export function useContextMenu(): {
  state: MenuState | null
  open: (event: { clientX: number; clientY: number; preventDefault: () => void }, items: MenuItem[]) => void
  close: () => void
} {
  const [state, setState] = useState<MenuState | null>(null)
  const open = useCallback(
    (
      event: { clientX: number; clientY: number; preventDefault: () => void },
      items: MenuItem[]
    ) => {
      event.preventDefault()
      if (items.length === 0) return
      setState({ x: event.clientX, y: event.clientY, items })
    },
    []
  )
  const close = useCallback(() => setState(null), [])
  return { state, open, close }
}
