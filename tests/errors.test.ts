import { describe, expect, test } from "bun:test"
import { cleanText } from "../src/stats/errors"

describe("cleanText", () => {
  test("drops CSI and OSC escape sequences entirely", () => {
    expect(cleanText("\u001b[2J\u001b[31mFailed\u001b[0m to init")).toBe("Failed to init")
    expect(cleanText("\u001b]52;c;cHduZWQ=\u0007ok")).toBe("ok")
    expect(cleanText("\u001b]0;title\u001b\\ok")).toBe("ok")
  })

  test("turns other control characters into single spaces", () => {
    expect(cleanText("a\r\nb\tc\u0000d\u009be")).toBe("a b c d e")
  })

  test("caps the length", () => {
    expect(cleanText("x".repeat(500))).toHaveLength(200)
  })
})
