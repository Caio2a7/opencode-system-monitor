import { createSignal } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"
import { createCollector } from "./stats/collect"
import { parseOptions } from "./options"
import type { SystemStats } from "./types"
import { MonitorView } from "./view"

const ID = "opencode-system-monitor"
const EMPTY: SystemStats = { cpu: null, ram: null, disk: null, gpu: null, swap: null }

// Plain object instead of `Plugin.define()` (an identity function): published installs then need no runtime import
// of `@opencode/plugin`, which the host does not provide to packages under node_modules.
const plugin = {
  id: ID,
  setup(context) {
    const options = parseOptions(context.options)
    const collector = createCollector()
    const [stats, setStats] = createSignal<SystemStats>(EMPTY)
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const controller = new AbortController()

    // Each tick is scheduled after the previous collection settles, so polls never overlap.
    // collect() never rejects by contract; `finally` still guarantees the next tick is scheduled.
    const poll = async () => {
      try {
        const next = await collector.collect(controller.signal)
        if (!disposed) setStats(next)
      } finally {
        if (!disposed) timer = setTimeout(fire, options.refreshMs)
      }
    }
    const fire = () => {
      poll().catch((error: unknown) => {
        if (!disposed) console.error("[opencode-system-monitor] poll failed:", error)
      })
    }
    fire()

    const removeSidebar = context.ui.slot({
      append: "sidebar.content",
      render: () => <MonitorView theme={context.theme} stats={stats} />,
    })

    return () => {
      disposed = true
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
      removeSidebar()
    }
  },
} satisfies Plugin.Definition

export default plugin
