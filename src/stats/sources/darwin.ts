import type { SwapStats } from "../../types"
import { cpuTimesFromCpus, parseSwapUsage, parseVmStat } from "../parse-os"
import type { CollectorDeps, StatsSource } from "./types"

const SWAP_REFRESH_MS = 10_000

export function darwinSource(deps: CollectorDeps): StatsSource {
  let cachedSwap: SwapStats | null = null
  let nextSwapRefresh = 0
  let swapInflight: Promise<SwapStats | null> | null = null

  const attempt = async <T>(task: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await task()
    } catch {
      return null
    }
  }

  const swap = async (signal?: AbortSignal): Promise<SwapStats | null> => {
    const now = deps.now()
    if (now < nextSwapRefresh) return swapInflight !== null && cachedSwap === null ? swapInflight : cachedSwap
    if (swapInflight === null) {
      nextSwapRefresh = now + SWAP_REFRESH_MS
      swapInflight = attempt(async () => parseSwapUsage(await deps.run("sysctl", ["-n", "vm.swapusage"], signal))).then(
        (res) => {
          cachedSwap = res
          swapInflight = null
          return res
        },
      )
    }
    return cachedSwap !== null ? cachedSwap : swapInflight
  }

  return {
    hasGpu: false,
    async cpuTimes() {
      return cpuTimesFromCpus(deps.cpus())
    },
    async memory(signal) {
      const [ram, s] = await Promise.all([
        attempt(async () => parseVmStat(await deps.run("vm_stat", [], signal), deps.totalmem())),
        swap(signal),
      ])
      return { ram, swap: s }
    },
  }
}
