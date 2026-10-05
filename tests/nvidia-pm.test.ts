import { describe, expect, test } from "bun:test"
import { createCollector } from "../src/stats/collect"
import { allSuspended, findNvidiaGpus } from "../src/stats/nvidia-pm"
import { MEMINFO, PROC_STAT_A, SMI_LINE } from "./fixtures"

const PCI = "/sys/bus/pci/devices"
const DGPU = `${PCI}/0000:01:00.0`

function sysfs(status: string) {
  const files: Record<string, string> = {
    [`${PCI}/0000:00:02.0/vendor`]: "0x8086\n",
    [`${PCI}/0000:00:02.0/class`]: "0x030000\n",
    [`${DGPU}/vendor`]: "0x10de\n",
    [`${DGPU}/class`]: "0x030200\n",
    [`${DGPU}/power/runtime_status`]: `${status}\n`,
    [`${PCI}/0000:01:00.1/vendor`]: "0x10de\n",
    [`${PCI}/0000:01:00.1/class`]: "0x040300\n",
    "/proc/stat": PROC_STAT_A,
    "/proc/meminfo": MEMINFO,
  }
  const read = async (path: string) => {
    if (!(path in files)) throw new Error(`ENOENT ${path}`)
    return files[path]!
  }
  const list = async (path: string) => {
    if (path !== PCI) throw new Error("ENOTDIR")
    return ["0000:00:02.0", "0000:01:00.0", "0000:01:00.1"]
  }
  return { files, read, list }
}

describe("findNvidiaGpus", () => {
  test("keeps NVIDIA display controllers only (not Intel, not the HDMI audio function)", async () => {
    const { read, list } = sysfs("active")
    expect(await findNvidiaGpus(read, list)).toEqual([DGPU])
  })

  test("no PCI sysfs -> no GPUs", async () => {
    expect(await findNvidiaGpus(async () => "", async () => { throw new Error("x") })).toEqual([])
  })
})

describe("allSuspended", () => {
  test("true only when every NVIDIA GPU is runtime-suspended", async () => {
    expect(await allSuspended(sysfs("suspended").read, [DGPU])).toBe(true)
    expect(await allSuspended(sysfs("active").read, [DGPU])).toBe(false)
    expect(await allSuspended(sysfs("suspending").read, [DGPU])).toBe(false)
  })

  test("false without GPUs or without runtime PM", async () => {
    expect(await allSuspended(sysfs("suspended").read, [])).toBe(false)
    expect(await allSuspended(async () => { throw new Error("x") }, [DGPU])).toBe(false)
  })
})

describe("linux collector", () => {
  function collector(status: string) {
    const fs = sysfs(status)
    const calls = { smi: 0 }
    const c = createCollector({
      platform: "linux",
      readText: fs.read,
      listDir: fs.list,
      statfs: async () => ({ bsize: 4096, blocks: 10, bfree: 5, bavail: 5 }),
      run: async (tool) => {
        if (tool !== "nvidia-smi") throw new Error(`unexpected ${tool}`)
        calls.smi++
        return SMI_LINE
      },
    })
    return { fs, calls, c }
  }

  test("a suspended dGPU is reported as such without running nvidia-smi", async () => {
    const { c, calls } = collector("suspended")
    expect((await c.collect()).gpu).toEqual({ suspended: true })
    expect(calls.smi).toBe(0)
  })

  test("an active dGPU is queried, and the device scan runs once", async () => {
    const { c, calls, fs } = collector("active")
    expect((await c.collect()).gpu).toMatchObject({ util: 89 })
    fs.files[`${DGPU}/power/runtime_status`] = "suspended\n"
    expect((await c.collect()).gpu).toEqual({ suspended: true })
    expect(calls.smi).toBe(1)
  })
})
