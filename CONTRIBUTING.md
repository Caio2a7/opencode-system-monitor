# Contributing

Thanks for helping out! Bug reports and pull requests are welcome.

## Setup

```sh
bun install
bun test
bun run typecheck
bun run build
bun run smoke
```

| Script              | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `bun test`          | Run the test suite (`bun:test`).                                     |
| `bun run typecheck` | Strict TypeScript check.                                             |
| `bun run smoke`     | Smoke test against the real machine (CPU, RAM, swap, disk, GPU on the current OS). |
| `bun run build`     | Bundle `src/tui.tsx` to `dist/tui.js`, rewriting solid/opentui imports to the host's runtime module ids. |

CI runs typecheck, tests, build and the real-machine smoke test (`bun run smoke`) on Ubuntu, macOS and Windows.

## Guidelines

- Strict TypeScript; no `any`, no stubs.
- Keep files under 300 lines and functions under 40 lines.
- No new runtime dependencies without a strong reason.
- Keep the plugin local-only: no network requests, no telemetry, no shell. Subprocesses use fixed argument lists, `shell: false`, a timeout and an output cap.
- Add or update tests in `tests/` for any behaviour change.
- Use [Conventional Commits](https://www.conventionalcommits.org/) in English and update `CHANGELOG.md`.

## Local testing in OpenCode

Run `bun install`, add the checkout's absolute path to the `plugins` array of `~/.config/opencode/cli.json` (see the
README) and restart OpenCode. A local path loads the root `tui.tsx`, which OpenCode compiles itself, so no build is
needed; `bun run build` is only for the published `dist/tui.js`.

## Release process

Publishing uses npm trusted publishing (repo `Caio2a7/opencode-system-monitor`, workflow `release.yml`) — no token needed.

Then:

1. Bump `version` in `package.json`.
2. Move the `CHANGELOG.md` entries under the new version heading with the release date.
3. Commit to `main`, then tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. GitHub Actions publishes to npm with provenance (from v0.1.1 onward; v0.1.0 was published manually). The `build`
   job installs, tests and builds without publish rights; only the `publish` job gets the OIDC token, and it runs
   `npm publish --ignore-scripts` on the uploaded `dist/` without installing dependencies.

The tag must point to a commit on `main` (otherwise the release workflow fails) and must equal the `package.json`
version.
