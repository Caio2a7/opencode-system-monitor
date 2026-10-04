import { spawn } from "node:child_process"

const SMI_ARGS = [
  "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name",
  "--format=csv,noheader,nounits",
]
const SMI_TIMEOUT_MS = 3000
const MAX_OUTPUT_BYTES = 64 * 1024
const MAX_ERROR_CHARS = 200

function abortError(): Error {
  return Object.assign(new Error("nvidia-smi aborted"), { name: "AbortError", code: "ABORT_ERR" })
}

/**
 * Runs nvidia-smi with fixed arguments (no shell). Rejects with ENOENT when it is not installed.
 * stdout and stderr are each bounded to 64 KiB; `signal` aborts the child.
 */
export function runNvidiaSmi(signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const child = spawn("nvidia-smi", SMI_ARGS, { stdio: ["ignore", "pipe", "pipe"], shell: false })
    let out = ""
    let err = ""
    let settledFlag = false

    const finish = (action: () => void, kill = false): void => {
      if (settledFlag) return
      settledFlag = true
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
      if (kill) child.kill("SIGKILL")
      action()
    }
    const onAbort = (): void => finish(() => reject(abortError()), true)
    const timer = setTimeout(() => finish(() => reject(new Error("nvidia-smi timeout")), true), SMI_TIMEOUT_MS)
    const overflow = (): void => finish(() => reject(new Error("nvidia-smi output exceeded 64 KiB")), true)

    signal?.addEventListener("abort", onAbort, { once: true })
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk
      if (Buffer.byteLength(out) > MAX_OUTPUT_BYTES) overflow()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk
      if (Buffer.byteLength(err) > MAX_OUTPUT_BYTES) overflow()
    })
    child.on("error", (e) => finish(() => reject(e)))
    child.on("close", (code) =>
      finish(() => {
        if (code === 0) resolve(out)
        else reject(new Error(err.trim().slice(0, MAX_ERROR_CHARS) || `nvidia-smi exited with code ${code}`))
      }),
    )
  })
}
