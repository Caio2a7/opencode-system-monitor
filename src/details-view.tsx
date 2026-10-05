import { createMemo, Index } from "solid-js"
import { detailLines, type Tone } from "./details"
import { palette, type ThemeTokens } from "./palette"
import type { Color, SystemStats } from "./types"

const LABEL_WIDTH = 6

export function DetailsView(props: { theme: ThemeTokens; stats: () => SystemStats; onClose: () => void }) {
  const colors = createMemo(() => palette(props.theme))
  const lines = createMemo(() => detailLines(props.stats()))
  const tone = (t: Tone): Color => (t === "error" ? colors().error : t === "muted" ? colors().muted : colors().base)
  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={colors().base}>
          <b>System monitor</b>
        </text>
        <text fg={colors().muted} onMouseUp={props.onClose}>
          esc
        </text>
      </box>
      <box gap={0}>
        <Index each={lines()}>
          {(l) => (
            <box flexDirection="row" gap={0}>
              <text fg={colors().muted}>{l().label.padEnd(LABEL_WIDTH)}</text>
              <text fg={tone(l().tone)}>{l().value}</text>
            </box>
          )}
        </Index>
      </box>
    </box>
  )
}
