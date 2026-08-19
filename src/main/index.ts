import path from 'node:path'
import fs from 'node:fs'
import { BrowserWindow, app, session, shell } from 'electron'
import { registerIpc } from './ipc'
import { appImagePath, installDesktopEntry } from './desktop'
import { readJson, writeJson } from './store'
import { releaseAll } from './staging'
import { flushNotes } from './notes'
import { handleNoteScheme, registerNoteScheme } from './noteprotocol'

// The application name decides where userData lives, so it is a storage key
// with a friendly face. The product is Kib now; this string stays MailKib so
// every existing account, vault, cache and note keeps being found.
app.setName('MailKib')
app.setAppUserModelId('dev.kib.mailkib')

// Privileged schemes have to be declared before the app is ready.
registerNoteScheme()

const isDev = !app.isPackaged
const RENDERER_URL = process.env['ELECTRON_RENDERER_URL']

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

const DEFAULT_STATE: WindowState = { width: 1320, height: 860 }

let mainWindow: BrowserWindow | null = null

function iconPath(): string | undefined {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png')
  ]
  return candidates.find((p) => p && fs.existsSync(p))
}

function saveWindowState(win: BrowserWindow): void {
  if (win.isMinimized()) return
  const bounds = win.getNormalBounds()
  writeJson('window.json', { ...bounds, maximized: win.isMaximized() })
}

function createWindow(): BrowserWindow {
  const state = readJson<WindowState>('window.json', DEFAULT_STATE)

  const win = new BrowserWindow({
    width: state.width ?? DEFAULT_STATE.width,
    height: state.height ?? DEFAULT_STATE.height,
    x: state.x,
    y: state.y,
    minWidth: 940,
    minHeight: 620,
    show: false,
    frame: false,
    title: 'MailKib',
    backgroundColor: '#1f2335',
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: true
    }
  })

  if (state.maximized) win.maximize()

  win.once('ready-to-show', () => win.show())

  let saveTimer: NodeJS.Timeout | undefined
  const scheduleSave = (): void => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveWindowState(win), 400)
  }
  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('close', () => saveWindowState(win))

  // Email content must never navigate or spawn windows inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = RENDERER_URL && url.startsWith(RENDERER_URL)
    if (!allowed && !url.startsWith('file://')) {
      event.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  )

  win.on('maximize', () => win.webContents.send('window:state', { maximized: true }))
  win.on('unmaximize', () => win.webContents.send('window:state', { maximized: false }))

  if (isDev && RENDERER_URL) void win.loadURL(RENDERER_URL)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))

  return win
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    // The image sources look permissive, but the app UI never loads a remote
    // image: they are here so a message frame can opt in to showing them. A
    // srcdoc frame inherits this policy on top of its own, so whatever is
    // missing here is blocked in the reader no matter what the frame allows --
    // which is why plain `http:` belongs in the list too. Plenty of senders
    // still host their images without TLS, and until this said so those
    // messages came up blank in packaged builds while working fine in dev.
    if (!isDev) {
      const remote = "data: blob: https: http:"
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
                `img-src 'self' ${remote}; media-src 'self' ${remote}; ` +
                "font-src 'self' data:; " +
                "connect-src 'self'; frame-src 'self' data: blob: kibnote:; object-src 'none'; " +
                "base-uri 'none'; form-action 'none'"
            ]
          }
        })
      })
    }

    handleNoteScheme()
    registerIpc(() => mainWindow)

    // Running from an AppImage there is no installer, so put ourselves in the
    // XDG menu on first launch. rofi/wofi/GNOME pick it up from there.
    if (appImagePath()) {
      try {
        installDesktopEntry()
      } catch {
        /* read-only home or similar; not worth blocking startup */
      }
    }

    mainWindow = createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  // Files copied out of a message to be forwarded live in the temp directory
  // until they are sent; nothing should outlive the session that staged them.
  app.on('will-quit', () => {
    releaseAll()
    // Note writes are coalesced, so a quit inside the window would drop the
    // last few seconds of typing.
    flushNotes()
  })

  app.on('window-all-closed', () => app.quit())
}
