import type { RamStats, SwapStats } from "../types"

export const BYTES_PER_KIB = 1024
export const BYTES_PER_MIB = 1024 ** 2
export const BYTES_PER_GIB = 1024 ** 3

function usage(usedBytes: number, totalBytes: number): RamStats | null {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) return null
  const used = Math.min(Math.max(usedBytes, 0), totalBytes)
  return { percent: (used / totalBytes) * 100, usedGiB: used / BYTES_PER_GIB, totalGiB: totalBytes / BYTES_PER_GIB }
}

export const ramFromTotals = (totalBytes: number, availableBytes: number): RamStats | null =>
  usage(totalBytes - availableBytes, totalBytes)

export const ramFromUsed = (usedBytes: number, totalBytes: number): RamStats | null => usage(usedBytes, totalBytes)

export const swapFromUsed = (usedBytes: number, totalBytes: number): SwapStats | null => usage(usedBytes, totalBytes)
