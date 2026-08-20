import type { JSX } from 'react'
import { IconX } from './Icons'

const GROUPS: { title: string; rows: [string, string[]][] }[] = [
  {
    title: 'Navigate',
    rows: [
      ['Next conversation', ['j']],
      ['Previous conversation', ['k']],
      ['Open conversation', ['↵']],
      ['Back to list', ['u']],
      ['Search this folder', ['/']],
      ['Widen search scope', ['tab']],
      ['Command palette', ['ctrl', 'k']],
      ['Refresh', ['ctrl', 'r']]
    ]
  },
  {
    title: 'Go to',
    rows: [
      ['Inbox', ['g', 'i']],
      ['Starred', ['g', 's']],
      ['Sent', ['g', 't']],
      ['Drafts', ['g', 'd']],
      ['Archive', ['g', 'a']],
      ['Trash', ['g', 'x']]
    ]
  },
  {
    title: 'Act',
    rows: [
      ['Archive', ['e']],
      ['Delete', ['#']],
      ['Star / unstar', ['s']],
      ['Mark unread', ['shift', 'u']],
      ['Move to inbox', ['shift', 'i']]
    ]
  },
  {
    title: 'Kib',
    rows: [
      ['Hub', ['ctrl', '0']],
      ['Mail / Notes / …', ['ctrl', '1', '–', '5']],
      ['Notes panel', ['ctrl', '\\']],
      ['Notes panel (any layout)', ['ctrl', 'shift', 'n']],
      ['Commands', ['ctrl', 'k']]
    ]
  },
  {
    title: 'Notes',
    rows: [
      ['New note', ['c']],
      ['Move', ['j', 'k']],
      ['Open', ['↵']],
      ['Search notes', ['/']],
      ['Edit / preview', ['ctrl', 'e']],
      ['Save now', ['ctrl', 's']],
      ['Pin', ['shift', 'p']],
      ['Delete note', ['#']]
    ]
  },
  {
    title: 'Code editor',
    rows: [
      ['Indent / dedent', ['tab']],
      ['Force completion', ['ctrl', 'space']],
      ['Undo / redo', ['ctrl', 'z']],
      ['Select line', ['ctrl', 'l']]
    ]
  },
  {
    title: 'Write',
    rows: [
      ['Compose', ['c']],
      ['Reply', ['r']],
      ['Reply all', ['a']],
      ['Forward', ['f']],
      ['Send', ['ctrl', '↵']],
      ['Attach files', ['ctrl', 'shift', 'a']],
      ['Close / cancel', ['esc']]
    ]
  }
]

export function Shortcuts({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div
      className="overlay overlay--center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="panel shortcuts">
        <div className="panel__head">
          <h3>Keyboard shortcuts</h3>
          <div style={{ flex: 1 }} />
          <button className="iconbtn" onClick={onClose}>
            <IconX size={15} />
          </button>
        </div>
        <div className="panel__body">
          <div className="shortcuts__grid">
            {GROUPS.map((group) => (
              <div className="shortcuts__col" key={group.title}>
                <h4>{group.title}</h4>
                {group.rows.map(([label, keys]) => (
                  <div className="shortcuts__row" key={label}>
                    {label}
                    <span className="shortcuts__keys">
                      {keys.map((key, i) => (
                        <span className="kbd" key={`${key}-${i}`}>
                          {key}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
