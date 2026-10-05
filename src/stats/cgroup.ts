import type { RamStats } from "../types"
import { ramFromTotals } from "./parse-os"

type ReadText = (path: string) => Promise<string>

export interface CgroupFiles {
  limit: string
  usage: string
  inactiveKey: string
}

export interface CgroupMemory {
  dir: string
  files: CgroupFiles
}

const V2: CgroupFiles = { limit: "memory.max", usage: "memory.current", inactiveKey: "inactive_file" }
const V1: CgroupFiles = { limit: "memory.limit_in_bytes", usage: "memory.usage_in_bytes", inactiveKey: "total_inactive_file" }

function ancestors(base: string, path: string): string[] {
  const parts = path.split("/").filter(Boolean)
  return parts.map((_, i) => `${base}/${parts.slice(0, parts.length - i).join("/")}`).concat(base)
}

export function cgroupCandidates(procSelfCgroup: string): Array<{ dirs: string[]; files: CgroupFiles }> {
  const out: Array<{ dirs: string[]; files: CgroupFiles }> = []
  for (const line of procSelfCgroup.split("\n")) {
    const match = /^(\d+):([^:]*):(\/.*)$/.exec(line.trim())
    if (!match) continue
    const [, id, controllers = "", path = "/"] = match
    if (id === "0" && controllers === "") out.unshift({ dirs: ancestors("/sys/fs/cgroup", path), files: V2 })
    else if (controllers.split(",").includes("memory")) out.push({ dirs: ancestors("/sys/fs/cgroup/memory", path), files: V1 })
  }
  return out
}

export function parseLimit(text: string): number {
  const value = text.trim()
  return value === "max" ? Infinity : Number(value)
}

async function limitOf(read: ReadText, dir: string, files: CgroupFiles): Promise<number> {
  try {
    const limit = parseLimit(await read(`${dir}/${files.limit}`))
    return Number.isFinite(limit) && limit > 0 ? limit : Infinity
  } catch {
    return Infinity
  }
}

export async function findCgroupMemory(read: ReadText): Promise<CgroupMemory | null> {
  let best: (CgroupMemory & { limit: number }) | null = null
  for (const { dirs, files } of cgroupCandidates(await read("/proc/self/cgroup"))) {
    for (const dir of dirs) {
      const limit = await limitOf(read, dir, files)
      if (limit < (best?.limit ?? Infinity)) best = { dir, files, limit }
    }
    if (best) break
  }
  return best && { dir: best.dir, files: best.files }
}

function statValue(stat: string, key: string): number | null {
  const match = new RegExp(`^${key} (\\d+)$`, "m").exec(stat)
  return match?.[1] === undefined ? null : Number(match[1])
}

export async function cgroupRam(read: ReadText, cgroup: CgroupMemory, hostTotalBytes: number): Promise<RamStats | null> {
  const { dir, files } = cgroup
  const [limitText, usageText, stat] = await Promise.all([
    read(`${dir}/${files.limit}`),
    read(`${dir}/${files.usage}`),
    read(`${dir}/memory.stat`),
  ])
  const limit = parseLimit(limitText)
  if (!(limit > 0 && limit < hostTotalBytes)) return null
  const used = Number(usageText.trim()) - (statValue(stat, files.inactiveKey) ?? 0)
  return Number.isFinite(used) ? ramFromTotals(limit, limit - used) : null
}
