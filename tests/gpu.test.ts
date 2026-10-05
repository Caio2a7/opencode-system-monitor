import { describe, expect, test } from "bun:test"
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, MISSING_RETRY_MS, createGpuProbe } from "../src/stats/gpu"
import { SMI_LINE } from "./fixtures"

const errno = (code: string, message = code) => Object.assign(new Error(message), { code })

function setup(outcomes: Array<string | Error>) {
  const state = { now: 0, runs: 0 }
  const probe = createGpuProbe({
    now: () => state.now,
    run: async () => {
      const next = outcomes[Math.min(state.runs++, outcomes.length - 1)]!
      if (next instanceof Error) throw next
      return next
    },
  })
  return { state, probe }
}

describe("createGpuProbe", () => {
  test("parses a successful run every time", async () => {
    const { state, probe } = setup([SMI_LINE])
    expect(await probe()).toMatchObject({ util: 89 })
    expect(await probe()).toMatchObject({ util: 89 })
    expect(state.runs).toBe(2)
  })

  test("a missing nvidia-smi is remembered for 5 minutes", async () => {
    const { state, probe } = setup([errno("ENOENT"), SMI_LINE])
    expect(await probe()).toBeNull()
    state.now = MISSING_RETRY_MS - 1
    expect(await probe()).toBeNull()
    expect(state.runs).toBe(1)
    state.now = MISSING_RETRY_MS
    expect(await probe()).toMatchObject({ util: 89 })
  })

  test("the delay after a failure doubles and is capped", async () => {
    const { state, probe } = setup([new Error("x")])
    const delays: number[] = []
    for (let i = 0; i < 10; i++) {
      const start = state.now
      expect(await probe()).toEqual({ error: "x" })
      let t = start
      const runs = state.runs
      while (state.runs === runs) {
        t += 500
        state.now = t
        await probe()
      }
      delays.push(t - start)
      state.now = t
    }
    expect(delays[0]).toBe(BACKOFF_BASE_MS)
    expect(delays[1]).toBe(2 * BACKOFF_BASE_MS)
    expect(delays[2]).toBe(4 * BACKOFF_BASE_MS)
    expect(Math.max(...delays)).toBe(BACKOFF_MAX_MS)
  })

  test("a success after failures resets the backoff", async () => {
    const { state, probe } = setup([new Error("x"), SMI_LINE, new Error("y")])
    await probe()
    state.now = BACKOFF_BASE_MS
    expect(await probe()).toMatchObject({ util: 89 })
    expect(await probe()).toEqual({ error: "y" })
    state.now += BACKOFF_BASE_MS
    await probe()
    expect(state.runs).toBe(4)
  })

  test("unparsable output is a failure", async () => {
    const { probe } = setup(["garbage"])
    expect(await probe()).toEqual({ error: "unexpected nvidia-smi output" })
  })

  test("an abort keeps the last result and schedules no backoff", async () => {
    const { state, probe } = setup([SMI_LINE, errno("ABORT_ERR", "aborted"), SMI_LINE])
    await probe()
    expect(await probe()).toMatchObject({ util: 89 })
    await probe()
    expect(state.runs).toBe(3)
  })
})
