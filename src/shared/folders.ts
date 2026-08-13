import type { FolderId } from './types'

export const LABEL_PREFIX = 'label:'

/** Type guard, so callers can still switch exhaustively over the system folders. */
export function isLabelFolder(folder: FolderId): folder is `label:${string}` {
  return folder.startsWith(LABEL_PREFIX)
}

export function toFolderId(providerId: string): `label:${string}` {
  return `${LABEL_PREFIX}${providerId}`
}

export function providerIdOf(folder: `label:${string}`): string {
  return folder.slice(LABEL_PREFIX.length)
}
