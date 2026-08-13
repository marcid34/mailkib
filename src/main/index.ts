import path from 'node:path'
import fs from 'node:fs'
import { BrowserWindow, app, session, shell } from 'electron'
import { registerIpc } from './ipc'
import { appImagePath, installDesktopEntry } from './desktop'
import { readJson, writeJson } from './store'

app.setName('MailKib')
app.setAppUserModelId('dev.kib.mailkib')

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
    // `img-src https:` looks permissive, but the app UI never loads remote
    // images -- it is there so a message frame can opt in to showing them, and
    // each frame carries its own stricter CSP until the reader unblocks it.
    if (!isDev) {
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
                "img-src 'self' data: blob: https:; font-src 'self' data:; " +
                "connect-src 'self'; frame-src 'self' data: blob:; object-src 'none'; " +
                "base-uri 'none'; form-action 'none'"
            ]
          }
        })
      })
    }

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

  app.on('window-all-closed', () => app.quit())
}
