import type { Rule } from "../types.js";
import { getServers, serversKey, makeIssue } from "./helpers.js";

/**
 * `duplicate-image` — two servers in the same config run the same docker
 * image (same registry + name + tag). The model addresses two servers by
 * name, but they'd be two processes running the same code — usually a
 * copy-paste leftover where the user meant to edit something about the
 * second entry and didn't.
 *
 * Legit duplicates do exist (different env, different args) so default
 * severity is warning, not error.
 */

const DOCKER_SUBCOMMANDS = new Set(["run", "exec", "pull", "start", "create", "compose"]);
const DOCKER_VALUE_FLAGS = new Set([
  "-e", "--env", "-v", "--volume", "-p", "--publish",
  "-w", "--workdir", "-u", "--user", "--name", "--mount",
  "--network", "--platform", "--entrypoint", "--label",
  "--add-host", "--env-file",
]);

export const duplicateImageRule: Rule = (ctx) => {
  const issues: ReturnType<Rule> = [];
  const servers = getServers(ctx.config);
  if (!servers) return issues;
  const root = serversKey(ctx.config);

  const rule = ctx.rules.duplicateImage;
  if (!rule.enabled || rule.severity === "off") return issues;

  const byImage = new Map<string, string[]>();
  for (const [name, raw] of Object.entries(servers)) {
    if (typeof raw !== "object" || raw === null) continue;
    const s = raw as Record<string, unknown>;
    const cmd = typeof s.command === "string" ? s.command : "";
    if (!/(^|\/)docker$/.test(cmd)) continue;
    const args = Array.isArray(s.args)
      ? (s.args.filter((a) => typeof a === "string") as string[])
      : [];
    const image = findDockerImage(args);
    if (!image) continue;
    const bucket = byImage.get(image) ?? [];
    bucket.push(name);
    byImage.set(image, bucket);
  }

  for (const [image, names] of byImage) {
    if (names.length < 2) continue;
    for (const name of names.slice(1)) {
      issues.push(makeIssue({
        ruleId: "duplicate-image",
        severity: rule.severity,
        message: `Server "${name}" runs the same docker image "${image}" as "${names[0]}". Two servers with the same image are usually a copy-paste leftover.`,
        jsonPath: `${root}.${name}`,
        source: ctx.source,
      }));
    }
  }
  return issues;
};

function findDockerImage(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (DOCKER_SUBCOMMANDS.has(a)) continue;
    if (a.startsWith("-")) {
      if (a.includes("=")) continue;
      if (DOCKER_VALUE_FLAGS.has(a)) i += 1;
      continue;
    }
    if (/^[a-z0-9][\w./-]*(:[a-z0-9][\w.-]*)?$/i.test(a)) return a;
    return undefined;
  }
  return undefined;
}
