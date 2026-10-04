import { For } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"
import { CELL_GAP, CELL_WIDTH, gridRows, titleColor, titleText } from "./layout"
import { palette } from "./palette"
import type { Cell, Segment, SystemStats } from "./types"

type Theme = Plugin.Context["theme"]

function Line(props: { segments: Segment[] }) {
  return (
    <box flexDirection="row" gap={0}>
      <For each={props.segments}>
        {(s) => <text fg={s.fg}>{s.bold ? <b>{s.text}</b> : s.text}</text>}
      </For>
    </box>
  )
}

function CellView(props: { cell: Cell }) {
  return (
    <box gap={0} width={CELL_WIDTH}>
      <Line segments={props.cell.label} />
      <Line segments={props.cell.bar} />
    </box>
  )
}

/** Bordered grid panel; the theme is read at render time so theme switches apply live. */
export function MonitorView(props: { theme: Theme; stats: () => SystemStats }) {
  const colors = () => palette(props.theme)
  return (
    <box
      border
      borderStyle="rounded"
      borderColor={colors().border}
      title={titleText(props.stats())}
      titleColor={titleColor(colors(), props.stats())}
      titleAlignment="left"
      paddingX={1}
      paddingY={0}
      gap={0}
    >
      <For each={gridRows(colors(), props.stats())}>
        {(row) => (
          <box flexDirection="row" gap={CELL_GAP}>
            <For each={row}>{(c) => <CellView cell={c} />}</For>
          </box>
        )}
      </For>
    </box>
  )
}
