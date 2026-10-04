# opencode-system-monitor

**A system monitor plugin for the OpenCode TUI sidebar — live CPU, RAM, disk, NVIDIA GPU, VRAM and network usage bars, btop-style, themed by your OpenCode theme.**

[![npm version](https://img.shields.io/npm/v/opencode-system-monitor.svg)](https://www.npmjs.com/package/opencode-system-monitor)
[![npm downloads](https://img.shields.io/npm/dm/opencode-system-monitor.svg)](https://www.npmjs.com/package/opencode-system-monitor)
[![CI](https://github.com/Caio2a7/opencode-system-monitor/actions/workflows/ci.yml/badge.svg)](https://github.com/Caio2a7/opencode-system-monitor/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/opencode-system-monitor.svg)](LICENSE)
[![OpenCode V2](https://img.shields.io/badge/OpenCode-V2-blue.svg)](https://opencode.ai)

An [OpenCode](https://opencode.ai) V2 CLI/TUI plugin that renders a compact rounded card in the sidebar with live
resource usage, so you can see what your machine is doing while an agent works, without leaving the terminal.

```
╭─ System · 62° ──────────────────╮
│ CPU   38%  RAM   61%  DISK  72% │
│ ━━━╸─────  ━━━━━╸───  ━━━━━━╸── │
│ GPU   89%  VRAM  58%  NET  3.4M │
│ ━━━━━━━━─  ━━━━━────  ━━━━───── │
╰─────────────────────────────────╯
```

## Why

Local models, builds and test suites can saturate the CPU, memory or GPU while an OpenCode session runs. This plugin
puts a small resource monitor (think btop or htop, reduced to six lines) right next to your session.

## Features

- CPU, RAM, DISK (root filesystem `/`), GPU utilization, VRAM and NET download rate bars.
- GPU temperature in the card title.
- Refreshes every 2 seconds by default (`refreshMs`, 500–60000).
- Colors come entirely from the active OpenCode theme; theme changes apply live.
- Without `nvidia-smi` the GPU and VRAM cells disappear and the second row shows only NET.
- Zero runtime dependencies, no network requests, no telemetry.

## Requirements

- OpenCode **V2**. CLI plugins are configured in `~/.config/opencode/cli.json`, not `opencode.json`. The V1
  `tui.json` format is not supported.
- Linux (reads `/proc` and `statfs`).
- Optional: an NVIDIA GPU with `nvidia-smi` on `PATH` for the GPU, VRAM and temperature readouts.

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
bun install && bun run build
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

| Row  | Metric | Source                                                                                    |
| ---- | ------ | ----------------------------------------------------------------------------------------- |
| CPU  | usage  | `/proc/stat`                                                                              |
| RAM  | usage  | `/proc/meminfo`                                                                           |
| DISK | usage  | `statfs("/")`, `df` formula                                                               |
| GPU  | usage  | `nvidia-smi` utilization                                                                  |
| VRAM | usage  | `nvidia-smi` memory                                                                       |
| NET  | rate   | `/proc/net/dev`, download rate of physical interfaces                                     |

NET ignores `lo`, `docker*`, `veth*`, `br-*`, `virbr*`, `tun*`, `tap*` and `wg*`. Its bar is relative to the peak of the
last 30 samples (30 × `refreshMs`, ~60 seconds at the default), with a 1 MiB/s floor so idle noise does not fill the bar. The GPU temperature is shown in the card
title (` System · 62° `).

## How the bars are colored

No color is hard-coded; everything is derived from the active OpenCode theme.

| Metric        | Below 65%                                          | From 65%                                                        |
| ------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| CPU, RAM      | fades `success` → base text color                  | yellow (`syntax.type`) → orange (`warning`) at 80% → red (`error`) at 92%+ |
| GPU, VRAM     | fades purple (`syntax.keyword`) → pink (purple mixed with `error`) | same yellow → orange → red scale                       |
| DISK          | base text color                                    | same yellow → orange → red scale                                |
| NET           | always the `info` color                            | always the `info` color                                         |

GPU temperature colors the card title:

| Temperature | Color  |
| ----------- | ------ |
| < 60 °C     | muted  |
| 60 °C       | yellow |
| 75 °C       | orange |
| 85 °C+      | red    |

## Privacy & security

- No network requests and no telemetry.
- No shell. The plugin reads `/proc/stat`, `/proc/meminfo`, `/proc/net/dev` and `statfs("/")`.
- The only subprocess is `nvidia-smi`, spawned with a fixed argument list (no shell) and a 3 s timeout.
- Zero runtime dependencies.
- Published to npm with provenance from GitHub Actions.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Troubleshooting

| Symptom                              | Fix                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| Nothing in the sidebar               | Open a session, widen the terminal and check that the sidebar is visible.                  |
| Plugin not loaded                    | Make sure it is listed in `~/.config/opencode/cli.json` (V2), then restart the TUI.        |
| No GPU or VRAM cells                 | Expected without `nvidia-smi`; the second row shows only NET.                              |
| GPU and VRAM show `—`                | `nvidia-smi` is installed but failed or timed out (3 s). Run it in the same terminal.      |
| macOS or Windows                     | Not supported; the plugin reads Linux `/proc`.                                             |
| OpenCode V1 (`tui.json`)             | Not supported; use OpenCode V2.                                                            |

Plugin load errors are logged to `~/.local/share/opencode/log/opencode.log`.

## FAQ

**How do I show CPU and RAM usage in the OpenCode sidebar?**
Install this plugin: add `opencode-system-monitor` to `~/.config/opencode/cli.json` and restart the TUI.

**Does it support AMD or Intel GPUs?**
No. GPU utilization, VRAM and temperature come from `nvidia-smi`, so only NVIDIA GPUs are supported. Without it the GPU
and VRAM cells are hidden.

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
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Related

- [OpenCode](https://opencode.ai) — the open-source AI coding agent.
- [opencode-claude-quota](https://github.com/Caio2a7/opencode-claude-quota) — Claude Code usage and rate limits in the
  OpenCode sidebar, by the same author.

## License

[MIT](LICENSE)
