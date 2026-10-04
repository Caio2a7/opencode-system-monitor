import { lerp } from "./scale"
import type { Color, Palette } from "./types"

// The theme is an external object; the tokens below are narrowed structurally instead of via `any`.
interface Theme {
  border: { base: Color }
  text: {
    base: Color
    muted: Color
    feedback: Record<"success" | "warning" | "error" | "info", { base: Color }>
  }
  syntax: { type: Color; keyword: Color }
}

/** Palette from the active theme tokens; no fixed colors. Pink has no token, so it blends purple into error. */
export function palette(theme: unknown): Palette {
  const t = theme as Theme
  const purple = t.syntax.keyword
  const error = t.text.feedback.error.base
  return {
    base: t.text.base,
    muted: t.text.muted,
    border: t.border.base,
    success: t.text.feedback.success.base,
    warning: t.text.feedback.warning.base,
    yellow: t.syntax.type,
    error,
    purple,
    pink: lerp(purple, error, 0.4),
    info: t.text.feedback.info.base,
  }
}
