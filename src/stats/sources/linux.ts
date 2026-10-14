import type { RamStats } from "../../types"
import { parseCgroupMemory, parseCpuTimes, parseMeminfo, parseSwap } from "../parse"
import type { CollectorDeps, StatsSource } from "./types"

export function linuxSource(deps: CollectorDeps): StatsSource {
  let cgroupLimited: boolean | null = null

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
  }
}
