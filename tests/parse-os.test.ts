import { describe, expect, test } from "bun:test"
import {
  WIN_PAGEFILE_SCRIPT,
  cpuTimesFromCpus,
  diskRoot,
  parsePageFile,
  parseSwapUsage,
  parseVmStat,
  ramFromTotals,
} from "../src/stats/parse-os"
import { PAGEFILE_OUT, SWAPUSAGE_G, SWAPUSAGE_M, VM_STAT } from "./fixtures"

const GiB = 1024 ** 3
const core = (user: number, nice: number, sys: number, idle: number, irq: number) => ({ times: { user, nice, sys, idle, irq } })

describe("cpuTimesFromCpus", () => {
  test("sums across cores", () => {
    expect(cpuTimesFromCpus([core(1, 2, 3, 4, 5), core(10, 20, 30, 40, 50)])).toEqual({ idle: 44, total: 165 })
  })
  test("empty list -> null", () => {
    expect(cpuTimesFromCpus([])).toBeNull()
  })
})

describe("ramFromTotals", () => {
  test("used = total - available", () => {
    const r = ramFromTotals(16 * GiB, 4 * GiB)!
    expect(r.percent).toBeCloseTo(75, 10)
    expect(r.usedGiB).toBeCloseTo(12, 10)
    expect(r.totalGiB).toBeCloseTo(16, 10)
  })
  test("available is clamped to [0, total]", () => {
    expect(ramFromTotals(8 * GiB, 20 * GiB)!.percent).toBe(0)
    expect(ramFromTotals(8 * GiB, -5)!.percent).toBeCloseTo(100, 10)
  })
  test("total <= 0 -> null", () => {
    expect(ramFromTotals(0, 0)).toBeNull()
    expect(ramFromTotals(-1, 0)).toBeNull()
  })
})

describe("parseVmStat", () => {
  test("Apple Silicon 16 KiB pages", () => {
    const total = 8 * GiB
    const r = parseVmStat(VM_STAT, total)!
    const used = 170000 * 16384
    expect(r.usedGiB).toBeCloseTo(used / GiB, 10)
    expect(r.totalGiB).toBeCloseTo(8, 10)
    expect(r.percent).toBeCloseTo((used / total) * 100, 10)
  })
  test("defaults to 4096-byte pages without a header", () => {
    const body = VM_STAT.split("\n").slice(1).join("\n")
    expect(parseVmStat(body, 8 * GiB)!.usedGiB).toBeCloseTo((170000 * 4096) / GiB, 10)
  })
  test("used is clamped to total", () => {
    expect(parseVmStat(VM_STAT, 1024)!.percent).toBeCloseTo(100, 10)
  })
  test("missing required line -> null", () => {
    expect(parseVmStat(VM_STAT.replace(/Pages wired down.*\n/, ""), 8 * GiB)).toBeNull()
    expect(parseVmStat(VM_STAT.replace(/Pages occupied by compressor.*\n/, ""), 8 * GiB)).toBeNull()
  })
  test("total <= 0 or garbage -> null", () => {
    expect(parseVmStat(VM_STAT, 0)).toBeNull()
    expect(parseVmStat("garbage", 8 * GiB)).toBeNull()
    expect(parseVmStat("", 8 * GiB)).toBeNull()
  })
})

describe("parseSwapUsage", () => {
  test("megabytes", () => {
    const s = parseSwapUsage(SWAPUSAGE_M)!
    expect(s.totalGiB).toBeCloseTo(2, 10)
    expect(s.usedGiB).toBeCloseTo(1080.25 / 1024, 10)
    expect(s.percent).toBeCloseTo((1080.25 / 2048) * 100, 10)
  })
  test("gigabytes", () => {
    const s = parseSwapUsage(SWAPUSAGE_G)!
    expect(s).toEqual({ percent: 25, usedGiB: 1, totalGiB: 4 })
  })
  test("kilobytes use base 1024", () => {
    const s = parseSwapUsage("total = 1048576.00K  used = 524288.00K  free = 524288.00K")!
    expect(s.totalGiB).toBeCloseTo(1, 10)
    expect(s.percent).toBeCloseTo(50, 10)
  })
  test("zero total -> null", () => {
    expect(parseSwapUsage("total = 0.00M  used = 0.00M  free = 0.00M  (encrypted)")).toBeNull()
  })
  test("garbage -> null", () => {
    expect(parseSwapUsage("")).toBeNull()
    expect(parseSwapUsage("sysctl: unknown oid")).toBeNull()
  })
})

describe("parsePageFile", () => {
  test("sums two page files with CRLF", () => {
    const s = parsePageFile(PAGEFILE_OUT)!
    expect(s.totalGiB).toBeCloseTo(3072 / 1024, 10)
    expect(s.usedGiB).toBeCloseTo(768 / 1024, 10)
    expect(s.percent).toBeCloseTo(25, 10)
  })
  test("ignores junk lines among valid ones", () => {
    expect(parsePageFile("hello\r\n1024 512\r\n\r\n")!.percent).toBeCloseTo(50, 10)
  })
  test("no valid lines or zero total -> null", () => {
    expect(parsePageFile("")).toBeNull()
    expect(parsePageFile("abc def\r\n")).toBeNull()
    expect(parsePageFile("0 0\r\n")).toBeNull()
  })
  test("script queries Win32_PageFileUsage", () => {
    expect(WIN_PAGEFILE_SCRIPT).toContain("Win32_PageFileUsage")
  })
})

describe("diskRoot", () => {
  test("win32 uses SystemDrive, default C:", () => {
    expect(diskRoot("win32", {})).toBe("C:\\")
    expect(diskRoot("win32", { SystemDrive: "D:" })).toBe("D:\\")
  })
  test("other platforms use /", () => {
    expect(diskRoot("linux", { SystemDrive: "D:" })).toBe("/")
    expect(diskRoot("darwin", {})).toBe("/")
  })
})
