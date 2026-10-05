import { cpuTimesFromCpus, ramFromTotals } from "../parse-os"
import type { CollectorDeps, StatsSource } from "./types"

/** Fallback for platforms without a dedicated source: node:os for CPU and RAM, no swap. */
export function genericSource(deps: CollectorDeps): StatsSource {
  return {
    hasGpu: true,
    async cpuTimes() {
      return cpuTimesFromCpus(deps.cpus())
    },
    async memory() {
      return { ram: ramFromTotals(deps.totalmem(), deps.freemem()), swap: null }
    },
  }
}
