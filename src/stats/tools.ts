import { access, constants, stat } from "node:fs/promises"
import { posix, win32 } from "node:path"
import { hasCode, notFound } from "./errors"
import { runCommand, type RunOptions } from "./run"

export type Tool = "nvidia-smi" | "vm_stat" | "sysctl" | "powershell"
type Env = Readonly<Record<string, string | undefined>>

export interface ToolHost {
  platform: string
  env: Env
  isExecutable(path: string): Promise<boolean>
  exec(file: string, args: readonly string[], opts: RunOptions): Promise<string>
}

export type ToolRunner = (tool: Tool, args: readonly string[], signal?: AbortSignal) => Promise<string>

const TIMEOUT_MS = 3000
const MAX_OUTPUT_BYTES = 64 * 1024

const POSIX_ENV = ["PATH", "HOME", "TMPDIR", "LD_LIBRARY_PATH"]
const WIN32_ENV = [
  "SystemRoot",
  "windir",
  "SystemDrive",
  "ComSpec",
  "PATH",
  "PATHEXT",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "ProgramData",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "ProgramW6432",
  "CommonProgramFiles",
  "CommonProgramFiles(x86)",
  "CommonProgramW6432",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "OS",
]
const POSIX_NVIDIA_SMI = ["/usr/bin/nvidia-smi", "/usr/lib/wsl/lib/nvidia-smi"]

const pathApi = (platform: string) => (platform === "win32" ? win32 : posix)

export function envValue(platform: string, env: Env, name: string): string | undefined {
  if (platform !== "win32") return env[name]
  const upper = name.toUpperCase()
  return Object.entries(env).find(([key, value]) => key.toUpperCase() === upper && value !== undefined)?.[1]
}

export function childEnv(platform: string, env: Env): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of platform === "win32" ? WIN32_ENV : POSIX_ENV) {
    const value = envValue(platform, env, name)
    if (value !== undefined) out[name] = value
  }
  if (platform !== "win32") Object.assign(out, { LC_ALL: "C", LANG: "C" })
  return out
}

function pathDirs(platform: string, env: Env): string[] {
  const api = pathApi(platform)
  const raw = envValue(platform, env, "PATH") ?? ""
  return raw
    .split(api.delimiter)
    .map((dir) => (platform === "win32" ? dir.trim().replace(/^"(.*)"$/, "$1") : dir))
    .filter((dir) => dir !== "" && api.isAbsolute(dir))
}

function win32Candidates(tool: Tool, env: Env): string[] {
  const root = envValue("win32", env, "SystemRoot") ?? "C:\\Windows"
  if (tool === "powershell") return [win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")]
  if (tool !== "nvidia-smi") return []
  const programFiles = envValue("win32", env, "ProgramFiles") ?? "C:\\Program Files"
  return [
    win32.join(root, "System32", "nvidia-smi.exe"),
    win32.join(programFiles, "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"),
    ...pathDirs("win32", env).map((dir) => win32.join(dir, "nvidia-smi.exe")),
  ]
}

function posixCandidates(tool: Tool, env: Env): string[] {
  switch (tool) {
    case "vm_stat":
      return ["/usr/bin/vm_stat"]
    case "sysctl":
      return ["/usr/sbin/sysctl", "/sbin/sysctl"]
    case "nvidia-smi":
      return [...pathDirs("linux", env).map((dir) => posix.join(dir, "nvidia-smi")), ...POSIX_NVIDIA_SMI]
    case "powershell":
      return []
  }
}

export function toolCandidates(tool: Tool, platform: string, env: Env): string[] {
  const list = platform === "win32" ? win32Candidates(tool, env) : posixCandidates(tool, env)
  return list.filter((path) => pathApi(platform).isAbsolute(path))
}

export async function isExecutable(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false
    if (process.platform !== "win32") await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function createToolRunner(host: ToolHost): ToolRunner {
  const resolved = new Map<Tool, string>()
  const env = childEnv(host.platform, host.env)

  const resolve = async (tool: Tool): Promise<string> => {
    const known = resolved.get(tool)
    if (known) return known
    for (const path of toolCandidates(tool, host.platform, host.env)) {
      if (!(await host.isExecutable(path))) continue
      resolved.set(tool, path)
      return path
    }
    throw notFound(tool)
  }

  return async (tool, args, signal) => {
    const file = await resolve(tool)
    const cwd = pathApi(host.platform).dirname(file)
    try {
      return await host.exec(file, args, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_OUTPUT_BYTES, signal, env, cwd })
    } catch (err) {
      if (hasCode(err, "ENOENT")) resolved.delete(tool)
      throw err
    }
  }
}

export const defaultToolHost = (): ToolHost => ({
  platform: process.platform,
  env: process.env,
  isExecutable,
  exec: runCommand,
})
