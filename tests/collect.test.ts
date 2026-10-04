import { describe, expect, test } from "bun:test"
import { createCollector, type CollectorDeps } from "../src/stats/collect"
import { MEMINFO, PROC_STAT_A, PROC_STAT_B, SMI_LINE, netDev } from "./fixtures"

const MiB = 1_048_576

function fakeDeps(over: Partial<CollectorDeps> & { files?: Record<string, string> } = {}) {
  const { files: given, ...rest } = over
  const files: Record<string, string> = {
    "/proc/stat": PROC_STAT_A,
    "/proc/meminfo": MEMINFO,
    "/proc/net/dev": netDev({ wlan0: 0 }),
    ...given,
  }
  const deps: CollectorDeps = {
    readText: async (path) => {
      if (!(path in files)) throw new Error(`ENOENT ${path}`)
      return files[path]!
    },
    statfs: async () => ({ blocks: 1000, bfree: 400, bavail: 300 }),
    runSmi: async () => SMI_LINE,
    now: () => 0,
    ...rest,
  }
  return { deps, files }
}

const errno = (code: string, message = code) => Object.assign(new Error(message), { code })

describe("createCollector", () => {
  test("first collect: all metrics present, cpu and net rates still unknown", async () => {
    const stats = await createCollector(fakeDeps().deps).collect()
    expect(stats.cpu?.percent ?? null).toBeNull()
    expect(stats.net?.rate ?? null).toBeNull()
    expect(stats.ram?.percent).toBeCloseTo(50, 10)
    expect(stats.disk?.percent).toBeCloseTo((600 / 900) * 100, 10)
    expect(stats.gpu && "util" in stats.gpu ? stats.gpu.util : null).toBe(89)
  })

  test("second collect derives cpu percent and net rate from deltas", async () => {
    let t = 0
    const { deps, files } = fakeDeps({ now: () => t })
    const c = createCollector(deps)
    await c.collect()
    files["/proc/stat"] = PROC_STAT_B
    files["/proc/net/dev"] = netDev({ wlan0: 2 * MiB, lo: 999999 })
    t = 1000
    const stats = await c.collect()
    expect(stats.cpu?.percent).toBeCloseTo(50, 10)
    expect(stats.net?.rate).toBe(2 * MiB)
  })

  test("nvidia-smi ENOENT means no GPU (null)", async () => {
    const { deps } = fakeDeps({ runSmi: async () => { throw errno("ENOENT") } })
    expect((await createCollector(deps).collect()).gpu).toBeNull()
  })

  test("other nvidia-smi failure becomes { error: message }", async () => {
    const { deps } = fakeDeps({ runSmi: async () => { throw new Error("driver mismatch") } })
    expect((await createCollector(deps).collect()).gpu).toEqual({ error: "driver mismatch" })
  })

  test("a failing reader nulls only its own metric", async () => {
    const { deps } = fakeDeps({ statfs: async () => { throw new Error("boom") } })
    const stats = await createCollector(deps).collect()
    expect(stats.disk).toBeNull()
    expect(stats.ram).not.toBeNull()
    expect(stats.gpu).not.toBeNull()
  })

  test("missing /proc/meminfo nulls ram but keeps cpu, disk, net", async () => {
    const { deps } = fakeDeps()
    const readText = deps.readText
    deps.readText = async (p) => {
      if (p === "/proc/meminfo") throw new Error("gone")
      return readText(p)
    }
    const stats = await createCollector(deps).collect()
    expect(stats.ram).toBeNull()
    expect(stats.cpu).not.toBeNull()
    expect(stats.disk).not.toBeNull()
    expect(stats.net).not.toBeNull()
  })

  test("malformed file contents null the metric instead of throwing", async () => {
    const { deps } = fakeDeps({ files: { "/proc/stat": "junk", "/proc/meminfo": "junk" } })
    const stats = await createCollector(deps).collect()
    expect(stats.cpu).toBeNull()
    expect(stats.ram).toBeNull()
  })

  test("never throws even if every dependency rejects", async () => {
    const fail = async () => { throw new Error("nope") }
    const c = createCollector({ readText: fail, statfs: fail, runSmi: fail, now: () => 0 })
    const stats = await c.collect()
    expect(stats.cpu).toBeNull()
    expect(stats.ram).toBeNull()
    expect(stats.disk).toBeNull()
    expect(stats.net).toBeNull()
    expect(stats.gpu).toEqual({ error: "nope" })
  })

  test("collector instances do not share state", async () => {
    const a = fakeDeps()
    const b = fakeDeps()
    const ca = createCollector(a.deps)
    const cb = createCollector(b.deps)
    await ca.collect()
    a.files["/proc/stat"] = PROC_STAT_B
    expect((await ca.collect()).cpu?.percent).toBeCloseTo(50, 10)
    // cb has never collected: its first sample must still be unknown
    b.files["/proc/stat"] = PROC_STAT_B
    expect((await cb.collect()).cpu?.percent ?? null).toBeNull()
  })
})
