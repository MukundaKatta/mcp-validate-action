import type { Rule } from "../types.js";
import { getServers, serversKey, makeIssue } from "./helpers.js";

/**
 * `http-without-auth` — URL-transport server with no `headers.Authorization`
 * and no `headers` at all. The overwhelming majority of real remote MCP
 * servers require an auth header; a config that ships without one is almost
 * always a missed env substitution (user meant `"Authorization": "Bearer
 * ${TOKEN}"` and forgot the headers block).
 *
 * We only flag HTTPS endpoints — `http://localhost` and friends are already
 * handled by `invalid-url`, and a local plaintext server genuinely may not
 * need auth.
 *
 * Default severity: warning. This is a missing-field heuristic; there are
 * real no-auth remote servers (mock endpoints, open documentation servers),
 * so we don't want to error by default.
 */

export const httpWithoutAuthRule: Rule = (ctx) => {
  const issues: ReturnType<Rule> = [];
  const servers = getServers(ctx.config);
  if (!servers) return issues;
  const root = serversKey(ctx.config);

  const rule = ctx.rules.httpWithoutAuth;
  if (!rule.enabled || rule.severity === "off") return issues;

  for (const [name, serverRaw] of Object.entries(servers)) {
    if (typeof serverRaw !== "object" || serverRaw === null) continue;
    const server = serverRaw as Record<string, unknown>;
    const url = server.url;
    if (typeof url !== "string") continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:") continue;
    const headers = server.headers;
    const hasAuth =
      typeof headers === "object" &&
      headers !== null &&
      !Array.isArray(headers) &&
      Object.keys(headers as Record<string, unknown>).some(
        (k) => k.toLowerCase() === "authorization"
      );
    if (hasAuth) continue;

    issues.push(makeIssue({
      ruleId: "http-without-auth",
      severity: rule.severity,
      message: `Server "${name}" targets an https URL but has no "Authorization" header. If the server requires a token, add "headers": { "Authorization": "Bearer \${API_TOKEN}" }.`,
      jsonPath: `${root}.${name}.url`,
      source: ctx.source,
    }));
  }
  return issues;
};
