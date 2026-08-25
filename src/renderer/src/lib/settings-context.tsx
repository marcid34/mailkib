import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode
} from 'react'
import type { AppSettings } from '../../../shared/types'
import { api, call } from './api'
import { applyTheme, DEFAULT_THEME, themeById, type Theme } from './themes'

const FALLBACK: AppSettings = {
  themeId: DEFAULT_THEME,
  cacheEnabled: true,
  remoteImages: 'always',
  messageSurface: 'auto',
  notifications: true,
  notificationSound: true,
  badgeCount: true
}

interface SettingsApi {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  theme: Theme
}

const SettingsContext = createContext<SettingsApi>({
  settings: FALLBACK,
  update: () => {},
  theme: themeById(DEFAULT_THEME)
})

export function useSettings(): SettingsApi {
  return useContext(SettingsContext)
}

/** Convenience for the many places that only care about colours. */
export function useTheme(): { theme: Theme; setTheme: (id: string) => void } {
  const { theme, update } = useSettings()
  return { theme, setTheme: (id: string) => update({ themeId: id }) }
}

export function SettingsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(FALLBACK)

  useEffect(() => {
    void (async () => {
      try {
        setSettings(await call(api.app.settings()))
      } catch {
        /* keep the defaults */
      }
    })()
  }, [])

  const theme = useMemo(() => themeById(settings.themeId), [settings.themeId])

  useEffect(() => applyTheme(theme), [theme])

  const update = useCallback((patch: Partial<AppSettings>) => {
    // Apply locally straight away; the write is a background detail.
    setSettings((current) => ({ ...current, ...patch }))
    void api.app.setSettings(patch)
  }, [])

  const value = useMemo(() => ({ settings, update, theme }), [settings, update, theme])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
