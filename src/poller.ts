import type { SystemStats } from "./types"

export interface Timers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

export interface PollerOptions {
  collect(signal: AbortSignal): Promise<SystemStats>
  publish(stats: SystemStats): void
  intervalMs: number
  primeMs: number
  onError?(error: unknown): void
  timers?: Timers
}

export interface Poller {
  acquire(): () => void
  dispose(): void
}

interface Run {
  controller: AbortController
  timer?: unknown
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createPoller(opts: PollerOptions): Poller {
  const timers = opts.timers ?? realTimers
  let users = 0
  let disposed = false
  let run: Run | null = null

  const tick = async (current: Run, first: boolean): Promise<void> => {
    try {
      const stats = await opts.collect(current.controller.signal)
      if (run === current) opts.publish(stats)
    } catch (error) {
      if (run === current) opts.onError?.(error)
    }
    if (run !== current) return
    current.timer = timers.set(() => void tick(current, false), first ? Math.min(opts.primeMs, opts.intervalMs) : opts.intervalMs)
  }

  const start = (): void => {
    const current: Run = { controller: new AbortController() }
    run = current
    void tick(current, true)
  }

  const stop = (): void => {
    if (!run) return
    run.controller.abort()
    if (run.timer !== undefined) timers.clear(run.timer)
    run = null
  }

  return {
    acquire() {
      if (disposed) return () => {}
      if (users++ === 0) start()
      let released = false
      return () => {
        if (released || disposed) return
        released = true
        if (--users === 0) stop()
      }
    },
    dispose() {
      disposed = true
      users = 0
      stop()
    },
  }
}
