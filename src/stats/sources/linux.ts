import type { RamStats } from "../../types"
import { cgroupRam, findCgroupMemory, type CgroupMemory } from "../cgroup"
import { BYTES_PER_GIB } from "../memory"
import { allSuspended, findNvidiaGpus } from "../nvidia-pm"
import { parseCpuTimes, parseMeminfo, parseSwap } from "../parse"
import type { CollectorDeps, StatsSource } from "./types"

export function linuxSource(deps: CollectorDeps): StatsSource {
  let cgroup: Promise<CgroupMemory | null> | undefined
  let gpus: Promise<string[]> | undefined

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
    async gpuSuspended() {
      gpus ??= findNvidiaGpus(deps.readText, deps.listDir)
      return allSuspended(deps.readText, await gpus)
    },
    async memory() {
      const meminfo = await deps.readText("/proc/meminfo")
      const host = parseMeminfo(meminfo)
      return { ram: (host && (await limited(host))) ?? host, swap: parseSwap(meminfo) }
    },
  }
}
