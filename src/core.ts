import { mergeConfig } from "./config.js";
import { parseJsonc } from "./jsonc.js";
import { BUILTIN_RULES } from "./rules/index.js";
import type {
  FileReport,
  Issue,
  Mcpcheckconfig,
  Rule,
  RuleContext,
} from "./types.js";

export interface CheckOptions {
  config?: Partial<Mcpcheckconfig>;
  /** Extra rules supplied by a plugin or caller. */
  extraRules?: Rule[];
}

/**
 * Validate a single config file in memory.
 */
export function checkSource(source: string, file: string, opts: CheckOptions = {}): FileReport {
  const config = mergeConfig(opts.config);
  let parsed: unknown;
  try {
    parsed = parseJsonc(source);
  } catch (err) {
    return {
      file,
      fatal: true,
      issues: [
        {
          ruleId: "invalid-json",
          severity: "error",
          message: `Invalid JSON: ${(err as Error).message}`,
          jsonPath: "",
        },
      ],
    };
  }

  const ctx: RuleContext = {
    config: parsed,
    source,
    file,
    rules: config.rules,
  };
  const rules: Rule[] = [...BUILTIN_RULES, ...(opts.extraRules ?? [])];
  const issues: Issue[] = [];
  for (const rule of rules) {
    issues.push(...rule(ctx));
  }

  const ignoreMap = collectIgnoreMap(parsed);
  const filtered = ignoreMap.size === 0 ? issues : issues.filter((i) => !suppressed(i, ignoreMap));

  filtered.sort(byLineThenPath);
  return { file, issues: filtered, fatal: false };
}

/**
 * Map each server name → the set of rule ids it opts out of, pulled from its
 * optional `x-mcpcheck-ignore` field. Lets users silence a specific rule on
 * a specific server without touching `mcpcheck.config.json` — the most common
 * "I know, that's intentional" request.
 */
function collectIgnoreMap(parsed: unknown): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (typeof parsed !== "object" || parsed === null) return out;
  const c = parsed as Record<string, unknown>;
  const servers =
    (c.mcpServers ?? c.servers ?? c.context_servers) as
      | Record<string, unknown>
      | undefined;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return out;
  for (const [name, raw] of Object.entries(servers)) {
    if (typeof raw !== "object" || raw === null) continue;
    const ignore = (raw as Record<string, unknown>)["x-mcpcheck-ignore"];
    if (!Array.isArray(ignore)) continue;
    const ids = new Set<string>();
    for (const id of ignore) if (typeof id === "string") ids.add(id);
    if (ids.size > 0) out.set(name, ids);
  }
  return out;
}

function suppressed(issue: Issue, ignoreMap: Map<string, Set<string>>): boolean {
  for (const [serverName, ids] of ignoreMap) {
    if (!ids.has(issue.ruleId)) continue;
    // Issue paths look like `mcpServers.<server>.<field>` — check that the
    // server name is a whole-segment match, not a prefix.
    const parts = issue.jsonPath.split(".");
    if (parts.length >= 2 && parts[1] === serverName) return true;
  }
  return false;
}

/**
 * Shared by `checkFiles` and any other multi-file runner that wants the same
 * aggregate counts/duration behaviour without depending on `node:fs`.
 */
export function aggregateReports(
  results: FileReport[],
  durationMs: number
): import("./types.js").RunReport {
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const r of results) {
    for (const i of r.issues) {
      if (i.severity === "error") errorCount += 1;
      else if (i.severity === "warning") warningCount += 1;
      else if (i.severity === "info") infoCount += 1;
    }
  }
  return {
    files: results,
    errorCount,
    warningCount,
    infoCount,
    durationMs,
  };
}

function byLineThenPath(a: Issue, b: Issue): number {
  const al = a.line ?? 0;
  const bl = b.line ?? 0;
  if (al !== bl) return al - bl;
  return a.jsonPath.localeCompare(b.jsonPath);
}
