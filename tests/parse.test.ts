import { describe, expect, test } from "bun:test"
import {
  cpuPercent,
  diskUsage,
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

  test("guest and guest_nice are already part of user and nice, so they are not added again", () => {
    expect(parseCpuTimes("cpu  100 10 50 800 50 5 5 10 30 5\n")).toEqual({ idle: 850, total: 1030 })
  })

  test("reads only the aggregate line even when it is not followed by a newline", () => {
    expect(parseCpuTimes("cpu  1 0 0 3 0")).toEqual({ idle: 3, total: 4 })
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
})

describe("parseMeminfo", () => {
  test("derives used from MemTotal - MemAvailable in GiB", () => {
    const ram = parseMeminfo(MEMINFO)!
    expect(ram.percent).toBeCloseTo(50, 10)
    expect(ram.totalGiB).toBeCloseTo(16384000 / 1048576, 10)
    expect(ram.usedGiB).toBeCloseTo(8192000 / 1048576, 10)
  })

  test.each([
    ["empty", ""],
    ["missing MemAvailable", "MemTotal: 100 kB\nMemFree: 5 kB\n"],
    ["missing MemTotal", "MemAvailable: 100 kB\n"],
    ["garbage", "not a meminfo file"],
  ])("returns null for %s", (_n, input) => expect(parseMeminfo(input)).toBeNull())

  test("clamps an available value above total to 0% used, like the other platforms", () => {
    expect(parseMeminfo("MemTotal: 100 kB\nMemAvailable: 150 kB\n")!.percent).toBe(0)
  })

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

  test("clamps a free value above total to 0% used", () => {
    expect(parseSwap("SwapTotal: 100 kB\nSwapFree: 150 kB\n")!.percent).toBe(0)
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

  test("control characters in the GPU name are neutralized", () => {
    expect(parseNvidiaSmi("1, 2, 3, 4, Evil\u001b[2JGPU\u0007\n")!.name).toBe("EvilGPU")
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
  ])("returns null for %s", (_n, input) => expect(parseNvidiaSmi(input)).toBeNull())

  test("zero total VRAM yields 0% instead of NaN", () => {
    expect(parseNvidiaSmi("5, 0, 0, 40, GPU")?.vramPercent).toBe(0)
  })
})

describe("diskUsage", () => {
  const GiB = 1024 ** 3
  test("df formula: (blocks-bfree) / ((blocks-bfree)+bavail)", () => {
    const d = diskUsage({ bsize: GiB, blocks: 1000, bfree: 400, bavail: 300 })!
    expect(d.percent).toBeCloseTo((600 / 900) * 100, 10)
    expect(d.usedGiB).toBe(600)
    expect(d.totalGiB).toBe(900)
  })

  test("APFS: the container used share, (blocks-bavail) / blocks", () => {
    const d = diskUsage({ bsize: GiB, blocks: 460, bfree: 450, bavail: 188 }, true)!
    expect(d.percent).toBeCloseTo((272 / 460) * 100, 10)
    expect(d.usedGiB).toBe(272)
    expect(d.totalGiB).toBe(460)
  })

  test("null for an empty filesystem", () => {
    expect(diskUsage({ bsize: 4096, blocks: 0, bfree: 0, bavail: 0 })).toBeNull()
    expect(diskUsage({ bsize: 4096, blocks: 0, bfree: 0, bavail: 0 }, true)).toBeNull()
  })
})

