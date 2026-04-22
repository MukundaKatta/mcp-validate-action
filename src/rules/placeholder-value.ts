import type { Rule } from "../types.js";
import { getServers, serversKey, makeIssue } from "./helpers.js";

/**
 * `placeholder-value` — env values that look like leftover templates:
 *   "YOUR_API_KEY_HERE", "your-token-here", "<token>", "replace-me",
 *   "xxx...xxx", "TODO", "FIXME", "PLACEHOLDER", "example".
 *
 * These are almost always half-finished configs where someone pasted the
 * MCP server's README snippet and forgot to substitute the real value.
 * They won't trigger `hardcoded-secret` (wrong format) and they'll cause a
 * confusing runtime failure at launch time rather than at lint time.
 *
 * Default severity: error. The config demonstrably won't work as-is.
 */

const PLACEHOLDER_RE =
  /^(?:<[^>]+>|x{5,}|[yY]our[_ -]?(?:api[_ -]?key|token|secret|password)(?:[_ -]?here)?|api[_ -]?key[_ -]?here|replace[_ -]?me|todo|fixme|placeholder|example(?:[_ -]?(?:key|token|secret))?|changeme)$/i;

export const placeholderValueRule: Rule = (ctx) => {
  const issues: ReturnType<Rule> = [];
  const servers = getServers(ctx.config);
  if (!servers) return issues;
  const root = serversKey(ctx.config);

  const rule = ctx.rules.placeholderValue;
  if (!rule.enabled || rule.severity === "off") return issues;

  for (const [name, serverRaw] of Object.entries(servers)) {
    if (typeof serverRaw !== "object" || serverRaw === null) continue;
    const env = (serverRaw as Record<string, unknown>).env;
    if (typeof env !== "object" || env === null || Array.isArray(env)) continue;
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      if (typeof value !== "string") continue;
      if (!PLACEHOLDER_RE.test(value.trim())) continue;
      issues.push(makeIssue({
        ruleId: "placeholder-value",
        severity: rule.severity,
        message: `Server "${name}" env.${key} is a placeholder ("${value}"). The config won't work until you fill this in (try \`\${${key}}\` for shell substitution).`,
        jsonPath: `${root}.${name}.env.${key}`,
        source: ctx.source,
      }));
    }
  }
  return issues;
};
