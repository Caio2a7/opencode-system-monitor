export const hasCode = (err: unknown, code: string): boolean =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === code

export const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]+/g
const MAX_TEXT = 200

export const cleanText = (text: string): string =>
  text.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT)

export function notFound(name: string): Error {
  return Object.assign(new Error(`${name} not found`), { code: "ENOENT" })
}
