import { describe, expect, test } from "bun:test"
import {
  CELL_GAP,
  CELL_WIDTH,
  barSegments,
  gridRows,
  gridText,
  titleSegments,
} from "../src/layout"
import { tempColor, usageColor } from "../src/scale"
import type { Segment, SystemStats } from "../src/types"
import { colors as c, fullStats } from "./fixtures"

const cols = (s: string) => [...s].length
const flat = (segs: Segment[]) => segs.map((s) => s.text).join("")
const withGpu = (gpu: SystemStats["gpu"]): SystemStats => ({ ...fullStats, gpu })

describe("constants", () => {
  test("cell geometry", () => {
    expect([CELL_WIDTH, CELL_GAP]).toEqual([9, 2])
  })
})

describe("barSegments", () => {
  test.each([0, 2, 5.6, 25, 50, 73.3, 99, 100])("is exactly 9 columns at %p%%", (p) => {
    expect(cols(flat(barSegments(c, p, c.success)))).toBe(9)
  })

  test("null renders an all-track bar in the border color", () => {
    const segs = barSegments(c, null, c.success)
    expect(flat(segs)).toBe("─────────")
    expect(segs.every((s) => s.fg === c.border)).toBe(true)
  })

  test("0% is all track, 100% is all filled in the accent", () => {
    expect(flat(barSegments(c, 0, c.success))).toBe("─────────")
    const full = barSegments(c, 100, c.success)
    expect(flat(full)).toBe("━━━━━━━━━")
    expect(full.filter((s) => s.text !== "").every((s) => s.fg === c.success)).toBe(true)
  })

  test("half cell appears when the remaining fraction is >= .5", () => {
    expect(flat(barSegments(c, 50, c.success))).toBe("━━━━╸────") // 4.5 cells
    expect(flat(barSegments(c, 5.6, c.success))).toBe("╸────────") // 0.504 cells
  })

  test("no half cell when the remaining fraction is < .5", () => {
    expect(flat(barSegments(c, 2, c.success))).toBe("─────────") // 0.18 cells
    expect(flat(barSegments(c, 100 / 3, c.success))).toBe("━━━──────") // 3.0 cells
  })

  test("filled part uses the accent, the track uses border", () => {
    const segs = barSegments(c, 50, c.success)
    expect(segs[0]).toMatchObject({ text: "━━━━╸", fg: c.success })
    expect(segs[segs.length - 1]).toMatchObject({ text: "────", fg: c.border })
  })

  test("out-of-range percents are clamped, not thrown or overflowed", () => {
    expect(flat(barSegments(c, 250, c.success))).toBe("━━━━━━━━━")
    expect(flat(barSegments(c, -30, c.success))).toBe("─────────")
  })
})

describe("gridRows with full stats", () => {
  const rows = gridRows(c, fullStats)

  test("two rows of three cells", () => {
    expect(rows.map((r) => r.length)).toEqual([3, 3])
  })

  test("every label and bar line is exactly 9 columns", () => {
    for (const cell of rows.flat()) {
      expect(cols(flat(cell.label))).toBe(9)
      expect(cols(flat(cell.bar))).toBe(9)
    }
  })

  test("plain text content", () => {
    expect(gridText(rows)).toEqual([
      "CPU   30%  RAM   56%  DISK  46%",
      "━━╸──────  ━━━━━────  ━━━━─────",
      "GPU   89%  VRAM  58%  SWAP  13%",
      "━━━━━━━━─  ━━━━━────  ━────────",
    ])
  })

  test("bar accents come from the usage scale; SWAP uses the ram scale", () => {
    expect(rows[0]![0]!.bar[0]!.fg).toBe(usageColor(c, "cpu", 30))
    expect(rows[0]![1]!.bar[0]!.fg).toBe(usageColor(c, "ram", 56))
    expect(rows[0]![2]!.bar[0]!.fg).toBe(c.base)
    expect(rows[1]![0]!.bar[0]!.fg).toBe(usageColor(c, "gpu", 89))
    expect(rows[1]![1]!.bar[0]!.fg).toBe(usageColor(c, "vram", 58))
    expect(rows[1]![2]!.bar[0]!.fg).toBe(usageColor(c, "swap", 12.5))
  })
})

