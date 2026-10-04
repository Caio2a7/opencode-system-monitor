import { readFile, statfs } from "node:fs/promises"
import type { CpuStats, DiskStats, GpuResult, NetStats, RamStats, SystemStats } from "../types"
import { createNetMeter } from "./net"
import { cpuPercent, diskPercent, parseCpuTimes, parseMeminfo, parseNvidiaSmi, sumRxBytes } from "./parse"
import { runNvidiaSmi } from "./smi"

export interface CollectorDeps {
  readText(path: string): Promise<string>
  statfs(path: string): Promise<{ blocks: number; bfree: number; bavail: number }>
  runSmi(signal?: AbortSignal): Promise<string>
  now(): number
}

const defaultDeps: CollectorDeps = {
  readText: (path) => readFile(path, "utf8"),
  statfs: async (path) => {
    const s = await statfs(path)
    return { blocks: s.blocks, bfree: s.bfree, bavail: s.bavail }
  },
  runSmi: runNvidiaSmi,
  now: Date.now,
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

/** Creates a stats collector; CPU and network deltas are kept inside the instance. */
export function createCollector(overrides: Partial<CollectorDeps> = {}): { collect(signal?: AbortSignal): Promise<SystemStats> } {
  const deps: CollectorDeps = { ...defaultDeps, ...overrides }
  const meter = createNetMeter()
  let prevCpu: ReturnType<typeof parseCpuTimes> = null

  const cpu = async (): Promise<CpuStats | null> => {
    const next = parseCpuTimes(await deps.readText("/proc/stat"))
    const prev = prevCpu
    prevCpu = next
    return next ? { percent: cpuPercent(prev, next) } : null
  }
  const ram = async (): Promise<RamStats | null> => parseMeminfo(await deps.readText("/proc/meminfo"))
  const disk = async (): Promise<DiskStats | null> => {
    const percent = diskPercent(await deps.statfs("/"))
    return percent === null ? null : { percent }
  }
  const net = async (): Promise<NetStats | null> =>
    meter.sample(sumRxBytes(await deps.readText("/proc/net/dev")), deps.now())

  return {
    async collect(signal) {
      const [c, r, d, g, n] = await Promise.allSettled([cpu(), ram(), disk(), collectGpu(deps, signal), net()])
      return {
        cpu: settled(c),
        ram: settled(r),
        disk: settled(d),
        gpu: g.status === "fulfilled" ? g.value : null,
        net: settled(n),
      }
    },
  }
}
