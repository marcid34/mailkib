import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { app } from 'electron'

const DESKTOP_ID = 'mailkib'

function xdgDataHome(): string {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
}

function applicationsDir(): string {
  return path.join(xdgDataHome(), 'applications')
}

export function desktopFilePath(): string {
  return path.join(applicationsDir(), `${DESKTOP_ID}.desktop`)
}

function iconTargetPath(): string {
  return path.join(xdgDataHome(), 'icons', 'hicolor', '512x512', 'apps', `${DESKTOP_ID}.png`)
}

/** Path to the running AppImage, when we were launched from one. */
export function appImagePath(): string | null {
  return process.env.APPIMAGE && fs.existsSync(process.env.APPIMAGE) ? process.env.APPIMAGE : null
}

function iconSource(): string | null {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(app.getAppPath(), '..', 'build', 'icon.png')
  ]
  return candidates.find((p) => p && fs.existsSync(p)) ?? null
}

function desktopEntry(exec: string): string {
  return `[Desktop Entry]
Type=Application
Version=1.0
Name=MailKib
GenericName=Mail Client
Comment=A fast, keyboard-first mail client
Exec=${exec} %U
Icon=${DESKTOP_ID}
Terminal=false
Categories=Network;Email;
Keywords=Email;Mail;Gmail;Outlook;Inbox;
MimeType=x-scheme-handler/mailto;
StartupNotify=true
StartupWMClass=MailKib
`
}

export interface DesktopStatus {
  installed: boolean
  path: string
  managed: boolean
}

export function desktopStatus(): DesktopStatus {
  return {
    installed: fs.existsSync(desktopFilePath()),
    path: desktopFilePath(),
    // A distro package owns its own entry; we only manage the AppImage case.
    managed: appImagePath() !== null
  }
}

/**
 * Register the app in the XDG menu so launchers (rofi, wofi, GNOME) can find it.
 * Only meaningful for AppImage runs -- .pacman/.deb installs ship their own entry.
 */
export function installDesktopEntry(force = false): DesktopStatus {
  const exec = appImagePath()
  if (!exec && !force) return desktopStatus()

  const command = exec ? JSON.stringify(exec) : JSON.stringify(process.execPath)
  fs.mkdirSync(applicationsDir(), { recursive: true })

  const contents = desktopEntry(command)
  const target = desktopFilePath()
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
  if (existing !== contents) fs.writeFileSync(target, contents, { mode: 0o644 })

  const icon = iconSource()
  if (icon) {
    const iconTarget = iconTargetPath()
    fs.mkdirSync(path.dirname(iconTarget), { recursive: true })
    try {
      fs.copyFileSync(icon, iconTarget)
    } catch {
      /* non-fatal: the entry still works, just without a themed icon */
    }
  }

  // Best-effort cache refresh; rofi reads the directory directly either way.
  execFile('update-desktop-database', [applicationsDir()], () => {})
  return desktopStatus()
}

export function removeDesktopEntry(): void {
  for (const p of [desktopFilePath(), iconTargetPath()]) {
    try {
      fs.unlinkSync(p)
    } catch {
      /* not there */
    }
  }
}
