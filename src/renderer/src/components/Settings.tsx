import { useEffect, useState, type JSX } from 'react'
import type { AppInfo, AppUser, CacheStats, MailAccount } from '../../../shared/types'
import { api, call } from '../lib/api'
import { colorFor, initials } from '../lib/format'
import { useLook, useSettings, useTheme } from '../lib/settings-context'
import { LOOKS } from '../lib/look'
import { THEMES } from '../lib/themes'
import { useToast } from '../lib/toast'
import { IconContacts, IconKey, IconPlus, IconX } from './Icons'

interface Props {
  user: AppUser
  info: AppInfo | null
  accounts: MailAccount[]
  onClose: () => void
  onAccountsChanged: () => void
  onAddAccount: () => void
  onAddressBook: () => void
}

export function Settings({
  user,
  info,
  accounts,
  onClose,
  onAccountsChanged,
  onAddAccount,
  onAddressBook
}: Props): JSX.Element {
  const { notify, fail } = useToast()
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [desktop, setDesktop] = useState(info?.desktop)
  const { theme, setTheme } = useTheme()
  const { look, setLook } = useLook()
  const { settings, update } = useSettings()
  const [stats, setStats] = useState<CacheStats | null>(null)
  const primary = accounts[0]

  useEffect(() => {
    if (!primary) return
    void (async () => {
      try {
        setStats(await call(api.mail.cacheStats(primary.id)))
      } catch {
        /* stats are informational */
      }
    })()
  }, [primary])

  async function clearCache(): Promise<void> {
    if (!primary) return
    try {
      await call(api.mail.clearCache(primary.id))
      setStats(await call(api.mail.cacheStats(primary.id)))
      notify('Cached mail cleared', 'ok')
    } catch (error) {
      fail(error)
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await call(api.accounts.remove(id))
      notify('Account removed', 'ok')
      setConfirmRemove(null)
      onAccountsChanged()
    } catch (error) {
      fail(error)
    }
  }

  async function installEntry(): Promise<void> {
    try {
      const status = await call(api.app.installDesktopEntry())
      setDesktop(status)
      notify('Desktop entry installed — it should show up in rofi now', 'ok')
    } catch (error) {
      fail(error)
    }
  }

  async function submitPassword(): Promise<void> {
    try {
      await call(api.auth.changePassword(oldPassword, newPassword))
      notify('Password changed', 'ok')
      setChanging(false)
      setOldPassword('')
      setNewPassword('')
    } catch (error) {
      fail(error)
    }
  }

  return (
    <div
      className="overlay overlay--center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="panel settings"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="panel__head">
          <h3>Settings</h3>
          <div style={{ flex: 1 }} />
          <button className="iconbtn" onClick={onClose}>
            <IconX size={15} />
          </button>
        </div>

        <div className="panel__body">
          <div className="settings__group">
            <h4>Mail accounts</h4>
            {accounts.map((account) => (
              <div className="settings__row" key={account.id}>
                <span
                  className="avatar"
                  style={{ width: 28, height: 28, background: account.color || colorFor(account.email) }}
                >
                  {initials(account.email)}
                </span>
                <div className="grow">
                  <div className="title">{account.email}</div>
                  <div className="sub">
                    {account.provider === 'gmail' ? 'Gmail' : 'Microsoft'} · added{' '}
                    {new Date(account.addedAt).toLocaleDateString()}
                  </div>
                </div>
                {confirmRemove === account.id ? (
                  <>
                    <button className="btn btn--danger btn--sm" onClick={() => void remove(account.id)}>
                      Confirm
                    </button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setConfirmRemove(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => setConfirmRemove(account.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button className="btn btn--sm" onClick={onAddAccount} style={{ alignSelf: 'flex-start' }}>
              <IconPlus size={13} /> Add account
            </button>
          </div>

          <div className="settings__group">
            <h4>Look</h4>

            <div className="settings__row">
              <div className="grow">
                <div className="title">Visual language</div>
                <div className="sub">
                  The same app in a different skin. <strong>Terminal</strong> squares every
                  corner, puts one monospace face across the whole app, frames each pane the
                  way a tiling window manager does, and writes counts, keys and buttons the way
                  a TUI writes them. Your theme comes with you either way — this changes the
                  shapes, not the colours.
                </div>
              </div>
              <div className="segmented">
                {LOOKS.map((option) => (
                  <button
                    key={option.id}
                    className={`segmented__btn${look.id === option.id ? ' is-on' : ''}`}
                    title={option.tagline}
                    onClick={() => setLook(option.id)}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="settings__group">
            <h4>Theme</h4>
            <div className="theme-grid">
              {THEMES.map((option) => (
                <button
                  key={option.id}
                  className={`theme-card${option.id === theme.id ? ' is-on' : ''}`}
                  onClick={() => setTheme(option.id)}
                  title={`${option.family} · ${option.name}`}
                  style={{
                    background: option.colors.bg,
                    borderColor:
                      option.id === theme.id ? option.colors.accent : option.colors.borderStrong
                  }}
                >
                  <span className="theme-card__bar" style={{ background: option.colors.bgDeep }}>
                    <span className="theme-card__dot" style={{ background: option.colors.accent }} />
                    <span className="theme-card__dot" style={{ background: option.colors.accent2 }} />
                    <span className="theme-card__dot" style={{ background: option.colors.green }} />
                    <span className="theme-card__dot" style={{ background: option.colors.red }} />
                    <span className="theme-card__dot" style={{ background: option.colors.purple }} />
                  </span>
                  <span className="theme-card__lines">
                    <span style={{ background: option.colors.fg, width: '62%' }} />
                    <span style={{ background: option.colors.fgMute, width: '84%' }} />
                    <span style={{ background: option.colors.fgFaint, width: '45%' }} />
                  </span>
                  <span className="theme-card__name" style={{ color: option.colors.fgDim }}>
                    {option.name}
                    <em style={{ color: option.colors.fgFaint }}>
                      {option.family}
                      {option.dark ? '' : ' · light'}
                    </em>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings__group">
            <h4>Notifications</h4>

            <div className="settings__row">
              <div className="grow">
                <div className="title">New mail</div>
                <div className="sub">
                  A desktop notification when mail lands in any connected mailbox, whichever
                  module you happen to be in. Click one to jump straight to the conversation.
                </div>
              </div>
              <div className="segmented">
                {(
                  [
                    [true, 'On'],
                    [false, 'Off']
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    className={`segmented__btn${settings.notifications === value ? ' is-on' : ''}`}
                    onClick={() => update({ notifications: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings__row">
              <div className="grow">
                <div className="title">Sound</div>
                <div className="sub">Let the notification make your desktop&apos;s noise.</div>
              </div>
              <div className="segmented">
                {(
                  [
                    [true, 'On'],
                    [false, 'Silent']
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    className={`segmented__btn${settings.notificationSound === value ? ' is-on' : ''}`}
                    disabled={!settings.notifications}
                    onClick={() => update({ notificationSound: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings__row">
              <div className="grow">
                <div className="title">Launcher badge</div>
                <div className="sub">
                  The unread total on the taskbar or dock icon. Not every Linux desktop shows
                  one — GNOME and KDE do, plain window managers generally do not.
                </div>
              </div>
              <div className="segmented">
                {(
                  [
                    [true, 'On'],
                    [false, 'Off']
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    className={`segmented__btn${settings.badgeCount === value ? ' is-on' : ''}`}
                    onClick={() => update({ badgeCount: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="settings__group">
            <h4>Reading</h4>

            <div className="settings__row">
              <div className="grow">
                <div className="title">Remote images</div>
                <div className="sub">
                  Images hosted by the sender. Loading them tells the sender you opened the
                  message — that is how tracking pixels work.
                </div>
              </div>
              <div className="segmented">
                {(
                  [
                    ['always', 'Always'],
                    ['ask', 'Ask'],
                    ['never', 'Never']
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={`segmented__btn${settings.remoteImages === value ? ' is-on' : ''}`}
                    onClick={() => update({ remoteImages: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings__row">
              <div className="grow">
                <div className="title">Message background</div>
                <div className="sub">
                  HTML email is written for a white page. <strong>Auto</strong> gives designed
                  messages a light sheet and leaves plain ones on your theme.
                </div>
              </div>
              <div className="segmented">
                {(
                  [
                    ['auto', 'Auto'],
                    ['light', 'Light'],
                    ['dark', 'Dark']
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={`segmented__btn${settings.messageSurface === value ? ' is-on' : ''}`}
                    onClick={() => update({ messageSurface: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="settings__group">
            <h4>Search</h4>

            <div className="settings__row">
              <div className="grow">
                <div className="title">Scope</div>
                <div className="sub">
                  <span className="kbd">/</span> opens the search box in the folder you are
                  standing in. <span className="kbd">tab</span> widens it a step at a time, and{' '}
                  <span className="kbd">shift</span>
                  <span className="kbd">tab</span> narrows it back. Your typed query is kept as the
                  scope changes.
                </div>
                <ul className="search-help">
                  <li>
                    <span className="search-help__key">In this folder</span>
                    <span>Only the folder or label open in the sidebar.</span>
                  </li>
                  <li>
                    <span className="search-help__key">This mailbox</span>
                    <span>
                      Every folder of the selected account, archive included. On Gmail, spam and
                      trash stay out unless you ask for them.
                    </span>
                  </li>
                  <li>
                    <span className="search-help__key">All mailboxes</span>
                    <span>
                      Every folder of every account you have added. Results are merged newest
                      first and each row is tagged with the mailbox it came from. This stop only
                      appears once you have more than one account — with one, it would repeat the
                      step before it.
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="settings__row">
              <div className="grow">
                <div className="title">Operators</div>
                <div className="sub">
                  Terms are combined with AND, and quotes hold a phrase together:{' '}
                  <code>&quot;quarterly review&quot;</code>. A term with an operator is recognised
                  as you type and shown as a chip you can click to remove.
                </div>
                <ul className="search-help">
                  <li>
                    <span className="search-help__key">
                      <code>from:</code> <code>to:</code> <code>cc:</code>
                    </span>
                    <span>Match a person, by name or address.</span>
                  </li>
                  <li>
                    <span className="search-help__key">
                      <code>subject:</code>
                    </span>
                    <span>Match the subject line only.</span>
                  </li>
                  <li>
                    <span className="search-help__key">
                      <code>label:</code> <code>in:</code>
                    </span>
                    <span>Restrict to one label or folder by name.</span>
                  </li>
                  <li>
                    <span className="search-help__key">
                      <code>has:attachment</code> <code>filename:</code>
                    </span>
                    <span>Messages carrying files, or a particular one.</span>
                  </li>
                  <li>
                    <span className="search-help__key">
                      <code>is:unread</code> <code>is:starred</code>
                    </span>
                    <span>Match on state rather than content.</span>
                  </li>
                  <li>
                    <span className="search-help__key">
                      <code>before:</code> <code>after:</code> <code>older_than:</code>
                    </span>
                    <span>
                      Dates as <code>2026/01/31</code>, or spans as <code>older_than:7d</code>.
                    </span>
                  </li>
                </ul>
                <div className="sub">
                  The query is handed to the provider as you typed it, so Gmail accounts understand
                  Gmail&apos;s full search language. Outlook accounts go to Microsoft Graph, which
                  reads <code>from:</code>, <code>to:</code>, <code>subject:</code> and the like —
                  Gmail-only spellings such as <code>older_than:</code> may not match there.
                </div>
              </div>
            </div>

            <div className="settings__row">
              <div className="grow">
                <div className="title">How results arrive</div>
                <div className="sub">
                  Matches from the local cache paint immediately, then the provider&apos;s answer
                  arrives and the two are merged — which is why a search can gain rows a moment
                  after you stop typing. The merge matters: Gmail and Graph only match whole words,
                  while the cache matches the start of one, so <code>vox</code> finds Voxtelesys in
                  mail MailKib has already seen even though the server would want the whole word.
                  Mail older than the cache still needs the full word. An all-mailbox search shows
                  the freshest matches per account rather than paging; narrow it with an operator to
                  dig further back.
                </div>
              </div>
            </div>
          </div>

          <div className="settings__group">
            <h4>Address book</h4>
            <div className="settings__row">
              <IconContacts size={17} />
              <div className="grow">
                <div className="title">
                  {stats ? `${stats.contacts} contacts` : 'Contacts'}
                </div>
                <div className="sub">
                  Learned from the mail you read and send. Hide anyone you do not want
                  suggested — hiding survives future syncs, deleting does not.
                </div>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={onAddressBook}>
                Manage
              </button>
            </div>
          </div>

          <div className="settings__group">
            <h4>Offline cache</h4>
            <div className="settings__row">
              <div className="grow">
                <div className="title">Cached locally</div>
                <div className="sub">
                  {stats
                    ? `${stats.messages} messages · ${stats.threads} threads · ${stats.contacts} contacts`
                    : 'reading…'}
                  . Encrypted with the same key as your tokens.
                </div>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={() => void clearCache()}>
                Clear
              </button>
            </div>
          </div>

          <div className="settings__group">
            <h4>This device</h4>

            <div className="settings__row">
              <IconKey size={17} />
              <div className="grow">
                <div className="title">Signed in as {user.username}</div>
                <div className="sub">
                  Secrets are encrypted with a key held by{' '}
                  {info?.keyBackend === 'file'
                    ? 'a 0600 key file (no OS keyring found)'
                    : `the OS keyring (${info?.keyBackend})`}
                  .
                </div>
              </div>
              {!changing && (
                <button className="btn btn--ghost btn--sm" onClick={() => setChanging(true)}>
                  Change password
                </button>
              )}
            </div>

            {changing && (
              <div className="settings__row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <div className="field">
                  <label htmlFor="old">Current password</label>
                  <input
                    id="old"
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="new">New password</label>
                  <input
                    id="new"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn--primary btn--sm"
                    disabled={!oldPassword || !newPassword}
                    onClick={() => void submitPassword()}
                  >
                    Save
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setChanging(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="settings__row">
              <div className="grow">
                <div className="title">Application menu entry</div>
                <div className="sub">
                  {desktop?.installed
                    ? desktop.path
                    : 'Not installed. Adds MailKib to rofi, wofi and other launchers.'}
                </div>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={() => void installEntry()}>
                {desktop?.installed ? 'Reinstall' : 'Install'}
              </button>
            </div>

            <div className="settings__row">
              <div className="grow">
                <div className="title">Version</div>
                <div className="sub">
                  MailKib {info?.version ?? '—'}
                  {info?.appImage ? ' · running from AppImage' : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
