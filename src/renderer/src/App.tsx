import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import type { AppInfo, AppUser, MailAccount } from '../../shared/types'
import { api, call } from './lib/api'
import { modalOpen, useKeyScope } from './lib/keymap'
import { lastModule, MODULES, rememberModule, type ModuleId } from './lib/modules'
import { useToast } from './lib/toast'
import type { Command } from './components/CommandPalette'
import { AddAccount } from './components/AddAccount'
import { AuthScreen } from './components/AuthScreen'
import { Hub } from './components/Hub'
import { MailView } from './components/MailView'
import { ModuleRail } from './components/ModuleRail'
import { NotesPanel } from './components/NotesPanel'
import { NotesView } from './components/NotesView'
import { Settings } from './components/Settings'
import { TitleBar } from './components/TitleBar'

type Screen = 'boot' | 'auth' | 'addAccount' | 'hub' | 'module'

export function App(): JSX.Element {
  const { fail, notify } = useToast()
  const [screen, setScreen] = useState<Screen>('boot')
  const [hasUsers, setHasUsers] = useState(false)
  const [user, setUser] = useState<AppUser | null>(null)
  const [accounts, setAccounts] = useState<MailAccount[]>([])
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [module, setModule] = useState<ModuleId>('mail')
  const [panelOpen, setPanelOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [noteCount, setNoteCount] = useState<number | undefined>(undefined)
  /** bumped to ask the notes module to select a particular note */
  const [wantedNote, setWantedNote] = useState<string | null>(null)

  const refreshAccounts = useCallback(async (): Promise<MailAccount[]> => {
    const list = await call(api.accounts.list())
    setAccounts(list)
    return list
  }, [])

  const refreshNoteCount = useCallback(async () => {
    try {
      setNoteCount((await call(api.notes.list())).length)
    } catch {
      /* the hub simply shows no count */
    }
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
        await refreshAccounts()
        void refreshNoteCount()
        setModule(lastModule(state.user.id) ?? 'mail')
        // The hub is the front door. Every module is one key away from it, so
        // landing here costs nothing and says what the app has become.
        setScreen('hub')
      } catch (error) {
        fail(error)
        setScreen('auth')
      }
    })()
  }, [fail, refreshAccounts, refreshNoteCount])

  const goto = useCallback(
    (id: ModuleId) => {
      const target = MODULES.find((m) => m.id === id)
      if (!target?.ready) return
      // Mail is no longer the only reason to be here, so a missing account
      // stops mail rather than stopping the app.
      if (id === 'mail' && accounts.length === 0) {
        setScreen('addAccount')
        return
      }
      setModule(id)
      setScreen('module')
      if (user) rememberModule(user.id, id)
      if (id === 'notes') void refreshNoteCount()
    },
    [accounts.length, user, refreshNoteCount]
  )

  const goHub = useCallback(() => {
    void refreshNoteCount()
    setScreen('hub')
  }, [refreshNoteCount])

  /* --------------------------- shell shortcuts --------------------------- */

  const onShellKey = useCallback(
    (event: KeyboardEvent): boolean | void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      if (modalOpen()) return

      // Backslash sits in a different place on every keyboard layout, and on
      // several it needs AltGr -- which this handler deliberately refuses. So
      // match the physical key as well as the character, and take ctrl+shift+N
      // as a plain-letter alias that any layout can type.
      const wantsPanel =
        event.key === '\\' ||
        event.code === 'Backslash' ||
        (event.shiftKey && event.key.toLowerCase() === 'n')
      if (wantsPanel) {
        event.preventDefault()
        setPanelOpen((v) => !v)
        return true
      }
      if (event.shiftKey) return

      // Digits likewise: `code` is the row of number keys wherever they land.
      const digit = event.code.match(/^Digit(\d)$/)?.[1] ?? event.key
      if (digit === '0') {
        event.preventDefault()
        goHub()
        return true
      }
      const index = Number(digit)
      if (index >= 1 && index <= MODULES.length) {
        const target = MODULES[index - 1]
        if (!target.ready) return
        event.preventDefault()
        goto(target.id)
        return true
      }
      return undefined
    },
    [goto, goHub]
  )

  useKeyScope('shell', onShellKey, screen === 'hub' || screen === 'module')

  /* --------------------------- module commands --------------------------- */

  const moduleCommands = useMemo<Command[]>(() => {
    const list: Command[] = [
      { id: 'go-hub', group: 'Kib', label: 'Go to the hub', keys: ['ctrl', '0'], run: goHub }
    ]
    MODULES.forEach((m, index) => {
      list.push({
        id: `go-module-${m.id}`,
        group: 'Kib',
        label: m.ready ? `Go to ${m.name}` : `${m.name} — not built yet`,
        keys: ['ctrl', String(index + 1)],
        run: () => goto(m.id)
      })
    })
    list.push({
      id: 'toggle-notes-panel',
      group: 'Kib',
      label: 'Toggle the notes panel',
      keys: ['ctrl', '\\'],
      run: () => setPanelOpen((v) => !v)
    })
    return list
  }, [goto, goHub])

  /* -------------------------------- auth --------------------------------- */

  const onAuthenticated = useCallback(
    async (next: AppUser) => {
      setUser(next)
      setHasUsers(true)
      try {
        await refreshAccounts()
        void refreshNoteCount()
        setModule(lastModule(next.id) ?? 'mail')
        setScreen('hub')
      } catch (error) {
        fail(error)
        setScreen('hub')
      }
    },
    [refreshAccounts, refreshNoteCount, fail]
  )

  const logout = useCallback(async () => {
    try {
      await call(api.auth.logout())
    } catch (error) {
      fail(error)
    }
    setUser(null)
    setAccounts([])
    setPanelOpen(false)
    setScreen('auth')
  }, [fail])

  const inShell = (screen === 'hub' || screen === 'module') && Boolean(user)

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
          onCancel={() => setScreen('hub')}
          onDone={(account) => {
            void refreshAccounts().then(() => {
              notify(`Connected ${account.email}`, 'ok')
              setModule('mail')
              setScreen('module')
            })
          }}
        />
      )}

      {inShell && user && (
        <div className="shell">
          <ModuleRail
            active={screen === 'module' ? module : null}
            notesOpen={panelOpen}
            onOpen={goto}
            onHub={goHub}
            onToggleNotes={() => setPanelOpen((v) => !v)}
          />

          <div className="shell__main">
            {screen === 'hub' && (
              <Hub user={user} noteCount={noteCount} onOpen={goto} />
            )}

            {screen === 'module' && module === 'mail' && (
              <MailView
                user={user}
                info={info}
                accounts={accounts}
                moduleCommands={moduleCommands}
                onAccountsChanged={() => {
                  void refreshAccounts()
                }}
                onAddAccount={() => setScreen('addAccount')}
                onLogout={() => void logout()}
              />
            )}

            {screen === 'module' && module === 'notes' && (
              <NotesView
                key={wantedNote ?? 'notes'}
                moduleCommands={moduleCommands}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            )}
          </div>

          {panelOpen && (
            <NotesPanel
              onClose={() => setPanelOpen(false)}
              onOpenInNotes={(id) => {
                setWantedNote(id)
                setPanelOpen(false)
                goto('notes')
              }}
            />
          )}
        </div>
      )}

      {settingsOpen && user && (
        <Settings
          user={user}
          info={info}
          accounts={accounts}
          onClose={() => setSettingsOpen(false)}
          onAccountsChanged={() => {
            void refreshAccounts()
          }}
          onAddAccount={() => {
            setSettingsOpen(false)
            setScreen('addAccount')
          }}
          onAddressBook={() => {
            // The address book is a mail thing; take them there rather than
            // growing a second copy of it.
            setSettingsOpen(false)
            goto('mail')
          }}
        />
      )}
    </div>
  )
}
