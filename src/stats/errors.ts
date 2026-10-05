export const hasCode = (err: unknown, code: string): boolean =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === code

export const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

export function notFound(name: string): Error {
  return Object.assign(new Error(`${name} not found`), { code: "ENOENT" })
}
