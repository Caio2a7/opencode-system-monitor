import type { ResolvedTheme } from "@opencode/theme/tui"
import { hueOf, lerp } from "./scale"
import type { Color, Palette } from "./types"

type Tone = Pick<ResolvedTheme["text"]["feedback"]["success"], "base">

export interface ThemeTokens {
  readonly border: Pick<ResolvedTheme["border"], "base">
  readonly text: Pick<ResolvedTheme["text"], "base" | "muted"> & {
    readonly feedback: Readonly<Record<"success" | "warning" | "error", Tone>>
  }
  readonly syntax: Pick<ResolvedTheme["syntax"], "type" | "keyword">
}

const YELLOW_HUES = [35, 75] as const

function yellowOf(t: ThemeTokens): Color {
  const hue = hueOf(t.syntax.type)
  if (hue !== null && hue >= YELLOW_HUES[0] && hue <= YELLOW_HUES[1]) return t.syntax.type
  return lerp(t.text.feedback.success.base, t.text.feedback.warning.base, 0.5)
}

/** Palette from the active theme tokens; no fixed colors. Pink has no token, so it blends purple into error. */
export function palette(t: ThemeTokens): Palette {
  const purple = t.syntax.keyword
  const error = t.text.feedback.error.base
  return {
    base: t.text.base,
    muted: t.text.muted,
    border: t.border.base,
    success: t.text.feedback.success.base,
    warning: t.text.feedback.warning.base,
    yellow: yellowOf(t),
    error,
    purple,
    pink: lerp(purple, error, 0.4),
  }
}
