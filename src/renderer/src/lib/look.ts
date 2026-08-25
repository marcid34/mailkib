import type { LookId } from '../../../shared/types'

/**
 * A "look" is a second skin over the same app: same components, same layout,
 * a different visual language. It is a single attribute on the root element,
 * and `styles/terminal.css` hangs everything off it -- so no component has to
 * know which look is on, and neither look can drift out of the other's way.
 */
export interface Look {
  id: LookId
  name: string
  tagline: string
}

export const LOOKS: Look[] = [
  {
    id: 'kib',
    name: 'Kib',
    tagline: 'Rounded, proportional, quiet. The original.'
  },
  {
    id: 'terminal',
    name: 'Terminal',
    tagline: 'Monospace, square, framed. Like the desktop it runs on.'
  }
]

export function lookById(id: string | undefined): Look {
  return LOOKS.find((l) => l.id === id) ?? LOOKS[0]
}

export function applyLook(look: LookId): void {
  document.documentElement.dataset.look = look
}
