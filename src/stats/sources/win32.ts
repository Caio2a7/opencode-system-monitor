import type { SwapStats } from "../../types"
import { cpuTimesFromCpus, parsePageFile, ramFromTotals, WIN_PAGEFILE_SCRIPT } from "../parse-os"
import type { CollectorDeps, StatsSource } from "./types"

const SWAP_REFRESH_MS = 30_000
const POWERSHELL_ARGS = ["-NoProfile", "-NonInteractive", "-Command", WIN_PAGEFILE_SCRIPT]

export function win32Source(deps: CollectorDeps): StatsSource {
  let cached: SwapStats | null = null
  let nextRefresh = 0

  /** PowerShell is slow: refresh at most every 30 s, failures keep null until the next refresh. */
  const swap = async (signal?: AbortSignal): Promise<SwapStats | null> => {
    const now = deps.now()
    if (now < nextRefresh) return cached
    nextRefresh = now + SWAP_REFRESH_MS
    try {
      cached = parsePageFile(await deps.run("powershell", POWERSHELL_ARGS, signal))
    } catch {
      cached = null
    }
    return cached
  }
  return {
    hasGpu: true,
    async cpuTimes() {
      return cpuTimesFromCpus(deps.cpus())
    },
    async memory(signal) {
      return { ram: ramFromTotals(deps.totalmem(), deps.freemem()), swap: await swap(signal) }
    },
  }
}
