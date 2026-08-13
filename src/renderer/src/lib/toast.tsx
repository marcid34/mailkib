import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode
} from 'react'

export type ToastKind = 'info' | 'error' | 'ok'

export interface ToastAction {
  label: string
  run: () => void
}

interface Toast {
  id: number
  text: string
  kind: ToastKind
  action?: ToastAction
}

interface ToastApi {
  notify: (text: string, kind?: ToastKind, action?: ToastAction) => void
  fail: (error: unknown) => void
}

const ToastContext = createContext<ToastApi>({ notify: () => {}, fail: () => {} })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const notify = useCallback(
    (text: string, kind: ToastKind = 'info', action?: ToastAction) => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-3), { id, text, kind, action }])
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : action ? 6000 : 3200)
    },
    [dismiss]
  )

  const fail = useCallback(
    (error: unknown) => notify(error instanceof Error ? error.message : String(error), 'error'),
    [notify]
  )

  const value = useMemo(() => ({ notify, fail }), [notify, fail])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.kind}`}>
            <span>{toast.text}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action!.run()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
