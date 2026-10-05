import { describe, expect, test } from "bun:test"
import { cgroupCandidates, cgroupRam, findCgroupMemory, parseLimit } from "../src/stats/cgroup"
import { createCollector, type CollectorDeps } from "../src/stats/collect"
import { MEMINFO, PROC_STAT_A } from "./fixtures"

const GiB = 1024 ** 3
const V1_SELF = "9:name=systemd:/\n4:memory:/process_api/abc/bash\n1:cpu:/\n0::/\n"
const V1_ROOT = "/sys/fs/cgroup/memory"
const V1_DIR = `${V1_ROOT}/process_api/abc/bash`
const NO_LIMIT_V1 = "9223372036854771712\n"

const reader = (files: Record<string, string>) => async (path: string) => {
  const text = files[path]
  if (text === undefined) throw Object.assign(new Error(`ENOENT ${path}`), { code: "ENOENT" })
  return text
}

describe("cgroupCandidates", () => {
  test("v1 memory controller walks from its path up to the hierarchy root", () => {
    const [v2, v1] = cgroupCandidates(V1_SELF)
    expect(v2!.dirs).toEqual(["/sys/fs/cgroup"])
    expect(v1!.dirs).toEqual([V1_DIR, `${V1_ROOT}/process_api/abc`, `${V1_ROOT}/process_api`, V1_ROOT])
    expect(v1!.files.limit).toBe("memory.limit_in_bytes")
  })

  test("v2 unified line comes first", () => {
    const [v2] = cgroupCandidates("0::/user.slice/app.scope\n")
    expect(v2!.dirs).toEqual(["/sys/fs/cgroup/user.slice/app.scope", "/sys/fs/cgroup/user.slice", "/sys/fs/cgroup"])
    expect(v2!.files.limit).toBe("memory.max")
  })

  test("garbage yields no candidates", () => {
    expect(cgroupCandidates("nonsense\n")).toEqual([])
  })
})

describe("parseLimit", () => {
  test("max is unlimited", () => {
    expect(parseLimit("max\n")).toBe(Infinity)
    expect(parseLimit("1073741824\n")).toBe(GiB)
  })
})

describe("findCgroupMemory", () => {
  test("v1 container: the own cgroup limit wins over the unlimited root", async () => {
    const read = reader({
      "/proc/self/cgroup": V1_SELF,
      [`${V1_DIR}/memory.limit_in_bytes`]: "14345031680\n",
      [`${V1_ROOT}/memory.limit_in_bytes`]: NO_LIMIT_V1,
    })
    expect(await findCgroupMemory(read)).toMatchObject({ dir: V1_DIR })
  })

  test("v2: the smallest limit among ancestors wins", async () => {
    const read = reader({
      "/proc/self/cgroup": "0::/a/b\n",
      "/sys/fs/cgroup/a/b/memory.max": "max\n",
      "/sys/fs/cgroup/a/memory.max": `${2 * GiB}\n`,
    })
    expect(await findCgroupMemory(read)).toMatchObject({ dir: "/sys/fs/cgroup/a" })
  })

  test("v2 with a cgroup namespace: the namespace root holds the limit", async () => {
    const read = reader({ "/proc/self/cgroup": "0::/\n", "/sys/fs/cgroup/memory.max": `${GiB}\n` })
    expect(await findCgroupMemory(read)).toMatchObject({ dir: "/sys/fs/cgroup" })
  })

  test("v1 without a namespace: a missing host path falls back to the mounted root", async () => {
    const read = reader({ "/proc/self/cgroup": "4:memory:/docker/abc\n", [`${V1_ROOT}/memory.limit_in_bytes`]: `${GiB}\n` })
    expect(await findCgroupMemory(read)).toMatchObject({ dir: V1_ROOT })
  })

  test("no limit anywhere -> null", async () => {
    const read = reader({ "/proc/self/cgroup": "0::/a\n", "/sys/fs/cgroup/a/memory.max": "max\n" })
    expect(await findCgroupMemory(read)).toBeNull()
  })
})

describe("cgroupRam", () => {
  const v2 = { dir: "/cg", files: { limit: "memory.max", usage: "memory.current", inactiveKey: "inactive_file" } }
  const files = (limit: string) =>
    reader({ "/cg/memory.max": limit, "/cg/memory.current": `${3 * GiB}\n`, "/cg/memory.stat": `anon 1\ninactive_file ${GiB}\n` })

  test("used = usage - inactive_file, total = limit", async () => {
    const ram = (await cgroupRam(files(`${4 * GiB}\n`), v2, 16 * GiB))!
    expect(ram.totalGiB).toBeCloseTo(4, 10)
    expect(ram.usedGiB).toBeCloseTo(2, 10)
    expect(ram.percent).toBeCloseTo(50, 10)
  })

  test("a limit at or above host memory, or unlimited, is ignored", async () => {
    expect(await cgroupRam(files(`${16 * GiB}\n`), v2, 16 * GiB)).toBeNull()
    expect(await cgroupRam(files("max\n"), v2, 16 * GiB)).toBeNull()
  })
})

describe("linux collector", () => {
  function deps(files: Record<string, string>): Partial<CollectorDeps> {
    return {
      readText: reader({ "/proc/stat": PROC_STAT_A, "/proc/meminfo": MEMINFO, ...files }),
      statfs: async () => ({ bsize: 4096, blocks: 1, bfree: 0, bavail: 0 }),
      runSmi: async () => { throw Object.assign(new Error("x"), { code: "ENOENT" }) },
      platform: "linux",
    }
  }

  test("RAM follows the container limit when it is below host memory", async () => {
    const stats = await createCollector(deps({
      "/proc/self/cgroup": "0::/\n",
      "/sys/fs/cgroup/memory.max": `${2 * GiB}\n`,
      "/sys/fs/cgroup/memory.current": `${GiB}\n`,
      "/sys/fs/cgroup/memory.stat": "inactive_file 0\n",
    })).collect()
    expect(stats.ram?.totalGiB).toBeCloseTo(2, 10)
    expect(stats.ram?.percent).toBeCloseTo(50, 10)
  })

  test("without cgroup files RAM comes from /proc/meminfo", async () => {
    const stats = await createCollector(deps({})).collect()
    expect(stats.ram?.percent).toBeCloseTo(50, 10)
    expect(stats.ram?.totalGiB).toBeCloseTo(16384000 / 1048576, 10)
  })
})
