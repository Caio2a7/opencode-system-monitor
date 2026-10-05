import { afterEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { testRender } from "@opentui/solid"
import { MonitorView } from "../src/view"
import type { SystemStats } from "../src/types"
import { lerp, tempColor } from "../src/scale"
import { colors, fullStats } from "./fixtures"

const theme = {
  border: { base: colors.border },
  text: {
    base: colors.base,
    muted: colors.muted,
    feedback: { success: { base: colors.success }, warning: { base: colors.warning }, error: { base: colors.error } },
  },
  syntax: { type: colors.yellow, keyword: colors.purple },
}

// 31 columns of cells + 2 padding + 2 border.
const CARD_WIDTH = 35

type Setup = Awaited<ReturnType<typeof testRender>>
let setup: Setup | undefined

async function frame(stats: SystemStats): Promise<{ setup: Setup; lines: string[] }> {
  const [signal] = createSignal(stats)
  setup = await testRender(
    () => (
      <box width={CARD_WIDTH}>
        <MonitorView theme={theme} stats={signal} />
      </box>
    ),
    { width: 40, height: 10 },
  )
  await setup.renderOnce()
  // The title overlay uses no-break spaces so it masks the border line; compare as plain spaces.
  return { setup, lines: setup.captureCharFrame().replaceAll("\u00a0", " ").split("\n") }
}

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
})

describe("MonitorView", () => {
  test("title shares the top border row of a 35-column card with 4 content rows", async () => {
    const { lines } = await frame(fullStats)
    const top = lines[0]!.trimEnd()
    expect(top.startsWith("╭─ System · 62° ─")).toBe(true)
    expect(top.endsWith("╮")).toBe(true)
    expect([...top]).toHaveLength(CARD_WIDTH)
    expect(lines[5]!.trimEnd().startsWith("╰")).toBe(true)
    expect([...lines[5]!.trimEnd()]).toHaveLength(CARD_WIDTH)
    expect(lines.slice(1, 5).every((l) => l.startsWith("│") && l.trimEnd().endsWith("│"))).toBe(true)
  })

  test("title without GPU temperature has no temperature part", async () => {
    const { lines } = await frame({ ...fullStats, gpu: null })
    expect(lines[0]!.startsWith("╭─ System ─")).toBe(true)
  })

  test("label is base-colored, temperature follows tempColor, border keeps its color", async () => {
    const { setup } = await frame(fullStats)
    const spans = setup.captureSpans().lines[0]!.spans
    const fg = (text: string) => {
      const [r, g, b] = spans.find((sp) => sp.text.includes(text))?.fg.toInts() ?? []
      return `#${[r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, "0")).join("")}`
    }
    const norm = (color: Parameters<typeof lerp>[0]) => lerp(color, color, 0)
    expect(fg("System")).toBe(norm(colors.base))
    expect(fg("62°")).toBe(norm(tempColor(colors, 62)))
    expect(fg("╭")).toBe(norm(colors.border))
  })
})
