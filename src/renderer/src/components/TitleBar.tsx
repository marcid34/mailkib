import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { api } from '../lib/api'
import { IconMaximize, IconMinus, IconX, Mark } from './Icons'

export function TitleBar({ children }: { children?: ReactNode }): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => api.app.onWindowState((state) => setMaximized(state.maximized)), [])

  return (
    <div className="titlebar" onDoubleClick={() => void api.app.window('maximize')}>
      <div className="titlebar__brand">
        <Mark size={15} />
        MailKib
      </div>
      <div className="titlebar__spacer" />
      {children && <div className="titlebar__center">{children}</div>}
      <div className="titlebar__spacer" />
      <div className="wincontrols">
        <button title="Minimise" onClick={() => void api.app.window('minimize')}>
          <IconMinus size={14} />
        </button>
        <button
          title={maximized ? 'Restore' : 'Maximise'}
          onClick={() => void api.app.window('maximize')}
        >
          <IconMaximize size={13} />
        </button>
        <button className="close" title="Close" onClick={() => void api.app.window('close')}>
          <IconX size={14} />
        </button>
      </div>
    </div>
  )
}
