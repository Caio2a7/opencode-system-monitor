import { For } from "solid-js"
import { CELL_GAP, CELL_WIDTH, gridRows, titleSegments } from "./layout"
import { palette } from "./palette"
import type { Cell, Segment, SystemStats } from "./types"

const NBSP = "\u00a0"

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

// The native `title` prop takes one plain string with one color, so the title is a text overlay on the top border row.
// Plain spaces are transparent cells that would let the border line show through, so they become no-break spaces.
// The wrapper has no border, so `top: 0` is the border row of the inner box; `left: 2` sits after the corner and dash.
function Title(props: { segments: Segment[] }) {
  return (
    <text position="absolute" top={0} left={2}>
      <For each={props.segments}>{(s) => <span style={{ fg: s.fg }}>{s.text.replaceAll(" ", NBSP)}</span>}</For>
    </text>
  )
}

/** Bordered grid panel; `theme` is the host theme (narrowed by palette()), read at render time so switches apply live. */
export function MonitorView(props: { theme: unknown; stats: () => SystemStats }) {
  const colors = () => palette(props.theme)
  return (
    <box>
      <box border borderStyle="rounded" borderColor={colors().border} paddingX={1} paddingY={0} gap={0}>
        <For each={gridRows(colors(), props.stats())}>
          {(row) => (
            <box flexDirection="row" gap={CELL_GAP}>
              <For each={row}>{(c) => <CellView cell={c} />}</For>
            </box>
          )}
        </For>
      </box>
      <Title segments={titleSegments(colors(), props.stats())} />
    </box>
  )
}
