import { onCleanup } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"
import { DetailsView } from "./details-view"
import { createCollector } from "./stats/collect"
import { parseOptions } from "./options"
import { createPoller } from "./poller"
import type { SystemStats } from "./types"
import { MonitorView } from "./view"

const ID = "opencode-system-monitor"
const EMPTY: SystemStats = { cpu: null, ram: null, disk: null, gpu: null, swap: null, errors: {} }
const PRIME_MS = 500
export const DETAILS_COMMAND = "system-monitor.details"

type Collector = ReturnType<typeof createCollector>

const detailsCommand = (run: () => void) => ({
  id: DETAILS_COMMAND,
  title: "System monitor details",
  description: "Used and total memory, disk, GPU name and collection errors",
  palette: true as const,
  slash: { name: "sysmon" },
  run,
})

// Plain object instead of `Plugin.define()` (an identity function): published installs then need no runtime import
// of `@opencode/plugin`, which the host does not provide to packages under node_modules.
export function createPlugin(makeCollector: () => Collector = createCollector) {
  return {
    id: ID,
    setup(context) {
      const options = parseOptions(context.options)
      const collector = makeCollector()
      const [store, update] = context.storage.memory("stats", { initial: { stats: EMPTY } })
      const stats = () => store.stats
      const poller = createPoller({
        collect: (signal) => collector.collect(signal),
        publish: (next) =>
          update((draft) => {
            draft.stats = next
          }),
        intervalMs: options.refreshMs,
        primeMs: PRIME_MS,
        onError: (error) => console.error(`[${ID}] poll failed:`, error),
      })

      const Details = () => {
        onCleanup(poller.acquire())
        return <DetailsView theme={context.theme} stats={stats} onClose={() => context.ui.dialog.clear()} />
      }
      const openDetails = () => context.ui.dialog.show(() => <Details />)

      const Card = () => {
        onCleanup(poller.acquire())
        context.keymap.layer(() => ({ mode: "global", commands: [detailsCommand(openDetails)] }))
        return <MonitorView theme={context.theme} stats={stats} />
      }

      const removeSidebar = context.ui.slot({ append: "sidebar.content", render: () => <Card /> })

      return () => {
        poller.dispose()
        removeSidebar()
      }
    },
  } satisfies Plugin.Definition
}

export default createPlugin()
