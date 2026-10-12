import type { SwapStats } from "../../types"
import { cpuTimesFromCpus, parsePageFile, ramFromTotals, WIN_PAGEFILE_SCRIPT } from "../parse-os"
import type { CollectorDeps, StatsSource } from "./types"

const SWAP_REFRESH_MS = 30_000
const POWERSHELL_ARGS = ["-NoProfile", "-NonInteractive", "-Command", WIN_PAGEFILE_SCRIPT]
const SHELL_CANDIDATES = ["powershell.exe", "pwsh.exe"] as const

const isEnoent = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT"

export function win32Source(deps: CollectorDeps): StatsSource {
  let cached: SwapStats | null = null
  let nextRefresh = 0
  let resolvedShell: string | null = null

  const queryPageFile = async (signal?: AbortSignal): Promise<SwapStats | null> => {
    const bins = resolvedShell !== null ? [resolvedShell] : SHELL_CANDIDATES
    for (const bin of bins) {
      try {
        const out = await deps.run(bin, POWERSHELL_ARGS, signal)
        resolvedShell = bin
        return parsePageFile(out)
      } catch (err) {
        if (!isEnoent(err)) {
          resolvedShell = bin
          return null
        }
      }
    }
    return null
  }

  /** PowerShell is slow: refresh at most every 30 s, failures keep null until the next refresh. */
  const swap = async (signal?: AbortSignal): Promise<SwapStats | null> => {
    const now = deps.now()
    if (now < nextRefresh) return cached
    nextRefresh = now + SWAP_REFRESH_MS
    cached = await queryPageFile(signal)
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
