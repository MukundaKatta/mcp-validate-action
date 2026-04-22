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
import { formatMarkdown } from "./formatters/markdown.js";
import { formatJunit } from "./formatters/junit.js";
import { explainRule, listRuleIds } from "./rule-docs.js";
import { runInit } from "./init.js";
import { diffFiles } from "./diff.js";
import { statsFromFile, formatStatsText } from "./stats.js";
import { runDoctor, formatDoctorText, doctorExitCode } from "./doctor.js";
import {
  applyBaseline,
  loadBaseline,
  writeBaseline,
} from "./baseline.js";
import { upgradePins } from "./upgrade-pins.js";
import { pathsForClient, knownClients } from "./cli-metadata.js";
import { completionFor, isKnownShell, listShells } from "./completions.js";
import { applyProfile, isKnownProfile, listProfiles } from "./profiles.js";
import {
  convertConfig,
  isKnownConvertTarget,
  listConvertTargets,
  mergeConfigs,
  readJsoncFile,
} from "./transform.js";
import type { Mcpcheckconfig, Rule, RunReport, FileReport } from "./types.js";

type Format = "text" | "json" | "sarif" | "github" | "markdown" | "junit";

interface CliOptions {
  config?: string;
  format: Format;
  fix: boolean;
  failOn: "error" | "warning" | "info" | "never";
  output?: string;
  explain?: string;
  listRules?: boolean;
  quiet: boolean;
  client?: string;
  baseline?: string;
  baselineWrite?: boolean;
  watch: boolean;
  profile?: string;
  printConfig: boolean;
}

