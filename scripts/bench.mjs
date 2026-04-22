#!/usr/bin/env node
/**
 * Tiny benchmark: how fast does `checkSource` rip through a realistic MCP
 * config? Used to put a concrete number in the README and to catch perf
 * regressions locally (run before/after a refactor, compare).
 *
 *   node scripts/bench.mjs           # default: 2000 iterations
 *   node scripts/bench.mjs 10000     # custom count
 *
 * Not a suite. Not intended for CI — there's too much jitter between
 * GH-hosted runners to trust a threshold. This is a "smell test" runner.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Build first so we're measuring the same thing the published package runs.
const build = spawnSync("npx", ["tsc"], { cwd: root, stdio: "ignore" });
if (build.status !== 0) {
  console.error("tsc failed; not benchmarking");
  process.exit(build.status ?? 1);
}

const { checkSource } = await import(pathToFileURL(resolve(root, "dist/core.js")).href);

// A realistically-shaped config: two stdio servers, one sse, env vars, and a
// hardcoded secret so the secret regex does work. Larger than the median
// real-world config but not absurd.
const sample = readFileSync(resolve(root, "tests/fixtures/broken.json"), "utf8");

const iters = Number.parseInt(process.argv[2] ?? "2000", 10);
const samples = new Float64Array(iters);

// Warmup — prime JIT, caches, regex.
for (let i = 0; i < 100; i += 1) checkSource(sample, "bench.json");

// Timed runs.
for (let i = 0; i < iters; i += 1) {
  const t = performance.now();
  checkSource(sample, "bench.json");
  samples[i] = performance.now() - t;
}

samples.sort();
const sum = samples.reduce((a, b) => a + b, 0);
const avg = sum / iters;
const p50 = samples[Math.floor(iters * 0.5)];
const p95 = samples[Math.floor(iters * 0.95)];
const p99 = samples[Math.floor(iters * 0.99)];

const fmt = (ms) => (ms < 1 ? `${(ms * 1000).toFixed(1)}µs` : `${ms.toFixed(2)}ms`);

console.log(`mcpcheck benchmark  (${iters} iterations, ${sample.length}B config)`);
console.log(`  avg   ${fmt(avg)}`);
console.log(`  p50   ${fmt(p50)}`);
console.log(`  p95   ${fmt(p95)}`);
console.log(`  p99   ${fmt(p99)}`);
console.log(`  total ${fmt(sum)}`);
