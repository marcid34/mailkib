import type { JSX } from 'react'
import {
  IconCalendar,
  IconGrid,
  IconHeart,
  IconInbox,
  IconLock,
  IconNote
} from '../components/Icons'

/**
 * The hub's five doors. Mail and Notes are real; the other three are drawn so
 * the shape of the thing is honest about where it is going, and marked so
 * nobody clicks them expecting a feature.
 */
export type ModuleId = 'mail' | 'notes' | 'vault' | 'health' | 'planner'

export interface ModuleDef {
  id: ModuleId
  name: string
  tagline: string
  icon: (p: { size?: number }) => JSX.Element
  /** the token name its accent is drawn from */
  hue: string
  ready: boolean
}

export const MODULES: ModuleDef[] = [
  {
    id: 'mail',
    name: 'Mail',
    tagline: 'Conversations, folders and search',
    icon: IconInbox,
    hue: 'var(--blue)',
    ready: true
  },
  {
    id: 'notes',
    name: 'Notes',
    tagline: 'Plain, Markdown or a page of your own',
    icon: IconNote,
    hue: 'var(--green)',
    ready: true
  },
  {
    id: 'vault',
    name: 'Vault',
    tagline: 'Passwords and secrets',
    icon: IconLock,
    hue: 'var(--yellow)',
    ready: false
  },
  {
    id: 'health',
    name: 'Health',
    tagline: 'Habits and measurements',
    icon: IconHeart,
    hue: 'var(--red)',
    ready: false
  },
  {
    id: 'planner',
    name: 'Planner',
    tagline: 'Days, weeks and what is due',
    icon: IconCalendar,
    hue: 'var(--purple)',
    ready: false
  }
]

export const HUB_ICON = IconGrid

export function moduleById(id: ModuleId): ModuleDef {
  return MODULES.find((m) => m.id === id) ?? MODULES[0]
}

/** Remembered per user, so two people on one machine do not fight over it. */
export function rememberModule(userId: string, id: ModuleId): void {
  try {
    localStorage.setItem(`kib.module.${userId}`, id)
  } catch {
    /* private mode or a wiped profile; the hub is a fine fallback */
  }
}

export function lastModule(userId: string): ModuleId | null {
  try {
    const value = localStorage.getItem(`kib.module.${userId}`)
    return MODULES.some((m) => m.id === value && m.ready) ? (value as ModuleId) : null
  } catch {
    return null
  }
}
