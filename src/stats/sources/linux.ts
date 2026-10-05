import type { RamStats } from "../../types"
import { cgroupRam, findCgroupMemory, type CgroupMemory } from "../cgroup"
import { parseCpuTimes, parseMeminfo, parseSwap } from "../parse"
import type { CollectorDeps, StatsSource } from "./types"

const BYTES_PER_GIB = 1024 ** 3

export function linuxSource(deps: CollectorDeps): StatsSource {
  let cgroup: Promise<CgroupMemory | null> | undefined

  const limited = async (host: RamStats): Promise<RamStats | null> => {
    cgroup ??= findCgroupMemory(deps.readText).catch(() => null)
    const found = await cgroup
    return found && cgroupRam(deps.readText, found, host.totalGiB * BYTES_PER_GIB).catch(() => null)
  }

  return {
    hasGpu: true,
    async cpuTimes() {
      return parseCpuTimes(await deps.readText("/proc/stat"))
    },
    async memory() {
      const meminfo = await deps.readText("/proc/meminfo")
      const host = parseMeminfo(meminfo)
      return { ram: (host && (await limited(host))) ?? host, swap: parseSwap(meminfo) }
    },
  }
}
