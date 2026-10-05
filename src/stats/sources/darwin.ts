import { cpuTimesFromCpus, parseSwapUsage, parseVmStat } from "../parse-os"
import type { CollectorDeps, StatsSource } from "./types"

export function darwinSource(deps: CollectorDeps): StatsSource {
  const attempt = async <T>(task: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await task()
    } catch {
      return null
    }
  }
  return {
    hasGpu: false,
    async cpuTimes() {
      return cpuTimesFromCpus(deps.cpus())
    },
    async memory(signal) {
      const [ram, swap] = await Promise.all([
        attempt(async () => parseVmStat(await deps.run("vm_stat", [], signal), deps.totalmem())),
        attempt(async () => parseSwapUsage(await deps.run("sysctl", ["-n", "vm.swapusage"], signal))),
      ])
      return { ram, swap }
    },
  }
}
