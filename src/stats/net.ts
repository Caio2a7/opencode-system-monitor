import type { NetStats } from "../types"

const DEFAULT_WINDOW = 30
const DEFAULT_FLOOR_BPS = 1_048_576

/** Receive-rate meter whose bar scales against the recent peak (never below the floor). */
export function createNetMeter(opts: { window?: number; floorBps?: number } = {}): {
  sample(rxBytes: number, nowMs: number): NetStats
} {
  const window = opts.window ?? DEFAULT_WINDOW
  const floor = opts.floorBps ?? DEFAULT_FLOOR_BPS
  const rates: number[] = []
  let prev: { bytes: number; now: number } | null = null

  return {
    sample(rxBytes, nowMs) {
      const last = prev
      prev = { bytes: rxBytes, now: nowMs }
      if (!last || rxBytes < last.bytes || nowMs <= last.now) return { rate: null, percent: null }
      const rate = ((rxBytes - last.bytes) / (nowMs - last.now)) * 1000
      rates.push(rate)
      if (rates.length > window) rates.shift()
      const peak = Math.max(floor, ...rates)
      return { rate, percent: (rate / peak) * 100 }
    },
  }
}