const DEFAULT_BASELINE_PATH = ".mcpcheck.baseline.json";

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
  if (process.argv[2] === "diff") {
    await handleDiff(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === "stats") {
    await handleStats(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === "doctor") {
    const sub = process.argv.slice(3);
    const fix = sub.includes("--fix");
    const { runDoctorFix } = await import("./doctor.js");
    const statuses = fix ? await runDoctorFix() : await runDoctor();
    process.stdout.write(formatDoctorText(statuses) + "\n");
    process.exit(doctorExitCode(statuses));
  }
  if (process.argv[2] === "upgrade-pins") {
    await handleUpgradePins(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === "mcp-server") {
    const { runMcpServer } = await import("./mcp-server.js");
    await runMcpServer();
    // Stays resident on stdin.
    return;
  }
  if (process.argv[2] === "lsp") {
    const { runLspServer } = await import("./lsp-server.js");
    await runLspServer();
    return;
  }
  if (process.argv[2] === "merge") {
    await handleMerge(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === "convert") {
    await handleConvert(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === "completions") {
    const shell = process.argv[3];
    if (!shell || shell === "-h" || shell === "--help") {
      process.stderr.write(
        `Usage: mcpcheck completions <${listShells().join("|")}>\n`
      );
      process.exit(shell ? 0 : 2);
    }
    if (!isKnownShell(shell)) {
      process.stderr.write(
        pc.red(`Unknown shell "${shell}". Supported: ${listShells().join(", ")}.\n`)
      );
      process.exit(2);
    }
    process.stdout.write(completionFor(shell));
    process.exit(0);
  }

  const program = new Command()
    .name("mcpcheck")
    .description(
      "Validate MCP (Model Context Protocol) config files for Claude, Claude Code, Cursor, Cline, Windsurf, and Zed."
    )
    .argument("[inputs...]", "file paths or globs (defaults to common MCP config locations)")
    .option("-c, --config <path>", "mcpcheck config file")
    .option("-f, --format <type>", "text | json | sarif | github | markdown | junit", "text")
    .option("--fix", "apply autofixes in place", false)
    .option("--fail-on <level>", "exit nonzero threshold: error | warning | info | never", "error")
    .option("-o, --output <path>", "write formatted output to a file")
    .option("-q, --quiet", "only print files that have issues", false)
    .option(
      "--client <name>",
      `scan only one client's paths: ${knownClients().join(", ")}`
    )
    .option("--explain <rule-id>", "print docs for a rule and exit")
    .option("--list-rules", "list all rule ids and exit", false)
    .option(
      "--baseline [path]",
      `suppress every issue already present in the baseline file (default: ${DEFAULT_BASELINE_PATH})`
    )
    .option(
      "--baseline-write [path]",
      `write the current issues as a baseline and exit 0 (default: ${DEFAULT_BASELINE_PATH})`
    )
    .option(
      "-w, --watch",
      "re-run every time an input file changes (Ctrl-C to exit)",
      false
    )
    .option(
      "--profile <name>",
      `preset severity bundle: ${listProfiles().join(", ")}`
    )
    .option(
      "--print-config",
      "print the effective merged mcpcheck config (defaults + profile + --config) and exit",
      false
    )
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
        "  mcpcheck diff a.json b.json                  show which issues changed between two configs",
        "  mcpcheck doctor                              per-client health summary across installed MCP clients",
        "  mcpcheck stats path.json                     inventory summary of an MCP config",
        "  mcpcheck --baseline-write                    snapshot today's issues as .mcpcheck.baseline.json",
        "  mcpcheck --baseline                          fail only on new issues (respects --baseline-write output)",
      ].join("\n")
    )
    .parse(process.argv);

  const opts = program.opts<CliOptions>();

  let defaultInputs: string[] = DEFAULT_GLOBS;
  if (opts.client) {
    const paths = pathsForClient(opts.client);
    if (!paths) {
      process.stderr.write(
        pc.red(
          `Unknown --client "${opts.client}". Known: ${knownClients().join(", ")}\n`
        )
      );
      process.exit(2);
    }
    defaultInputs = paths;
  }

  const rawInputs = program.args.length > 0 ? program.args : defaultInputs;

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

  let config: Mcpcheckconfig;
  if (opts.profile) {
    if (!isKnownProfile(opts.profile)) {
      process.stderr.write(
        pc.red(`Unknown --profile "${opts.profile}". Known: ${listProfiles().join(", ")}.\n`)
      );
      process.exit(2);
    }
    // Profile first, then any explicitly-loaded user config layered on top.
    // Without --config, we want the profile's severities to prevail over the
    // in-code defaults; passing `mergeConfig()` as "overrides" would clobber
    // them.
    const userOverrides = opts.config
      ? loadConfigFileSafeRaw(opts.config)
      : undefined;
    config = applyProfile(opts.profile, userOverrides);
  } else {
    config = opts.config ? loadConfigFileSafe(opts.config) : mergeConfig();
  }
  if (opts.printConfig) {
    process.stdout.write(JSON.stringify(config, null, 2) + "\n");
    process.exit(0);
  }

  const extraRules = await loadPluginRules(config);

  const files = await expandInputs(rawInputs);
  if (files.length === 0) {
    process.stderr.write(pc.yellow("No MCP config files matched. Nothing to do.\n"));
    process.exit(0);
  }

  const report = await checkFiles(files, { config, extraRules });

  if (opts.baselineWrite !== undefined) {
    const path =
      typeof opts.baselineWrite === "string" ? opts.baselineWrite : DEFAULT_BASELINE_PATH;
    const n = await writeBaseline(path, report.files);
    process.stderr.write(
      pc.green(`[baseline] wrote ${n} issue(s) to ${path}\n`)
    );
    process.exit(0);
  }

  let suppressedByBaseline = 0;
  if (opts.baseline !== undefined) {
    const path =
      typeof opts.baseline === "string" ? opts.baseline : DEFAULT_BASELINE_PATH;
    const baseline = await loadBaseline(path);
    if (!baseline) {
      process.stderr.write(
        pc.yellow(
          `[baseline] no baseline found at ${path}; running as if --baseline weren't set. Use --baseline-write to create one.\n`
        )
      );
    } else {
      const { files: filtered, suppressed } = applyBaseline(report.files, baseline);
      report.files = filtered;
      suppressedByBaseline = suppressed;
      // Counts need to reflect what we still report.
      report.errorCount = filtered.reduce(
        (n, f) => n + f.issues.filter((i) => i.severity === "error").length,
        0
      );
      report.warningCount = filtered.reduce(
        (n, f) => n + f.issues.filter((i) => i.severity === "warning").length,
        0
      );
      report.infoCount = filtered.reduce(
        (n, f) => n + f.issues.filter((i) => i.severity === "info").length,
        0
      );
      if (suppressed > 0) {
        process.stderr.write(
          pc.dim(`[baseline] suppressed ${suppressed} pre-existing issue(s)\n`)
        );
      }
    }
  }
  void suppressedByBaseline;

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

  if (opts.watch) {
    // Stay resident: re-run on every input-file change. We keep going even
    // when exitCode() would be non-zero — the whole point of watch mode is
    // iterative dev, not CI-grade exits.
    await startWatch(files, opts, config, extraRules);
    return;
  }
  process.exit(exitCode(report, opts.failOn));
}

/**
 * Watch-mode loop. Subscribes to each input file (via fs.watch) and re-runs
 * the main scan on every change, debounced 150ms to coalesce editors that
 * save via rename+rename.
 */
async function startWatch(
  files: string[],
  opts: CliOptions,
  config: Mcpcheckconfig,
  extraRules: Rule[]
): Promise<void> {
  const fs = await import("node:fs");
  process.stderr.write(
    pc.dim(`[watch] watching ${files.length} file(s) — Ctrl-C to exit\n`)
  );
  let debounce: NodeJS.Timeout | undefined;
  const trigger = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      process.stderr.write(pc.dim("\n[watch] re-running…\n"));
      try {
        const report = await checkFiles(files, { config, extraRules });
        const view = opts.quiet && opts.format === "text" ? filterQuiet(report) : report;
        process.stdout.write(renderReport(opts.format, view) + "\n");
      } catch (err) {
        process.stderr.write(pc.red(`[watch] error: ${(err as Error).message}\n`));
      }
    }, 150);
  };
  for (const f of files) {
    try {
      fs.watch(f, { persistent: true }, trigger);
    } catch (err) {
      process.stderr.write(
        pc.yellow(`[watch] could not watch ${f}: ${(err as Error).message}\n`)
      );
    }
  }
  // Keep the process alive; fs.watch handles are enough but tidier to
  // explicitly resume stdin as a belt-and-braces.
  process.stdin.resume();
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

