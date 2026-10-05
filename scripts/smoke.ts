import { createCollector } from "../src/stats/collect"

const isPercent = (n: unknown): boolean => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100

const collector = createCollector()
await collector.collect()
await new Promise((resolve) => setTimeout(resolve, 1100))
const stats = await collector.collect()
console.log(JSON.stringify(stats, null, 2))

const failures: string[] = []
if (!isPercent(stats.cpu?.percent)) failures.push("cpu.percent")
if (!isPercent(stats.ram?.percent)) failures.push("ram.percent")
if (!isPercent(stats.disk?.percent)) failures.push("disk.percent")
if (stats.swap !== null && !isPercent(stats.swap.percent)) failures.push("swap.percent")

if (failures.length > 0) {
  console.error(`smoke failed: invalid ${failures.join(", ")}`)
  process.exit(1)
}
console.log(`smoke ok (${process.platform})`)
