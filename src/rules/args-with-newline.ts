import type { Rule } from "../types.js";
import { getServers, serversKey, makeIssue } from "./helpers.js";

/**
 * `args-with-newline` — an arg string contains a literal newline (`\n` or
 * `\r`). Almost always a copy-paste artefact where a multiline command
 * was fused into a single JSON string. On the child-process side each arg
 * is passed as-is; the shell the user thought was running the pipeline
 * isn't involved, so the newline becomes a literal byte in argv and the
 * server usually fails with an opaque parse error.
 *
 * Default severity: error. These configs demonstrably don't work as
 * intended at runtime.
 */

export const argsWithNewlineRule: Rule = (ctx) => {
  const issues: ReturnType<Rule> = [];
  const servers = getServers(ctx.config);
  if (!servers) return issues;
  const root = serversKey(ctx.config);

  const rule = ctx.rules.argsWithNewline;
  if (!rule.enabled || rule.severity === "off") return issues;

  for (const [name, serverRaw] of Object.entries(servers)) {
    if (typeof serverRaw !== "object" || serverRaw === null) continue;
    const args = (serverRaw as Record<string, unknown>).args;
    if (!Array.isArray(args)) continue;
    args.forEach((arg, idx) => {
      if (typeof arg !== "string") return;
      if (!/[\r\n]/.test(arg)) return;
      issues.push(makeIssue({
        ruleId: "args-with-newline",
        severity: rule.severity,
        message: `Server "${name}" args[${idx}] contains a literal newline. Split across separate args entries, or if you really meant a multiline script, wrap in bash -c with the script in one arg.`,
        jsonPath: `${root}.${name}.args.${idx}`,
        source: ctx.source,
      }));
    });
  }
  return issues;
};
