import { describe, expect, test } from "bun:test"
import { detailLines } from "../src/details"
import type { SystemStats } from "../src/types"
import { fullStats } from "./fixtures"

const text = (stats: SystemStats) => detailLines(stats).map((l) => `${l.label} ${l.value}`)

describe("detailLines", () => {
  test("absolute values for every metric", () => {
    expect(text(fullStats)).toEqual([
      "CPU 30%",
      "RAM 8.9 / 15.9 GiB · 56%",
      "SWAP 1.0 / 8.0 GiB · 13%",
      "DISK 230.0 / 500.0 GiB · 46%",
      "GPU 89% · 62 °C · RTX",
      "VRAM 4.6 / 8.0 GiB · 58%",
    ])
  })

  test("missing values, no swap, no GPU", () => {
    const stats: SystemStats = { cpu: { percent: null }, ram: null, disk: null, gpu: null, swap: null, errors: {} }
    expect(text(stats)).toEqual(["CPU —", "RAM —", "SWAP none", "DISK —", "GPU no NVIDIA GPU (nvidia-smi not found)"])
  })

  test("suspended GPU", () => {
    expect(text({ ...fullStats, gpu: { suspended: true } })).toContain("GPU off, runtime-suspended (not woken up to read it)")
  })

  test("errors are listed last, in metric order, with the error tone", () => {
    const stats: SystemStats = {
      ...fullStats,
      swap: null,
      gpu: { error: "driver mismatch" },
      errors: { gpu: "driver mismatch", swap: "blocked" },
    }
    const lines = detailLines(stats)
    expect(lines.filter((l) => l.tone === "error").map((l) => `${l.label} ${l.value}`)).toEqual([
      "SWAP blocked",
      "GPU driver mismatch",
    ])
    expect(lines.find((l) => l.label === "SWAP")?.value).toBe("—")
  })
})
