import type { Result } from '../../../shared/types'

/** Unwrap the main-process Result envelope, turning failures into throws. */
export async function call<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new Error(result.error)
  return result.data
}

export const api = window.mailkib
