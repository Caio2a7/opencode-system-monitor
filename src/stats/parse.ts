import type { GpuStats, RamStats, SwapStats } from "../types"

export { createNetMeter } from "./net"

/** Interface name prefixes ignored by the network meter ("lo" matches exactly). */
export const NET_SKIP: readonly string[] = ["lo", "docker", "veth", "br-", "virbr", "tun", "tap", "wg"]

const KIB_PER_GIB = 1024 * 1024
const MIB_PER_GIB = 1024

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

/** Same formula as `df`: used / (used + available to unprivileged users). */
export function diskPercent(fs: { blocks: number; bfree: number; bavail: number }): number | null {
  const used = fs.blocks - fs.bfree
  const denom = used + fs.bavail
  return denom > 0 ? (used / denom) * 100 : null
}

const isSkipped = (name: string, skip: readonly string[]): boolean =>
  skip.some((p) => (p === "lo" ? name === p : name.startsWith(p)))

/** Sums received bytes over /proc/net/dev interfaces not in `skip`; malformed lines are ignored. */
export function sumRxBytes(procNetDev: string, skip: readonly string[] = NET_SKIP): number {
  let total = 0
  for (const line of procNetDev.split("\n").slice(2)) {
    const [rawName, rest] = line.split(":")
    if (!rest || rawName === undefined || isSkipped(rawName.trim(), skip)) continue
    const rx = Number(rest.trim().split(/\s+/)[0])
    if (Number.isFinite(rx)) total += rx
  }
  return total
}
