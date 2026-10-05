import { afterEach, describe, expect, test } from "bun:test"
import { createSignal, Show } from "solid-js"
import { testRender } from "@opentui/solid"
import type { Plugin } from "@opencode/plugin/tui"
import { createPlugin } from "../src/tui"
import type { SystemStats } from "../src/types"
import { colors, fullStats } from "./fixtures"

type Context = Parameters<Plugin.Definition["setup"]>[0]
type Claim = { append: string; render: (input: { sessionID: string }) => unknown }

const theme = {
  border: { base: colors.border },
  text: {
    base: colors.base,
    muted: colors.muted,
    feedback: { success: { base: colors.success }, warning: { base: colors.warning }, error: { base: colors.error } },
  },
  syntax: { type: colors.yellow, keyword: colors.purple },
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

function host() {
  const state = { collects: 0, signals: [] as AbortSignal[], claims: [] as Claim[], removed: 0 }
  const plugin = createPlugin(() => ({
    collect: async (signal?: AbortSignal) => {
      state.collects++
      if (signal) state.signals.push(signal)
      return fullStats as SystemStats
    },
  }))
  const context = {
    options: { refreshMs: 60_000 },
    theme,
    ui: {
      slot: (claim: Claim) => {
        state.claims.push(claim)
        return () => state.removed++
      },
    },
  } as unknown as Context
  return { state, plugin, context }
}

let destroy: (() => void) | undefined
afterEach(() => {
  destroy?.()
  destroy = undefined
})

describe("plugin lifecycle", () => {
  test("claims the sidebar slot and does not poll while the card is not mounted", async () => {
    const { state, plugin, context } = host()
    await plugin.setup(context)
    await settle()
    expect(state.claims.map((c) => c.append)).toEqual(["sidebar.content"])
    expect(state.collects).toBe(0)
  })

  test("polls while the card is mounted and stops when it unmounts", async () => {
    const { state, plugin, context } = host()
    await plugin.setup(context)
    const [visible, setVisible] = createSignal(true)
    const setup = await testRender(() => <Show when={visible()}>{state.claims[0]!.render({ sessionID: "s" }) as never}</Show>, {
      width: 40,
      height: 8,
    })
    destroy = () => setup.renderer.destroy()
    await settle()
    await setup.renderOnce()
    expect(state.collects).toBe(1)
    expect(setup.captureCharFrame()).toContain("CPU   30%")
    setVisible(false)
    expect(state.signals[0]!.aborted).toBe(true)
  })

  test("cleanup stops polling and removes the slot", async () => {
    const { state, plugin, context } = host()
    const cleanup = await plugin.setup(context)
    const setup = await testRender(() => state.claims[0]!.render({ sessionID: "s" }) as never, { width: 40, height: 8 })
    destroy = () => setup.renderer.destroy()
    await settle()
    if (typeof cleanup === "function") await cleanup()
    expect(state.removed).toBe(1)
    expect(state.signals[0]!.aborted).toBe(true)
  })
})
