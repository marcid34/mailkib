import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react'

export interface PromptSpec {
  title: string
  label: string
  initial?: string
  placeholder?: string
  hint?: string
  confirmLabel?: string
  danger?: boolean
  /** Return an error string to block submission. */
  validate?: (value: string) => string | null
  onSubmit: (value: string) => void
}

/** A themed replacement for window.prompt, used for label names. */
export function Prompt({
  spec,
  onClose
}: {
  spec: PromptSpec
  onClose: () => void
}): JSX.Element {
  const [value, setValue] = useState(spec.initial ?? '')
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  function submit(event: FormEvent): void {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    const problem = spec.validate?.(trimmed) ?? null
    if (problem) {
      setError(problem)
      return
    }
    onClose()
    spec.onSubmit(trimmed)
  }

  return (
    <div
      className="overlay overlay--center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form
        className="panel prompt"
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="panel__head">
          <h3>{spec.title}</h3>
        </div>
        <div className="panel__body">
          <div className="field">
            <label htmlFor="prompt-value">{spec.label}</label>
            <input
              id="prompt-value"
              ref={input}
              value={value}
              spellCheck={false}
              placeholder={spec.placeholder}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
            />
            {spec.hint && <div className="field__hint">{spec.hint}</div>}
          </div>
          {error && <div className="error-line">{error}</div>}
        </div>
        <div className="panel__foot">
          <button
            className={`btn btn--sm ${spec.danger ? 'btn--danger' : 'btn--primary'}`}
            type="submit"
            disabled={!value.trim()}
          >
            {spec.confirmLabel ?? 'Save'}
          </button>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
