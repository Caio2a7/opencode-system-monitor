import type { GpuStats, RamStats, SwapStats } from "../types"

const BYTES_PER_GIB = 1024 ** 3
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

const clampPct = (n: number): number => Math.max(0, Math.min(100, n))
const SMI_NA = /^\[?(?:N\/A|Not Supported)\]?$/i

export function cpuPercent(prev: CpuTimes | null, next: CpuTimes | null): number | null {
  if (!prev || !next) return null
  const dTotal = next.total - prev.total
  const dIdle = next.idle - prev.idle
  if (dTotal <= 0 || dIdle < 0) return null
  return clampPct((1 - dIdle / dTotal) * 100)
}

function meminfoKib(text: string, key: string): number | null {
  const match = new RegExp(`^${key}:\\s+(\\d+)`, "m").exec(text)
  return match?.[1] === undefined ? null : Number(match[1])
}

/** used = MemTotal - MemAvailable, clamped to [0, MemTotal]. */
export function parseMeminfo(meminfo: string): RamStats | null {
  const total = meminfoKib(meminfo, "MemTotal")
  const available = meminfoKib(meminfo, "MemAvailable")
  if (total === null || available === null || total <= 0) return null
  const used = Math.min(total, Math.max(0, total - available))
  return { percent: (used / total) * 100, usedGiB: used / KIB_PER_GIB, totalGiB: total / KIB_PER_GIB }
}

/** Parses Linux cgroup v2 `memory.max` and `memory.current` when a container limit (< host RAM) is active. */
export function parseCgroupMemory(maxRaw: string, currentRaw: string, hostTotalGiB?: number): RamStats | null {
  const maxTrim = maxRaw.trim()
  const curTrim = currentRaw.trim()
  if (maxTrim === "" || maxTrim === "max" || curTrim === "") return null
  const limit = Number(maxTrim)
  const current = Number(curTrim)
  if (!Number.isFinite(limit) || !Number.isFinite(current) || limit <= 0 || current < 0) return null
  const totalGiB = limit / BYTES_PER_GIB
  if (hostTotalGiB !== undefined && totalGiB >= hostTotalGiB) return null
  const used = Math.min(limit, current)
  return { percent: clampPct((used / limit) * 100), usedGiB: used / BYTES_PER_GIB, totalGiB }
}

/** used = SwapTotal - SwapFree; null when swap is absent (SwapTotal 0 or missing). */
export function parseSwap(meminfo: string): SwapStats | null {
  const total = meminfoKib(meminfo, "SwapTotal")
  const free = meminfoKib(meminfo, "SwapFree")
  if (total === null || free === null || total <= 0) return null
  const used = Math.min(total, Math.max(0, total - free))
  return { percent: (used / total) * 100, usedGiB: used / KIB_PER_GIB, totalGiB: total / KIB_PER_GIB }
}

/** Numeric field or `"na"` when nvidia-smi reports `[N/A]` / `[Not Supported]`; `"bad"` on arbitrary garbage. */
function smiNumber(raw: string): number | "na" | "bad" {
  if (SMI_NA.test(raw)) return "na"
  const n = Number(raw)
  return raw !== "" && Number.isFinite(n) && n >= 0 ? n : "bad"
}

/** Parses one GPU line (default: the first) of `--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name`. */
export function parseNvidiaSmi(stdout: string, index = 0): GpuStats | null {
  const lines = stdout.split("\n").map((l) => l.trim()).filter((l) => l !== "")
  const fields = lines[index]?.split(",").map((s) => s.trim())
  if (!fields || fields.length < 5) return null
  const [utilRaw, usedRaw, totalRaw, tempRaw] = fields as [string, string, string, string]
  const util = smiNumber(utilRaw)
  const used = smiNumber(usedRaw)
  const total = smiNumber(totalRaw)
  const temp = Number(tempRaw)
  if (util === "bad" || used === "bad" || total === "bad") return null
  const hasVram = typeof used === "number" && typeof total === "number"
  if (util === "na" && !hasVram) return null
  const clampedUsed = hasVram ? Math.min(used, total) : 0
  return {
    name: fields.slice(4).join(","),
    util: typeof util === "number" ? clampPct(util) : null,
    temp: tempRaw !== "" && Number.isFinite(temp) ? temp : null,
    vramPercent: hasVram ? (total > 0 ? clampPct((clampedUsed / total) * 100) : 0) : null,
    vramUsedGiB: hasVram ? clampedUsed / MIB_PER_GIB : null,
    vramTotalGiB: hasVram ? total / MIB_PER_GIB : null,
  }
}

function sysfsNumber(raw: string | null): number | null | "bad" {
  if (raw === null) return null
  const trimmed = raw.trim()
  const n = Number(trimmed)
  return trimmed !== "" && Number.isFinite(n) && n >= 0 ? n : "bad"
}

/** Parses Linux DRM/amdgpu sysfs files (`gpu_busy_percent`, `mem_info_vram_used`, `mem_info_vram_total`, `temp1_input`). */
export function parseAmdGpu(
  busyRaw: string | null,
  vramUsedRaw: string | null,
  vramTotalRaw: string | null,
  tempRaw: string | null = null,
  name = "AMD GPU",
): GpuStats | null {
  const util = sysfsNumber(busyRaw)
  const used = sysfsNumber(vramUsedRaw)
  const total = sysfsNumber(vramTotalRaw)
  if (util === "bad" || used === "bad" || total === "bad") return null
  const hasVram = typeof used === "number" && typeof total === "number"
  if (util === null && !hasVram) return null
  const clampedUsed = hasVram ? Math.min(used, total) : 0
  const tempMilli = sysfsNumber(tempRaw)
  return {
    name: name.trim() || "AMD GPU",
    util: typeof util === "number" ? clampPct(util) : null,
    temp: typeof tempMilli === "number" ? tempMilli / 1000 : null,
    vramPercent: hasVram ? (total > 0 ? clampPct((clampedUsed / total) * 100) : 0) : null,
    vramUsedGiB: hasVram ? clampedUsed / BYTES_PER_GIB : null,
    vramTotalGiB: hasVram ? total / BYTES_PER_GIB : null,
  }
}

/** Same formula as `df`: used / (used + available to unprivileged users). */
export function diskPercent(fs: { blocks: number; bfree: number; bavail: number }): number | null {
  if (![fs.blocks, fs.bfree, fs.bavail].every(Number.isFinite) || fs.blocks <= 0 || fs.bavail < 0) return null
  const used = Math.max(0, fs.blocks - fs.bfree)
  const denom = used + fs.bavail
  return denom > 0 ? clampPct((used / denom) * 100) : null
}
