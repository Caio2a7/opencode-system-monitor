import { spawn } from "node:child_process"

export interface RunOptions {
  timeoutMs: number
  maxBytes: number
  signal?: AbortSignal
  env?: Readonly<Record<string, string>>
  cwd?: string
}

const MAX_ERROR_CHARS = 200

function abortError(file: string): Error {
  return Object.assign(new Error(`${file} aborted`), { name: "AbortError", code: "ABORT_ERR" })
}

/**
 * Runs `file` with fixed arguments (no shell, no console window). stdout and stderr are each bounded to `maxBytes`;
 * the child is killed on timeout, overflow or abort. Spawn errors (e.g. ENOENT) are propagated as-is.
 */
export function runCommand(file: string, args: readonly string[], opts: RunOptions): Promise<string> {
  const { timeoutMs, maxBytes, signal, env, cwd } = opts
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(file))
    const child = spawn(file, [...args], { stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true, env, cwd })
    let out = ""
    let err = ""
    let done = false

    const finish = (action: () => void, kill = false): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
      if (kill) child.kill("SIGKILL")
      action()
    }
    const onAbort = (): void => finish(() => reject(abortError(file)), true)
    const timer = setTimeout(
      () => finish(() => reject(new Error(`${file} timed out after ${timeoutMs} ms`)), true),
      timeoutMs,
    )
    const overflow = (): void => finish(() => reject(new Error(`${file} output exceeded ${maxBytes} bytes`)), true)

    signal?.addEventListener("abort", onAbort, { once: true })
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk
      if (Buffer.byteLength(out) > maxBytes) overflow()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk
      if (Buffer.byteLength(err) > maxBytes) overflow()
    })
    child.on("error", (e) => finish(() => reject(e)))
    child.on("close", (code) =>
      finish(() => {
        if (code === 0) resolve(out)
        else reject(new Error(err.trim().slice(0, MAX_ERROR_CHARS) || `${file} exited with code ${code}`))
      }),
    )
  })
}
