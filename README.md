# opencode-system-monitor

**A cross-platform system monitor plugin for the OpenCode TUI sidebar (Linux, macOS, Windows) — live CPU, RAM, disk, NVIDIA GPU, VRAM and swap usage bars, btop-style, themed by your OpenCode theme.**

[![npm version](https://img.shields.io/npm/v/opencode-system-monitor.svg)](https://www.npmjs.com/package/opencode-system-monitor)
[![npm downloads](https://img.shields.io/npm/dm/opencode-system-monitor.svg)](https://www.npmjs.com/package/opencode-system-monitor)
[![CI](https://github.com/Caio2a7/opencode-system-monitor/actions/workflows/ci.yml/badge.svg)](https://github.com/Caio2a7/opencode-system-monitor/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/opencode-system-monitor.svg)](LICENSE)
[![platforms](https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%7C%20windows-lightgrey.svg)](#platform-support)
[![OpenCode V2](https://img.shields.io/badge/OpenCode-V2-blue.svg)](https://opencode.ai)

An [OpenCode](https://opencode.ai) V2 CLI/TUI plugin that renders a compact rounded card in the sidebar with live
resource usage, so you can see what your machine is doing while an agent works, without leaving the terminal.

```
╭─ System · 62° ──────────────────╮
│ CPU   38%  RAM   61%  DISK  72% │
│ ━━━╸─────  ━━━━━╸───  ━━━━━━╸── │
│ GPU   89%  VRAM  58%  SWAP  12% │
│ ━━━━━━━━─  ━━━━━────  ━━━━───── │
╰─────────────────────────────────╯
```

## Why

Local models, builds and test suites can saturate the CPU, memory or GPU while an OpenCode session runs. This plugin
puts a small resource monitor (think btop or htop, reduced to six lines) right next to your session.

## Features

- Works on Linux, macOS and Windows (see [Platform support](#platform-support)).
- CPU, RAM, DISK (root filesystem, or the system drive on Windows), GPU utilization, VRAM and SWAP usage bars.
- GPU temperature in the card title, colored by temperature while "System" keeps the theme text color.
- `/sysmon` (or **System monitor details** in the command palette, `ctrl+p`) opens a live dialog with used and total
  GiB for RAM, swap, disk and VRAM, the GPU name and temperature, and the reason behind any `—` cell.
- Refreshes every 2 seconds by default (`refreshMs`, 500–60000), only while the card is on screen.
- Colors come entirely from the active OpenCode theme; theme changes apply live.
- Without `nvidia-smi` (and always on macOS) the GPU and VRAM cells disappear and the second row shows only SWAP.
- Zero runtime dependencies, no network requests, no telemetry.

## Requirements

- OpenCode **V2**. CLI plugins are configured in `~/.config/opencode/cli.json`, not `opencode.json`. The V1
  `tui.json` format is not supported.
- Linux, macOS or Windows (other platforms such as FreeBSD: best effort).
- Optional: an NVIDIA GPU with `nvidia-smi` on `PATH` (Linux and Windows) for the GPU, VRAM and temperature readouts.

## Install the OpenCode plugin

Add the package to the `plugins` array of `~/.config/opencode/cli.json` and restart the TUI:

```json
{
  "plugins": ["opencode-system-monitor"]
}
```

With options:

```json
{
  "plugins": [
    {
      "package": "opencode-system-monitor",
      "options": { "refreshMs": 1000 }
    }
  ]
}
```

From a local checkout:

```sh
bun install
```

Then use the absolute path of the checkout:

```json
{
  "plugins": ["/path/to/opencode-system-monitor"]
}
```

The card is rendered in the `sidebar.content` slot, so the sidebar must be visible (open a session in a wide terminal).

## Configuration

| Option      | Type    | Default | Description                                      |
| ----------- | ------- | ------- | ------------------------------------------------ |
| `refreshMs` | integer | `2000`  | Refresh interval in milliseconds (500–60000).    |

## How it works

The plugin samples the system on a timer and renders a 31-column card inside a rounded border.

| Row  | Metric | Source                                                          |
| ---- | ------ | --------------------------------------------------------------- |
| CPU  | usage  | per-platform, see [Platform support](#platform-support)         |
| RAM  | usage  | per-platform, see [Platform support](#platform-support)         |
| DISK | usage  | `statfs`: `df` formula, or the whole APFS container on macOS   |
| GPU  | usage  | `nvidia-smi` utilization                                        |
| VRAM | usage  | `nvidia-smi` memory                                             |
| SWAP | usage  | per-platform, see [Platform support](#platform-support)         |

SWAP shows `—` when the system has no swap. The GPU temperature is shown in the card
title (` System · 62° `).

## Platform support

The plugin runs on Linux, macOS and Windows; the package installs on any OS.

| Metric        | Linux                                    | macOS                                          | Windows                                                                                          |
| ------------- | ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| CPU           | `/proc/stat` (incl. iowait)              | `os.cpus()` deltas                             | `os.cpus()` deltas                                                                               |
| RAM           | `/proc/meminfo` (MemTotal − MemAvailable); inside a container with a lower cgroup memory limit, usage − inactive file cache over that limit | `vm_stat` active + wired + compressed pages    | total − available physical memory                                                                |
| Swap          | `/proc/meminfo`                          | `sysctl -n vm.swapusage`, at most every 10 s   | page file usage via PowerShell `Get-CimInstance Win32_PageFileUsage`, refreshed at most every 30 s |
| Disk          | `statfs("/")`                            | `statfs("/")`, APFS container used / size      | `statfs` of the system drive (`%SystemDrive%`, default `C:\`)                                    |
| GPU/VRAM/temp | `nvidia-smi`, skipped while the dGPU is runtime-suspended (`off`) | not available (cells hidden)                   | `nvidia-smi` from `System32`, `NVSMI` or an absolute `PATH` entry                                |

Other platforms (e.g. FreeBSD) are best effort: CPU and RAM via Node's `os` module, swap hidden, disk `/`.

Metrics are only collected while the card (or the `/sysmon` dialog) is on screen.

## How the bars are colored

No color is hard-coded; everything is derived from the active OpenCode theme.

| Metric        | Below 65%                                          | From 65%                                                        |
| ------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| CPU, RAM, SWAP | fades `success` → yellow, reaching it at 65%       | yellow (`syntax.type`) → orange (`warning`) at 80% → red (`error`) at 92%+ |
| GPU, VRAM     | fades purple (`syntax.keyword`) → pink (purple mixed with `error`) at 32.5% → yellow at 65% | same yellow → orange → red scale                       |
| DISK          | base text color                                    | same yellow → orange → red scale                                |

Yellow is `syntax.type` when the theme's type color is a yellow or gold hue; otherwise (e.g. Dracula's cyan types) it
is a blend of `success` and `warning`, so the scale always reads green → yellow → orange → red.

The card title keeps "System" in the theme text color; only the GPU temperature is colored:

| Temperature | Color  |
| ----------- | ------ |
| ≤ 50 °C     | green (`success`) |
| 50 → 60 °C  | fades green → yellow |
| 60 °C       | yellow |
| 75 °C       | orange |
| 85 °C+      | red    |

## Privacy & security

- No network requests and no telemetry.
- No shell. Metrics come from `/proc` (Linux), Node's `os` module and `statfs`.
- Child processes are spawned with fixed argument lists, `shell: false`, a 3 s timeout (10 s for PowerShell) and a 64 KiB output cap:
  `nvidia-smi` (Linux, Windows), `vm_stat` and `sysctl -n vm.swapusage` (macOS), and
  `powershell.exe -NoProfile -NonInteractive -Command <constant script>` (Windows, at most every 30 s).
- Executables are resolved to absolute paths only (fixed system locations such as `/usr/bin/vm_stat` or
  `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`, or absolute `PATH` entries), never from the current
  directory or relative `PATH` entries, and run from their own directory.
- Child processes get an allowlisted environment (`PATH`, system directories, locale `C`); API keys and other
  variables of the OpenCode process are not passed on.
- Text coming from child processes (error messages, GPU name) has ANSI sequences and control characters removed.
- Zero runtime dependencies.
- v0.1.0 was published manually; releases from v0.1.1 onward are published from GitHub Actions via npm trusted publishing (OIDC) with provenance.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Troubleshooting

| Symptom                              | Fix                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| A cell shows `—`                     | Run `/sysmon`: the details dialog lists the error behind each missing metric.             |
| Nothing in the sidebar               | Open a session, widen the terminal and check that the sidebar is visible.                  |
| Plugin not loaded                    | Make sure it is listed in `~/.config/opencode/cli.json` (V2), then restart the TUI.        |
| No GPU or VRAM cells                 | Expected without `nvidia-smi`, and always on macOS; the second row shows only SWAP.        |
| GPU and VRAM show `—`                | `nvidia-smi` is installed but failed or timed out (3 s); it is retried with a backoff of 5 s up to 5 min. |
| GPU and VRAM show `off`              | Linux laptop dGPU is runtime-suspended (RTD3); the plugin does not wake it up to read it. |
| Windows swap missing at start        | Swap appears up to 30 s after start (PowerShell query is throttled).                       |
| SWAP shows `—` on Windows            | PowerShell is blocked (AppLocker, GPO) or took over 10 s; swap is hidden, other metrics still work. |
| OpenCode V1 (`tui.json`)             | Not supported; use OpenCode V2.                                                            |

Plugin load errors are logged to `~/.local/share/opencode/log/opencode.log`.

## FAQ

**How do I show CPU and RAM usage in the OpenCode sidebar?**
Install this plugin: add `opencode-system-monitor` to `~/.config/opencode/cli.json` and restart the TUI.

**Does it support AMD or Intel GPUs?**
No. GPU utilization, VRAM and temperature come from `nvidia-smi`, so only NVIDIA GPUs are supported. Without it the GPU
and VRAM cells are hidden.

**Does it work on macOS / Windows?**
Yes, since v0.2.0. Linux, macOS and Windows are supported; see [Platform support](#platform-support). macOS has no GPU
row.

**Does it work with OpenCode V1?**
No. It targets the OpenCode V2 plugin API and `cli.json`.

**Can I change the colors?**
Colors follow your OpenCode theme. Change the theme and the card updates live.

## Development

```sh
bun install
bun test
bun run typecheck
bun run build   # bundles src/tui.tsx to dist/tui.js
bun run smoke   # real-machine smoke test
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Related

- [OpenCode](https://opencode.ai) — the open-source AI coding agent.
- [opencode-claude-quota](https://github.com/Caio2a7/opencode-claude-quota) — Claude Code usage and rate limits in the
  OpenCode sidebar, by the same author.

## License

[MIT](LICENSE)
