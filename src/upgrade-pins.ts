/**
 * `mcpcheck upgrade-pins` — turn every unpinned `npx <pkg>` / `uvx <pkg>`
 * reference in a config into a pinned one by looking up the latest version
 * on the matching registry.
 *
 * Scope:
 *   - npm: hits registry.npmjs.org for `latest` dist-tag.
 *   - PyPI: hits pypi.org/pypi/<name>/json for `info.version`.
 *   - Docker images are *not* handled here. Docker Hub / ghcr.io
 *     auth-and-rate-limit story is different enough to earn its own flag
 *     later; we skip them for now and leave the `unstable-reference`
 *     warning in place.
 *
 * Default behaviour is `--dry-run`: prints the changes it *would* make.
 * `--write` applies them in place. Zero network is fatal only in `--write`
 * mode; `--dry-run` succeeds with a note so CI-style "show me what's
 * available" works offline.
 */

import { readFile, writeFile } from "node:fs/promises";
import { parseJsonc } from "./jsonc.js";

export interface UpgradeResult {
  file: string;
  changes: Array<{
    server: string;
    oldPkg: string;
    newPkg: string;
    registry: "npm" | "pypi";
  }>;
  skipped: Array<{ server: string; pkg: string; reason: string }>;
}

export interface UpgradeOptions {
  write: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function upgradePins(
  file: string,
  opts: UpgradeOptions
): Promise<UpgradeResult> {
  const source = await readFile(file, "utf8");
  const parsed = parseJsonc(source);
  const servers = getServers(parsed);
  const result: UpgradeResult = { file, changes: [], skipped: [] };
  if (!servers) return result;

  const fetcher = opts.fetchImpl ?? fetch;
  const timeout = opts.timeoutMs ?? 5000;

  let newSource = source;

  for (const [name, serverRaw] of Object.entries(servers)) {
    if (typeof serverRaw !== "object" || serverRaw === null) continue;
    const server = serverRaw as Record<string, unknown>;
    const cmd = typeof server.command === "string" ? server.command : "";
    const args = Array.isArray(server.args)
      ? (server.args.filter((a) => typeof a === "string") as string[])
      : [];
    const base = basename(cmd);
    if (base !== "npx" && base !== "uvx") continue;

    const pkgIndex = args.findIndex((a) => !a.startsWith("-"));
    if (pkgIndex < 0) continue;
    const pkg = args[pkgIndex]!;
    if (isPinned(base, pkg)) continue;

    let latest: string | undefined;
    try {
      latest = base === "npx"
        ? await latestNpmVersion(pkg, fetcher, timeout)
        : await latestPypiVersion(pkg, fetcher, timeout);
    } catch (err) {
      result.skipped.push({
        server: name,
        pkg,
        reason: `registry lookup failed: ${(err as Error).message}`,
      });
      continue;
    }
    if (!latest) {
      result.skipped.push({ server: name, pkg, reason: "no version returned" });
      continue;
    }

    const pinned = base === "npx"
      ? `${pkg}@${latest}`
      : `${pkg}==${latest}`;
    result.changes.push({
      server: name,
      oldPkg: pkg,
      newPkg: pinned,
      registry: base === "npx" ? "npm" : "pypi",
    });
    newSource = replaceStringLiteral(newSource, pkg, pinned);
  }

  if (opts.write && result.changes.length > 0) {
    await writeFile(file, newSource, "utf8");
  }
  return result;
}

/**
 * Replace the first occurrence of a JSON string literal whose contents equal
 * `value`. We walk the source respecting string escapes so we don't
 * accidentally match an identical substring inside a different literal or
 * inside a comment.
 */
function replaceStringLiteral(
  source: string,
  value: string,
  replacement: string
): string {
  const needle = JSON.stringify(value);
  let i = 0;
  const len = source.length;
  let inString = false;
  let stringStart = -1;
  while (i < len) {
    const ch = source[i]!;
    if (inString) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === '"') {
        const literal = source.slice(stringStart, i + 1);
        if (literal === needle) {
          return source.slice(0, stringStart) + JSON.stringify(replacement) + source.slice(i + 1);
        }
        inString = false;
      }
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      stringStart = i;
      i += 1;
      continue;
    }
    // Skip line comments (JSONC).
    if (ch === "/" && source[i + 1] === "/") {
      while (i < len && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < len && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    i += 1;
  }
  return source;
}

function isPinned(kind: "npx" | "uvx", pkg: string): boolean {
  if (kind === "npx") {
    // Scoped: @scope/name@ver — must have `@` after first slash.
    if (pkg.startsWith("@")) {
      const slash = pkg.indexOf("/");
      if (slash < 0) return false;
      return pkg.slice(slash).includes("@");
    }
    return pkg.includes("@");
  }
  // uvx: name==1.2.3 (PEP 440 exact) counts as pinned.
  return pkg.includes("==");
}

async function latestNpmVersion(
  pkg: string,
  fetcher: typeof fetch,
  timeoutMs: number
): Promise<string | undefined> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg).replace(/%2F/g, "/")}/latest`;
  const res = await fetchWithTimeout(fetcher, url, timeoutMs);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = (await res.json()) as { version?: string };
  return json.version;
}

async function latestPypiVersion(
  pkg: string,
  fetcher: typeof fetch,
  timeoutMs: number
): Promise<string | undefined> {
  const url = `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`;
  const res = await fetchWithTimeout(fetcher, url, timeoutMs);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = (await res.json()) as { info?: { version?: string } };
  return json.info?.version;
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  timeoutMs: number
): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetcher(url, {
      signal: ac.signal,
      headers: { "User-Agent": "mcpcheck-upgrade-pins" },
    });
  } finally {
    clearTimeout(t);
  }
}

function getServers(config: unknown): Record<string, unknown> | undefined {
  if (typeof config !== "object" || config === null) return undefined;
  const c = config as Record<string, unknown>;
  for (const key of ["mcpServers", "servers", "context_servers"] as const) {
    const v = c[key];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return undefined;
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}
