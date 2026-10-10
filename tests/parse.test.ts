import { describe, expect, test } from "bun:test"
import {
  cpuPercent,
  diskPercent,
  parseCpuTimes,
  parseMeminfo,
  parseNvidiaSmi,
  parseSwap,
} from "../src/stats/parse"
import { MEMINFO, PROC_STAT_A, PROC_STAT_B, SMI_LINE } from "./fixtures"

const MiB = 1_048_576

describe("parseCpuTimes", () => {
  test("sums all fields and counts idle + iowait as idle", () => {
    expect(parseCpuTimes(PROC_STAT_A)).toEqual({ idle: 850, total: 1000 })
  })

  test("uses the aggregate line, not per-core lines", () => {
    expect(parseCpuTimes("cpu0 1 1 1 1 1\ncpu  10 0 0 20 5\n")).toEqual({ idle: 25, total: 35 })
  })

  test.each([["empty", ""], ["no cpu line", "intr 1\nctxt 2\n"], ["only per-core", "cpu0 1 2 3 4 5\n"]])(
    "returns null for %s",
    (_n, input) => expect(parseCpuTimes(input)).toBeNull(),
  )
})

describe("cpuPercent", () => {
  test("computes busy share between two samples", () => {
    expect(cpuPercent(parseCpuTimes(PROC_STAT_A), parseCpuTimes(PROC_STAT_B))).toBeCloseTo(50, 10)
  })

  test("null when either sample is null", () => {
    expect(cpuPercent(null, { idle: 1, total: 2 })).toBeNull()
    expect(cpuPercent({ idle: 1, total: 2 }, null)).toBeNull()
  })

  test("null when total did not advance or went backwards", () => {
    expect(cpuPercent({ idle: 1, total: 10 }, { idle: 1, total: 10 })).toBeNull()
    expect(cpuPercent({ idle: 5, total: 10 }, { idle: 1, total: 4 })).toBeNull()
  })

  test("0% when everything is idle, 100% when nothing is idle", () => {
    expect(cpuPercent({ idle: 0, total: 1 }, { idle: 100, total: 101 })).toBeCloseTo(0, 10)
    expect(cpuPercent({ idle: 5, total: 10 }, { idle: 5, total: 110 })).toBeCloseTo(100, 10)
  })

  test("null when idle counter went backwards; clamps to 0% if dIdle > dTotal", () => {
    expect(cpuPercent({ idle: 50, total: 100 }, { idle: 40, total: 200 })).toBeNull()
    expect(cpuPercent({ idle: 10, total: 100 }, { idle: 120, total: 150 })).toBe(0)
  })
})

describe("parseMeminfo", () => {
  test("derives used from MemTotal - MemAvailable in GiB", () => {
    const ram = parseMeminfo(MEMINFO)!
    expect(ram.percent).toBeCloseTo(50, 10)
    expect(ram.totalGiB).toBeCloseTo(16384000 / 1048576, 10)
    expect(ram.usedGiB).toBeCloseTo(8192000 / 1048576, 10)
  })

  test("clamps used to 0 when MemAvailable exceeds MemTotal", () => {
    const ram = parseMeminfo("MemTotal: 1000 kB\nMemAvailable: 2000 kB\n")!
    expect(ram.percent).toBe(0)
    expect(ram.usedGiB).toBe(0)
  })

  test.each([
    ["empty", ""],
    ["missing MemAvailable", "MemTotal: 100 kB\nMemFree: 5 kB\n"],
    ["missing MemTotal", "MemAvailable: 100 kB\n"],
    ["garbage", "not a meminfo file"],
  ])("returns null for %s", (_n, input) => expect(parseMeminfo(input)).toBeNull())

  test("returns null when MemTotal is zero (no divide-by-zero)", () => {
    expect(parseMeminfo("MemTotal: 0 kB\nMemAvailable: 0 kB\n")).toBeNull()
  })
})

describe("parseSwap", () => {
  test("derives used from SwapTotal - SwapFree in GiB", () => {
    const swap = parseSwap(MEMINFO)!
    expect(swap.percent).toBeCloseTo(12.5, 10)
    expect(swap.totalGiB).toBeCloseTo(8, 10)
    expect(swap.usedGiB).toBeCloseTo(1, 10)
  })

  test("returns null when swap is disabled (SwapTotal 0)", () => {
    expect(parseSwap("SwapTotal: 0 kB\nSwapFree: 0 kB\n")).toBeNull()
  })

  test.each([
    ["empty", ""],
    ["missing SwapFree", "SwapTotal: 100 kB\n"],
    ["missing SwapTotal", "SwapFree: 100 kB\n"],
  ])("returns null for %s", (_n, input) => expect(parseSwap(input)).toBeNull())
})

