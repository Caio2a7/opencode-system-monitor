import { USAGE_HIGH, tempColor, usageColor } from "./scale"
import type { Cell, Color, GpuStats, MetricKind, Palette, Segment, SystemStats } from "./types"

export const CELL_WIDTH = 9
export const CELL_GAP = 2

const BAR_CHAR = "━"
const HALF_CHAR = "╸"
const TRACK_CHAR = "─"
const MISSING = "—"

const known = (n: number | null | undefined): n is number => n != null && Number.isFinite(n)
const clamp = (p: number): number => Math.max(0, Math.min(100, p))
const seg = (text: string, fg: Color, bold = false): Segment => ({ text, fg, bold })

export function barSegments(colors: Palette, percent: number | null, accent: Color): Segment[] {
  const halves = known(percent) ? Math.round((clamp(percent) / 100) * CELL_WIDTH * 2) : 0
  const full = halves >> 1
  const half = halves & 1
  const filled = BAR_CHAR.repeat(full) + (half ? HALF_CHAR : "")
  const segs: Segment[] = []
  if (filled) segs.push(seg(filled, accent))
  segs.push(seg(TRACK_CHAR.repeat(CELL_WIDTH - full - half), colors.border))
  return segs
}

const percentValue = (colors: Palette, percent: number | null, accent: Color): Segment =>
  known(percent)
    ? seg(`${Math.round(percent)}%`, percent >= USAGE_HIGH ? accent : colors.base, true)
    : seg(MISSING, colors.muted)

function cell(colors: Palette, label: string, accent: Color, percent: number | null, value: Segment): Cell {
  const pad = Math.max(0, CELL_WIDTH - label.length - value.text.length)
  return {
    label: [seg(label, colors.muted), seg(" ".repeat(pad), colors.muted), value],
    bar: barSegments(colors, percent, accent),
  }
}

function usageCell(colors: Palette, label: string, kind: MetricKind, percent: number | null): Cell {
  const accent = known(percent) ? usageColor(colors, kind, clamp(percent)) : colors.muted
  return cell(colors, label, accent, percent, percentValue(colors, percent, accent))
}

const gpuOf = (stats: SystemStats): GpuStats | null => (stats.gpu && "util" in stats.gpu ? stats.gpu : null)

/** Grid rows: [CPU, RAM, DISK] and [GPU, VRAM, SWAP]; without a GPU the second row holds only SWAP. */
export function gridRows(colors: Palette, stats: SystemStats): Cell[][] {
  const first = [
    usageCell(colors, "CPU", "cpu", stats.cpu?.percent ?? null),
    usageCell(colors, "RAM", "ram", stats.ram?.percent ?? null),
    usageCell(colors, "DISK", "disk", stats.disk?.percent ?? null),
  ]
  const gpu = gpuOf(stats)
  const second = stats.gpu
    ? [
        usageCell(colors, "GPU", "gpu", gpu?.util ?? null),
        usageCell(colors, "VRAM", "vram", gpu?.vramPercent ?? null),
      ]
    : []
  return [first, [...second, usageCell(colors, "SWAP", "swap", stats.swap?.percent ?? null)]]
}

/** Title pieces: the label stays in the base text color, only the GPU temperature follows tempColor. */
export function titleSegments(colors: Palette, stats: SystemStats): Segment[] {
  const temp = gpuOf(stats)?.temp
  if (!known(temp)) return [seg(" System ", colors.base)]
  return [
    seg(" System ·", colors.base),
    seg(` ${Math.round(temp)}°`, tempColor(colors, temp)),
    seg(" ", colors.base),
  ]
}

const flat = (segs: Segment[]): string => segs.map((s) => s.text).join("")

/** Plain-text grid lines (no border), cells joined by CELL_GAP spaces. */
export function gridText(rows: Cell[][]): string[] {
  const gap = " ".repeat(CELL_GAP)
  return rows.flatMap((row) => [row.map((c) => flat(c.label)).join(gap), row.map((c) => flat(c.bar)).join(gap)])
}
