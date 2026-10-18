import { expect, test } from "bun:test"
import pkg from "../package.json"
import { VERSION } from "../src/version"

test("VERSION matches package.json", () => {
  expect(VERSION).toBe(pkg.version)
})
