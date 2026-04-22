import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRules, matchPattern, anyMatch } from "../src/index.js";
import type { RuleContext } from "mcpcheck";

function runRules(rules: ReturnType<typeof buildRules>, config: unknown) {
  const ctx: RuleContext = {
    config,
    source: JSON.stringify(config),
    file: "mcp.json",
    rules: {} as RuleContext["rules"],
  };
  return rules.flatMap((r) => r(ctx));
}

describe("matchPattern", () => {
  it("supports * wildcards but not path traversal semantics", () => {
    assert.ok(matchPattern("docker", "docker"));
    assert.ok(matchPattern("docker", "doc*"));
    assert.ok(matchPattern("/usr/local/bin/mcp-fs", "*mcp-fs"));
    assert.ok(matchPattern("ghcr.io/org/img:latest", "*:latest"));
    assert.ok(!matchPattern("docker", "dockerd"));
    assert.ok(anyMatch("foo", ["a", "b", "f*"]));
    assert.ok(!anyMatch("foo", ["a", "b"]));
  });
});

describe("enterprise/allowed-command", () => {
  const rules = buildRules({ allowedCommands: ["npx", "/usr/local/bin/*"] });

  it("allows an exact match", () => {
    const config = { mcpServers: { s: { command: "npx", args: ["-y", "@x/y@1.0.0"] } } };
    const issues = runRules(rules, config);
    assert.equal(issues.length, 0);
  });

  it("allows a wildcard match", () => {
    const config = { mcpServers: { s: { command: "/usr/local/bin/mcp-fs" } } };
    const issues = runRules(rules, config);
    assert.equal(issues.length, 0);
  });

  it("flags an unlisted command", () => {
    const config = { mcpServers: { s: { command: "docker", args: ["run", "img:1.0"] } } };
    const issues = runRules(rules, config);
    assert.equal(issues.length, 1);
    assert.equal(issues[0]!.ruleId, "enterprise/allowed-command");
  });
});

describe("enterprise/denied-image", () => {
  const rules = buildRules({ deniedImages: ["ghcr.io/bad-org/*", "*:latest"] });

  it("flags a denied image", () => {
    const config = {
      mcpServers: {
        s: { command: "docker", args: ["run", "-i", "--rm", "ghcr.io/bad-org/evil:1.0.0"] },
      },
    };
    const issues = runRules(rules, config);
    assert.equal(issues.length, 1);
    assert.equal(issues[0]!.ruleId, "enterprise/denied-image");
  });

  it("flags implicit :latest via wildcard", () => {
    const config = {
      mcpServers: { s: { command: "docker", args: ["run", "something:latest"] } },
    };
    const issues = runRules(rules, config);
    assert.equal(issues.length, 1);
  });

  it("allows a non-denied image", () => {
    const config = {
      mcpServers: {
        s: { command: "docker", args: ["run", "ghcr.io/good-org/img:2.0.0"] },
      },
    };
    const issues = runRules(rules, config);
    assert.equal(issues.length, 0);
  });
});

describe("enterprise/allowed-package", () => {
  const rules = buildRules({ allowedPackages: ["@modelcontextprotocol/*", "@my-org/*"] });

  it("strips version suffix before matching scoped packages", () => {
    const config = {
      mcpServers: {
        s: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem@0.6.2"] },
      },
    };
    const issues = runRules(rules, config);
    assert.equal(issues.length, 0);
  });

  it("flags a package outside the allowlist", () => {
    const config = {
      mcpServers: { s: { command: "npx", args: ["-y", "sketchy-pkg@1.0.0"] } },
    };
    const issues = runRules(rules, config);
    assert.equal(issues.length, 1);
    assert.equal(issues[0]!.ruleId, "enterprise/allowed-package");
  });

  it("does not fire on non-npx/uvx commands", () => {
    const config = { mcpServers: { s: { command: "node", args: ["server.js"] } } };
    const issues = runRules(rules, config);
    assert.equal(issues.length, 0);
  });
});

describe("empty config", () => {
  it("produces no rules when all lists are empty", () => {
    const rules = buildRules({});
    assert.equal(rules.length, 0);
  });
});
