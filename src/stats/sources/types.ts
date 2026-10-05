import type { RamStats, SwapStats } from "../../types"
import type { CpuTimes, FsStats } from "../parse"
import type { Tool } from "../tools"

export interface CollectorDeps {
  readText(path: string): Promise<string>
  statfs(path: string): Promise<FsStats>
  runSmi(signal?: AbortSignal): Promise<string>
  run(tool: Tool, args: readonly string[], signal?: AbortSignal): Promise<string>
  cpus(): ReadonlyArray<{ times: { user: number; nice: number; sys: number; idle: number; irq: number } }>
  totalmem(): number
  freemem(): number
  now(): number
  platform: string
  env: Readonly<Record<string, string | undefined>>
}

export interface MemoryStats {
  ram: RamStats | null
  swap: SwapStats | null
}

/** Platform-specific metric sources; each method may reject, the collector maps that to null. */
export interface StatsSource {
  cpuTimes(): Promise<CpuTimes | null>
  memory(signal?: AbortSignal): Promise<MemoryStats>
  /** false when the platform never has an NVIDIA GPU, so nvidia-smi is not spawned. */
  readonly hasGpu: boolean
}
