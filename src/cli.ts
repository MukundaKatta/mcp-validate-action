#!/usr/bin/env node
/**
 * mcpcheck CLI.
 *
 * Examples:
 *   mcpcheck                                    # scan default paths
 *   mcpcheck ~/.cursor/mcp.json                 # single file
 *   mcpcheck '**\/mcp.json' --format sarif      # emit SARIF
 *   mcpcheck config.json --fix                  # apply autofixes in place
 */

import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Command } from "commander";
import { globby } from "globby";
import pc from "picocolors";

import { checkFiles } from "./core-fs.js";
import { applyFixes } from "./fix.js";
import { mergeConfig } from "./config.js";
import { loadConfigFile } from "./config-fs.js";
import { loadPlugins, hasLicense } from "./plugins.js";
import { formatText } from "./formatters/text.js";
import { formatJson } from "./formatters/json.js";
import { formatSarif } from "./formatters/sarif.js";
import { formatGithub } from "./formatters/github.js";
import { explainRule, listRuleIds } from "./rule-docs.js";
import { runInit } from "./init.js";
import type { Mcpcheckconfig, Rule, RunReport, FileReport } from "./types.js";

type Format = "text" | "json" | "sarif" | "github";

interface CliOptions {
  config?: string;
  format: Format;
  fix: boolean;
  failOn: "error" | "warning" | "info" | "never";
  output?: string;
  explain?: string;
  listRules?: boolean;
  quiet: boolean;
}

/**
 * Default inputs when no argument is given. We scan two places:
 *
 *   1. In-repo configs:    **\/mcp.json, **\/.mcp.json, **\/.cursor/mcp.json, etc.
 *   2. Known per-user paths: Claude Desktop, Cursor, Cline, Windsurf, Zed,
 *      Claude Code — one entry per client. These are absolute paths under the
 *      user's home dir and are tilde-expanded in `expandInputs`.
 */
const DEFAULT_GLOBS = [
  // repo-local configs
  "mcp.json",
  ".mcp.json",
  "**/mcp.json",
  "**/.mcp.json",
  "**/claude_desktop_config.json",
  "**/.cursor/mcp.json",
  "**/.cline/mcp.json",
  "**/.claude/mcp.json",
  "**/.codeium/windsurf/mcp_config.json",
  // per-user configs (tilde-expanded on the fly)
  "~/.claude.json",
  "~/.cursor/mcp.json",
  "~/.codeium/windsurf/mcp_config.json",
  "~/.config/zed/settings.json",
  "~/Library/Application Support/Claude/claude_desktop_config.json",
  "~/.config/Claude/claude_desktop_config.json",
  "~/AppData/Roaming/Claude/claude_desktop_config.json",
];

function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return homedir() + p.slice(1);
  return p;
}

async function main(): Promise<void> {
  // `mcpcheck init` is handled before commander parses, because commander
  // doesn't combine well with a positional-arg default command. We only
  // peek the first raw arg; everything else still goes through the main
  // command parser below.
  if (process.argv[2] === "init") {
    await handleInit(process.argv.slice(3));
    return;
  }

  const program = new Command()
    .name("mcpcheck")
    .description(
      "Validate MCP (Model Context Protocol) config files for Claude, Claude Code, Cursor, Cline, Windsurf, and Zed."
    )
    .argument("[inputs...]", "file paths or globs (defaults to common MCP config locations)")
    .option("-c, --config <path>", "mcpcheck config file")
    .option("-f, --format <type>", "text | json | sarif | github", "text")
    .option("--fix", "apply autofixes in place", false)
    .option("--fail-on <level>", "exit nonzero threshold: error | warning | info | never", "error")
    .option("-o, --output <path>", "write formatted output to a file")
    .option("-q, --quiet", "only print files that have issues", false)
    .option("--explain <rule-id>", "print docs for a rule and exit")
    .option("--list-rules", "list all rule ids and exit", false)
    .version(readVersion(), "-v, --version")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  mcpcheck                                     scan common MCP paths (auto-discovery)",
        "  mcpcheck ~/.cursor/mcp.json                  check a single file",
        "  mcpcheck '**/mcp.json' --format sarif        emit SARIF for Code Scanning",
        "  mcpcheck config.json --fix                   apply autofixes in place",
        "  mcpcheck --fail-on warning                   strict CI mode",
        "  mcpcheck --explain hardcoded-secret          print rule documentation",
        "  mcpcheck init                                scaffold mcpcheck.config.json + CI",
      ].join("\n")
    )
    .parse(process.argv);

  const rawInputs = program.args.length > 0 ? program.args : DEFAULT_GLOBS;
  const opts = program.opts<CliOptions>();

  if (opts.listRules) {
    process.stdout.write(listRuleIds().join("\n") + "\n");
    process.exit(0);
  }
  if (opts.explain) {
    const text = explainRule(opts.explain);
    if (!text) {
      process.stderr.write(
        pc.red(`Unknown rule "${opts.explain}". Try \`mcpcheck --list-rules\`.\n`)
      );
      process.exit(2);
    }
    process.stdout.write(text);
    process.exit(0);
  }

  const config: Mcpcheckconfig = opts.config ? loadConfigFileSafe(opts.config) : mergeConfig();
  const extraRules = await loadPluginRules(config);

  const files = await expandInputs(rawInputs);
  if (files.length === 0) {
    process.stderr.write(pc.yellow("No MCP config files matched. Nothing to do.\n"));
    process.exit(0);
  }

  const report = await checkFiles(files, { config, extraRules });

  if (opts.fix) {
    for (const file of report.files) {
      if (file.fatal) continue;
      const source = await readFile(file.file, "utf8");
      const { output, applied } = applyFixes(source, file.issues);
      if (applied.length > 0) {
        await writeFile(file.file, output, "utf8");
        process.stderr.write(
          pc.green(`[fixed] ${applied.length} issue(s) in ${file.file}\n`)
        );
      }
    }
  }

  const viewReport = opts.quiet && opts.format === "text" ? filterQuiet(report) : report;
  const out = renderReport(opts.format, viewReport);
  if (opts.output) {
    await writeFile(opts.output, out, "utf8");
  } else {
    process.stdout.write(out + (opts.format === "text" ? "\n" : "\n"));
  }
  process.exit(exitCode(report, opts.failOn));
}

