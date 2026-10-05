import { spawn, type ChildProcessByStdio } from "node:child_process"
import type { Readable } from "node:stream"

export interface RunOptions {
  timeoutMs: number
  maxBytes: number
  signal?: AbortSignal
  env?: Readonly<Record<string, string>>
  cwd?: string
  onExit?: () => void
}

type Child = ChildProcessByStdio<null, Readable, Readable>

const MAX_ERROR_CHARS = 200

function sink(maxBytes: number, onOverflow: () => void) {
  const chunks: Buffer[] = []
  let size = 0
  return {
    push(chunk: Buffer): void {
      size += chunk.length
      if (size > maxBytes) return onOverflow()
      chunks.push(chunk)
    },
    text: (): string => Buffer.concat(chunks).toString("utf8"),
  }
}

function startChild(file: string, args: readonly string[], opts: RunOptions): Child {
  let exited = false
  const exit = (): void => {
    if (exited) return
    exited = true
    opts.onExit?.()
  }
  try {
    if (opts.signal?.aborted) throw abortError(file)
    const child = spawn(file, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      env: opts.env,
      cwd: opts.cwd,
    })
    let spawned = false
    child.once("spawn", () => (spawned = true))
    child.once("exit", exit)
    child.once("error", () => (!spawned || child.exitCode !== null) && exit())
    return child
  } catch (err) {
    exit()
    throw err
  }
}

function abortError(file: string): Error {
  return Object.assign(new Error(`${file} aborted`), { name: "AbortError", code: "ABORT_ERR" })
}

/**
 * Runs `file` with fixed arguments (no shell, no console window). stdout and stderr are each bounded to `maxBytes`;
 * the child is killed on timeout, overflow or abort. Spawn errors (e.g. ENOENT) are propagated as-is.
 */
export function runCommand(file: string, args: readonly string[], opts: RunOptions): Promise<string> {
  const { timeoutMs, maxBytes, signal } = opts
  return new Promise((resolve, reject) => {
    let child: Child
    try {
      child = startChild(file, args, opts)
    } catch (err) {
      return reject(err)
    }
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
    const fail = (message: string) => (): void => finish(() => reject(new Error(message)), true)
    const timer = setTimeout(fail(`${file} timed out after ${timeoutMs} ms`), timeoutMs)
    const overflow = fail(`${file} output exceeded ${maxBytes} bytes`)
    const out = sink(maxBytes, overflow)
    const err = sink(maxBytes, overflow)

    signal?.addEventListener("abort", onAbort, { once: true })
    child.stdout.on("data", out.push)
    child.stderr.on("data", err.push)
    child.on("error", (e) => finish(() => reject(e)))
    child.on("close", (code) =>
      finish(() => {
        if (code === 0) resolve(out.text())
        else reject(new Error(err.text().trim().slice(0, MAX_ERROR_CHARS) || `${file} exited with code ${code}`))
      }),
    )
  })
}
