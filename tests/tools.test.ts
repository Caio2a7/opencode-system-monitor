import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { RunOptions } from "../src/stats/run"
import { childEnv, createToolRunner, isExecutable, toolCandidates, type ToolHost } from "../src/stats/tools"

const WIN_ENV = {
  SYSTEMROOT: "C:\\Windows",
  ProgramFiles: "C:\\Program Files",
  Path: 'C:\\Tools;.;bin;;"C:\\Quoted Dir";C:\\Windows\\System32',
  ANTHROPIC_API_KEY: "sk-secret",
  PSModulePath: "C:\\Program Files\\PowerShell\\7\\Modules",
}

function fakeHost(over: Partial<ToolHost> = {}) {
  const calls = { exec: [] as Array<[string, readonly string[], RunOptions]>, checked: [] as string[] }
  const host: ToolHost = {
    platform: "linux",
    env: { PATH: "/opt/bin:.:relative::/usr/bin", HOME: "/home/u", OPENAI_API_KEY: "sk-secret" },
    isExecutable: async (path) => {
      calls.checked.push(path)
      return path === "/usr/bin/nvidia-smi"
    },
    exec: async (file, args, opts) => {
      calls.exec.push([file, args, opts])
      opts.onExit?.()
      return "ok"
    },
    ...over,
  }
  return { host, calls }
}

describe("toolCandidates", () => {
  test("win32 powershell is the fixed System32 path from SystemRoot (any case)", () => {
    expect(toolCandidates("powershell", "win32", WIN_ENV)).toEqual([
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    ])
  })

  test("win32 nvidia-smi: System32, NVSMI, then absolute PATH entries only", () => {
    expect(toolCandidates("nvidia-smi", "win32", WIN_ENV)).toEqual([
      "C:\\Windows\\System32\\nvidia-smi.exe",
      "C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe",
      "C:\\Tools\\nvidia-smi.exe",
      "C:\\Quoted Dir\\nvidia-smi.exe",
      "C:\\Windows\\System32\\nvidia-smi.exe",
    ])
  })

  test("posix nvidia-smi skips empty and relative PATH entries", () => {
    expect(toolCandidates("nvidia-smi", "linux", { PATH: "/opt/bin:.:relative::/usr/local/bin" })).toEqual([
      "/opt/bin/nvidia-smi",
      "/usr/local/bin/nvidia-smi",
      "/usr/bin/nvidia-smi",
      "/usr/lib/wsl/lib/nvidia-smi",
    ])
  })

  test("macOS tools use absolute system paths", () => {
    expect(toolCandidates("vm_stat", "darwin", { PATH: "." })).toEqual(["/usr/bin/vm_stat"])
    expect(toolCandidates("sysctl", "darwin", { PATH: "." })).toEqual(["/usr/sbin/sysctl", "/sbin/sysctl"])
  })

  test("no candidate is ever relative", () => {
    for (const platform of ["linux", "darwin", "win32"]) {
      for (const tool of ["nvidia-smi", "vm_stat", "sysctl", "powershell"] as const) {
        const env = { PATH: ".;bin;.:bin", SystemRoot: "Windows" }
        for (const path of toolCandidates(tool, platform, env)) {
          expect(path.startsWith("/") || /^[A-Za-z]:\\/.test(path)).toBe(true)
        }
      }
    }
  })
})

describe("childEnv", () => {
  test("posix keeps PATH and HOME, drops secrets, forces the C locale", () => {
    expect(childEnv("linux", { PATH: "/usr/bin", HOME: "/h", OPENAI_API_KEY: "x", LANG: "pt_BR.UTF-8" })).toEqual({
      PATH: "/usr/bin",
      HOME: "/h",
      LC_ALL: "C",
      LANG: "C",
    })
  })

  test("win32 keeps system variables regardless of case, drops secrets and PSModulePath", () => {
    const env = childEnv("win32", WIN_ENV)
    expect(env.SystemRoot).toBe("C:\\Windows")
    expect(env.PATH).toBe(WIN_ENV.Path)
    expect(Object.keys(env)).not.toContain("ANTHROPIC_API_KEY")
    expect(Object.keys(env)).not.toContain("PSModulePath")
  })
})

