import { describe, expect, test } from "bun:test"
import { createPoller, type Timers } from "../src/poller"
import type { SystemStats } from "../src/types"
import { fullStats } from "./fixtures"

function fakeTimers() {
  const pending = new Map<number, { fn: () => void; ms: number }>()
  let next = 0
  const timers: Timers = {
    set: (fn, ms) => {
      pending.set(++next, { fn, ms })
      return next
    },
    clear: (handle) => pending.delete(handle as number),
  }
  const fire = async () => {
    const [id, entry] = [...pending.entries()][0]!
    pending.delete(id)
    entry.fn()
    await settle()
    return entry.ms
  }
  return { timers, pending, fire }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(collect?: (signal: AbortSignal) => Promise<SystemStats>) {
  const t = fakeTimers()
  const log = { collects: 0, published: [] as SystemStats[], errors: [] as unknown[], signals: [] as AbortSignal[] }
  const poller = createPoller({
    collect: async (signal) => {
      log.collects++
      log.signals.push(signal)
      return collect ? collect(signal) : fullStats
    },
    publish: (s) => log.published.push(s),
    onError: (e) => log.errors.push(e),
    intervalMs: 2000,
    primeMs: 500,
    timers: t.timers,
  })
  return { ...t, log, poller }
}

describe("createPoller", () => {
  test("nothing is collected until a view acquires it", async () => {
    const { log, pending } = setup()
    await settle()
    expect(log.collects).toBe(0)
    expect(pending.size).toBe(0)
  })

  test("acquire collects at once, primes after 500 ms, then follows the interval", async () => {
    const { poller, log, fire } = setup()
    poller.acquire()
    await settle()
    expect(log.published).toHaveLength(1)
    expect(await fire()).toBe(500)
    expect(await fire()).toBe(2000)
    expect(await fire()).toBe(2000)
    expect(log.collects).toBe(4)
  })

  test("several views share one polling loop", async () => {
    const { poller, log, pending } = setup()
    poller.acquire()
    poller.acquire()
    await settle()
    expect(log.collects).toBe(1)
    expect(pending.size).toBe(1)
  })

  test("releasing the last view stops polling and aborts the collection in flight", async () => {
    let resolve: (s: SystemStats) => void = () => undefined
    const { poller, log, pending } = setup(() => new Promise((r) => (resolve = r)))
    const releaseA = poller.acquire()
    const releaseB = poller.acquire()
    releaseA()
    expect(log.signals[0]!.aborted).toBe(false)
    releaseB()
    releaseB()
    expect(log.signals[0]!.aborted).toBe(true)
    resolve(fullStats)
    await settle()
    expect(log.published).toHaveLength(0)
    expect(pending.size).toBe(0)
  })

  test("a released then re-acquired poller starts a fresh loop", async () => {
    const { poller, log, fire, pending } = setup()
    const release = poller.acquire()
    await settle()
    release()
    expect(pending.size).toBe(0)
    poller.acquire()
    await settle()
    expect(log.collects).toBe(2)
    expect(await fire()).toBe(500)
  })

  test("the next tick is scheduled only after the collection settles", async () => {
    let resolve: (s: SystemStats) => void = () => undefined
    const { poller, pending } = setup(() => new Promise((r) => (resolve = r)))
    poller.acquire()
    await settle()
    expect(pending.size).toBe(0)
    resolve(fullStats)
    await settle()
    expect(pending.size).toBe(1)
  })

  test("a failing collection is reported and polling continues", async () => {
    const { poller, log, pending } = setup(async () => {
      throw new Error("boom")
    })
    poller.acquire()
    await settle()
    expect(log.errors).toHaveLength(1)
    expect(pending.size).toBe(1)
  })

  test("dispose stops polling and ignores later acquires and releases", async () => {
    const { poller, log, pending } = setup()
    const release = poller.acquire()
    await settle()
    poller.dispose()
    release()
    poller.acquire()
    await settle()
    expect(log.collects).toBe(1)
    expect(pending.size).toBe(0)
  })
})
