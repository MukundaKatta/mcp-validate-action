import type { Rule } from "../types.js";
import { getServers, serversKey, makeIssue } from "./helpers.js";

/**
 * `duplicate-env-key` — two env var names that differ only by case. Real-
 * world POSIX env vars are case-sensitive, but clients (and the users
 * writing configs) frequently mix casing — `API_KEY` vs `ApiKey`. JSON
 * permits both and the MCP client hands them both to the subprocess
 * unchanged; whichever one the subprocess reads wins and the other is
 * dead. That's almost always a bug.
 *
 * Default severity: warning. Real duplicates get caught at runtime quickly
 * (one works, one doesn't); the rule exists to surface the smell during
 * config review, not fail CI.
 */

export const duplicateEnvKeyRule: Rule = (ctx) => {
  const issues: ReturnType<Rule> = [];
  const servers = getServers(ctx.config);
  if (!servers) return issues;
  const root = serversKey(ctx.config);

  const rule = ctx.rules.duplicateEnvKey;
  if (!rule.enabled || rule.severity === "off") return issues;

  for (const [name, serverRaw] of Object.entries(servers)) {
    if (typeof serverRaw !== "object" || serverRaw === null) continue;
    const env = (serverRaw as Record<string, unknown>).env;
    if (typeof env !== "object" || env === null || Array.isArray(env)) continue;
    const seen = new Map<string, string>();
    for (const key of Object.keys(env as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      const prev = seen.get(lower);
      if (prev && prev !== key) {
        issues.push(makeIssue({
          ruleId: "duplicate-env-key",
          severity: rule.severity,
          message: `Server "${name}" env has "${key}" and "${prev}" — same name by case-insensitive compare. The MCP client keeps both; only one is read at runtime.`,
          jsonPath: `${root}.${name}.env.${key}`,
          source: ctx.source,
        }));
      }
      seen.set(lower, key);
    }
  }
  return issues;
};
