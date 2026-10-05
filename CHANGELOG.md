# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `/sysmon` slash command and **System monitor details** palette entry: a live dialog with used/total GiB for RAM, swap, disk and VRAM, the GPU name and temperature, and the error behind every missing metric.

### Security

- System tools are spawned by absolute path (fixed system locations or absolute `PATH` entries only), from their own directory and with an allowlisted environment. Before, a `nvidia-smi.exe` or `powershell.exe` inside the opened project ran on Windows, and API keys were inherited by every child process.

### Changed

- The last sample is kept in the host's `storage.memory`, so a plugin hot reload no longer flashes empty `—` cells.
- The package no longer restricts `os`, so the documented best-effort platforms (e.g. FreeBSD) can install it.

### Performance

- Metrics are collected only while a card is mounted (home screen, hidden sidebar or narrow terminal: no polling and no subprocesses), with one shared loop for all mounted cards.
- The second sample is taken 500 ms after the card appears, so CPU shows a value right away instead of `—` for a full refresh interval.
- The card reuses its renderables on every refresh (`<Index>` plus memoized palette and layout) instead of destroying and recreating about 50 of them each tick.
- On Linux, `nvidia-smi` is not run while every NVIDIA GPU is runtime-suspended (RTD3), so polling no longer keeps a laptop's discrete GPU awake; the GPU and VRAM cells show `off` instead.
- macOS swap (`sysctl -n vm.swapusage`) is queried at most every 10 s instead of every tick.
- A missing `nvidia-smi` is re-checked every 5 minutes instead of on every tick, failures back off exponentially (5 s up to 5 minutes), and a new `nvidia-smi` is never started while the previous one is still alive (a hung driver no longer piles up processes).

### Fixed

- Themes whose `syntax.type` is not yellow (e.g. Dracula's cyan) no longer turn the usage scale green → cyan → orange; yellow falls back to a `success`/`warning` blend.
- Collection errors are no longer swallowed: each metric keeps its last error (shown by `/sysmon`), with ANSI sequences and control characters stripped from external text.
- Child process output is decoded after all bytes arrive, so multibyte characters split across chunks are no longer corrupted.
- macOS DISK measured the sealed system volume and showed a few percent on a full disk; it now reports the APFS container usage.
- Linux CPU no longer counts `guest` and `guest_nice` twice (they are already included in `user` and `nice`), which inflated usage on hosts running VMs.
- Linux RAM inside containers (Docker, devcontainers) reports usage against the cgroup v1/v2 memory limit instead of the host's memory.
- PowerShell gets a 10 s timeout instead of 3 s, so its cold start no longer hides SWAP for 30 s.
- The Windows swap throttle uses a monotonic clock, so a system clock change can no longer freeze the SWAP value.

## [0.2.0] - 2026-10-05

### Added

- macOS and Windows support (package `os`: `linux`, `darwin`, `win32`); other platforms are best effort.
- Per-platform sources: CPU, RAM, swap and disk read from `/proc` (Linux), `os.cpus()` deltas, `vm_stat`, `sysctl -n vm.swapusage` (macOS) and `os.cpus()`, PowerShell `Win32_PageFileUsage` (Windows, refreshed at most every 30 s); disk uses `statfs` of `/` or the system drive. GPU, VRAM and temperature via `nvidia-smi` on Linux and Windows; hidden on macOS.
- Real-machine smoke test (`bun run smoke`) and a CI matrix running typecheck, tests, build and smoke on Ubuntu, macOS and Windows.

### Changed

- Release workflow publishes via npm trusted publishing with provenance; the GitHub release step is idempotent.

## [0.1.0] - 2026-10-05

### Added

- OpenCode V2 CLI/TUI plugin rendering a compact rounded "System" card in the sidebar (`sidebar.content` slot).
- CPU, RAM, DISK (root filesystem), GPU utilization, VRAM and SWAP usage bars; SWAP shows "—" when the system has no swap.
- NVIDIA GPU, VRAM and temperature readouts via `nvidia-smi`; the GPU and VRAM cells are hidden when `nvidia-smi` is missing, and show "—" when it fails or times out.
- Colors derived from the active OpenCode theme, updated live: CPU/RAM blend green straight into yellow and GPU/VRAM purple → pink → yellow below 65%, then severity thresholds at 65%, 80% and 92%.
- GPU temperature in the card title; "System" keeps the theme text color and the temperature is green up to 50 °C, fades to yellow at 60 °C, then orange at 75 °C and red at 85 °C.
- `refreshMs` option (integer, 500–60000, default 2000).
- npm publishing with provenance from GitHub Actions on `vX.Y.Z` tags.

[Unreleased]: https://github.com/Caio2a7/opencode-system-monitor/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Caio2a7/opencode-system-monitor/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Caio2a7/opencode-system-monitor/releases/tag/v0.1.0
