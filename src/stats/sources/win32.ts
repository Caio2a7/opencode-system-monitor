import { cpuTimesFromCpus, parsePageFile, ramFromTotals, WIN_PAGEFILE_SCRIPT } from "../parse-os"
import { cached } from "./cache"
import type { CollectorDeps, StatsSource } from "./types"

const SWAP_REFRESH_MS = 30_000
const POWERSHELL_ARGS = ["-NoProfile", "-NonInteractive", "-Command", WIN_PAGEFILE_SCRIPT]

export function win32Source(deps: CollectorDeps): StatsSource {
  const swap = cached(deps.now, SWAP_REFRESH_MS, async (signal) =>
    parsePageFile(await deps.run("powershell", POWERSHELL_ARGS, signal)),
  )
  return {
    hasGpu: true,
    async cpuTimes() {
      return cpuTimesFromCpus(deps.cpus())
    },
    async memory(signal) {
      return { ram: ramFromTotals(deps.totalmem(), deps.freemem()), swap: (await swap(signal)).value }
    },
  }
}
