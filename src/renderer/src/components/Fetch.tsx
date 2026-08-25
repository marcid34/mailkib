import type { JSX } from 'react'
import type { AppInfo, MailAccount } from '../../../shared/types'
import { useSettings } from '../lib/settings-context'

/**
 * The block every Linux desktop screenshot opens with. In the terminal look the
 * hub grows one: the same facts the cards carry, read out the way `neofetch`
 * reads them, over the distro's own ASCII.
 */
const ARCH = [
  '                   -`',
  '                  .o+`',
  '                 `ooo/',
  '                `+oooo:',
  '               `+oooooo:',
  '               -+oooooo+:',
  '             `/:-:++oooo+:',
  '            `/++++/+++++++:',
  '           `/++++++++++++++:',
  '          `/+++ooooooooooooo/`',
  '         ./ooosssso++osssssso+`',
  '        .oossssso-````/ossssss+`',
  '       -osssssso.      :ssssssso.',
  '      :osssssss/        osssss+++',
  '     /ossssssss/        +ssssooo/-',
  '   `/ossssso+/:-        -:/+osssso+-',
  '  `+sso+:-`                 `.-/+oso:',
  ' `++:.                           `-/+/',
  ' `.                                 `/'
].join('\n')

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="fetch__row">
      <span className="fetch__key">{label}</span>
      <span className="fetch__value">{value}</span>
    </div>
  )
}

export function Fetch({
  username,
  info,
  accounts,
  unread,
  noteCount
}: {
  username: string
  info: AppInfo | null
  accounts: MailAccount[]
  unread?: number
  noteCount?: number
}): JSX.Element {
  const { theme } = useSettings()
  const host = info?.appImage ? 'appimage' : info?.platform === 'linux' ? 'linux' : 'kib'
  const who = `${username}@${host}`

  const swatches = [
    theme.colors.red,
    theme.colors.green,
    theme.colors.yellow,
    theme.colors.blue,
    theme.colors.purple,
    theme.colors.cyan,
    theme.colors.accent,
    theme.colors.accent2
  ]

  return (
    <div className="fetch">
      <pre className="fetch__art" aria-hidden="true">
        {ARCH}
      </pre>
      <div className="fetch__info">
        <div className="fetch__who">{who}</div>
        <div className="fetch__rule">{'─'.repeat(who.length)}</div>
        <Row label="kib" value={`v${info?.version ?? '—'}`} />
        <Row
          label="mail"
          value={
            accounts.length === 0
              ? 'no accounts'
              : `${accounts.length} mailbox${accounts.length === 1 ? '' : 'es'}` +
                (unread ? ` · ${unread} unread` : ' · all read')
          }
        />
        <Row
          label="notes"
          value={noteCount === undefined ? '—' : `${noteCount} note${noteCount === 1 ? '' : 's'}`}
        />
        <Row label="theme" value={`${theme.family} ${theme.name}`} />
        <Row label="look" value="terminal" />
        <Row label="keys" value="ctrl+0 hub · ctrl+1-5 modules · ctrl+k commands" />
        <div className="fetch__swatches" aria-hidden="true">
          {swatches.map((colour, i) => (
            <span key={i} className="fetch__swatch" style={{ background: colour }} />
          ))}
        </div>
      </div>
    </div>
  )
}
