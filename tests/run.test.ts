import { describe, expect, test } from "bun:test"
import { realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { runCommand } from "../src/stats/run"

const node = (code: string) => ["-e", code] as const
const opts = { timeoutMs: 5000, maxBytes: 1024 }

describe("runCommand", () => {
  test("resolves stdout", async () => {
    expect(await runCommand(process.execPath, node("process.stdout.write('hello')"), opts)).toBe("hello")
  })

  test("multibyte characters split across chunks are decoded intact", async () => {
    const code = "process.stdout.write(Buffer.from([0xc3])); setTimeout(() => process.stdout.write(Buffer.from([0xa9])), 50)"
    expect(await runCommand(process.execPath, node(code), opts)).toBe("é")
  })

  test("overflow counts bytes, not characters", async () => {
    const err = await runCommand(process.execPath, node("process.stdout.write('é'.repeat(60))"), { ...opts, maxBytes: 100 }).catch((e) => e)
    expect(err.message).toMatch(/output exceeded 100 bytes/)
  })

  test("env and cwd are passed to the child", async () => {
    const code = "process.stdout.write(process.env.ONLY + ' ' + process.cwd())"
    const out = await runCommand(process.execPath, node(code), { ...opts, env: { ONLY: "yes" }, cwd: tmpdir() })
    expect(out).toBe(`yes ${realpathSync(tmpdir())}`)
  })

  test("spawn error keeps ENOENT code", async () => {
    const err = await runCommand("definitely-not-a-real-binary-xyz", [], opts).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe("ENOENT")
  })

  test("non-zero exit rejects with stderr truncated to 200 chars", async () => {
    const code = "process.stderr.write('E'.repeat(500)); process.exit(3)"
    const err = await runCommand(process.execPath, node(code), opts).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain("EEEE")
    expect(err.message).not.toContain("E".repeat(201))
  })

  test("non-zero exit includes short stderr text", async () => {
    const err = await runCommand(process.execPath, node("console.error('bad thing'); process.exit(1)"), opts).catch((e) => e)
    expect(err.message).toContain("bad thing")
  })

  test("timeout rejects", async () => {
    const err = await runCommand(process.execPath, node("setTimeout(() => {}, 30000)"), { ...opts, timeoutMs: 200 }).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toMatch(/timed out after 200 ms/)
  })

  test("output overflow rejects", async () => {
    const err = await runCommand(process.execPath, node("process.stdout.write('x'.repeat(5000))"), { ...opts, maxBytes: 100 }).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toMatch(/output exceeded 100 bytes/)
  })

  test("output exactly at the limit is accepted", async () => {
    const out = await runCommand(process.execPath, node("process.stdout.write('x'.repeat(100))"), { ...opts, maxBytes: 100 })
    expect(out).toBe("x".repeat(100))
  })

  test("abort rejects with ABORT_ERR", async () => {
    const ctl = new AbortController()
    const p = runCommand(process.execPath, node("setTimeout(() => {}, 30000)"), { ...opts, signal: ctl.signal }).catch((e) => e)
    setTimeout(() => ctl.abort(), 100)
    const err = await p
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe("ABORT_ERR")
  })

  test("already-aborted signal rejects with ABORT_ERR", async () => {
    const ctl = new AbortController()
    ctl.abort()
    const err = await runCommand(process.execPath, node("setTimeout(() => {}, 30000)"), { ...opts, signal: ctl.signal }).catch((e) => e)
    expect(err.code).toBe("ABORT_ERR")
  })
})
