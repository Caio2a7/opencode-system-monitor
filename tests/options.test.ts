import { describe, expect, test } from "bun:test"
import { parseOptions } from "../src/options"

const DEFAULTS = { refreshMs: 2000, diskPath: null }

describe("parseOptions", () => {
  test.each([
    ["undefined", undefined],
    ["null", null],
    ["string", "fast"],
    ["array", []],
    ["empty object", {}],
  ])("defaults for %s", (_n, raw) => {
    expect(parseOptions(raw)).toEqual(DEFAULTS)
  })

  test("accepts a valid value", () => {
    expect(parseOptions({ refreshMs: 5000 })).toEqual({ ...DEFAULTS, refreshMs: 5000 })
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

describe("parseOptions diskPath", () => {
  test("accepts and trims a path", () => {
    expect(parseOptions({ diskPath: "/home" }).diskPath).toBe("/home")
    expect(parseOptions({ diskPath: "  D:\\  " }).diskPath).toBe("D:\\")
  })

  test.each([
    ["number", 5],
    ["empty", ""],
    ["blank", "   "],
    ["NUL byte", "/home\0/x"],
    ["too long", `/${"a".repeat(5000)}`],
    ["object", { path: "/" }],
  ])("invalid %s falls back to null", (_n, diskPath) => {
    expect(parseOptions({ diskPath }).diskPath).toBeNull()
  })
})