/**
 * For --quiet text output, drop files with no issues from the printed report
 * while keeping aggregate counts. Non-text formats are machine-readable and
 * should not be filtered; --quiet is a text-UX affordance.
 */
function filterQuiet(report: RunReport): RunReport {
  const files: FileReport[] = report.files.filter((f) => f.issues.length > 0);
  return { ...report, files };
}

async function handleInit(argv: string[]): Promise<void> {
  const initCmd = new Command("init")
    .description("Scaffold mcpcheck.config.json and .github/workflows/mcpcheck.yml")
    .option("--config-only", "only write mcpcheck.config.json", false)
    .option("--workflow-only", "only write the GitHub Actions workflow", false)
    .option("--force", "overwrite existing files", false)
    .parse(["node", "mcpcheck", ...argv]);
  const opts = initCmd.opts<{ configOnly: boolean; workflowOnly: boolean; force: boolean }>();
  const result = await runInit({
    cwd: process.cwd(),
    force: opts.force,
    configOnly: opts.configOnly,
    workflowOnly: opts.workflowOnly,
  });
  for (const path of result.written) {
    process.stdout.write(pc.green(`[+] ${path}\n`));
  }
  for (const path of result.skipped) {
    process.stderr.write(
      pc.yellow(`[=] ${path} (already exists; pass --force to overwrite)\n`)
    );
  }
  if (result.written.length === 0) {
    process.exit(1);
  }
  process.exit(0);
}

function loadConfigFileSafe(path: string): Mcpcheckconfig {
  try {
    return loadConfigFile(path);
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    process.stderr.write(
      pc.red(`Failed to load --config file "${path}": ${message}\n`)
    );
    process.exit(2);
  }
}

async function loadPluginRules(config: Mcpcheckconfig): Promise<Rule[]> {
  if (!config.plugins || config.plugins.length === 0) return [];
  const plugins = await loadPlugins(config.plugins);
  const unlocked = hasLicense();
  const extra: Rule[] = [];
  for (const p of plugins) {
    if (p.rules) extra.push(...p.rules);
    if (p.premium && unlocked) p.premium({});
  }
  return extra;
}

async function expandInputs(inputs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const rawInput of inputs) {
    const input = expandTilde(rawInput);
    // Absolute/~-expanded paths: read directly. This skips globby's
    // "path outside cwd" restriction and works for per-user configs.
    try {
      await readFile(input, "utf8");
      out.push(input);
      continue;
    } catch {
      // Fall through to glob matching. If it contains no glob characters and
      // isn't readable, it silently drops — that's fine, the default list
      // includes several paths that only exist on some OSes/clients.
    }
    try {
      const matches = await globby(input, {
        onlyFiles: true,
        gitignore: true,
        ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/build/**"],
      });
      out.push(...matches);
    } catch {
      // Skip: neither a glob match nor a readable file.
    }
  }
  return [...new Set(out)].sort();
}

function renderReport(fmt: Format, report: ReturnType<typeof checkFiles> extends Promise<infer R> ? R : never): string {
  switch (fmt) {
    case "json":
      return formatJson(report);
    case "sarif":
      return formatSarif(report);
    case "github":
      return formatGithub(report);
    default:
      return formatText(report);
  }
}

function exitCode(
  report: Awaited<ReturnType<typeof checkFiles>>,
  failOn: CliOptions["failOn"]
): number {
  if (failOn === "never") return 0;
  const order = { info: 0, warning: 1, error: 2 };
  const threshold = order[failOn];
  for (const file of report.files) {
    for (const issue of file.issues) {
      if (issue.severity === "off") continue;
      if (order[issue.severity] >= threshold) return 1;
    }
  }
  return 0;
}

function readVersion(): string {
  try {
    const url = new URL("../package.json", import.meta.url);
    const json = readFileSync(url, "utf8");
    return (JSON.parse(json) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

main().catch((err: unknown) => {
  process.stderr.write(pc.red(String((err as Error)?.message ?? err)) + "\n");
  process.exit(2);
});
