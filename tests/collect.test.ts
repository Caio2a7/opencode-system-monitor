import { describe, expect, test } from "bun:test"
import { createCollector, type CollectorDeps } from "../src/stats/collect"
import { MEMINFO, PROC_STAT_A, PROC_STAT_B, SMI_LINE } from "./fixtures"

function fakeDeps(over: Partial<CollectorDeps> & { files?: Record<string, string> } = {}) {
  const { files: given, ...rest } = over
  const files: Record<string, string> = {
    "/proc/stat": PROC_STAT_A,
    "/proc/meminfo": MEMINFO,
    ...given,
  }
  const deps: CollectorDeps = {
    readText: async (path) => {
      if (!(path in files)) throw new Error(`ENOENT ${path}`)
      return files[path]!
    },
    statfs: async () => ({ blocks: 1000, bfree: 400, bavail: 300 }),
    runSmi: async () => SMI_LINE,
    run: async () => {
      throw new Error("run not faked")
    },
    cpus: () => [],
    totalmem: () => 0,
    freemem: () => 0,
    now: () => 0,
    platform: "linux",
    env: {},
    ...rest,
  }
  return { deps, files }
}

const errno = (code: string, message = code) => Object.assign(new Error(message), { code })

describe("createCollector", () => {
  test("first collect: all metrics present, cpu rate still unknown", async () => {
    const stats = await createCollector(fakeDeps().deps).collect()
    expect(stats.cpu?.percent ?? null).toBeNull()
    expect(stats.swap?.percent).toBeCloseTo(12.5, 10)
    expect(stats.ram?.percent).toBeCloseTo(50, 10)
    expect(stats.disk?.percent).toBeCloseTo((600 / 900) * 100, 10)
    expect(stats.gpu && "util" in stats.gpu ? stats.gpu.util : null).toBe(89)
  })

  test("second collect derives cpu percent from deltas", async () => {
    const { deps, files } = fakeDeps()
    const c = createCollector(deps)
    await c.collect()
    files["/proc/stat"] = PROC_STAT_B
    const stats = await c.collect()
    expect(stats.cpu?.percent).toBeCloseTo(50, 10)
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

  test("missing /proc/meminfo nulls ram but keeps cpu, disk and nulls swap", async () => {
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
    expect(stats.swap).toBeNull()
  })

  test("malformed file contents null the metric instead of throwing", async () => {
    const { deps } = fakeDeps({ files: { "/proc/stat": "junk", "/proc/meminfo": "junk" } })
    const stats = await createCollector(deps).collect()
    expect(stats.cpu).toBeNull()
    expect(stats.ram).toBeNull()
  })

  test("never throws even if every dependency rejects", async () => {
    const fail = async () => { throw new Error("nope") }
    const c = createCollector({ readText: fail, statfs: fail, runSmi: fail, platform: "linux" })
    const stats = await c.collect()
    expect(stats.cpu).toBeNull()
    expect(stats.ram).toBeNull()
    expect(stats.disk).toBeNull()
    expect(stats.swap).toBeNull()
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

  test("transient /proc/stat failure preserves prevCpu so the next valid read still computes a delta", async () => {
    const { deps, files } = fakeDeps()
    const c = createCollector(deps)
    expect((await c.collect()).cpu?.percent).toBeNull()
    files["/proc/stat"] = "corrupt"
    expect((await c.collect()).cpu).toBeNull()
    files["/proc/stat"] = PROC_STAT_B
    expect((await c.collect()).cpu?.percent).toBeCloseTo(50, 10)
  })

  test("nvidia-smi ENOENT is cached so subsequent collects do not re-spawn nvidia-smi", async () => {
    let smiCalls = 0
    const { deps } = fakeDeps({
      runSmi: async () => {
        smiCalls++
        throw errno("ENOENT")
      },
    })
    const c = createCollector(deps)
    expect((await c.collect()).gpu).toBeNull()
    expect((await c.collect()).gpu).toBeNull()
    expect((await c.collect()).gpu).toBeNull()
    expect(smiCalls).toBe(1)
  })

  test("falls back to Linux AMD GPU sysfs when nvidia-smi throws ENOENT and caches discovered card", async () => {
    let smiCalls = 0
    const GiB = 1024 ** 3
    const { deps, files } = fakeDeps({
      runSmi: async () => {
        smiCalls++
        throw errno("ENOENT")
      },
      files: {
        "/sys/class/drm/card1/device/gpu_busy_percent": "64\n",
        "/sys/class/drm/card1/device/mem_info_vram_used": `${3 * GiB}\n`,
        "/sys/class/drm/card1/device/mem_info_vram_total": `${12 * GiB}\n`,
        "/sys/class/drm/card1/device/hwmon/hwmon0/temp1_input": "61000\n",
        "/sys/class/drm/card1/device/product_name": "AMD Radeon RX 7700 XT\n",
      },
    })
    const c = createCollector(deps)
    const first = await c.collect()
    expect(first.gpu).toEqual({
      name: "AMD Radeon RX 7700 XT",
      util: 64,
      temp: 61,
      vramPercent: 25,
      vramUsedGiB: 3,
      vramTotalGiB: 12,
    })
    files["/sys/class/drm/card1/device/gpu_busy_percent"] = "80\n"
    const second = await c.collect()
    expect(second.gpu && "util" in second.gpu ? second.gpu.util : null).toBe(80)
    expect(smiCalls).toBe(1)
  })

  test("uses Linux cgroup v2 memory limit when smaller than host RAM and caches absence when unlimited", async () => {
    const GiB = 1024 ** 3
    const { deps, files } = fakeDeps({
      files: {
        "/sys/fs/cgroup/memory.max": `${4 * GiB}\n`,
        "/sys/fs/cgroup/memory.current": `${GiB}\n`,
      },
    })
    const c = createCollector(deps)
    const s = await c.collect()
    expect(s.ram).toEqual({ percent: 25, usedGiB: 1, totalGiB: 4 })
    files["/sys/fs/cgroup/memory.current"] = `${2 * GiB}\n`
    expect((await c.collect()).ram?.percent).toBe(50)

    let cgroupReads = 0
    const unlimited = fakeDeps({
      files: {
        "/sys/fs/cgroup/memory.max": "max\n",
        "/sys/fs/cgroup/memory.current": `${GiB}\n`,
      },
    })
    const origRead = unlimited.deps.readText
    unlimited.deps.readText = async (p) => {
      if (p.startsWith("/sys/fs/cgroup/")) cgroupReads++
      return origRead(p)
    }
    const cu = createCollector(unlimited.deps)
    expect((await cu.collect()).ram?.percent).toBeCloseTo(50, 10)
    expect((await cu.collect()).ram?.percent).toBeCloseTo(50, 10)
    expect(cgroupReads).toBe(2) // Only read once on first tick
  })

  test("caches statfs disk usage for 10 s and refreshes afterwards", async () => {
    let now = 1_000
    let statfsCalls = 0
    const { deps } = fakeDeps({
      now: () => now,
      statfs: async () => {
        statfsCalls++
        return { blocks: 1000, bfree: 400, bavail: 300 }
      },
    })
    const c = createCollector(deps)
    expect((await c.collect()).disk?.percent).toBeCloseTo((600 / 900) * 100, 10)
    now += 9_999
    expect((await c.collect()).disk?.percent).toBeCloseTo((600 / 900) * 100, 10)
    expect(statfsCalls).toBe(1)
    now += 1
    expect((await c.collect()).disk?.percent).toBeCloseTo((600 / 900) * 100, 10)
    expect(statfsCalls).toBe(2)
  })

  test("serves cached GPU within fast budget when nvidia-smi is slow and deduplicates inflight calls", async () => {
    let smiCalls = 0
    let resolveSlow!: (v: string) => void
    const { deps, files } = fakeDeps({
      runSmi: async () => {
        smiCalls++
        if (smiCalls === 1) return SMI_LINE
        return new Promise<string>((r) => {
          resolveSlow = r
        })
      },
    })
    const c = createCollector(deps)
    const first = await c.collect()
    expect(first.gpu && "util" in first.gpu ? first.gpu.util : null).toBe(89)

    files["/proc/stat"] = PROC_STAT_B
    const start = Date.now()
    const second = await c.collect()
    // Should resolve after ~250ms fast budget with CPU updated and stale GPU (89%), without waiting forever
    expect(Date.now() - start).toBeLessThan(1000)
    expect(second.cpu?.percent).toBeCloseTo(50, 10)
    expect(second.gpu && "util" in second.gpu ? second.gpu.util : null).toBe(89)

    // Another collect while still inflight must not spawn a 3rd nvidia-smi
    await c.collect()
    expect(smiCalls).toBe(2)

    resolveSlow("42, 2048, 8192, 55, RTX\n")
    await new Promise((r) => setTimeout(r, 0))
    const fourth = await c.collect()
    expect(fourth.gpu && "util" in fourth.gpu ? fourth.gpu.util : null).toBe(42)
  })

  test("config.diskPath overrides the default disk root", async () => {
    const paths: string[] = []
    const statfs = async (p: string) => {
      paths.push(p)
      return { blocks: 1000, bfree: 400, bavail: 300 }
    }
    await createCollector(fakeDeps({ statfs }).deps, { diskPath: "/home" }).collect()
    await createCollector(fakeDeps({ statfs }).deps, { diskPath: null }).collect()
    expect(paths).toEqual(["/home", "/"])
  })

  test("config.gpuIndex selects the nvidia-smi line", async () => {
    const runSmi = async () => `${SMI_LINE.trim()}\n10, 512, 2048, 30, Second GPU\n`
    const second = await createCollector(fakeDeps({ runSmi }).deps, { gpuIndex: 1 }).collect()
    expect(second.gpu && "name" in second.gpu ? second.gpu.name : null).toBe("Second GPU")
    const missing = await createCollector(fakeDeps({ runSmi }).deps, { gpuIndex: 5 }).collect()
    expect(missing.gpu).toEqual({ error: "unexpected nvidia-smi output" })
  })
})
