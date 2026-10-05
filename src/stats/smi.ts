import { runCommand } from "./run"

const SMI_ARGS = [
  "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name",
  "--format=csv,noheader,nounits",
]
const SMI_TIMEOUT_MS = 3000
const MAX_OUTPUT_BYTES = 64 * 1024

/** Runs nvidia-smi with fixed arguments (no shell). Rejects with ENOENT when it is not installed. */
export function runNvidiaSmi(signal?: AbortSignal): Promise<string> {
  return runCommand("nvidia-smi", SMI_ARGS, { timeoutMs: SMI_TIMEOUT_MS, maxBytes: MAX_OUTPUT_BYTES, signal })
}
