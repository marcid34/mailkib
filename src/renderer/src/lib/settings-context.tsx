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
import type { AppSettings, LookId } from '../../../shared/types'
import { api, call } from './api'
import { applyLook, lookById, type Look } from './look'
import { applyTheme, DEFAULT_THEME, themeById, type Theme } from './themes'

const FALLBACK: AppSettings = {
  themeId: DEFAULT_THEME,
  cacheEnabled: true,
  remoteImages: 'always',
  messageSurface: 'auto',
  notifications: true,
  notificationSound: true,
  badgeCount: true,
  look: 'kib'
}

interface SettingsApi {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  theme: Theme
  look: Look
}

const SettingsContext = createContext<SettingsApi>({
  settings: FALLBACK,
  update: () => {},
  theme: themeById(DEFAULT_THEME),
  look: lookById('kib')
})

export function useSettings(): SettingsApi {
  return useContext(SettingsContext)
}

/** Convenience for the many places that only care about colours. */
export function useTheme(): { theme: Theme; setTheme: (id: string) => void } {
  const { theme, update } = useSettings()
  return { theme, setTheme: (id: string) => update({ themeId: id }) }
}

/** The visual language, and the switch between them. */
export function useLook(): { look: Look; setLook: (id: LookId) => void; toggle: () => void } {
  const { look, update } = useSettings()
  return {
    look,
    setLook: (id: LookId) => update({ look: id }),
    toggle: () => update({ look: look.id === 'terminal' ? 'kib' : 'terminal' })
  }
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
  const look = useMemo(() => lookById(settings.look), [settings.look])

  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => applyLook(look.id), [look])

  const update = useCallback((patch: Partial<AppSettings>) => {
    // Apply locally straight away; the write is a background detail.
    setSettings((current) => ({ ...current, ...patch }))
    void api.app.setSettings(patch)
  }, [])

  const value = useMemo(
    () => ({ settings, update, theme, look }),
    [settings, update, theme, look]
  )
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
