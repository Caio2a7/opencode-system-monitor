import type { GpuStats, RamStats } from "../../types"
import { parseAmdGpu, parseCgroupMemory, parseCpuTimes, parseMeminfo, parseSwap } from "../parse"
import type { CollectorDeps, StatsSource } from "./types"

const DRM_CARDS = ["card0", "card1"] as const

export function linuxSource(deps: CollectorDeps): StatsSource {
  let cgroupLimited: boolean | null = null
  let amdCard: string | "none" | null = null

  const tryRead = (path: string): Promise<string | null> => deps.readText(path).catch(() => null)

  const resolveRam = async (hostRam: RamStats | null): Promise<RamStats | null> => {
    if (hostRam === null || cgroupLimited === false) return hostRam
    const [maxRaw, curRaw] = await Promise.all([
      tryRead("/sys/fs/cgroup/memory.max"),
      tryRead("/sys/fs/cgroup/memory.current"),
    ])
    if (maxRaw === null || curRaw === null) {
      cgroupLimited = false
      return hostRam
    }
    const cgRam = parseCgroupMemory(maxRaw, curRaw, hostRam.totalGiB)
    cgroupLimited = cgRam !== null
    return cgRam ?? hostRam
  }

  const readAmdCard = async (card: string): Promise<GpuStats | null> => {
    const base = `/sys/class/drm/${card}/device`
    const [busy, used, total] = await Promise.all([
      tryRead(`${base}/gpu_busy_percent`),
      tryRead(`${base}/mem_info_vram_used`),
      tryRead(`${base}/mem_info_vram_total`),
    ])
    if (busy === null && (used === null || total === null)) return null
    const [temp0, temp1, name] = await Promise.all([
      tryRead(`${base}/hwmon/hwmon0/temp1_input`),
      tryRead(`${base}/hwmon/hwmon1/temp1_input`),
      tryRead(`${base}/product_name`),
    ])
    return parseAmdGpu(busy, used, total, temp0 ?? temp1, name ?? "AMD GPU")
  }

  return {
    hasGpu: true,
    async cpuTimes() {
      return parseCpuTimes(await deps.readText("/proc/stat"))
    },
    async memory() {
      const meminfo = await deps.readText("/proc/meminfo")
      const [ram, swap] = await Promise.all([resolveRam(parseMeminfo(meminfo)), Promise.resolve(parseSwap(meminfo))])
      return { ram, swap }
    },
    async fallbackGpu() {
      if (amdCard === "none") return null
      if (amdCard !== null) return readAmdCard(amdCard)
      for (const card of DRM_CARDS) {
        const stats = await readAmdCard(card)
        if (stats !== null) {
          amdCard = card
          return stats
        }
      }
      amdCard = "none"
      return null
    },
  }
}