async function handleMerge(argv: string[]): Promise<void> {
  const output = extractArg(argv, "--output") ?? extractArg(argv, "-o");
  const files = positionalArgs(argv, ["--output", "-o"]);
  if (files.length < 2 || argv.includes("-h") || argv.includes("--help")) {
    process.stderr.write(
      "Usage: mcpcheck merge <a.json> <b.json> [<c.json> ...] [--output path]\n" +
        "Union two or more MCP configs. Server maps are unioned with later-wins\n" +
        "precedence. Writes to stdout unless --output is given.\n"
    );
    process.exit(files.length < 2 ? 2 : 0);
  }
  let merged: unknown = await readJsoncFile(files[0]!);
  for (const f of files.slice(1)) {
    const next = await readJsoncFile(f);
    merged = mergeConfigs(merged, next);
  }
  const out = JSON.stringify(merged, null, 2) + "\n";
  if (output) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(output, out, "utf8");
    process.stderr.write(pc.green(`[merge] wrote ${output}\n`));
  } else {
    process.stdout.write(out);
  }
  process.exit(0);
}

async function handleConvert(argv: string[]): Promise<void> {
  const target = extractArg(argv, "--to");
  const output = extractArg(argv, "--output") ?? extractArg(argv, "-o");
  const files = positionalArgs(argv, ["--to", "--output", "-o"]);
  if (!target || files.length !== 1 || argv.includes("-h") || argv.includes("--help")) {
    process.stderr.write(
      "Usage: mcpcheck convert <file.json> --to <client> [--output path]\n" +
        `Targets: ${listConvertTargets().join(", ")}\n` +
        "Rewrites the top-level server key (mcpServers / servers / context_servers)\n" +
        "to match the target client.\n"
    );
    process.exit(!target || files.length !== 1 ? 2 : 0);
  }
  if (!isKnownConvertTarget(target)) {
    process.stderr.write(
      pc.red(`Unknown convert target "${target}". Known: ${listConvertTargets().join(", ")}.\n`)
    );
    process.exit(2);
  }
  const parsed = await readJsoncFile(files[0]!);
  const converted = convertConfig(parsed, target);
  const out = JSON.stringify(converted, null, 2) + "\n";
  if (output) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(output, out, "utf8");
    process.stderr.write(pc.green(`[convert] wrote ${output}\n`));
  } else {
    process.stdout.write(out);
  }
  process.exit(0);
}

function extractArg(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

/**
 * Filter argv down to positional args, skipping both the listed value-taking
 * flags AND their values. "Positional" here excludes anything beginning with
 * `-` and anything that immediately follows a value-taking flag.
 */
function positionalArgs(argv: string[], valueFlags: string[]): string[] {
  const flagSet = new Set(valueFlags);
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (flagSet.has(a)) {
      i += 1; // skip the value
      continue;
    }
    if (a.startsWith("-")) continue;
    out.push(a);
  }
  return out;
}

