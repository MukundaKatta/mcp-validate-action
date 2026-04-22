import type { Rule } from "../types.js";
import { getServers, serversKey, makeIssue } from "./helpers.js";

/**
 * `shell-metachars-without-shell` — the `command` contains shell
 * metacharacters (pipe, redirect, backtick, `$(...)`, `&&`/`||`, `;`) but
 * isn't a shell. MCP clients hand `command + args` straight to the OS
 * process launcher — they don't invoke a shell — so `ls | wc` gets passed
 * as literal argv to `ls`, which never sees the pipe. The user meant
 * `bash -c "ls | wc"`.
 *
 * Default severity: error. The config is straightforwardly broken; the
 * rule exists to make the error obvious at lint time rather than "server
 * hangs on startup" time.
 */

const METACHARS = /[|;&$`]|\$\(|&&|\|\|/;

const SHELLS = new Set(["bash", "sh", "zsh", "fish", "ksh", "dash", "pwsh", "powershell", "cmd"]);

export const shellMetacharsRule: Rule = (ctx) => {
  const issues: ReturnType<Rule> = [];
  const servers = getServers(ctx.config);
  if (!servers) return issues;
  const root = serversKey(ctx.config);

  const rule = ctx.rules.shellMetachars;
  if (!rule.enabled || rule.severity === "off") return issues;

  for (const [name, serverRaw] of Object.entries(servers)) {
    if (typeof serverRaw !== "object" || serverRaw === null) continue;
    const server = serverRaw as Record<string, unknown>;
    const cmd = server.command;
    if (typeof cmd !== "string") continue;
    const base = basename(cmd);
    if (SHELLS.has(base)) continue;
    if (!METACHARS.test(cmd)) continue;
    issues.push(makeIssue({
      ruleId: "shell-metachars",
      severity: rule.severity,
      message: `Server "${name}" command "${cmd}" contains shell metacharacters but the MCP client doesn't invoke a shell. Wrap in bash -c "..." if you meant a shell pipeline.`,
      jsonPath: `${root}.${name}.command`,
      source: ctx.source,
    }));
  }
  return issues;
};

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}
