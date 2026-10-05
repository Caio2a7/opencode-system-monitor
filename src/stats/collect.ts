import { readFile, statfs } from "node:fs/promises"
import type { CpuStats, DiskStats, GpuResult, RamStats, SwapStats, SystemStats } from "../types"
import { cpuPercent, diskPercent, parseCpuTimes, parseMeminfo, parseNvidiaSmi, parseSwap } from "./parse"
import { runNvidiaSmi } from "./smi"

export interface CollectorDeps {
  readText(path: string): Promise<string>
  statfs(path: string): Promise<{ blocks: number; bfree: number; bavail: number }>
  runSmi(signal?: AbortSignal): Promise<string>
}

const defaultDeps: CollectorDeps = {
  readText: (path) => readFile(path, "utf8"),
  statfs: async (path) => {
    const s = await statfs(path)
    return { blocks: s.blocks, bfree: s.bfree, bavail: s.bavail }
  },
  runSmi: runNvidiaSmi,
}

const hasCode = (err: unknown, code: string): boolean =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === code

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

const settled = <T>(r: PromiseSettledResult<T | null>): T | null => (r.status === "fulfilled" ? r.value : null)

async function collectGpu(deps: CollectorDeps, signal?: AbortSignal): Promise<GpuResult> {
  try {
    const gpu = parseNvidiaSmi(await deps.runSmi(signal))
    return gpu ?? { error: "unexpected nvidia-smi output" }
  } catch (err) {
    return hasCode(err, "ENOENT") ? null : { error: messageOf(err) }
  }
}

/** Creates a stats collector; CPU deltas are kept inside the instance. */
export function createCollector(overrides: Partial<CollectorDeps> = {}): { collect(signal?: AbortSignal): Promise<SystemStats> } {
  const deps: CollectorDeps = { ...defaultDeps, ...overrides }
  let prevCpu: ReturnType<typeof parseCpuTimes> = null

  const cpu = async (): Promise<CpuStats | null> => {
    const next = parseCpuTimes(await deps.readText("/proc/stat"))
    const prev = prevCpu
    prevCpu = next
    return next ? { percent: cpuPercent(prev, next) } : null
  }
  const memory = async (): Promise<{ ram: RamStats | null; swap: SwapStats | null }> => {
    const meminfo = await deps.readText("/proc/meminfo")
    return { ram: parseMeminfo(meminfo), swap: parseSwap(meminfo) }
  }
  const disk = async (): Promise<DiskStats | null> => {
    const percent = diskPercent(await deps.statfs("/"))
    return percent === null ? null : { percent }
  }

  return {
    async collect(signal) {
      const [c, m, d, g] = await Promise.allSettled([cpu(), memory(), disk(), collectGpu(deps, signal)])
      const mem = m.status === "fulfilled" ? m.value : null
      return {
        cpu: settled(c),
        ram: mem?.ram ?? null,
        disk: settled(d),
        gpu: g.status === "fulfilled" ? g.value : null,
        swap: mem?.swap ?? null,
      }
    },
  }
}
