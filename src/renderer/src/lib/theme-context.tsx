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
import { api, call } from './api'
import { applyTheme, DEFAULT_THEME, themeById, type Theme } from './themes'

interface ThemeApi {
  theme: Theme
  setTheme: (id: string) => void
}

const ThemeContext = createContext<ThemeApi>({
  theme: themeById(DEFAULT_THEME),
  setTheme: () => {}
})

export function useTheme(): ThemeApi {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [id, setId] = useState(DEFAULT_THEME)

  // Paint the stored theme as early as we can; the default is already applied
  // by the stylesheet so there is no flash of an unstyled window.
  useEffect(() => {
    void (async () => {
      try {
        const settings = await call(api.app.settings())
        setId(settings.themeId)
      } catch {
        /* fall back to the default */
      }
    })()
  }, [])

  const theme = useMemo(() => themeById(id), [id])

  useEffect(() => applyTheme(theme), [theme])

  const setTheme = useCallback((next: string) => {
    setId(next)
    void api.app.setSettings({ themeId: next })
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
