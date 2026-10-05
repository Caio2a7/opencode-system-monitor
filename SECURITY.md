# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.2.x   | Yes       |
| < 0.2   | No        |

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories: open the repository's **Security** tab and
choose **Report a vulnerability**. Do not open a public issue for security problems.

Include the affected version, steps to reproduce and the impact. You can expect an acknowledgement and a fix or
mitigation plan as soon as the report is triaged.

## Scope

What the plugin does, and what is therefore in scope:

- Reads `/proc/stat`, `/proc/meminfo` and the process's cgroup memory files (Linux), uses Node's `os` module and `statfs` (`/` or the system drive on Windows).
- Spawns child processes with fixed argument lists, `shell: false`, a 3 s timeout (10 s for PowerShell) and a 64 KiB output cap: `nvidia-smi` (Linux, Windows), `vm_stat` and `sysctl -n vm.swapusage` (macOS), `powershell.exe -NoProfile -NonInteractive -Command <constant script>` (Windows, at most every 30 s).
- Resolves those executables to absolute paths only (fixed system locations or absolute `PATH` entries, never the current directory), runs them from their own directory with an allowlisted environment, and strips ANSI sequences and control characters from their output before display.
- Makes no network requests, sends no telemetry and has no runtime dependencies.
- v0.1.0 was published manually; releases from v0.1.1 onward are published from GitHub Actions via npm trusted publishing (OIDC) with provenance.

Out of scope: vulnerabilities in OpenCode itself, in `nvidia-smi`, `vm_stat`, `sysctl`, PowerShell or in your operating system.
