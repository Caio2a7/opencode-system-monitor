import { afterEach, describe, expect, test } from "bun:test"
import { createSignal, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { testRender } from "@opentui/solid"
import type { Plugin } from "@opencode/plugin/tui"
import { DETAILS_COMMAND, createPlugin } from "../src/tui"
import type { SystemStats } from "../src/types"
import { fullStats, themeOf } from "./fixtures"

type Context = Parameters<Plugin.Definition["setup"]>[0]
type Claim = { append: string; render: (input: { sessionID: string }) => unknown }
type Layer = { mode?: string; commands?: Array<{ id?: string; palette?: true; slash?: { name: string }; run: () => void }> }

const theme = themeOf()

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

function memoryStorage() {
  const stores = new Map<string, unknown>()
  return {
    memory<Value extends object>(key: string, options: { initial: Value }) {
      const found = stores.get(key)
      if (found) return found
      const [store, set] = createStore(options.initial)
      const entry = [store, (mutation: (draft: Value) => void) => set(produce(mutation))] as const
      stores.set(key, entry)
      return entry
    },
  }
}

function host(storage = memoryStorage(), collect?: () => Promise<SystemStats>) {
  const state = {
    collects: 0,
    signals: [] as AbortSignal[],
    claims: [] as Claim[],
    removed: 0,
    layers: [] as Array<() => Layer>,
    dialogs: [] as Array<() => unknown>,
    cleared: 0,
  }
  const plugin = createPlugin(() => ({
    collect: async (signal?: AbortSignal) => {
      state.collects++
      if (signal) state.signals.push(signal)
      return collect ? collect() : fullStats
    },
  }))
  const context = {
    options: { refreshMs: 60_000 },
    theme,
    storage,
    keymap: { layer: (input: () => Layer) => state.layers.push(input) },
    ui: {
      slot: (claim: Claim) => {
        state.claims.push(claim)
        return () => state.removed++
      },
      dialog: {
        show: (render: () => unknown) => state.dialogs.push(render),
        clear: () => state.cleared++,
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

  test("the mounted card registers a global /sysmon palette command that opens live details", async () => {
    const { state, plugin, context } = host()
    await plugin.setup(context)
    const card = await testRender(() => state.claims[0]!.render({ sessionID: "s" }) as never, { width: 40, height: 8 })
    destroy = () => card.renderer.destroy()
    const layer = state.layers[0]!()
    expect(layer.mode).toBe("global")
    const command = layer.commands![0]!
    expect(command).toMatchObject({ id: DETAILS_COMMAND, palette: true, slash: { name: "sysmon" } })
    command.run()
    expect(state.dialogs).toHaveLength(1)
    await settle()
    const dialog = await testRender(() => state.dialogs[0]!() as never, { width: 70, height: 14 })
    await settle()
    await dialog.renderOnce()
    const frame = dialog.captureCharFrame()
    dialog.renderer.destroy()
    expect(frame).toContain("System monitor")
    expect(frame).toContain("RAM   8.9 / 15.9 GiB · 56%")
  })

  test("the last sample survives a plugin reload through storage.memory", async () => {
    const storage = memoryStorage()
    const first = host(storage)
    const cleanup = await first.plugin.setup(first.context)
    const a = await testRender(() => first.state.claims[0]!.render({ sessionID: "s" }) as never, { width: 40, height: 8 })
    await settle()
    a.renderer.destroy()
    if (typeof cleanup === "function") await cleanup()

    const second = host(storage, () => new Promise(() => undefined))
    await second.plugin.setup(second.context)
    const b = await testRender(() => second.state.claims[0]!.render({ sessionID: "s" }) as never, { width: 40, height: 8 })
    destroy = () => b.renderer.destroy()
    await b.renderOnce()
    expect(b.captureCharFrame()).toContain("CPU   30%")
  })
})
