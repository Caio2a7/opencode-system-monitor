import { readFile, statfs } from "node:fs/promises"
import { cpus, freemem, totalmem } from "node:os"
import type { CpuStats, DiskStats, GpuResult, SystemStats } from "../types"
import { cpuPercent, diskPercent, parseNvidiaSmi } from "./parse"
import type { CpuTimes } from "./parse"
import { diskRoot } from "./parse-os"
import { runCommand } from "./run"
import { runNvidiaSmi } from "./smi"
import { darwinSource } from "./sources/darwin"
import { genericSource } from "./sources/generic"
import { linuxSource } from "./sources/linux"
import type { CollectorDeps, MemoryStats, StatsSource } from "./sources/types"
import { win32Source } from "./sources/win32"

export type { CollectorDeps } from "./sources/types"

const RUN_TIMEOUT_MS = 3000
const RUN_MAX_BYTES = 64 * 1024

const defaultDeps: CollectorDeps = {
  readText: (path) => readFile(path, "utf8"),
  statfs: async (path) => {
    const s = await statfs(path)
    return { blocks: s.blocks, bfree: s.bfree, bavail: s.bavail }
  },
  runSmi: runNvidiaSmi,
  run: (file, args, signal) => runCommand(file, args, { timeoutMs: RUN_TIMEOUT_MS, maxBytes: RUN_MAX_BYTES, signal }),
  cpus: cpus,
  totalmem,
  freemem,
  now: Date.now,
  platform: process.platform,
  env: process.env,
}

const hasCode = (err: unknown, code: string): boolean =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === code

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

const settled = <T>(r: PromiseSettledResult<T | null>): T | null => (r.status === "fulfilled" ? r.value : null)

function sourceFor(deps: CollectorDeps): StatsSource {
  switch (deps.platform) {
    case "linux":
      return linuxSource(deps)
    case "darwin":
      return darwinSource(deps)
    case "win32":
      return win32Source(deps)
    default:
      return genericSource(deps)
  }
}

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
  const source = sourceFor(deps)
  let prevCpu: CpuTimes | null = null

  const cpu = async (): Promise<CpuStats | null> => {
    const next = await source.cpuTimes()
    const prev = prevCpu
    prevCpu = next
    return next ? { percent: cpuPercent(prev, next) } : null
  }
  const disk = async (): Promise<DiskStats | null> => {
    const percent = diskPercent(await deps.statfs(diskRoot(deps.platform, deps.env)))
    return percent === null ? null : { percent }
  }
  const gpu = (signal?: AbortSignal): Promise<GpuResult> =>
    source.hasGpu ? collectGpu(deps, signal) : Promise.resolve(null)

  return {
    async collect(signal) {
      const [c, m, d, g] = await Promise.allSettled([cpu(), source.memory(signal), disk(), gpu(signal)])
      const mem: MemoryStats | null = m.status === "fulfilled" ? m.value : null
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