describe("createToolRunner", () => {
  test("runs the first executable candidate by absolute path, from its own directory, with a minimal env", async () => {
    const { host, calls } = fakeHost()
    expect(await createToolRunner(host)("nvidia-smi", ["-q"])).toBe("ok")
    const [file, args, opts] = calls.exec[0]!
    expect(file).toBe("/usr/bin/nvidia-smi")
    expect(args).toEqual(["-q"])
    expect(opts.cwd).toBe("/usr/bin")
    expect(opts.env).toEqual({ PATH: "/opt/bin:.:relative::/usr/bin", HOME: "/home/u", LC_ALL: "C", LANG: "C" })
    expect(calls.checked.every((p) => p.startsWith("/"))).toBe(true)
  })

  test("PowerShell gets 10 s for its cold start, other tools 3 s", async () => {
    const { host, calls } = fakeHost({ platform: "win32", env: WIN_ENV, isExecutable: async () => true })
    const run = createToolRunner(host)
    await run("powershell", [])
    await run("nvidia-smi", [])
    expect(calls.exec.map(([, , o]) => o.timeoutMs)).toEqual([10_000, 3000])
  })

  test("refuses to start a tool whose previous process has not exited yet", async () => {
    let exit: (() => void) | undefined
    const { host, calls } = fakeHost({
      exec: async (file, args, opts) => {
        calls.exec.push([file, args, opts])
        exit = opts.onExit
        throw new Error("nvidia-smi timed out after 3000 ms")
      },
    })
    const run = createToolRunner(host)
    await run("nvidia-smi", []).catch(() => undefined)
    const err = await run("nvidia-smi", []).catch((e) => e)
    expect(err.message).toBe("nvidia-smi is still running")
    expect(calls.exec).toHaveLength(1)
    exit?.()
    await run("nvidia-smi", []).catch(() => undefined)
    expect(calls.exec).toHaveLength(2)
  })

  test("a failed resolution does not leave the tool marked as running", async () => {
    const { host } = fakeHost({ isExecutable: async () => false })
    const run = createToolRunner(host)
    await run("nvidia-smi", []).catch(() => undefined)
    expect((await run("nvidia-smi", []).catch((e) => e)).code).toBe("ENOENT")
  })

  test("resolution is cached", async () => {
    const { host, calls } = fakeHost()
    const run = createToolRunner(host)
    await run("nvidia-smi", [])
    const checks = calls.checked.length
    await run("nvidia-smi", [])
    expect(calls.checked).toHaveLength(checks)
  })

  test("missing tool rejects with ENOENT without spawning", async () => {
    const { host, calls } = fakeHost({ isExecutable: async () => false })
    const err = await createToolRunner(host)("nvidia-smi", []).catch((e) => e)
    expect(err.code).toBe("ENOENT")
    expect(calls.exec).toHaveLength(0)
  })

  test("an ENOENT from the spawn drops the cached path", async () => {
    let gone = false
    const { host, calls } = fakeHost({
      exec: async (_f, _a, opts) => {
        opts.onExit?.()
        if (!gone) return "ok"
        throw Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" })
      },
    })
    const run = createToolRunner(host)
    await run("nvidia-smi", [])
    gone = true
    await run("nvidia-smi", []).catch(() => undefined)
    const checks = calls.checked.length
    await run("nvidia-smi", []).catch(() => undefined)
    expect(calls.checked.length).toBeGreaterThan(checks)
  })
})

describe("isExecutable", () => {
  test("true for an executable file, false for directories, plain files and missing paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sysmon-"))
    try {
      const exe = join(dir, "tool")
      const plain = join(dir, "plain")
      await writeFile(exe, "#!/bin/sh\n")
      await chmod(exe, 0o755)
      await writeFile(plain, "x")
      await chmod(plain, 0o644)
      expect(await isExecutable(exe)).toBe(true)
      expect(await isExecutable(dir)).toBe(false)
      expect(await isExecutable(join(dir, "missing"))).toBe(false)
      if (process.platform !== "win32") expect(await isExecutable(plain)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
