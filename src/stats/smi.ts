import { runCommand } from "./run"

export const SMI_ARGS: readonly string[] = [
  "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name",
  "--format=csv,noheader,nounits",
]
const SMI_TIMEOUT_MS = 3000
const MAX_OUTPUT_BYTES = 64 * 1024

export type SmiExec = (file: string, args: readonly string[], signal?: AbortSignal) => Promise<string>

const defaultExec: SmiExec = (file, args, signal) =>
  runCommand(file, args, { timeoutMs: SMI_TIMEOUT_MS, maxBytes: MAX_OUTPUT_BYTES, signal })

const isEnoent = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT"

/** Ordered list of nvidia-smi executable candidates for the given platform. */
export function smiCandidates(
  platform: string = process.platform,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  if (platform === "win32") {
    const sysRoot = (env.SystemRoot || "C:\\Windows").replace(/[\\/]+$/, "")
    const progFiles = (env.ProgramFiles || "C:\\Program Files").replace(/[\\/]+$/, "")
    return [
      "nvidia-smi",
      `${sysRoot}\\System32\\nvidia-smi.exe`,
      `${progFiles}\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe`,
    ]
  }
  if (platform === "linux") return ["nvidia-smi", "/usr/lib/wsl/lib/nvidia-smi"]
  return ["nvidia-smi"]
}

/** Creates an nvidia-smi runner that probes fallback paths on ENOENT and caches the working binary. */
export function createSmiRunner(
  exec: SmiExec = defaultExec,
  platform: string = process.platform,
  env: Readonly<Record<string, string | undefined>> = process.env,
): (signal?: AbortSignal) => Promise<string> {
  const candidates = smiCandidates(platform, env)
  let resolved: string | null = null
  return async (signal?: AbortSignal): Promise<string> => {
    if (resolved !== null) return exec(resolved, SMI_ARGS, signal)
    let lastErr: unknown
    for (const bin of candidates) {
      try {
        const out = await exec(bin, SMI_ARGS, signal)
        resolved = bin
        return out
      } catch (err) {
        if (!isEnoent(err)) {
          resolved = bin
          throw err
        }
        lastErr = err
      }
    }
    throw lastErr
  }
}

/** Runs nvidia-smi with fixed arguments (no shell). Rejects with ENOENT when it is not installed. */
export function runNvidiaSmi(signal?: AbortSignal): Promise<string> {
  return createSmiRunner()(signal)
}
