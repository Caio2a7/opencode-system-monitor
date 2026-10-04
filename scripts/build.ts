import { runtimeModuleIdForSpecifier } from "@opentui/core/runtime-plugin"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

/**
 * Plugins installed from npm live under node_modules, where the OpenCode host neither compiles TSX nor provides bare
 * `solid-js` / `@opentui/solid` imports. The host does resolve its own runtime module ids, so the build compiles JSX
 * with the Solid transform and rewrites those imports to the host's ids.
 */
const HOST_MODULES = ["solid-js", "solid-js/store", "@opentui/solid", "@opentui/solid/components"]
const OUTFILE = "dist/tui.js"

const result = await Bun.build({
  entrypoints: ["src/tui.tsx"],
  outdir: "dist",
  target: "node",
  format: "esm",
  external: ["@opencode/plugin", "@opencode/plugin/*", "@opentui/core", "@opentui/core/*", "opentui:*", ...HOST_MODULES],
  plugins: [createSolidTransformPlugin({ moduleName: runtimeModuleIdForSpecifier("@opentui/solid") })],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

let code = await Bun.file(OUTFILE).text()
for (const specifier of HOST_MODULES) {
  code = code.replaceAll(` from "${specifier}";`, ` from "${runtimeModuleIdForSpecifier(specifier)}";`)
}
const leftover = code.match(/from "(solid-js|@opentui\/[^"]+)"/)
if (leftover) throw new Error(`Unrewritten host import in ${OUTFILE}: ${leftover[0]}`)
await Bun.write(OUTFILE, code)
console.log(`Built ${OUTFILE}`)
