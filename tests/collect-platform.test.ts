import { describe, expect, test } from "bun:test"
import { createCollector, type CollectorDeps } from "../src/stats/collect"
import { WIN_PAGEFILE_SCRIPT } from "../src/stats/parse-os"
import { PAGEFILE_OUT, SMI_LINE, SWAPUSAGE_M, VM_STAT } from "./fixtures"

const GiB = 1024 ** 3
type Times = { user: number; nice: number; sys: number; idle: number; irq: number }

function setup(platform: string, over: Partial<CollectorDeps> = {}) {
  const state = { times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 50 } as Times, now: 1_000_000 }
  const calls = { run: [] as Array<[string, readonly string[]]>, smi: 0, read: 0, statfs: [] as string[] }
  const deps: CollectorDeps = {
    readText: async () => { calls.read++; throw new Error("readText must not be used") },
    listDir: async () => { throw new Error("listDir must not be used") },
    statfs: async (p) => { calls.statfs.push(p); return { bsize: 4096, blocks: 1000, bfree: 950, bavail: 400 } },
    run: async (file, args) => {
      if (file === "nvidia-smi") { calls.smi++; return SMI_LINE }
      calls.run.push([file, args])
      if (file === "vm_stat") return VM_STAT
      if (file === "sysctl") return SWAPUSAGE_M
      if (file === "powershell") return PAGEFILE_OUT
      throw new Error(`unexpected ${file}`)
    },
    cpus: () => [{ times: state.times }],
    totalmem: () => 8 * GiB,
    freemem: () => 2 * GiB,
    now: () => state.now,
    platform,
    env: {},
    ...over,
  }
  return { deps, state, calls }
}

const ps = (calls: ReturnType<typeof setup>["calls"]) => calls.run.filter(([f]) => f === "powershell")

describe("darwin", () => {
  test("cpu from cpus(): null first, delta second", async () => {
    const { deps, state } = setup("darwin")
    const c = createCollector(deps)
    expect((await c.collect()).cpu?.percent ?? null).toBeNull()
    state.times = { user: 150, nice: 0, sys: 50, idle: 825, irq: 75 } // Δidle 25, Δtotal 100
    expect((await c.collect()).cpu?.percent).toBeCloseTo(75, 10)
  })

  test("ram/swap from vm_stat and sysctl; no gpu, no /proc, disk at /", async () => {
    const { deps, calls } = setup("darwin")
    const s = await createCollector(deps).collect()
    expect(s.ram?.percent).toBeCloseTo(((170000 * 16384) / (8 * GiB)) * 100, 10)
    expect(s.swap?.percent).toBeCloseTo((1080.25 / 2048) * 100, 10)
    expect(s.gpu).toBeNull()
    expect(calls.smi).toBe(0)
    expect(calls.read).toBe(0)
    expect(calls.statfs).toEqual(["/"])
    expect(calls.run).toContainEqual(["vm_stat", []])
    expect(calls.run).toContainEqual(["sysctl", ["-n", "vm.swapusage"]])
  })

  test("disk measures the APFS container, not the sealed system volume", async () => {
    const { deps } = setup("darwin")
    expect((await createCollector(deps).collect()).disk?.percent).toBeCloseTo(60, 10)
  })

  test("vm_stat runs every tick, sysctl at most every 10 s", async () => {
    const { deps, state, calls } = setup("darwin")
    const c = createCollector(deps)
    const count = (f: string) => calls.run.filter(([file]) => file === f).length
    await c.collect()
    state.now += 9_999
    expect((await c.collect()).swap).not.toBeNull()
    expect([count("vm_stat"), count("sysctl")]).toEqual([2, 1])
    state.now += 1
    await c.collect()
    expect([count("vm_stat"), count("sysctl")]).toEqual([3, 2])
  })

  test("failing vm_stat leaves swap intact", async () => {
    const { deps } = setup("darwin")
    const run = deps.run
    deps.run = async (f, a, s) => { if (f === "vm_stat") throw new Error("x"); return run(f, a, s) }
    const s = await createCollector(deps).collect()
    expect(s.ram).toBeNull()
    expect(s.swap).not.toBeNull()
  })

  test("failing sysctl leaves ram intact", async () => {
    const { deps } = setup("darwin")
    const run = deps.run
    deps.run = async (f, a, s) => { if (f === "sysctl") throw new Error("x"); return run(f, a, s) }
    const s = await createCollector(deps).collect()
    expect(s.swap).toBeNull()
    expect(s.ram).not.toBeNull()
  })

  test("never throws when everything fails", async () => {
    const fail = async () => { throw new Error("nope") }
    const { deps } = setup("darwin", { run: fail, statfs: fail, cpus: () => { throw new Error("nope") } })
    const s = await createCollector(deps).collect()
    expect([s.cpu, s.ram, s.swap, s.disk, s.gpu]).toEqual([null, null, null, null, null])
  })
})

