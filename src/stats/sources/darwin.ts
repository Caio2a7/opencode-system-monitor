import { cpuTimesFromCpus, parseSwapUsage, parseVmStat } from "../parse-os"
import { cached } from "./cache"
import type { CollectorDeps, StatsSource } from "./types"

const SWAP_REFRESH_MS = 10_000

export function darwinSource(deps: CollectorDeps): StatsSource {
  const swap = cached(deps.now, SWAP_REFRESH_MS, async (signal) =>
    parseSwapUsage(await deps.run("sysctl", ["-n", "vm.swapusage"], signal)),
  )
  const ram = cached(deps.now, 0, async (signal) => parseVmStat(await deps.run("vm_stat", [], signal), deps.totalmem()))
  return {
    hasGpu: false,
    async cpuTimes() {
      return cpuTimesFromCpus(deps.cpus())
    },
    async memory(signal) {
      const [r, s] = await Promise.all([ram(signal), swap(signal)])
      return { ram: r.value, swap: s.value }
    },
  }
}