async function handleUpgradePins(argv: string[]): Promise<void> {
  const write = argv.includes("--write");
  const files = argv.filter((a) => !a.startsWith("-"));
  if (files.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    process.stderr.write(
      "Usage: mcpcheck upgrade-pins <file...> [--write]\n" +
        "Look up the latest version on npm (for npx) or PyPI (for uvx) for each\n" +
        "unpinned package in the given MCP configs. Without --write, prints the\n" +
        "changes it would make. With --write, rewrites the files in place.\n"
    );
    process.exit(files.length === 0 ? 2 : 0);
  }
  let anyChanges = false;
  for (const file of files) {
    let result;
    try {
      result = await upgradePins(file, { write });
    } catch (err) {
      process.stderr.write(
        pc.red(`[upgrade-pins] ${file}: ${(err as Error).message}\n`)
      );
      continue;
    }
    process.stdout.write(pc.bold(file) + "\n");
    if (result.changes.length === 0 && result.skipped.length === 0) {
      process.stdout.write(pc.dim("  nothing to upgrade (everything pinned or not a runner)\n"));
      continue;
    }
    for (const c of result.changes) {
      anyChanges = true;
      process.stdout.write(
        `  ${pc.green(write ? "✓" : "→")} ${c.server}: ${c.oldPkg} → ${pc.green(c.newPkg)}  ${pc.dim(`(${c.registry})`)}\n`
      );
    }
    for (const s of result.skipped) {
      process.stdout.write(
        `  ${pc.yellow("!")} ${s.server}: ${s.pkg}  ${pc.dim(s.reason)}\n`
      );
    }
    if (!write && result.changes.length > 0) {
      process.stdout.write(pc.dim("  (dry run — re-run with --write to apply)\n"));
    }
  }
  process.exit(anyChanges && !write ? 1 : 0);
}

async function handleStats(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    process.stderr.write(
      "Usage: mcpcheck stats <file...>\n" +
        "Summarize MCP configs: server count, transport mix, pinning, env usage.\n"
    );
    process.exit(argv.length === 0 ? 2 : 0);
  }
  const stats = [];
  for (const file of argv) {
    try {
      stats.push(await statsFromFile(file));
    } catch (err) {
      process.stderr.write(
        pc.yellow(`[skip] ${file}: ${(err as Error).message}\n`)
      );
    }
  }
  if (stats.length === 0) process.exit(1);
  process.stdout.write(formatStatsText(stats));
  process.exit(0);
}

async function handleDiff(argv: string[]): Promise<void> {
  if (argv.length !== 2 || argv.includes("-h") || argv.includes("--help")) {
    process.stderr.write(
      "Usage: mcpcheck diff <before.json> <after.json>\n" +
        "Compare the issues two MCP configs produce and print what was added / removed.\n"
    );
    process.exit(argv.length === 2 ? 0 : 2);
  }
  const [a, b] = argv as [string, string];
  const diff = await diffFiles(a, b);
  const lines: string[] = [];
  if (diff.added.length === 0 && diff.removed.length === 0) {
    process.stdout.write(pc.green(`No issue changes. (${diff.unchanged} unchanged)\n`));
    process.exit(0);
  }
  for (const i of diff.removed) {
    lines.push(pc.green(`- ${pad(i.line)} ${i.severity.padEnd(8)} ${i.ruleId}  ${i.message}`));
  }
  for (const i of diff.added) {
    lines.push(pc.red(`+ ${pad(i.line)} ${i.severity.padEnd(8)} ${i.ruleId}  ${i.message}`));
  }
  lines.push(
    `\n${diff.added.length} added, ${diff.removed.length} removed, ${diff.unchanged} unchanged.`
  );
  process.stdout.write(lines.join("\n") + "\n");
  process.exit(diff.added.length > 0 ? 1 : 0);
}

function pad(line: number | undefined): string {
  return line ? `L${String(line).padStart(4, " ")}` : "     ";
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

/**
 * Same as loadConfigFileSafe but returns the *raw* user partial rather than
 * the default-merged result. Used when we want the profile preset to layer
 * on top of whatever the user *explicitly* set, without re-asserting the
 * in-code defaults.
 */
function loadConfigFileSafeRaw(path: string): Partial<Mcpcheckconfig> {
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as Partial<Mcpcheckconfig>;
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
    case "markdown":
      return formatMarkdown(report);
    case "junit":
      return formatJunit(report);
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
