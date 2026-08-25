import { useState, type DragEvent, type JSX, type MouseEvent } from 'react'
import type { FolderId, MailAccount, MailFolder, SystemFolderId } from '../../../shared/types'
import { colorFor, initials } from '../lib/format'
import { readableOn } from '../lib/themes'
import {
  IconAllMail,
  IconArchive,
  IconContacts,
  IconDraft,
  IconFolder,
  IconInbox,
  IconLogout,
  IconPlus,
  IconSend,
  IconSettings,
  IconSpam,
  IconStar,
  IconTag,
  IconTrash
} from './Icons'

export const FOLDERS: {
  id: SystemFolderId
  name: string
  icon: (p: { size?: number }) => JSX.Element
  /** Whether dropping a conversation here means something. */
  droppable?: boolean
}[] = [
  { id: 'inbox', name: 'Inbox', icon: IconInbox, droppable: true },
  { id: 'starred', name: 'Starred', icon: IconStar, droppable: true },
  { id: 'sent', name: 'Sent', icon: IconSend },
  { id: 'drafts', name: 'Drafts', icon: IconDraft },
  { id: 'archive', name: 'Archive', icon: IconArchive, droppable: true },
  { id: 'all', name: 'All Mail', icon: IconAllMail },
  { id: 'spam', name: 'Spam', icon: IconSpam },
  { id: 'trash', name: 'Trash', icon: IconTrash, droppable: true }
]

interface Props {
  accounts: MailAccount[]
  activeAccountId: string
  folder: FolderId
  counts: Partial<Record<string, number>>
  /** Unread in any account's inbox — the account chips each show their own. */
  unreadFor: (accountId: string) => number
  labels: MailFolder[]
  labelsLoading: boolean
  onSelectAccount: (id: string) => void
  onSelectFolder: (folder: FolderId) => void
  onAddAccount: () => void
  onAddressBook: () => void
  onSettings: () => void
  onLogout: () => void
  onLabelMenu: (event: MouseEvent, label: MailFolder) => void
  onNavMenu: (event: MouseEvent) => void
  onDropOnFolder: (folder: FolderId) => void
  dragging: boolean
}

export function Sidebar({
  accounts,
  activeAccountId,
  folder,
  counts,
  unreadFor,
  labels,
  labelsLoading,
  onSelectAccount,
  onSelectFolder,
  onAddAccount,
  onAddressBook,
  onSettings,
  onLogout,
  onLabelMenu,
  onNavMenu,
  onDropOnFolder,
  dragging
}: Props): JSX.Element {
  const [dropTarget, setDropTarget] = useState<FolderId | null>(null)
  const active = accounts.find((a) => a.id === activeAccountId)
  const isGmail = active?.provider === 'gmail'
  const LabelIcon = isGmail ? IconTag : IconFolder

  function dropProps(id: FolderId, enabled = true): Record<string, unknown> {
    if (!enabled) return {}
    return {
      onDragOver: (e: DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropTarget(id)
      },
      onDragLeave: () => setDropTarget((t) => (t === id ? null : t)),
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        setDropTarget(null)
        onDropOnFolder(id)
      }
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__section">
        <div className="sidebar__label">Accounts</div>
        {accounts.map((account) => {
          const tint = account.color || colorFor(account.email)
          const unread = unreadFor(account.id)
          return (
            <button
              key={account.id}
              className={`account-chip${account.id === activeAccountId ? ' is-active' : ''}`}
              onClick={() => onSelectAccount(account.id)}
              title={
                unread > 0
                  ? `${account.email} — ${unread} unread`
                  : account.email
              }
            >
              <span
                className="avatar"
                style={{ width: 24, height: 24, background: tint, color: readableOn(tint) }}
              >
                {initials(account.email)}
              </span>
              <span className="account-chip__text">
                <div className="account-chip__name">{account.email}</div>
                <div className="account-chip__provider">
                  {account.provider === 'gmail' ? 'Gmail' : 'Microsoft'}
                </div>
              </span>
              {unread > 0 && (
                <span
                  // Keyed on the number so a change replays the pop.
                  key={unread}
                  className="account-chip__count"
                  style={{ background: tint, color: readableOn(tint), ['--tint' as string]: tint }}
                >
                  {unread > 999 ? '999+' : unread}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <nav className={`nav${dragging ? ' is-dragging' : ''}`} onContextMenu={onNavMenu}>
        {FOLDERS.map(({ id, name, icon: Icon, droppable }) => {
          const count = counts[id]
          return (
            <button
              key={id}
              className={[
                'nav__item',
                folder === id ? 'is-active' : '',
                dropTarget === id ? 'is-drop' : '',
                dragging && droppable ? 'is-droppable' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectFolder(id)}
              {...dropProps(id, droppable)}
            >
              <Icon size={15} />
              <span className="nav__text">{name}</span>
              {count ? (
                <span
                  key={count}
                  className={`nav__count${id === 'drafts' ? '' : ' nav__count--unread'}`}
                  title={id === 'drafts' ? `${count} drafts` : `${count} unread`}
                >
                  {count > 999 ? '999+' : count}
                </span>
              ) : null}
            </button>
          )
        })}

        <div className="sidebar__label sidebar__label--inline">
          {isGmail ? 'Labels' : 'Folders'}
          {labelsLoading && <span className="spinner spinner--tiny" />}
          <button
            className="sidebar__add"
            title={isGmail ? 'New label' : 'New folder'}
            onClick={(e) => {
              e.stopPropagation()
              onNavMenu(e)
            }}
          >
            <IconPlus size={12} />
          </button>
        </div>

        {labels.length === 0 && !labelsLoading && (
          <div className="nav__hint">
            Right-click here to create {isGmail ? 'a label' : 'a folder'}.
          </div>
        )}

        {labels.map((label) => (
          <button
            key={label.id}
            className={[
              'nav__item',
              folder === label.id ? 'is-active' : '',
              dropTarget === label.id ? 'is-drop' : '',
              dragging ? 'is-droppable' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ paddingLeft: 9 + Math.min(label.depth, 4) * 13 }}
            onClick={() => onSelectFolder(label.id)}
            onContextMenu={(e) => {
              e.stopPropagation()
              onLabelMenu(e, label)
            }}
            title={label.path}
            {...dropProps(label.id)}
          >
            <LabelIcon size={14} />
            <span className="nav__text">{label.name}</span>
            {label.unread ? (
              <span
                key={label.unread}
                className="nav__count nav__count--unread"
                title={`${label.unread} unread`}
              >
                {label.unread > 999 ? '999+' : label.unread}
              </span>
            ) : null}
          </button>
        ))}

        {/* Fills the remaining space so right-clicking below the last label
            still opens the nav menu. */}
        <div className="nav__filler" />
      </nav>

      <div className="sidebar__foot">
        <button className="nav__item" onClick={onAddressBook}>
          <IconContacts size={15} />
          <span className="nav__text">Address book</span>
        </button>
        <button className="nav__item" onClick={onAddAccount}>
          <IconPlus size={15} />
          <span className="nav__text">Add account</span>
        </button>
        <button className="nav__item" onClick={onSettings}>
          <IconSettings size={15} />
          <span className="nav__text">Settings</span>
        </button>
        <button className="nav__item" onClick={onLogout}>
          <IconLogout size={15} />
          <span className="nav__text">Sign out</span>
        </button>
      </div>
    </aside>
  )
}
