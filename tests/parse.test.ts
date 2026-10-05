import { describe, expect, test } from "bun:test"
import {
  NET_SKIP,
  cpuPercent,
  createNetMeter,
  diskPercent,
  parseCpuTimes,
  parseMeminfo,
  parseNvidiaSmi,
  parseSwap,
  sumRxBytes,
} from "../src/stats/parse"
import { MEMINFO, PROC_STAT_A, PROC_STAT_B, SMI_LINE, netDev } from "./fixtures"

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
  ])("returns null for %s", (_n, input) => expect(parseNvidiaSmi(input)).toBeNull())

  test("zero total VRAM yields 0% instead of NaN", () => {
    expect(parseNvidiaSmi("5, 0, 0, 40, GPU")?.vramPercent).toBe(0)
  })
})

describe("diskPercent", () => {
  test("uses (blocks-bfree) / ((blocks-bfree)+bavail)", () => {
    expect(diskPercent({ blocks: 1000, bfree: 400, bavail: 300 })).toBeCloseTo((600 / 900) * 100, 10)
  })

  test("null for empty filesystem", () => {
    expect(diskPercent({ blocks: 0, bfree: 0, bavail: 0 })).toBeNull()
  })
})

describe("sumRxBytes", () => {
  test("skips virtual interfaces by default", () => {
    const text = netDev({ lo: 999, docker0: 888, veth1a: 777, wlan0: 100, enp3s0: 50 })
    expect(sumRxBytes(text)).toBe(150)
  })

  test("NET_SKIP lists the documented prefixes", () => {
    expect([...NET_SKIP]).toEqual(["lo", "docker", "veth", "br-", "virbr", "tun", "tap", "wg"])
  })

  test("custom skip list overrides the default", () => {
    expect(sumRxBytes(netDev({ lo: 1, wlan0: 10, enp3s0: 100 }), ["wlan"])).toBe(101)
  })

  test.each([["empty", ""], ["header only", "a\nb\n"], ["garbage", "hello world"]])(
    "returns 0 for %s",
    (_n, input) => expect(sumRxBytes(input)).toBe(0),
  )
})

describe("createNetMeter", () => {
  test("first sample has no rate", () => {
    expect(createNetMeter().sample(1000, 0)).toEqual({ rate: null, percent: null })
  })

  test("rate in B/s; peak below floor uses the floor", () => {
    const m = createNetMeter()
    m.sample(0, 0)
    const s = m.sample(MiB / 2, 1000)
    expect(s.rate).toBe(MiB / 2)
    expect(s.percent).toBeCloseTo(50, 10)
  })

  test("rate scales by elapsed milliseconds", () => {
    const m = createNetMeter()
    m.sample(0, 0)
    expect(m.sample(MiB, 500)?.rate).toBe(2 * MiB)
  })

  test("a new peak yields 100% and later slower rates are relative to it", () => {
    const m = createNetMeter()
    m.sample(0, 0)
    expect(m.sample(10 * MiB, 1000).percent).toBeCloseTo(100, 10)
    expect(m.sample(12 * MiB, 2000).percent).toBeCloseTo(20, 10)
  })

  test("old peaks fall out of the window", () => {
    const m = createNetMeter({ window: 2 })
    m.sample(0, 0)
    expect(m.sample(10 * MiB, 1000).rate).toBe(10 * MiB)
    expect(m.sample(11 * MiB, 2000).percent).toBeCloseTo(10, 10)
    expect(m.sample(12 * MiB, 3000).percent).toBeCloseTo(100, 10)
  })

  test("custom floor changes the scale", () => {
    const m = createNetMeter({ floorBps: 4 * MiB })
    m.sample(0, 0)
    expect(m.sample(MiB, 1000).percent).toBeCloseTo(25, 10)
  })

  test("counter regression resets the sample and rebases", () => {
    const m = createNetMeter()
    m.sample(5 * MiB, 0)
    expect(m.sample(100, 1000)).toEqual({ rate: null, percent: null })
    expect(m.sample(100 + MiB, 2000).rate).toBe(MiB)
  })
})
