import { describe, expect, test } from "bun:test"
import {
  TEMP_COOL,
  TEMP_CRIT,
  TEMP_HOT,
  TEMP_WARN,
  USAGE_CRIT,
  USAGE_HIGH,
  USAGE_MID,
  USAGE_WARN,
  lerp,
  tempColor,
  usageColor,
} from "../src/scale"
import { colors as c } from "./fixtures"

const theme = (hex: string) => {
  const ints = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
  return { toInts: (): [number, number, number, number] => [...ints, 255] }
}

describe("constants", () => {
  test("thresholds", () => {
    expect([USAGE_HIGH, USAGE_WARN, USAGE_CRIT]).toEqual([65, 80, 92])
    expect([TEMP_COOL, TEMP_WARN, TEMP_HOT, TEMP_CRIT]).toEqual([50, 60, 75, 85])
  })
})

describe("lerp", () => {
  test("endpoints and midpoint with hex strings", () => {
    expect(lerp("#000000", "#ffffff", 0)).toBe("#000000")
    expect(lerp("#000000", "#ffffff", 1)).toBe("#ffffff")
    expect(lerp("#000000", "#ffffff", 0.5)).toBe("#808080")
  })

  test("accepts toInts() colors and mixes them with hex", () => {
    expect(lerp(theme("#ff0000"), theme("#0000ff"), 1)).toBe("#0000ff")
    expect(lerp(theme("#000000"), "#ffffff", 0.5)).toBe("#808080")
  })

  test("clamps t to [0, 1]", () => {
    expect(lerp("#102030", "#405060", -5)).toBe("#102030")
    expect(lerp("#102030", "#405060", 7)).toBe("#405060")
  })

  test("output is lowercase and zero-padded", () => {
    expect(lerp("#FF00AA", "#FF00AA", 0.3)).toBe("#ff00aa")
    expect(lerp("#000000", "#000000", 0.5)).toBe("#000000")
  })
})

describe("usageColor below the high threshold", () => {
  test("cpu/ram/swap go success → yellow", () => {
    for (const kind of ["cpu", "ram", "swap"] as const) {
      expect(usageColor(c, kind, 0)).toBe(c.success)
      expect(usageColor(c, kind, 30)).toBe(lerp(c.success, c.yellow, 30 / 65))
      expect(usageColor(c, kind, 64)).toBe(lerp(c.success, c.yellow, 64 / 65))
    }
  })

  test("gpu/vram go purple → pink (32.5) → yellow (65)", () => {
    for (const kind of ["gpu", "vram"] as const) {
      expect(usageColor(c, kind, 0)).toBe(c.purple)
      expect(usageColor(c, kind, USAGE_MID)).toBe(c.pink)
      expect(usageColor(c, kind, 50)).toBe(lerp(c.pink, c.yellow, (50 - 32.5) / 32.5))
      expect(usageColor(c, kind, 64)).toBe(lerp(c.pink, c.yellow, (64 - 32.5) / 32.5))
      expect(usageColor(c, kind, 65)).toBe(c.yellow)
    }
  })

  test("disk stays at base", () => {
    for (const v of [0, 30, 46, 64]) expect(usageColor(c, "disk", v)).toBe(c.base)
  })

  test("RAM at 56% is a green→yellow blend, not warning-ish", () => {
    const got = usageColor(c, "ram", 56)
    expect(got).toBe(lerp(c.success, c.yellow, 56 / 65))
    expect(got).not.toBe(c.warning)
    expect(got).not.toBe(c.yellow)
  })
})

describe("usageColor at and above the high threshold", () => {
  const kinds = ["cpu", "ram", "disk", "gpu", "vram", "swap"] as const

  test("65 is exactly yellow for every kind", () => {
    for (const k of kinds) expect(usageColor(c, k, 65)).toBe(c.yellow)
  })

  test("interpolates yellow → warning between 65 and 80", () => {
    for (const k of kinds) expect(usageColor(c, k, 72)).toBe(lerp(c.yellow, c.warning, 7 / 15))
  })

  test("80 is exactly warning", () => {
    for (const k of kinds) expect(usageColor(c, k, 80)).toBe(c.warning)
  })

  test("interpolates warning → error between 80 and 92", () => {
    for (const k of kinds) expect(usageColor(c, k, 86)).toBe(lerp(c.warning, c.error, 6 / 12))
  })

  test("92 and above clamp to error", () => {
    for (const k of kinds) {
      expect(usageColor(c, k, 92)).toBe(c.error)
      expect(usageColor(c, k, 100)).toBe(c.error)
    }
  })

  test("values just under 65 are not yet yellow", () => {
    expect(usageColor(c, "cpu", 60)).not.toBe(c.yellow)
  })
})

describe("tempColor", () => {
  test("null is muted", () => {
    expect(tempColor(c, null)).toBe(c.muted)
  })

  test("cool temperatures (<= 50) are green", () => {
    expect(tempColor(c, 0)).toBe(c.success)
    expect(tempColor(c, 45)).toBe(c.success)
    expect(tempColor(c, 50)).toBe(c.success)
  })

  test("50 → 60 fades green → yellow", () => {
    expect(tempColor(c, 55)).toBe(lerp(c.success, c.yellow, 0.5))
  })

  test("stops: 60 yellow, 75 warning, 85 error", () => {
    expect(tempColor(c, 60)).toBe(c.yellow)
    expect(tempColor(c, 75)).toBe(c.warning)
    expect(tempColor(c, 85)).toBe(c.error)
  })

  test("linear between stops", () => {
    expect(tempColor(c, 67.5)).toBe("#ffc400")
    expect(tempColor(c, 80)).toBe(lerp(c.warning, c.error, 5 / 10))
  })

  test("above critical clamps to error", () => {
    expect(tempColor(c, 100)).toBe(c.error)
    expect(tempColor(c, 120)).toBe(c.error)
  })
})
