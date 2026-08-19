import { useEffect } from 'react'

/**
 * One keydown listener for the whole app, with a stack of scopes on top of it.
 *
 * Every module used to attach its own listener to `window`, which is fine while
 * there is exactly one module. With two, both handlers see every key and the
 * bug that produces is intermittent and horrible: sometimes `c` composes a mail
 * while you are writing a note. So keys are dispatched to the most recently
 * mounted scope first, and a scope stops the walk by returning `true` or by
 * calling `preventDefault`.
 */
export type KeyHandler = (event: KeyboardEvent) => boolean | void

interface Scope {
  id: string
  seq: number
  handler: KeyHandler
}

let scopes: Scope[] = []
let sequence = 0
let listening = false
let modals = 0

/** True while a dialog owns the keyboard, so background scopes stand down. */
export function modalOpen(): boolean {
  return modals > 0
}

function dispatch(event: KeyboardEvent): void {
  // Newest scope first: a module mounted inside the shell outranks the shell.
  for (const scope of [...scopes].sort((a, b) => b.seq - a.seq)) {
    if (scope.handler(event) === true) return
    if (event.defaultPrevented) return
  }
}

function listen(): void {
  if (listening) return
  window.addEventListener('keydown', dispatch)
  listening = true
}

/**
 * Claim keys for as long as the component is mounted and `enabled` is true.
 * The handler is read through a ref-like closure on every event, so it may
 * safely capture fresh state without re-registering.
 */
export function useKeyScope(id: string, handler: KeyHandler, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    listen()
    const scope: Scope = { id, seq: ++sequence, handler }
    scopes.push(scope)
    return () => {
      scopes = scopes.filter((s) => s !== scope)
    }
  }, [id, handler, enabled])
}

/** Register that a dialog is open, so shell-level keys hold off. */
export function useModalScope(open: boolean): void {
  useEffect(() => {
    if (!open) return
    modals++
    return () => {
      modals--
    }
  }, [open])
}

/** Is the user typing into something? Most single-key shortcuts should defer. */
export function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  if (!target) return false
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable === true
}
