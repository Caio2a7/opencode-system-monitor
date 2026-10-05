import { createMemo, Index } from "solid-js"
import { CELL_GAP, CELL_WIDTH, gridRows, titleSegments } from "./layout"
import { palette } from "./palette"
import type { Cell, Segment, SystemStats } from "./types"

const NBSP = "\u00a0"

function Line(props: { segments: Segment[] }) {
  return (
    <box flexDirection="row" gap={0}>
      <Index each={props.segments}>
        {(s) => <text fg={s().fg}>{s().bold ? <b>{s().text}</b> : s().text}</text>}
      </Index>
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
      <Index each={props.segments}>{(s) => <span style={{ fg: s().fg }}>{s().text.replaceAll(" ", NBSP)}</span>}</Index>
    </text>
  )
}

/** Bordered grid panel; `theme` is the host theme (narrowed by palette()), read at render time so switches apply live. */
export function MonitorView(props: { theme: unknown; stats: () => SystemStats }) {
  const colors = createMemo(() => palette(props.theme))
  const rows = createMemo(() => gridRows(colors(), props.stats()))
  const title = createMemo(() => titleSegments(colors(), props.stats()))
  return (
    <box>
      <box border borderStyle="rounded" borderColor={colors().border} paddingX={1} paddingY={0} gap={0}>
        <Index each={rows()}>
          {(row) => (
            <box flexDirection="row" gap={CELL_GAP}>
              <Index each={row()}>{(c) => <CellView cell={c()} />}</Index>
            </box>
          )}
        </Index>
      </box>
      <Title segments={title()} />
    </box>
  )
}
