import type { RamStats, SwapStats } from "../types"
import type { CpuTimes } from "./parse"

const BYTES_PER_GIB = 1024 ** 3
const BYTES_PER_MIB = 1024 ** 2
const UNIT_BYTES: Readonly<Record<string, number>> = { K: 1024, M: BYTES_PER_MIB, G: BYTES_PER_GIB, T: 1024 ** 4 }

export const WIN_PAGEFILE_SCRIPT =
  'Get-CimInstance Win32_PageFileUsage | ForEach-Object { "$($_.AllocatedBaseSize) $($_.CurrentUsage)" }'

interface CpuCore {
  times: { user: number; nice: number; sys: number; idle: number; irq: number }
}

/** Sums every core's times (os.cpus); null when no core is reported. */
export function cpuTimesFromCpus(cpus: ReadonlyArray<CpuCore>): CpuTimes | null {
  if (cpus.length === 0) return null
  let idle = 0
  let total = 0
  for (const { times } of cpus) {
    idle += times.idle
    total += times.user + times.nice + times.sys + times.idle + times.irq
  }
  return { idle, total }
}

function ramStats(used: number, total: number): RamStats {
  return { percent: (used / total) * 100, usedGiB: used / BYTES_PER_GIB, totalGiB: total / BYTES_PER_GIB }
}

export function ramFromTotals(totalBytes: number, availableBytes: number): RamStats | null {
  if (!Number.isFinite(totalBytes) || !Number.isFinite(availableBytes) || totalBytes <= 0) return null
  const available = Math.min(Math.max(availableBytes, 0), totalBytes)
  return ramStats(totalBytes - available, totalBytes)
}

function vmStatPages(stdout: string, label: string): number | null {
  const match = new RegExp(`^${label}:\\s+(\\d+)\\.?\\s*$`, "m").exec(stdout)
  return match?.[1] === undefined ? null : Number(match[1])
}

/** macOS `vm_stat`: used = active + wired + compressor pages, clamped to total. */
export function parseVmStat(stdout: string, totalBytes: number): RamStats | null {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null
  const pageSize = Number(/page size of (\d+) bytes/.exec(stdout)?.[1] ?? 4096)
  const pages = ["Pages active", "Pages wired down", "Pages occupied by compressor"].map((l) => vmStatPages(stdout, l))
  if (pages.some((p) => p === null) || !(pageSize > 0)) return null
  const used = (pages as number[]).reduce((a, b) => a + b, 0) * pageSize
  return ramStats(Math.min(used, totalBytes), totalBytes)
}

function swapStats(usedBytes: number, totalBytes: number): SwapStats | null {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) return null
  const used = Math.min(Math.max(usedBytes, 0), totalBytes)
  return { percent: (used / totalBytes) * 100, usedGiB: used / BYTES_PER_GIB, totalGiB: totalBytes / BYTES_PER_GIB }
}

function swapField(stdout: string, key: string): number | null {
  const match = new RegExp(`${key}\\s*=\\s*([\\d.]+)\\s*([KMGT])`, "i").exec(stdout)
  const unit = UNIT_BYTES[match?.[2]?.toUpperCase() ?? ""]
  return match?.[1] === undefined || unit === undefined ? null : Number(match[1]) * unit
}

/** macOS `sysctl -n vm.swapusage`. */
export function parseSwapUsage(stdout: string): SwapStats | null {
  const total = swapField(stdout, "total")
  const used = swapField(stdout, "used")
  return total === null || used === null ? null : swapStats(used, total)
}

/** One "<AllocatedBaseSizeMB> <CurrentUsageMB>" line per Windows page file; sums them all. */
export function parsePageFile(stdout: string): SwapStats | null {
  let total = 0
  let used = 0
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/.exec(line)
    if (!match) continue
    total += Number(match[1])
    used += Number(match[2])
  }
  return swapStats(used * BYTES_PER_MIB, total * BYTES_PER_MIB)
}

export function diskRoot(platform: string, env: Readonly<Record<string, string | undefined>>): string {
  return platform === "win32" ? `${env.SystemDrive ?? "C:"}\\` : "/"
}
