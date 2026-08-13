import fs from 'node:fs'
import path from 'node:path'
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
  timingSafeEqual,
  randomUUID
} from 'node:crypto'
import { app, safeStorage } from 'electron'

// N=2^15 needs roughly 128 * N * r = 32 MiB, which is exactly Node's default
// maxmem ceiling, so raise it or scryptSync throws MEMORY_LIMIT_EXCEEDED.
const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 }

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`
}

/**
 * Whether the OS keyring can actually protect a secret. Electron reports
 * `isEncryptionAvailable() === true` on Linux even when it has fallen back to
 * the `basic_text` backend, which is plaintext with extra steps -- so check the
 * selected backend too and prefer a 0600 key file over a false sense of safety.
 */
function keyringUsable(): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false
    const backend = safeStorage.getSelectedStorageBackend?.()
    return backend !== 'basic_text' && backend !== 'unknown'
  } catch {
    return false
  }
}

let cachedKey: Buffer | null = null

/** A 32-byte key used to encrypt the per-user vaults. Created on first run. */
export function deviceKey(): Buffer {
  if (cachedKey) return cachedKey
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  const encPath = path.join(dir, 'device.key.enc')
  const rawPath = path.join(dir, 'device.key')

  if (keyringUsable() && fs.existsSync(encPath)) {
    try {
      cachedKey = Buffer.from(safeStorage.decryptString(fs.readFileSync(encPath)), 'hex')
      return cachedKey
    } catch {
      // keyring rejected it (different session/backend); fall through to the file
    }
  }
  if (fs.existsSync(rawPath)) {
    cachedKey = Buffer.from(fs.readFileSync(rawPath, 'utf8').trim(), 'hex')
    return cachedKey
  }

  const key = randomBytes(32)
  if (keyringUsable()) {
    fs.writeFileSync(encPath, safeStorage.encryptString(key.toString('hex')), { mode: 0o600 })
  } else {
    fs.writeFileSync(rawPath, key.toString('hex'), { mode: 0o600 })
  }
  cachedKey = key
  return key
}

export function keyStorageBackend(): string {
  return keyringUsable() ? (safeStorage.getSelectedStorageBackend?.() ?? 'keyring') : 'file'
}

/** AES-256-GCM. Layout: iv(12) || tag(16) || ciphertext. */
export function encrypt(plain: string, key: Buffer = deviceKey()): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body])
}

export function decrypt(blob: Buffer, key: Buffer = deviceKey()): string {
  const iv = blob.subarray(0, 12)
  const tag = blob.subarray(12, 28)
  const body = blob.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16)
  const hash = scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, SCRYPT)
  return { salt: salt.toString('hex'), hash: hash.toString('hex') }
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(
    password.normalize('NFKC'),
    Buffer.from(salt, 'hex'),
    SCRYPT.keylen,
    SCRYPT
  )
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function base64url(buf: Buffer | string): string {
  return Buffer.from(buf as never)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function fromBase64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}
