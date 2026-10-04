# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-04

### Added

- OpenCode V2 CLI/TUI plugin rendering a compact rounded "System" card in the sidebar (`sidebar.content` slot).
- CPU, RAM, DISK (root filesystem), GPU utilization, VRAM and NET download-rate bars.
- NVIDIA GPU, VRAM and temperature readouts via `nvidia-smi`; the GPU and VRAM cells are hidden when `nvidia-smi` is missing, and show "—" when it fails or times out.
- NET bar relative to the peak of the last 30 samples (~60 s at the default `refreshMs`) with a 1 MiB/s floor, ignoring virtual interfaces.
- Colors derived from the active OpenCode theme, updated live, with severity thresholds at 65%, 80% and 92%.
- GPU temperature in the card title, colored at 60, 75 and 85 °C.
- `refreshMs` option (integer, 500–60000, default 2000).
- npm publishing with provenance from GitHub Actions on `vX.Y.Z` tags.

[Unreleased]: https://github.com/Caio2a7/opencode-system-monitor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Caio2a7/opencode-system-monitor/releases/tag/v0.1.0
