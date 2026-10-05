import { readdir, readFile, statfs } from "node:fs/promises"
import { cpus, freemem, totalmem } from "node:os"
import type { CpuStats, DiskStats, GpuResult, MetricErrors, SystemStats } from "../types"
import { cleanText, messageOf } from "./errors"
import { createGpuProbe, SMI_ARGS } from "./gpu"
import { cpuPercent, diskUsage } from "./parse"
import type { CpuTimes } from "./parse"
import { diskRoot } from "./parse-os"
import { darwinSource } from "./sources/darwin"
import { genericSource } from "./sources/generic"
import { linuxSource } from "./sources/linux"
import type { CollectorDeps, MemoryStats, StatsSource } from "./sources/types"
import { win32Source } from "./sources/win32"
import { createToolRunner, defaultToolHost } from "./tools"

export type { CollectorDeps } from "./sources/types"

const runTool = createToolRunner(defaultToolHost())

const defaultDeps: CollectorDeps = {
  readText: (path) => readFile(path, "utf8"),
  listDir: (path) => readdir(path),
  statfs: async (path) => {
    const s = await statfs(path)
    return { bsize: s.bsize, blocks: s.blocks, bfree: s.bfree, bavail: s.bavail }
  },
  run: runTool,
  cpus: cpus,
  totalmem,
  freemem,
  now: () => performance.now(),
  platform: process.platform,
  env: process.env,
}

const settled = <T>(r: PromiseSettledResult<T | null>): T | null => (r.status === "fulfilled" ? r.value : null)

const reason = (r: PromiseSettledResult<unknown>): string | undefined =>
  r.status === "rejected" ? messageOf(r.reason) : undefined

function errorsOf(
  [c, m, d]: [PromiseSettledResult<unknown>, PromiseSettledResult<MemoryStats>, PromiseSettledResult<unknown>],
  gpu: GpuResult,
): MetricErrors {
  const memory = reason(m)
  const reported = m.status === "fulfilled" ? m.value.errors : undefined
  const found: MetricErrors = {
    cpu: reason(c),
    ram: memory ?? reported?.ram,
    swap: memory ?? reported?.swap,
    disk: reason(d),
    gpu: gpu && "error" in gpu ? gpu.error : undefined,
  }
  return Object.fromEntries(
    Object.entries(found).flatMap(([key, text]) => (text ? [[key, cleanText(text)]] : [])),
  ) as MetricErrors
}

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
  const disk = async (): Promise<DiskStats | null> =>
    diskUsage(await deps.statfs(diskRoot(deps.platform, deps.env)), deps.platform === "darwin")
  const probe = createGpuProbe({ run: (signal) => deps.run("nvidia-smi", SMI_ARGS, signal), now: () => deps.now() })
  const gpu = async (signal?: AbortSignal): Promise<GpuResult> => {
    if (!source.hasGpu) return null
    if (await source.gpuSuspended?.().catch(() => false)) return { suspended: true }
    return probe(signal)
  }

  return {
    async collect(signal) {
      const [c, m, d, g] = await Promise.allSettled([cpu(), source.memory(signal), disk(), gpu(signal)])
      const mem: MemoryStats | null = m.status === "fulfilled" ? m.value : null
      const gpuResult = g.status === "fulfilled" ? g.value : null
      return {
        cpu: settled(c),
        ram: mem?.ram ?? null,
        disk: settled(d),
        gpu: gpuResult,
        swap: mem?.swap ?? null,
        errors: errorsOf([c, m, d], gpuResult),
      }
    },
  }
}
