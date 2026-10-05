# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