describe("win32", () => {
  test("cpu, ram from os totals, swap from powershell, gpu via smi", async () => {
    const { deps, calls } = setup("win32")
    const s = await createCollector(deps).collect()
    expect(s.cpu?.percent ?? null).toBeNull()
    expect(s.ram?.percent).toBeCloseTo(75, 10)
    expect(s.swap?.percent).toBeCloseTo(25, 10)
    expect(s.gpu && "util" in s.gpu ? s.gpu.util : null).toBe(89)
    expect(calls.read).toBe(0)
    const [file, args] = ps(calls)[0]!
    expect(file).toBe("powershell")
    expect(args).toContain("-Command")
    expect(args).toContain(WIN_PAGEFILE_SCRIPT)
  })

  test("swap cached for 30 s, re-spawned after", async () => {
    const { deps, state, calls } = setup("win32")
    const c = createCollector(deps)
    await c.collect()
    state.now += 29_999
    expect((await c.collect()).swap).not.toBeNull()
    expect(ps(calls)).toHaveLength(1)
    state.now += 1
    await c.collect()
    expect(ps(calls)).toHaveLength(2)
  })

  test("powershell failure -> swap null, no re-spawn before 30 s", async () => {
    const { deps, state, calls } = setup("win32")
    deps.run = async (f, a) => { calls.run.push([f, a]); throw new Error("blocked") }
    const c = createCollector(deps)
    expect((await c.collect()).swap).toBeNull()
    state.now += 10_000
    expect((await c.collect()).swap).toBeNull()
    expect(ps(calls)).toHaveLength(1)
    state.now += 20_000
    await c.collect()
    expect(ps(calls)).toHaveLength(2)
  })

  test("disk uses the df formula outside macOS", async () => {
    const { deps } = setup("win32")
    expect((await createCollector(deps).collect()).disk?.percent).toBeCloseTo((50 / 450) * 100, 10)
  })

  test("disk root follows SystemDrive", async () => {
    const a = setup("win32")
    await createCollector(a.deps).collect()
    expect(a.calls.statfs).toEqual(["C:\\"])
    const b = setup("win32", { env: { SystemDrive: "D:" } })
    await createCollector(b.deps).collect()
    expect(b.calls.statfs).toEqual(["D:\\"])
  })

  test("cache is per collector instance", async () => {
    const { deps, calls } = setup("win32")
    await createCollector(deps).collect()
    await createCollector(deps).collect()
    expect(ps(calls)).toHaveLength(2)
  })
})

describe("other platform", () => {
  test("ram from os totals, swap null, gpu via smi", async () => {
    const { deps, calls } = setup("freebsd")
    const s = await createCollector(deps).collect()
    expect(s.ram?.percent).toBeCloseTo(75, 10)
    expect(s.swap).toBeNull()
    expect(s.gpu && "util" in s.gpu ? s.gpu.util : null).toBe(89)
    expect(calls.statfs).toEqual(["/"])
    expect(calls.run).toEqual([])
  })
})
