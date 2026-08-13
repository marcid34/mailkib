import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { encrypt, decrypt } from './crypto'

export function dataDir(): string {
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function atomicWrite(file: string, data: string | Buffer, mode = 0o600): void {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, data, { mode })
  fs.renameSync(tmp, file)
}

export function readJson<T>(name: string, fallback: T): T {
  const file = path.join(dataDir(), name)
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeJson(name: string, value: unknown): void {
  atomicWrite(path.join(dataDir(), name), JSON.stringify(value, null, 2))
}

export function readEncrypted<T>(name: string, fallback: T): T {
  const file = path.join(dataDir(), name)
  try {
    return JSON.parse(decrypt(fs.readFileSync(file))) as T
  } catch {
    return fallback
  }
}

export function writeEncrypted(name: string, value: unknown): void {
  atomicWrite(path.join(dataDir(), name), encrypt(JSON.stringify(value)))
}

export function removeFile(name: string): void {
  try {
    fs.unlinkSync(path.join(dataDir(), name))
  } catch {
    /* already gone */
  }
}
