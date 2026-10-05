import { describe, expect, test } from "bun:test"
import { palette } from "../src/palette"
import { hueOf, lerp, toHex } from "../src/scale"
import { themeOf } from "./fixtures"

const hex = (p: ReturnType<typeof palette>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, toHex(v)]))

describe("palette", () => {
  test("maps the theme tokens", () => {
    expect(hex(palette(themeOf()))).toEqual({
      base: "#ffffff",
      muted: "#888888",
      border: "#333333",
      success: "#00ff00",
      warning: "#ff8800",
      yellow: "#ffff00",
      error: "#ff0000",
      purple: "#8000ff",
      pink: lerp("#8000ff", "#ff0000", 0.4),
    })
  })

  test("keeps syntax.type when the theme's type color is yellow or gold", () => {
    expect(toHex(palette(themeOf({ type: "#e5c07b" })).yellow)).toBe("#e5c07b")
    expect(toHex(palette(themeOf({ type: "#f9e2af" })).yellow)).toBe("#f9e2af")
  })

  test("blends success into warning when syntax.type is not yellow (e.g. Dracula cyan)", () => {
    expect(toHex(palette(themeOf({ type: "#8be9fd" })).yellow)).toBe(lerp("#00ff00", "#ff8800", 0.5))
    expect(toHex(palette(themeOf({ type: "#9a9a9a" })).yellow)).toBe(lerp("#00ff00", "#ff8800", 0.5))
  })
})

describe("hueOf", () => {
  test("hue in degrees, null for greys", () => {
    expect(hueOf("#ff0000")).toBe(0)
    expect(hueOf("#ffff00")).toBe(60)
    expect(hueOf("#0000ff")).toBe(240)
    expect(hueOf("#808080")).toBeNull()
  })
})
