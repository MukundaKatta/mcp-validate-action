import type { Rule } from "../types.js";
import { getServers, serversKey, makeIssue } from "./helpers.js";

/**
 * Heuristic: flag commands that reference unversioned packages (`npx foo@latest`,
 * `uvx bar`, `docker run image:latest`) which break reproducibility.
 *
 * Typical MCP servers are distributed via npx/uvx/docker, and pinning is the
 * difference between a config that keeps working next quarter and one that
 * quietly breaks when a dep bumps a major.
 */
export const unstableReferenceRule: Rule = (ctx) => {
  const issues: ReturnType<Rule> = [];
  const servers = getServers(ctx.config);
  if (!servers) return issues;
  const root = serversKey(ctx.config);

  const rule = ctx.rules.unstableReference;
  if (!rule.enabled || rule.severity === "off") return issues;

  for (const [name, serverRaw] of Object.entries(servers)) {
    if (typeof serverRaw !== "object" || serverRaw === null) continue;
    const server = serverRaw as Record<string, unknown>;
    const command = server.command;
    const args = Array.isArray(server.args) ? (server.args as string[]) : [];
    if (typeof command !== "string") continue;

    const concerning = detectUnstable(command, args);
    if (concerning) {
      issues.push(makeIssue({
        ruleId: "unstable-reference",
        severity: rule.severity,
        message: `Server "${name}" runs ${concerning} without a pinned version. Pin exact versions for reproducible clients.`,
        jsonPath: `${root}.${name}`,
        source: ctx.source,
      }));
    }
  }
  return issues;
};

const DOCKER_SUBCOMMANDS = new Set([
  "run",
  "exec",
  "pull",
  "start",
  "create",
  "compose",
]);

/**
 * Flags that take a value (either via `--flag value` or `-f value`). For
 * `docker run` we skip over their values when hunting for the image argument.
 * Conservative list: we'd rather miss a non-standard flag than misidentify
 * its value as the image and emit a confusing false positive.
 */
const DOCKER_VALUE_FLAGS = new Set([
  "-e", "--env",
  "-v", "--volume",
  "-p", "--publish",
  "-w", "--workdir",
  "-u", "--user",
  "--name",
  "--mount",
  "--network",
  "--platform",
  "--entrypoint",
  "--label",
  "--add-host",
  "--env-file",
]);

function detectUnstable(command: string, args: string[]): string | undefined {
  if (command.endsWith("npx") || command === "npx") {
    const pkg = args.find((a) => !a.startsWith("-"));
    if (pkg && !/@[\d]/.test(pkg)) return `npx ${pkg}`;
  }
  if (command.endsWith("uvx") || command === "uvx") {
    const pkg = args.find((a) => !a.startsWith("-"));
    if (pkg && !pkg.includes("==") && !pkg.includes("@")) return `uvx ${pkg}`;
  }
  if (command.endsWith("docker") || command === "docker") {
    const image = findDockerImage(args);
    if (image && isMutableImageTag(image)) {
      return `docker ${image}`;
    }
  }
  return undefined;
}

/**
 * A docker image reference is "mutable" (floats) when it has no tag, has the
 * literal `:latest`, or has one of the common moving tags:
 *    beta, dev, develop, nightly, canary, edge, snapshot, main, master, rc-*
 * Any of those re-points at a new digest on each pull.
 */
const MUTABLE_TAGS = /^(?:latest|beta|dev|develop|nightly|canary|edge|snapshot|main|master|rc(?:[-.][a-z0-9]+)?)$/i;

function isMutableImageTag(image: string): boolean {
  const colon = image.lastIndexOf(":");
  // A repo like `registry:5000/foo` has a colon in the *host* portion; the
  // tag only follows the last `/`. Scope the colon-search to the basename.
  const slash = image.lastIndexOf("/");
  const tagSeparator = colon > slash ? colon : -1;
  if (tagSeparator < 0) return true; // no tag = floats
  const tag = image.slice(tagSeparator + 1);
  return MUTABLE_TAGS.test(tag);
}

/**
 * Walk a `docker ...` argv and return the image reference, or undefined if we
 * can't find one with confidence. We skip the subcommand, flags, and
 * flag-values; the first remaining positional that looks like an image ref is
 * the answer. If the first positional is itself an `=`-joined flag (for
 * example `--env=FOO=bar`), skip it.
 */
function findDockerImage(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (DOCKER_SUBCOMMANDS.has(a)) continue;
    if (a.startsWith("-")) {
      if (a.includes("=")) continue;
      if (DOCKER_VALUE_FLAGS.has(a)) i += 1;
      continue;
    }
    // First bare positional. Must at least look like a container reference:
    // registry/name[:tag] with no spaces. Reject if it looks like a CLI flag
    // residue or an inline command.
    if (/^[a-z0-9][\w./-]*(:[a-z0-9][\w.-]*)?$/i.test(a)) return a;
    return undefined;
  }
  return undefined;
}
