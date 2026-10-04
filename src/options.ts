export interface Options {
  refreshMs: number
}

const DEFAULT_REFRESH_MS = 2000
const MIN_REFRESH_MS = 500
const MAX_REFRESH_MS = 60_000

/** Validates untrusted plugin options; invalid values fall back to defaults. */
export function parseOptions(raw: unknown): Options {
  const value = typeof raw === "object" && raw !== null ? (raw as { refreshMs?: unknown }).refreshMs : undefined
  if (typeof value !== "number" || !Number.isFinite(value)) return { refreshMs: DEFAULT_REFRESH_MS }
  return { refreshMs: Math.max(MIN_REFRESH_MS, Math.min(MAX_REFRESH_MS, Math.round(value))) }
}
