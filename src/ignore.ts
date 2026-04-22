/**
 * `.mcpcheckignore` — gitignore-style file list that mcpcheck skips even if
 * the default globs would have matched them. Supports the subset that
 * matters for a linter:
 *
 *   - `#` comments
 *   - blank lines
 *   - `**` (zero or more path segments)
 *   - `*` (zero or more non-separator characters)
 *   - leading `!` to re-include a pattern
 *   - trailing `/` to scope the pattern to directories
 *
 * Matching is done against the file path relative to the cwd. Absolute
 * paths are matched against their basename and as-is. Ignored files aren't
 * read; they just don't appear in the input list.
 */

import { readFile } from "node:fs/promises";
import { relative, sep } from "node:path";

export interface IgnoreRule {
  negated: boolean;
  regex: RegExp;
  dirOnly: boolean;
}

export async function loadIgnoreFile(path: string): Promise<IgnoreRule[] | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  return parseIgnore(raw);
}

export function parseIgnore(source: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    let pattern = line;
    const negated = pattern.startsWith("!");
    if (negated) pattern = pattern.slice(1);
    const dirOnly = pattern.endsWith("/");
    if (dirOnly) pattern = pattern.slice(0, -1);
    rules.push({ negated, dirOnly, regex: globToRegex(pattern) });
  }
  return rules;
}

function globToRegex(pattern: string): RegExp {
  let out = "";
  let i = 0;
  const len = pattern.length;
  // A pattern without `/` matches in any directory (gitignore default).
  const anchored = pattern.includes("/");
  if (!anchored) out += "(?:.+/)?";
  while (i < len) {
    const c = pattern[i]!;
    // `**` matches across path separators (any number of characters).
    if (c === "*" && pattern[i + 1] === "*") {
      out += ".*";
      i += 2;
      // Consume an immediately-following `/` so `node_modules/**/foo`
      // matches `node_modules/foo` as well.
      if (pattern[i] === "/") i += 1;
      continue;
    }
    if (c === "*") {
      out += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "?") {
      out += "[^/]";
      i += 1;
      continue;
    }
    if (/[.+^$|()[\]{}\\]/.test(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
    i += 1;
  }
  return new RegExp("^" + out + "$");
}

/**
 * @returns true if the given path should be ignored according to the
 *   ordered rules (later rules win; negation re-includes).
 */
export function isIgnored(path: string, rules: IgnoreRule[], cwd: string = process.cwd()): boolean {
  let rel = relative(cwd, path).split(sep).join("/");
  if (!rel) rel = path;
  let ignored = false;
  for (const rule of rules) {
    if (rule.regex.test(rel)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

export function filterIgnored(paths: string[], rules: IgnoreRule[]): string[] {
  if (rules.length === 0) return paths;
  return paths.filter((p) => !isIgnored(p, rules));
}
