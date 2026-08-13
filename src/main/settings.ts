import type { AppSettings } from '../shared/types'
import { readJson, writeJson } from './store'

const FILE = 'settings.json'

const DEFAULTS: AppSettings = {
  themeId: 'tokyo-night-storm',
  cacheEnabled: true
}

export function getSettings(): AppSettings {
  return { ...DEFAULTS, ...readJson<Partial<AppSettings>>(FILE, {}) }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  writeJson(FILE, next)
  return next
}
