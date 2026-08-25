import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { SettingsProvider } from './lib/settings-context'
import { ToastProvider } from './lib/toast'
import './styles/theme.css'
import './styles/app.css'
// Last, so a look only ever overrides -- never has to fight specificity.
import './styles/terminal.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </SettingsProvider>
  </StrictMode>
)
