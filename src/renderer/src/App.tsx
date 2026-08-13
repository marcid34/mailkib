import { useCallback, useEffect, useState, type JSX } from 'react'
import type { AppInfo, AppUser, MailAccount } from '../../shared/types'
import { api, call } from './lib/api'
import { useToast } from './lib/toast'
import { AddAccount } from './components/AddAccount'
import { AuthScreen } from './components/AuthScreen'
import { MailView } from './components/MailView'
import { TitleBar } from './components/TitleBar'

type Screen = 'boot' | 'auth' | 'addAccount' | 'mail'

export function App(): JSX.Element {
  const { fail, notify } = useToast()
  const [screen, setScreen] = useState<Screen>('boot')
  const [hasUsers, setHasUsers] = useState(false)
  const [user, setUser] = useState<AppUser | null>(null)
  const [accounts, setAccounts] = useState<MailAccount[]>([])
  const [info, setInfo] = useState<AppInfo | null>(null)

  const refreshAccounts = useCallback(async (): Promise<MailAccount[]> => {
    const list = await call(api.accounts.list())
    setAccounts(list)
    return list
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const [state, appInfo] = await Promise.all([call(api.auth.state()), call(api.app.info())])
        setInfo(appInfo)
        setHasUsers(state.hasUsers)
        if (!state.user) {
          setScreen('auth')
          return
        }
        setUser(state.user)
        const list = await refreshAccounts()
        setScreen(list.length === 0 ? 'addAccount' : 'mail')
      } catch (error) {
        fail(error)
        setScreen('auth')
      }
    })()
  }, [fail, refreshAccounts])

  const onAuthenticated = useCallback(
    async (next: AppUser) => {
      setUser(next)
      setHasUsers(true)
      try {
        const list = await refreshAccounts()
        setScreen(list.length === 0 ? 'addAccount' : 'mail')
      } catch (error) {
        fail(error)
        setScreen('addAccount')
      }
    },
    [refreshAccounts, fail]
  )

  const logout = useCallback(async () => {
    try {
      await call(api.auth.logout())
    } catch (error) {
      fail(error)
    }
    setUser(null)
    setAccounts([])
    setScreen('auth')
  }, [fail])

  return (
    <div className="app">
      <TitleBar />

      {screen === 'boot' && (
        <div className="centered">
          <span className="spinner" />
        </div>
      )}

      {screen === 'auth' && (
        <AuthScreen hasUsers={hasUsers} onAuthenticated={(u) => void onAuthenticated(u)} />
      )}

      {screen === 'addAccount' && (
        <AddAccount
          firstRun={accounts.length === 0}
          onCancel={accounts.length > 0 ? () => setScreen('mail') : undefined}
          onDone={(account) => {
            void refreshAccounts().then(() => {
              notify(`Connected ${account.email}`, 'ok')
              setScreen('mail')
            })
          }}
        />
      )}

      {screen === 'mail' && user && (
        <MailView
          user={user}
          info={info}
          accounts={accounts}
          onAccountsChanged={() => {
            void refreshAccounts().then((list) => {
              if (list.length === 0) setScreen('addAccount')
            })
          }}
          onAddAccount={() => setScreen('addAccount')}
          onLogout={() => void logout()}
        />
      )}
    </div>
  )
}
