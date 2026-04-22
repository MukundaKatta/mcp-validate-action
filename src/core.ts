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

  issues.sort(byLineThenPath);
  return { file, issues, fatal: false };
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
