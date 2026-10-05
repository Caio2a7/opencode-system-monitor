# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories: open the repository's **Security** tab and
choose **Report a vulnerability**. Do not open a public issue for security problems.

Include the affected version, steps to reproduce and the impact. You can expect an acknowledgement and a fix or
mitigation plan as soon as the report is triaged.

## Scope

What the plugin does, and what is therefore in scope:

- Reads `/proc/stat`, `/proc/meminfo`, `/proc/net/dev` and `statfs("/")`.
- Spawns `nvidia-smi` with a fixed argument list, no shell and a 3 s timeout.
- Makes no network requests, sends no telemetry and has no runtime dependencies.
- v0.1.0 was published manually; releases from v0.1.1 onward are published from GitHub Actions via npm trusted publishing (OIDC) with provenance.

Out of scope: vulnerabilities in OpenCode itself, in `nvidia-smi` or in your operating system.
