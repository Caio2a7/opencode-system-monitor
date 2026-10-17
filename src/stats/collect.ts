import { readFile, statfs } from "node:fs/promises"
import { cpus, freemem, totalmem } from "node:os"
import type { CpuStats, DiskStats, GpuResult, SystemStats } from "../types"
import { cpuPercent, diskPercent, parseNvidiaSmi } from "./parse"
import type { CpuTimes } from "./parse"
import { diskRoot } from "./parse-os"
import { runCommand } from "./run"
import { createSmiRunner, runNvidiaSmi } from "./smi"
import { darwinSource } from "./sources/darwin"
import { genericSource } from "./sources/generic"
import { linuxSource } from "./sources/linux"
import type { CollectorDeps, MemoryStats, StatsSource } from "./sources/types"
import { win32Source } from "./sources/win32"

export type { CollectorDeps } from "./sources/types"

const RUN_TIMEOUT_MS = 3000
const RUN_MAX_BYTES = 64 * 1024
const DISK_REFRESH_MS = 10_000
const GPU_FAST_BUDGET_MS = 250

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

/** Races `task` against `budgetMs`, returning `fallback` if `task` is still pending after the budget. */
function withFastBudget<T>(task: Promise<T>, budgetMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), budgetMs)
    timer.unref?.()
    task.then(
      (val) => {
        clearTimeout(timer)
        resolve(val)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}

export interface CollectorConfig {
  /** Path whose filesystem usage is reported; defaults to `/` or `%SystemDrive%\`. */
  diskPath?: string | null
}

type Reader<T> = (signal?: AbortSignal) => Promise<T>

/** statfs is cheap but disk usage moves slowly: cache successful reads for DISK_REFRESH_MS. */
function createDiskReader(deps: CollectorDeps, path: string): Reader<DiskStats | null> {
  let cached: DiskStats | null = null
  let nextRefresh = 0
  return async () => {
    const now = deps.now()
    if (cached !== null && now < nextRefresh) return cached
    const percent = diskPercent(await deps.statfs(path))
    cached = percent === null ? null : { percent }
    if (cached !== null) nextRefresh = now + DISK_REFRESH_MS
    return cached
  }
}

/** nvidia-smi first (ENOENT cached), then the platform fallback; slow reads are deduplicated and budgeted. */
function createGpuReader(deps: CollectorDeps, source: StatsSource): Reader<GpuResult> {
  let smiAbsent = false
  let last: GpuResult | undefined
  let inflight: Promise<GpuResult> | null = null

  const fetchGpu = async (signal?: AbortSignal): Promise<GpuResult> => {
    if (!smiAbsent) {
      try {
        return parseNvidiaSmi(await deps.runSmi(signal)) ?? { error: "unexpected nvidia-smi output" }
      } catch (err) {
        if (!hasCode(err, "ENOENT")) return { error: messageOf(err) }
        smiAbsent = true
      }
    }
    return (await source.fallbackGpu?.()) ?? null
  }
  return async (signal) => {
    if (!source.hasGpu) return null
    if (inflight === null) {
      inflight = fetchGpu(signal).then((res) => {
        last = res
        inflight = null
        return res
      })
    }
    return last !== undefined ? withFastBudget(inflight, GPU_FAST_BUDGET_MS, last) : inflight
  }
}

function createCpuReader(source: StatsSource): Reader<CpuStats | null> {
  let prev: CpuTimes | null = null
  return async () => {
    const next = await source.cpuTimes()
    if (!next) return null
    const percent = cpuPercent(prev, next)
    prev = next
    return { percent }
  }
}

/** Creates a stats collector; CPU deltas, caches and GPU discovery state are kept inside the instance. */
export function createCollector(
  overrides: Partial<CollectorDeps> = {},
  config: CollectorConfig = {},
): { collect(signal?: AbortSignal): Promise<SystemStats> } {
  const platform = overrides.platform ?? defaultDeps.platform
  const env = overrides.env ?? defaultDeps.env
  const deps: CollectorDeps = { ...defaultDeps, runSmi: createSmiRunner(undefined, platform, env), ...overrides }
  const source = sourceFor(deps)
  const cpu = createCpuReader(source)
  const disk = createDiskReader(deps, config.diskPath ?? diskRoot(deps.platform, deps.env))
  const gpu = createGpuReader(deps, source)

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
