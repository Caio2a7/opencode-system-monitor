import type { Color, MetricKind, Palette, ThemeColor } from "./types"

// Theme-derived color scales: linear interpolation between theme tokens.
export const USAGE_HIGH = 65
export const USAGE_MID = USAGE_HIGH / 2
export const USAGE_WARN = 80
export const USAGE_CRIT = 92
export const TEMP_COOL = 50
export const TEMP_WARN = 60
export const TEMP_HOT = 75
export const TEMP_CRIT = 85

type Rgb = [number, number, number]
type MathColor = Color | ThemeColor
type Stop = [number, MathColor]

const hex2 = (n: number): string => Math.round(n).toString(16).padStart(2, "0")
const rgbHex = ([r, g, b]: Rgb): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`

function toRgb(color: MathColor): Rgb {
  if (typeof color !== "string") {
    const [r, g, b] = color.toInts()
    return [r, g, b]
  }
  const n = parseInt(color.slice(1, 7), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Linear interpolation between two colors; t is clamped to [0, 1]. */
export function lerp(from: MathColor, to: MathColor, t: number): string {
  const k = Math.max(0, Math.min(1, t))
  const [r1, g1, b1] = toRgb(from)
  const [r2, g2, b2] = toRgb(to)
  return rgbHex([r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k])
}

export const toHex = (color: MathColor): string => rgbHex(toRgb(color))

/** Color at v along ascending [x, color] stops; clamps at both ends. */
function stops(points: [Stop, ...Stop[]], v: number): string {
  const first = points[0]
  const last = points[points.length - 1] as Stop
  if (v >= last[0]) return toHex(last[1])
  if (v <= first[0]) return toHex(first[1])
  const i = points.findIndex(([x]) => v < x)
  const [x0, c0] = points[i - 1] as Stop
  const [x1, c1] = points[i] as Stop
  return lerp(c0, c1, (v - x0) / (x1 - x0))
}

/** Color below USAGE_HIGH; every scale ends continuous with yellow at 65. */
function lowColor(c: Palette, kind: MetricKind, v: number): string {
  switch (kind) {
    case "cpu":
    case "ram":
    case "swap":
      return lerp(c.success, c.yellow, v / USAGE_HIGH)
    case "gpu":
    case "vram":
      return stops([[0, c.purple], [USAGE_MID, c.pink], [USAGE_HIGH, c.yellow]], v)
    case "disk":
      return toHex(c.base)
  }
}

/** Bar/percent color: per-kind low range; from 65% yellow -> orange -> red. */
export function usageColor(colors: Palette, kind: MetricKind, value: number): Color {
  if (value >= USAGE_HIGH) {
    return stops(
      [[USAGE_HIGH, colors.yellow], [USAGE_WARN, colors.warning], [USAGE_CRIT, colors.error]],
      value,
    )
  }
  return lowColor(colors, kind, value)
}

/** Temperature: green up to 50 °C; 50 -> 60 green to yellow; 75 orange; 85 red. */
export function tempColor(colors: Palette, tempC: number): Color {
  return stops(
    [
      [TEMP_COOL, colors.success],
      [TEMP_WARN, colors.yellow],
      [TEMP_HOT, colors.warning],
      [TEMP_CRIT, colors.error],
    ],
    tempC,
  )
}
