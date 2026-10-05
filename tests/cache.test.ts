import { describe, expect, test } from "bun:test"
import { cached } from "../src/stats/sources/cache"

describe("cached", () => {
  test("loads once per TTL window and keeps the error of a failed load", async () => {
    const state = { now: 0, loads: 0 }
    const get = cached(() => state.now, 1000, async () => {
      state.loads++
      if (state.loads === 2) throw new Error("boom")
      return state.loads
    })
    expect(await get()).toEqual({ value: 1 })
    state.now = 999
    expect(await get()).toEqual({ value: 1 })
    state.now = 1000
    expect(await get()).toEqual({ value: null, error: "boom" })
    state.now = 1999
    expect(await get()).toEqual({ value: null, error: "boom" })
    state.now = 2000
    expect(await get()).toEqual({ value: 3 })
    expect(state.loads).toBe(3)
  })

  test("an aborted load keeps the previous entry and is retried on the next call", async () => {
    const state = { now: 0, calls: 0 }
    const get = cached(() => state.now, 60_000, async () => {
      state.calls++
      if (state.calls === 2) throw Object.assign(new Error("aborted"), { code: "ABORT_ERR" })
      return state.calls
    })
    expect(await get()).toEqual({ value: 1 })
    state.now = 60_000
    expect(await get()).toEqual({ value: 1 })
    expect(await get()).toEqual({ value: 3 })
    expect(state.calls).toBe(3)
  })

  test("a zero TTL loads on every call", async () => {
    let calls = 0
    const get = cached(() => 5, 0, async () => ++calls)
    await get()
    await get()
    expect(calls).toBe(2)
  })
})
