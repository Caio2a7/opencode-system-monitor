import { parseCpuTimes, parseMeminfo, parseSwap } from "../parse"
import type { CollectorDeps, StatsSource } from "./types"

export function linuxSource(deps: CollectorDeps): StatsSource {
  return {
    hasGpu: true,
    async cpuTimes() {
      return parseCpuTimes(await deps.readText("/proc/stat"))
    },
    async memory() {
      const meminfo = await deps.readText("/proc/meminfo")
      return { ram: parseMeminfo(meminfo), swap: parseSwap(meminfo) }
    },
  }
}
