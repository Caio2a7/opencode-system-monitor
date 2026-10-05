import type { Palette, SystemStats } from "../src/types"

export const colors: Palette = {
  base: "#ffffff",
  muted: "#888888",
  border: "#333333",
  success: "#00ff00",
  warning: "#ff8800",
  yellow: "#ffff00",
  error: "#ff0000",
  purple: "#8000ff",
  pink: "#ff80ff",
  info: "#0088ff",
}

export const PROC_STAT_A = `cpu  100 0 50 800 50 0 0 0 0 0
cpu0 50 0 25 400 25 0 0 0 0 0
cpu1 50 0 25 400 25 0 0 0 0 0
intr 12345
ctxt 6789
`

// Δidle = 50 (idle+iowait), Δtotal = 100 → 50% busy
export const PROC_STAT_B = `cpu  150 0 50 825 75 0 0 0 0 0
cpu0 75 0 25 412 37 0 0 0 0 0
intr 12400
`

export const MEMINFO = `MemTotal:       16384000 kB
MemFree:         1000000 kB
MemAvailable:    8192000 kB
Buffers:          200000 kB
Cached:          4000000 kB
SwapTotal:       8388608 kB
SwapFree:        7340032 kB
`

export function netDev(rx: { lo?: number; docker0?: number; veth1a?: number; wlan0?: number; enp3s0?: number }) {
  const row = (name: string, bytes: number) =>
    `${name.padStart(8)}: ${bytes} 10 0 0 0 0 0 0 5000 10 0 0 0 0 0 0`
  return [
    "Inter-|   Receive                                                |  Transmit",
    " face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed",
    row("lo", rx.lo ?? 0),
    row("docker0", rx.docker0 ?? 0),
    row("veth1a", rx.veth1a ?? 0),
    row("wlan0", rx.wlan0 ?? 0),
    row("enp3s0", rx.enp3s0 ?? 0),
    "",
  ].join("\n")
}

export const SMI_LINE = "89, 4746, 8188, 62, NVIDIA GeForce RTX 4060 Laptop GPU\n"

export const fullStats: SystemStats = {
  cpu: { percent: 30 },
  ram: { percent: 56, usedGiB: 8.9, totalGiB: 15.9 },
  disk: { percent: 46 },
  gpu: { util: 89, temp: 62, vramPercent: 58, vramUsedGiB: 4.6, vramTotalGiB: 8, name: "RTX" },
  swap: { percent: 12.5, usedGiB: 1, totalGiB: 8 },
}
