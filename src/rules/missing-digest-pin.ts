import type { Rule } from "../types.js";
import { getServers, serversKey, makeIssue } from "./helpers.js";

/**
 * `missing-digest-pin` — a docker image is tag-pinned but not
 * digest-pinned. `docker run registry/image:1.0.0` is reproducible today;
 * it stops being reproducible the moment someone re-pushes `1.0.0` (which
 * the registry format allows). `docker run registry/image@sha256:…` is
 * content-addressed and can't change out from under you.
 *
 * Stricter than `unstable-reference`. We only fire when the image already
 * has a tag (otherwise `unstable-reference` speaks up first). Default
 * severity: info — this is a best-practice recommendation, not a bug in
 * the config.
 */

const DOCKER_SUBCOMMANDS = new Set(["run", "exec", "pull", "start", "create", "compose"]);
const DOCKER_VALUE_FLAGS = new Set([
  "-e", "--env", "-v", "--volume", "-p", "--publish",
  "-w", "--workdir", "-u", "--user", "--name", "--mount",
  "--network", "--platform", "--entrypoint", "--label",
  "--add-host", "--env-file",
]);

export const missingDigestPinRule: Rule = (ctx) => {
  const issues: ReturnType<Rule> = [];
  const servers = getServers(ctx.config);
  if (!servers) return issues;
  const root = serversKey(ctx.config);

  const rule = ctx.rules.missingDigestPin;
  if (!rule.enabled || rule.severity === "off") return issues;

  for (const [name, serverRaw] of Object.entries(servers)) {
    if (typeof serverRaw !== "object" || serverRaw === null) continue;
    const s = serverRaw as Record<string, unknown>;
    const cmd = typeof s.command === "string" ? s.command : "";
    if (!/(^|\/)docker$/.test(cmd)) continue;
    const args = Array.isArray(s.args)
      ? (s.args.filter((a) => typeof a === "string") as string[])
      : [];
    const image = findDockerImage(args);
    if (!image) continue;
    // Skip "no tag at all" — unstable-reference already flags that.
    if (!image.includes(":") && !image.includes("@")) continue;
    // Already has a digest pin — we're good.
    if (image.includes("@sha256:")) continue;
    // Mutable tags are caught by unstable-reference.
    if (/:latest$/.test(image) || /:(beta|dev|nightly|canary|edge)$/i.test(image)) continue;

    issues.push(makeIssue({
      ruleId: "missing-digest-pin",
      severity: rule.severity,
      message: `Server "${name}" uses "${image}". The tag is pinned but not digest-pinned; the registry can re-push the same tag with different content. Prefer \`image@sha256:…\` for truly reproducible launches.`,
      jsonPath: `${root}.${name}`,
      source: ctx.source,
    }));
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
    if (/^[a-z0-9][\w./@:-]*$/i.test(a)) return a;
    return undefined;
  }
  return undefined;
}
