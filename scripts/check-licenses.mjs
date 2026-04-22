#!/usr/bin/env node
/**
 * Fails the process if any shipped sub-package is missing a LICENSE file.
 *
 * We can't publish a package to npm / Marketplace / ghcr without a license
 * header. This check runs in CI so "I forgot to copy LICENSE into the new
 * sub-package I created" doesn't slip through review.
 */
import { accessSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const REQUIRE_LICENSE = [root, ...collectSubpackages(resolve(root, "extensions"))];
REQUIRE_LICENSE.push(resolve(root, "extensions/vscode"));

const missing = [];
for (const dir of unique(REQUIRE_LICENSE)) {
  const candidate = resolve(dir, "LICENSE");
  try {
    accessSync(candidate);
  } catch {
    missing.push(candidate);
  }
}

if (missing.length > 0) {
  console.error("Missing LICENSE file(s):");
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}
console.log(`OK — LICENSE present in ${unique(REQUIRE_LICENSE).length} location(s).`);

function collectSubpackages(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const full = resolve(dir, e);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    try {
      accessSync(resolve(full, "package.json"));
      out.push(full);
    } catch {
      // not a package; skip
    }
  }
  return out;
}

function unique(arr) {
  return [...new Set(arr)];
}
