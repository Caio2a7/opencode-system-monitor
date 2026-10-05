import { hasCode, messageOf } from "../errors"

export interface Cached<T> {
  value: T | null
  error?: string
}

export function cached<T>(
  now: () => number,
  ttlMs: number,
  load: (signal?: AbortSignal) => Promise<T | null>,
): (signal?: AbortSignal) => Promise<Cached<T>> {
  let entry: Cached<T> = { value: null }
  let expires = -Infinity
  return async (signal) => {
    const t = now()
    if (t < expires) return entry
    expires = t + ttlMs
    try {
      entry = { value: await load(signal) }
    } catch (err) {
      if (hasCode(err, "ABORT_ERR")) expires = -Infinity
      else entry = { value: null, error: messageOf(err) }
    }
    return entry
  }
}
