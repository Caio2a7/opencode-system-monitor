import { createSignal, onCleanup } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"
import { createCollector } from "./stats/collect"
import { parseOptions } from "./options"
import type { ThemeTokens } from "./palette"
import { createPoller } from "./poller"
import type { SystemStats } from "./types"
import { MonitorView } from "./view"

const ID = "opencode-system-monitor"
const EMPTY: SystemStats = { cpu: null, ram: null, disk: null, gpu: null, swap: null, errors: {} }
const PRIME_MS = 500

type Collector = ReturnType<typeof createCollector>

function MonitorCard(props: { theme: ThemeTokens; stats: () => SystemStats; acquire: () => () => void }) {
  onCleanup(props.acquire())
  return <MonitorView theme={props.theme} stats={props.stats} />
}

// Plain object instead of `Plugin.define()` (an identity function): published installs then need no runtime import
// of `@opencode/plugin`, which the host does not provide to packages under node_modules.
export function createPlugin(makeCollector: () => Collector = createCollector) {
  return {
    id: ID,
    setup(context) {
      const options = parseOptions(context.options)
      const collector = makeCollector()
      const [stats, setStats] = createSignal<SystemStats>(EMPTY)
      const poller = createPoller({
        collect: (signal) => collector.collect(signal),
        publish: setStats,
        intervalMs: options.refreshMs,
        primeMs: PRIME_MS,
        onError: (error) => console.error(`[${ID}] poll failed:`, error),
      })

      const removeSidebar = context.ui.slot({
        append: "sidebar.content",
        render: () => <MonitorCard theme={context.theme} stats={stats} acquire={poller.acquire} />,
      })

      return () => {
        poller.dispose()
        removeSidebar()
      }
    },
  } satisfies Plugin.Definition
}

export default createPlugin()
