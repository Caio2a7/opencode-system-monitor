import type { MetricName, SystemStats } from "./types"

export type Tone = "base" | "muted" | "error"

export interface DetailLine {
  label: string
  value: string
  tone: Tone
}

const MISSING = "—"
const ORDER: readonly MetricName[] = ["cpu", "ram", "swap", "disk", "gpu"]

const pct = (n: number | null | undefined): string => (n != null && Number.isFinite(n) ? `${Math.round(n)}%` : MISSING)
const gib = (n: number): string => `${n.toFixed(1)}`

const usage = (s: { usedGiB: number; totalGiB: number; percent: number }): string =>
  `${gib(s.usedGiB)} / ${gib(s.totalGiB)} GiB · ${pct(s.percent)}`

const line = (label: string, value: string, tone: Tone = "base"): DetailLine => ({ label, value, tone })

function gpuLines(stats: SystemStats): DetailLine[] {
  const gpu = stats.gpu
  if (gpu === null) return [line("GPU", "no NVIDIA GPU (nvidia-smi not found)", "muted")]
  if ("suspended" in gpu) return [line("GPU", "off, runtime-suspended (not woken up to read it)", "muted")]
  if ("error" in gpu) return [line("GPU", MISSING, "muted")]
  const temp = gpu.temp === null ? "" : ` · ${Math.round(gpu.temp)} °C`
  return [
    line("GPU", `${pct(gpu.util)}${temp} · ${gpu.name}`),
    line("VRAM", `${gib(gpu.vramUsedGiB)} / ${gib(gpu.vramTotalGiB)} GiB · ${pct(gpu.vramPercent)}`),
  ]
}

export function detailLines(stats: SystemStats): DetailLine[] {
  const errors = ORDER.flatMap((key) => {
    const text = stats.errors[key]
    return text ? [line(key.toUpperCase(), text, "error")] : []
  })
  return [
    line("CPU", pct(stats.cpu?.percent)),
    stats.ram ? line("RAM", usage(stats.ram)) : line("RAM", MISSING, "muted"),
    stats.swap ? line("SWAP", usage(stats.swap)) : line("SWAP", stats.errors.swap ? MISSING : "none", "muted"),
    stats.disk ? line("DISK", usage(stats.disk)) : line("DISK", MISSING, "muted"),
    ...gpuLines(stats),
    ...errors,
  ]
}