describe("parseNvidiaSmi", () => {
  test("parses the first csv line", () => {
    const gpu = parseNvidiaSmi(SMI_LINE)!
    expect(gpu.util).toBe(89)
    expect(gpu.temp).toBe(62)
    expect(gpu.name).toBe("NVIDIA GeForce RTX 4060 Laptop GPU")
    expect(gpu.vramPercent).toBeCloseTo((4746 / 8188) * 100, 10)
    expect(gpu.vramUsedGiB).toBeCloseTo(4746 / 1024, 10)
    expect(gpu.vramTotalGiB).toBeCloseTo(8188 / 1024, 10)
  })

  test("ignores additional GPU lines", () => {
    const gpu = parseNvidiaSmi(`${SMI_LINE}10, 1, 2, 30, Other\n`)!
    expect(gpu.util).toBe(89)
  })

  test.each([
    ["empty", ""],
    ["whitespace", "  \n"],
    ["too few fields", "89, 4746"],
    ["non numeric util", "abc, 4746, 8188, 62, GPU"],
    ["all metrics N/A", "[N/A], [N/A], [N/A], [N/A], GPU"],
  ])("returns null for %s", (_n, input) => expect(parseNvidiaSmi(input)).toBeNull())

  test("keeps VRAM and temp when utilization.gpu is [N/A] or [Not Supported]", () => {
    const gpu = parseNvidiaSmi("[N/A], 2048, 8192, 58, NVIDIA GeForce")!
    expect(gpu.util).toBeNull()
    expect(gpu.vramPercent).toBeCloseTo(25, 10)
    expect(gpu.vramUsedGiB).toBeCloseTo(2, 10)
    expect(gpu.vramTotalGiB).toBeCloseTo(8, 10)
    expect(gpu.temp).toBe(58)

    const unsupported = parseNvidiaSmi("[Not Supported], 1024, 4096, [N/A], NVIDIA vGPU")!
    expect(unsupported.util).toBeNull()
    expect(unsupported.vramPercent).toBeCloseTo(25, 10)
    expect(unsupported.temp).toBeNull()
  })

  test("keeps utilization when VRAM is [N/A] (unified-memory GPUs)", () => {
    const gpu = parseNvidiaSmi("42, [N/A], [N/A], 51, NVIDIA Tegra")!
    expect(gpu.util).toBe(42)
    expect(gpu.vramPercent).toBeNull()
    expect(gpu.vramUsedGiB).toBeNull()
    expect(gpu.vramTotalGiB).toBeNull()
    expect(gpu.temp).toBe(51)
  })

  test("clamps util and vramPercent to 100%", () => {
    const gpu = parseNvidiaSmi("120, 9000, 8192, 70, GPU")!
    expect(gpu.util).toBe(100)
    expect(gpu.vramPercent).toBe(100)
    expect(gpu.vramUsedGiB).toBeCloseTo(8, 10)
  })

  test("zero total VRAM yields 0% instead of NaN", () => {
    expect(parseNvidiaSmi("5, 0, 0, 40, GPU")?.vramPercent).toBe(0)
  })
})

describe("diskPercent", () => {
  test("uses (blocks-bfree) / ((blocks-bfree)+bavail)", () => {
    expect(diskPercent({ blocks: 1000, bfree: 400, bavail: 300 })).toBeCloseTo((600 / 900) * 100, 10)
  })

  test("null for empty or invalid filesystem stats, clamps when bfree > blocks", () => {
    expect(diskPercent({ blocks: 0, bfree: 0, bavail: 0 })).toBeNull()
    expect(diskPercent({ blocks: -10, bfree: 0, bavail: 10 })).toBeNull()
    expect(diskPercent({ blocks: 100, bfree: 50, bavail: -1 })).toBeNull()
    expect(diskPercent({ blocks: Number.NaN, bfree: 0, bavail: 10 })).toBeNull()
    expect(diskPercent({ blocks: 100, bfree: 150, bavail: 50 })).toBe(0)
  })
})

