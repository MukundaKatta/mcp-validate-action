/**
 * @mcpcheck/enterprise — policy-as-code plugin for mcpcheck.
 *
 * Adds three rules on top of the OSS core:
 *
 *   - `enterprise/allowed-command`: the `command` must be in the allowlist.
 *   - `enterprise/denied-image`:    docker images matching a denylist are
 *                                   rejected (supports `*` wildcards).
 *   - `enterprise/allowed-package`: npx/uvx packages must be in the
 *                                   allowlist (the bare package name, without
 *                                   the version suffix, is matched).
 *
 * Configuration lives in `.mcpcheck.enterprise.json` at the project root
 * (same layout as mcpcheck.config.json, same working directory). Missing /
 * empty lists disable the corresponding rule without an error, so the plugin
 * is safe to install before policy is defined.
 *
 * Shape:
 *
 *   {
 *     "allowedCommands": ["npx", "uvx", "docker", "/usr/local/bin/mcp-*"],
 *     "deniedImages":    ["ghcr.io/bad-org/*", "*:latest"],
 *     "allowedPackages": ["@modelcontextprotocol/*", "@my-org/*"]
 *   }
 *
 * Note: the plugin reads its config at module load, which means rule
 * behaviour is fixed for the life of the mcpcheck process. That's fine for
 * CLI + CI invocations; if you need hot-reload for the VS Code extension,
 * file an issue — we can move config-loading into the rule body if users
 * care.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Issue, Plugin, Rule } from "mcpcheck";

interface EnterpriseConfig {
  allowedCommands?: string[];
  deniedImages?: string[];
  allowedPackages?: string[];
}

const CONFIG_FILENAME = ".mcpcheck.enterprise.json";

export function loadConfig(cwd: string = process.cwd()): EnterpriseConfig {
  try {
    const raw = readFileSync(resolve(cwd, CONFIG_FILENAME), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as EnterpriseConfig;
  } catch {
    return {};
  }
}

/**
 * Glob-ish matcher: supports `*` (any-run-of-non-slash) and exact matches.
 * We accept `*` inside any single token; we do NOT traverse `/` segments
 * like a full glob would. That's deliberate — these matches run against
 * command paths and package names, not filesystem trees, and the restricted
 * form keeps policies predictable.
 */
export function matchPattern(value: string, pattern: string): boolean {
  if (pattern === value) return true;
  if (!pattern.includes("*")) return false;
  const regex = new RegExp(
    "^" + pattern.replace(/[.+^$|()[\]{}\\]/g, "\\$&").replace(/\*/g, ".*") + "$"
  );
  return regex.test(value);
}

export function anyMatch(value: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => matchPattern(value, p));
}

