import { afterEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { testRender } from "@opentui/solid"
import type { Renderable } from "@opentui/core"
import { MonitorView } from "../src/view"
import type { SystemStats } from "../src/types"
import { tempColor, toHex } from "../src/scale"
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

async function mount(stats: SystemStats) {
  const [signal, setStats] = createSignal(stats)
  setup = await testRender(
    () => (
      <box width={CARD_WIDTH}>
        <MonitorView theme={theme} stats={signal} />
      </box>
    ),
    { width: 40, height: 10 },
  )
  await setup.renderOnce()
  return { setup, setStats }
}

const lines = (s: Setup) => s.captureCharFrame().replaceAll("\u00a0", " ").split("\n")

async function frame(stats: SystemStats): Promise<{ setup: Setup; lines: string[] }> {
  const { setup } = await mount(stats)
  return { setup, lines: lines(setup) }
}

function ids(node: Renderable, out: string[] = []): string[] {
  out.push(node.id)
  for (const child of node.getChildren()) ids(child as Renderable, out)
  return out
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
    expect(fg("System")).toBe(toHex(colors.base))
    expect(fg("62°")).toBe(toHex(tempColor(colors, 62)))
    expect(fg("╭")).toBe(toHex(colors.border))
  })

  test("a stats update reuses every renderable instead of rebuilding the card", async () => {
    const { setup, setStats } = await mount(fullStats)
    const before = ids(setup.renderer.root)
    setStats({ ...fullStats, cpu: { percent: 31 }, ram: { ...fullStats.ram!, percent: 57 } })
    await setup.renderOnce()
    const after = ids(setup.renderer.root)
    expect(after.filter((id) => before.includes(id))).toHaveLength(before.length)
    expect(lines(setup)[1]).toContain("CPU   31%  RAM   57%")
  })

  test("the second row shrinks to SWAP when the GPU disappears", async () => {
    const { setup, setStats } = await mount(fullStats)
    setStats({ ...fullStats, gpu: null })
    await setup.renderOnce()
    expect(lines(setup)[3]!.replace(/\s+/g, " ")).toContain("│ SWAP 13% │")
  })
})
