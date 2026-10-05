import type { RGBA } from "@opentui/core"

/** Anything exposing `toInts()`, as RGBA does; accepted by color math. */
export type ThemeColor = Pick<RGBA, "toInts">
/** A theme color or a "#rrggbb" string. */
export type Color = RGBA | string

export interface Palette {
  base: Color
  muted: Color
  border: Color
  success: Color
  warning: Color
  yellow: Color
  error: Color
  purple: Color
  pink: Color
}

export interface CpuStats {
  percent: number | null
}
export interface RamStats {
  percent: number
  usedGiB: number
  totalGiB: number
}
export interface SwapStats {
  percent: number
  usedGiB: number
  totalGiB: number
}
export interface DiskStats {
  percent: number
  usedGiB: number
  totalGiB: number
}
export interface GpuStats {
  util: number
  temp: number | null
  vramPercent: number
  vramUsedGiB: number
  vramTotalGiB: number
  name: string
}
/** `null` means nvidia-smi is not installed. */
export type GpuResult = GpuStats | { error: string } | null
export interface SystemStats {
  cpu: CpuStats | null
  ram: RamStats | null
  disk: DiskStats | null
  gpu: GpuResult
  swap: SwapStats | null
}

export type MetricKind = "cpu" | "ram" | "disk" | "gpu" | "vram" | "swap"

export interface Segment {
  text: string
  fg: Color
  bold?: boolean
}
/** Each line is exactly CELL_WIDTH columns wide. */
export interface Cell {
  label: Segment[]
  bar: Segment[]
}
