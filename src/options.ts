export interface Options {
  refreshMs: number
  /** Filesystem path whose disk usage is shown; `null` means the system drive (`/` or `%SystemDrive%\`). */
  diskPath: string | null
}

const DEFAULT_REFRESH_MS = 2000
const MIN_REFRESH_MS = 500
const MAX_REFRESH_MS = 60_000
const MAX_PATH_LENGTH = 4096

const field = (raw: unknown, key: string): unknown =>
  typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>)[key] : undefined

function parseRefreshMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_REFRESH_MS
  return Math.max(MIN_REFRESH_MS, Math.min(MAX_REFRESH_MS, Math.round(value)))
}

function parseDiskPath(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed === "" || trimmed.length > MAX_PATH_LENGTH || trimmed.includes("\0")) return null
  return trimmed
}

/** Validates untrusted plugin options; invalid values fall back to defaults. */
export function parseOptions(raw: unknown): Options {
  return {
    refreshMs: parseRefreshMs(field(raw, "refreshMs")),
    diskPath: parseDiskPath(field(raw, "diskPath")),
  }
}
