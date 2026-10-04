import { describe, expect, test } from "bun:test"
import { parseOptions } from "../src/options"

describe("parseOptions", () => {
  test.each([
    ["undefined", undefined],
    ["null", null],
    ["string", "fast"],
    ["array", []],
    ["empty object", {}],
  ])("defaults to 2000 for %s", (_n, raw) => {
    expect(parseOptions(raw)).toEqual({ refreshMs: 2000 })
  })

  test("accepts a valid value", () => {
    expect(parseOptions({ refreshMs: 5000 })).toEqual({ refreshMs: 5000 })
  })

  test("boundaries are inclusive", () => {
    expect(parseOptions({ refreshMs: 500 }).refreshMs).toBe(500)
    expect(parseOptions({ refreshMs: 60000 }).refreshMs).toBe(60000)
  })

  test("clamps out-of-range values", () => {
    expect(parseOptions({ refreshMs: 499 }).refreshMs).toBe(500)
    expect(parseOptions({ refreshMs: 0 }).refreshMs).toBe(500)
    expect(parseOptions({ refreshMs: -100 }).refreshMs).toBe(500)
    expect(parseOptions({ refreshMs: 60001 }).refreshMs).toBe(60000)
    expect(parseOptions({ refreshMs: 1e9 }).refreshMs).toBe(60000)
  })

  test("fractional values become integers", () => {
    const { refreshMs } = parseOptions({ refreshMs: 1500.7 })
    expect(Number.isInteger(refreshMs)).toBe(true)
    expect(refreshMs).toBeGreaterThanOrEqual(1500)
    expect(refreshMs).toBeLessThanOrEqual(1501)
  })

  test("NaN and non-number types fall back to the default", () => {
    expect(parseOptions({ refreshMs: Number.NaN }).refreshMs).toBe(2000)
    expect(parseOptions({ refreshMs: "3000" }).refreshMs).toBe(2000)
    expect(parseOptions({ refreshMs: null }).refreshMs).toBe(2000)
    expect(parseOptions({ refreshMs: {} }).refreshMs).toBe(2000)
  })
})