describe("gridRows degraded inputs", () => {
  test("gpu null (no nvidia-smi) leaves only SWAP on row two", () => {
    const rows = gridRows(c, withGpu(null))
    expect(rows.map((r) => r.length)).toEqual([3, 1])
    expect(flat(rows[1]![0]!.label).startsWith("SWAP")).toBe(true)
  })

  test("gpu error keeps GPU/VRAM cells showing an em dash", () => {
    const rows = gridRows(c, withGpu({ error: "driver" }))
    expect(rows[1]!.length).toBe(3)
    for (const cell of rows[1]!.slice(0, 2)) {
      expect(flat(cell.label).endsWith("—")).toBe(true)
      expect(flat(cell.bar)).toBe("─────────")
      expect(cols(flat(cell.label))).toBe(9)
    }
  })

  test("a suspended GPU shows muted off cells and no temperature", () => {
    const stats = withGpu({ suspended: true })
    const rows = gridRows(c, stats)
    expect(gridText(rows).slice(2)).toEqual(["GPU   off  VRAM  off  SWAP  13%", "─────────  ─────────  ━────────"])
    expect(rows[1]![0]!.label.at(-1)).toEqual({ text: "off", fg: c.muted, bold: false })
    expect(titleSegments(c, stats)).toEqual([{ text: " System ", fg: c.base, bold: false }])
  })

  test("null cpu and swap show dashes with an empty bar", () => {
    const rows = gridRows(c, { ...fullStats, cpu: null, swap: null })
    const cpu = rows[0]![0]!
    const swap = rows[1]![2]!
    expect(flat(cpu.label)).toBe("CPU     —")
    expect(flat(cpu.bar)).toBe("─────────")
    expect(flat(swap.label)).toBe("SWAP    —")
    expect(flat(swap.bar)).toBe("─────────")
  })

  test("everything missing still yields 9-column cells", () => {
    const empty: SystemStats = { cpu: null, ram: null, disk: null, gpu: null, swap: null, errors: {} }
    for (const cell of gridRows(c, empty).flat()) {
      expect(cols(flat(cell.label))).toBe(9)
      expect(cols(flat(cell.bar))).toBe(9)
    }
  })

  test("100% values fit in the label (CPU 100%)", () => {
    const rows = gridRows(c, { ...fullStats, cpu: { percent: 100 } })
    expect(flat(rows[0]![0]!.label)).toBe("CPU  100%")
  })
})

describe("gridText", () => {
  test("every line of the full grid is 31 columns (3×9 + 2×2)", () => {
    const lines = gridText(gridRows(c, fullStats))
    expect(lines).toHaveLength(4)
    for (const l of lines) expect(cols(l)).toBe(31)
  })

  test("a single-cell row is 9 columns", () => {
    const lines = gridText(gridRows(c, withGpu(null)))
    expect(lines).toHaveLength(4)
    expect(cols(lines[2]!)).toBe(9)
    expect(cols(lines[3]!)).toBe(9)
  })
})

describe("titleSegments", () => {
  const text = (segs: Segment[]) => segs.map((s) => s.text).join("")
  const withTemp = (temp: number | null) => withGpu({ ...(fullStats.gpu as object), temp } as SystemStats["gpu"])

  test("shows the rounded GPU temperature when known", () => {
    expect(text(titleSegments(c, fullStats))).toBe(" System · 62° ")
    expect(text(titleSegments(c, withTemp(61.6)))).toBe(" System · 62° ")
  })

  test("plain base-colored title for gpu null, error, or unknown temperature", () => {
    for (const stats of [withGpu(null), withGpu({ error: "x" }), withTemp(null)]) {
      expect(titleSegments(c, stats)).toEqual([{ text: " System ", fg: c.base, bold: false }])
    }
  })

  test("only the temperature follows tempColor; the label stays base", () => {
    const segs = titleSegments(c, fullStats)
    expect(segs.filter((s) => s.fg === tempColor(c, 62)).map((s) => s.text)).toEqual([" 62°"])
    expect(segs.filter((s) => s.fg !== tempColor(c, 62)).every((s) => s.fg === c.base)).toBe(true)
  })

  test("cool temperatures are green, hot ones red", () => {
    expect(titleSegments(c, withTemp(40))[1]!.fg).toBe(c.success)
    expect(titleSegments(c, withTemp(90))[1]!.fg).toBe(c.error)
  })
})
