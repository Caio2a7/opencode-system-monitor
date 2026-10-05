import type { GpuResult } from "../types"
import { hasCode, messageOf } from "./errors"
import { parseNvidiaSmi } from "./parse"

export const SMI_ARGS = [
  "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name",
  "--format=csv,noheader,nounits",
]

export const MISSING_RETRY_MS = 5 * 60_000
export const BACKOFF_BASE_MS = 5_000
export const BACKOFF_MAX_MS = 5 * 60_000

export interface GpuProbeDeps {
  run(signal?: AbortSignal): Promise<string>
  now(): number
}

export function createGpuProbe(deps: GpuProbeDeps): (signal?: AbortSignal) => Promise<GpuResult> {
  let last: GpuResult = null
  let retryAt = -Infinity
  let failures = 0

  const fail = (err: unknown): void => {
    const missing = hasCode(err, "ENOENT")
    failures = missing ? 0 : failures + 1
    const delay = missing ? MISSING_RETRY_MS : Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS)
    retryAt = deps.now() + delay
    last = missing ? null : { error: messageOf(err) }
  }

  return async (signal) => {
    if (deps.now() < retryAt) return last
    try {
      const gpu = parseNvidiaSmi(await deps.run(signal))
      if (!gpu) throw new Error("unexpected nvidia-smi output")
      failures = 0
      last = gpu
    } catch (err) {
      if (!hasCode(err, "ABORT_ERR")) fail(err)
    }
    return last
  }
}
