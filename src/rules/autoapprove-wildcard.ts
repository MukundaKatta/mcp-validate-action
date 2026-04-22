import type { Rule } from "../types.js";
import { getServers, serversKey, makeIssue } from "./helpers.js";

/**
 * `autoapprove-wildcard` — `autoApprove: ["*"]` (or `alwaysAllow: ["*"]`
 * for Cline) effectively turns off every tool-call confirmation prompt
 * the client would otherwise show. That includes destructive operations:
 * the server can delete, send, or spend without user input.
 *
 * Default severity: error. Users should opt tools in by name rather than
 * handing the server a blanket exception.
 */

export const autoapproveWildcardRule: Rule = (ctx) => {
  const issues: ReturnType<Rule> = [];
  const servers = getServers(ctx.config);
  if (!servers) return issues;
  const root = serversKey(ctx.config);

  const rule = ctx.rules.autoapproveWildcard;
  if (!rule.enabled || rule.severity === "off") return issues;

  for (const [name, serverRaw] of Object.entries(servers)) {
    if (typeof serverRaw !== "object" || serverRaw === null) continue;
    const server = serverRaw as Record<string, unknown>;
    for (const key of ["autoApprove", "alwaysAllow"] as const) {
      const list = server[key];
      if (!Array.isArray(list)) continue;
      const hasWildcard = list.some((entry) => entry === "*");
      if (!hasWildcard) continue;
      issues.push(makeIssue({
        ruleId: "autoapprove-wildcard",
        severity: rule.severity,
        message: `Server "${name}" has ${key}: ["*"]. That disables every tool-call confirmation, including destructive ones. List the specific tool names instead.`,
        jsonPath: `${root}.${name}.${key}`,
        source: ctx.source,
      }));
    }
  }
  return issues;
};
