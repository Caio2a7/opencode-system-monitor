import type { DiskStats, GpuStats, RamStats, SwapStats } from "../types"

const KIB_PER_GIB = 1024 * 1024
const MIB_PER_GIB = 1024
const BYTES_PER_GIB = 1024 ** 3

export interface FsStats {
  bsize: number
  blocks: number
  bfree: number
  bavail: number
}

export interface CpuTimes {
  idle: number
  total: number
}

/** Parses the aggregate "cpu " line of /proc/stat; idle includes iowait. */
export function parseCpuTimes(procStat: string): CpuTimes | null {
  const line = procStat.split("\n").find((l) => l.startsWith("cpu "))
  if (!line) return null
  const values = line.trim().split(/\s+/).slice(1).map(Number)
  if (values.length === 0 || values.some((n) => !Number.isFinite(n))) return null
  return { idle: (values[3] ?? 0) + (values[4] ?? 0), total: values.reduce((a, b) => a + b, 0) }
}

export function cpuPercent(prev: CpuTimes | null, next: CpuTimes | null): number | null {
  if (!prev || !next) return null
  const dTotal = next.total - prev.total
  if (dTotal <= 0) return null
  return (1 - (next.idle - prev.idle) / dTotal) * 100
}

function meminfoKib(text: string, key: string): number | null {
  const match = new RegExp(`^${key}:\\s+(\\d+)`, "m").exec(text)
  return match?.[1] === undefined ? null : Number(match[1])
}

/** used = MemTotal - MemAvailable. */
export function parseMeminfo(meminfo: string): RamStats | null {
  const total = meminfoKib(meminfo, "MemTotal")
  const available = meminfoKib(meminfo, "MemAvailable")
  if (total === null || available === null || total <= 0) return null
  const used = total - available
  return { percent: (used / total) * 100, usedGiB: used / KIB_PER_GIB, totalGiB: total / KIB_PER_GIB }
}

/** used = SwapTotal - SwapFree; null when swap is absent (SwapTotal 0 or missing). */
export function parseSwap(meminfo: string): SwapStats | null {
  const total = meminfoKib(meminfo, "SwapTotal")
  const free = meminfoKib(meminfo, "SwapFree")
  if (total === null || free === null || total <= 0) return null
  const used = Math.max(0, total - free)
  return { percent: (used / total) * 100, usedGiB: used / KIB_PER_GIB, totalGiB: total / KIB_PER_GIB }
}

/** Parses the first GPU line of `--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name`. */
export function parseNvidiaSmi(stdout: string): GpuStats | null {
  const fields = stdout.trim().split("\n")[0]?.split(",").map((s) => s.trim())
  if (!fields || fields.length < 5) return null
  const [util, used, total, temp] = fields.slice(0, 4).map(Number) as [number, number, number, number]
  if (![util, used, total].every(Number.isFinite)) return null
  return {
    name: fields.slice(4).join(","),
    util,
    temp: Number.isFinite(temp) ? temp : null,
    vramPercent: total > 0 ? (used / total) * 100 : 0,
    vramUsedGiB: used / MIB_PER_GIB,
    vramTotalGiB: total / MIB_PER_GIB,
  }
}

export function diskUsage(fs: FsStats, apfs = false): DiskStats | null {
  const used = fs.blocks - (apfs ? fs.bavail : fs.bfree)
  const total = apfs ? fs.blocks : used + fs.bavail
  if (!(total > 0)) return null
  const gib = (blocks: number) => (blocks * fs.bsize) / BYTES_PER_GIB
  return { percent: (used / total) * 100, usedGiB: gib(used), totalGiB: gib(total) }
}