function getServers(config: unknown): Record<string, unknown> | undefined {
  if (typeof config !== "object" || config === null) return undefined;
  const c = config as Record<string, unknown>;
  const keys = ["mcpServers", "servers", "context_servers"] as const;
  for (const k of keys) {
    const v = c[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  }
  return undefined;
}

function serversKey(config: unknown): string {
  if (config && typeof config === "object") {
    const c = config as Record<string, unknown>;
    for (const k of ["mcpServers", "servers", "context_servers"]) {
      if (k in c) return k;
    }
  }
  return "mcpServers";
}

export function buildRules(cfg: EnterpriseConfig): Rule[] {
  const rules: Rule[] = [];

  if (cfg.allowedCommands?.length) {
    const allowedCommand: Rule = (ctx) => {
      const issues: Issue[] = [];
      const servers = getServers(ctx.config);
      if (!servers) return issues;
      const root = serversKey(ctx.config);
      for (const [name, serverRaw] of Object.entries(servers)) {
        if (typeof serverRaw !== "object" || serverRaw === null) continue;
        const server = serverRaw as Record<string, unknown>;
        const cmd = server.command;
        if (typeof cmd !== "string") continue;
        if (!anyMatch(cmd, cfg.allowedCommands)) {
          issues.push({
            ruleId: "enterprise/allowed-command",
            severity: "error",
            message: `Server "${name}" runs "${cmd}", which is not in the allowedCommands policy.`,
            jsonPath: `${root}.${name}.command`,
          });
        }
      }
      return issues;
    };
    rules.push(allowedCommand);
  }

  if (cfg.deniedImages?.length) {
    const deniedImage: Rule = (ctx) => {
      const issues: Issue[] = [];
      const servers = getServers(ctx.config);
      if (!servers) return issues;
      const root = serversKey(ctx.config);
      for (const [name, serverRaw] of Object.entries(servers)) {
        if (typeof serverRaw !== "object" || serverRaw === null) continue;
        const server = serverRaw as Record<string, unknown>;
        const cmd = typeof server.command === "string" ? server.command : "";
        if (!/(^|\/)docker$/.test(cmd)) continue;
        const args = Array.isArray(server.args)
          ? (server.args.filter((a) => typeof a === "string") as string[])
          : [];
        const image = findDockerImage(args);
        if (image && anyMatch(image, cfg.deniedImages)) {
          issues.push({
            ruleId: "enterprise/denied-image",
            severity: "error",
            message: `Server "${name}" uses denied docker image "${image}" (matches a deniedImages pattern).`,
            jsonPath: `${root}.${name}`,
          });
        }
      }
      return issues;
    };
    rules.push(deniedImage);
  }

  if (cfg.allowedPackages?.length) {
    const allowedPackage: Rule = (ctx) => {
      const issues: Issue[] = [];
      const servers = getServers(ctx.config);
      if (!servers) return issues;
      const root = serversKey(ctx.config);
      for (const [name, serverRaw] of Object.entries(servers)) {
        if (typeof serverRaw !== "object" || serverRaw === null) continue;
        const server = serverRaw as Record<string, unknown>;
        const cmd = typeof server.command === "string" ? server.command : "";
        if (!/(^|\/)(npx|uvx)$/.test(cmd)) continue;
        const args = Array.isArray(server.args)
          ? (server.args.filter((a) => typeof a === "string") as string[])
          : [];
        const pkg = args.find((a) => !a.startsWith("-"));
        if (!pkg) continue;
        const bare = stripVersionSuffix(pkg);
        if (!anyMatch(bare, cfg.allowedPackages)) {
          issues.push({
            ruleId: "enterprise/allowed-package",
            severity: "error",
            message: `Server "${name}" runs package "${bare}", which is not in the allowedPackages policy.`,
            jsonPath: `${root}.${name}`,
          });
        }
      }
      return issues;
    };
    rules.push(allowedPackage);
  }

  return rules;
}

function stripVersionSuffix(pkg: string): string {
  // Strip `@<version>` only at the tail, being careful about scoped names
  // (`@scope/name` — the leading `@` is part of the name, not a version).
  if (pkg.startsWith("@")) {
    const slash = pkg.indexOf("/");
    if (slash < 0) return pkg;
    const tail = pkg.slice(slash);
    const at = tail.lastIndexOf("@");
    if (at <= 0) return pkg;
    return pkg.slice(0, slash) + tail.slice(0, at);
  }
  const at = pkg.lastIndexOf("@");
  if (at <= 0) return pkg;
  return pkg.slice(0, at);
}

function findDockerImage(args: string[]): string | undefined {
  const SUB = new Set(["run", "exec", "pull", "start", "create", "compose"]);
  const VALFLAGS = new Set([
    "-e", "--env", "-v", "--volume", "-p", "--publish",
    "-w", "--workdir", "-u", "--user", "--name", "--mount",
    "--network", "--platform", "--entrypoint", "--label",
    "--add-host", "--env-file",
  ]);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (SUB.has(a)) continue;
    if (a.startsWith("-")) {
      if (a.includes("=")) continue;
      if (VALFLAGS.has(a)) i += 1;
      continue;
    }
    if (/^[a-z0-9][\w./-]*(:[a-z0-9][\w.-]*)?$/i.test(a)) return a;
    return undefined;
  }
  return undefined;
}

const cfg = loadConfig();
const plugin: Plugin = { rules: buildRules(cfg) };
export default plugin;
