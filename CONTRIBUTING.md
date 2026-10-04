# Contributing

Thanks for helping out! Bug reports and pull requests are welcome.

## Setup

```sh
bun install
bun test
bun run typecheck
bun run build
```

| Script              | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `bun test`          | Run the test suite (`bun:test`).                                     |
| `bun run typecheck` | Strict TypeScript check.                                             |
| `bun run build`     | Bundle `src/tui.tsx` to `dist/tui.js`, rewriting solid/opentui imports to the host's runtime module ids. |

CI runs test, typecheck, build and a pack dry-run.

## Guidelines

- Strict TypeScript; no `any`, no stubs.
- Keep files under 300 lines and functions under 40 lines.
- No new runtime dependencies without a strong reason.
- Keep the plugin local-only: no network requests, no telemetry, no shell. Subprocesses use fixed argument lists.
- Add or update tests in `tests/` for any behaviour change.
- Use [Conventional Commits](https://www.conventionalcommits.org/) in English and update `CHANGELOG.md`.

## Local testing in OpenCode

Run `bun install && bun run build`, add the checkout's absolute path to the `plugins` array of
`~/.config/opencode/cli.json` (see the README) and restart OpenCode.

## Release process

Before the first tag, set up npm authentication (one of):

- Add an `NPM_TOKEN` repository secret (an npm granular automation token with publish rights).
- Or configure a trusted publisher on npmjs.com (repository `Caio2a7/opencode-system-monitor`, workflow
  `release.yml`); after that the `NPM_TOKEN` secret can be removed.

Then:

1. Bump `version` in `package.json`.
2. Move the `CHANGELOG.md` entries under the new version heading with the release date.
3. Commit to `main`, then tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. GitHub Actions publishes to npm with provenance.

The tag must point to a commit on `main` (otherwise the release workflow fails) and must equal the `package.json`
version.
