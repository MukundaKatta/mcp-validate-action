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

import "./color-boot.js"; // MUST be first — sets NO_COLOR / FORCE_COLOR before picocolors caches.
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
import { formatHtml } from "./formatters/html.js";
import { formatCsv } from "./formatters/csv.js";
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
import { filterIgnored, loadIgnoreFile } from "./ignore.js";
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

type Format = "text" | "json" | "sarif" | "github" | "markdown" | "junit" | "html" | "csv";

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
  diffOnly?: string;
  excludeRule?: string[];
  onlyRule?: string[];
  onlyFixable: boolean;
  sortBy?: "severity" | "rule" | "line" | "file";
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
  if (process.argv[2] === "version") {
    process.stdout.write(
      JSON.stringify(
        {
          name: "mcpcheck",
          version: readVersion(),
          ruleCount: listRuleIds().length,
          rules: listRuleIds(),
          schemas: {
            config: "schema.json",
            mcpConfig: "schema/mcp-config.schema.json",
          },
        },
        null,
        2
      ) + "\n"
    );
    process.exit(0);
  }
  if (process.argv[2] === "pipe") {
    await handlePipe(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === "scaffold-workflow") {
    await handleScaffoldWorkflow(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === "fmt") {
    await handleFmt(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === "why") {
    const id = process.argv[3];
    if (!id || id === "-h" || id === "--help") {
      process.stderr.write(
        "Usage: mcpcheck why <rule-id>\n" +
          'Prints the same docs as `mcpcheck --explain <rule-id>`. Use "all" to dump every rule.\n'
      );
      process.exit(id ? 0 : 2);
    }
    const text = explainRule(id);
    if (!text) {
      process.stderr.write(
        pc.red(`Unknown rule "${id}". Try \`mcpcheck --list-rules\`.\n`)
      );
      process.exit(2);
    }
    process.stdout.write(text);
    process.exit(0);
  }
  if (process.argv[2] === "audit") {
    await handleAudit(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === "list-servers") {
    await handleListServers(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === "graph") {
    await handleGraph(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === "snapshot") {
    await handleSnapshot(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === "restore") {
    await handleRestore(process.argv.slice(3));
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
    .option("-f, --format <type>", "text | json | sarif | github | markdown | junit | html | csv", "text")
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
    .option("--strict", "alias for --profile strict", false)
    .option(
      "--print-config",
      "print the effective merged mcpcheck config (defaults + profile + --config) and exit",
      false
    )
    .option(
      "--diff-only [base]",
      "lint only files changed vs base (default: HEAD). Uses `git diff --name-only`."
    )
    .option(
      "--exclude-rule <id>",
      "suppress issues for this rule (repeatable)",
      (val: string, prev: string[] = []) => [...prev, val]
    )
    .option(
      "--only-rule <id>",
      "only report issues for this rule (repeatable)",
      (val: string, prev: string[] = []) => [...prev, val]
    )
    .option("--only-fixable", "only report issues that have an autofix", false)
    .option(
      "--sort-by <key>",
      "sort issues within each file by severity | rule | line | file"
    )
    .option(
      "--color <mode>",
      "always | never | auto. Respects NO_COLOR / FORCE_COLOR env vars.",
      "auto"
    )
    .option("--no-color", "alias for --color=never")
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
        "",
        "Subcommands (more via <cmd> --help):",
        "  init, diff, stats, doctor, doctor --fix, upgrade-pins, merge, convert,",
        "  fmt, graph, list-servers, pipe, snapshot, restore, scaffold-workflow,",
        "  completions, mcp-server, lsp, version, why",
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

  // --strict is just sugar for --profile strict. Error if the user set both
  // to conflicting values so a `mcpcheck --strict --profile permissive`
  // doesn't silently prefer one.
  const strictFlag = (opts as unknown as { strict?: boolean }).strict;
  if (strictFlag) {
    if (opts.profile && opts.profile !== "strict") {
      process.stderr.write(
        pc.red(`--strict and --profile "${opts.profile}" conflict. Pick one.\n`)
      );
      process.exit(2);
    }
    opts.profile = "strict";
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
    // Global config (~/.mcpcheck/config.json) merges in first, project
    // --config layers on top. This gives users a single place to turn a
    // rule off across every repo without duplicating mcpcheck.config.json
    // everywhere.
    const globalPartial = tryLoadGlobalConfig();
    const base = globalPartial ? mergeConfig(globalPartial) : mergeConfig();
    config = opts.config
      ? mergeConfig({ ...base, ...loadConfigFileSafeRaw(opts.config) })
      : base;
  }
  if (opts.printConfig) {
    process.stdout.write(JSON.stringify(config, null, 2) + "\n");
    process.exit(0);
  }

  const extraRules = await loadPluginRules(config);

  const expanded = await expandInputs(rawInputs);
  const ignore = await loadIgnoreRules();
  let files = ignore ? filterIgnored(expanded, ignore) : expanded;
  if (opts.diffOnly !== undefined) {
    const base =
      typeof opts.diffOnly === "string" && opts.diffOnly !== "" ? opts.diffOnly : "HEAD";
    const changed = await gitChangedFiles(base);
    if (changed === undefined) {
      process.stderr.write(
        pc.yellow(
          `[--diff-only] not a git repo or git unavailable; running against every matched file instead.\n`
        )
      );
    } else {
      const changedSet = new Set(changed);
      const filtered = files.filter((f) => changedSet.has(trimCwd(f)));
      process.stderr.write(
        pc.dim(
          `[--diff-only] ${filtered.length}/${files.length} input(s) changed vs ${base}\n`
        )
      );
      files = filtered;
    }
  }
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

  // Apply rule-filter flags before any formatting. These affect exit-code
  // thresholding too, so callers doing `mcpcheck --exclude-rule foo --fail-on
  // error` really don't fail on suppressed findings.
  if (
    (opts.excludeRule && opts.excludeRule.length > 0) ||
    (opts.onlyRule && opts.onlyRule.length > 0) ||
    opts.onlyFixable
  ) {
    applyRuleFilters(report, opts);
  }
  if (opts.sortBy) {
    const rank = { error: 0, warning: 1, info: 2, off: 3 };
    const cmp = opts.sortBy;
    for (const f of report.files) {
      f.issues.sort((a, b) => {
        if (cmp === "severity") {
          return rank[a.severity] - rank[b.severity] || (a.line ?? 0) - (b.line ?? 0);
        }
        if (cmp === "rule") return a.ruleId.localeCompare(b.ruleId);
        if (cmp === "line") return (a.line ?? 0) - (b.line ?? 0);
        return 0; // "file" is the default ordering; per-file sort is a no-op
      });
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

/**
 * In-place mutation: drop issues matching the exclude list, keep only those
 * matching the include list (if set), keep only fixable (if set). Recomputes
 * aggregate counts so exit-code logic reflects the filtered view.
 */
function applyRuleFilters(report: RunReport, opts: CliOptions): void {
  const exclude = new Set(opts.excludeRule ?? []);
  const onlySet = opts.onlyRule && opts.onlyRule.length > 0 ? new Set(opts.onlyRule) : undefined;
  for (const f of report.files) {
    f.issues = f.issues.filter((i) => {
      if (exclude.has(i.ruleId)) return false;
      if (onlySet && !onlySet.has(i.ruleId)) return false;
      if (opts.onlyFixable && !i.fix) return false;
      return true;
    });
  }
  report.errorCount = 0;
  report.warningCount = 0;
  report.infoCount = 0;
  for (const f of report.files) {
    for (const i of f.issues) {
      if (i.severity === "error") report.errorCount += 1;
      else if (i.severity === "warning") report.warningCount += 1;
      else if (i.severity === "info") report.infoCount += 1;
    }
  }
}

async function handleScaffoldWorkflow(argv: string[]): Promise<void> {
  const force = argv.includes("--force");
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stderr.write(
      "Usage: mcpcheck scaffold-workflow [--force]\n" +
        "Copies the PR-comment workflow template into\n" +
        ".github/workflows/mcpcheck-pr-comment.yml so CI posts a markdown\n" +
        "report on every MCP-config-touching PR.\n"
    );
    process.exit(0);
  }
  const { mkdir, writeFile, access } = await import("node:fs/promises");
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, resolve } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(
    resolve(here, "..", "examples", "github-actions", "mcpcheck-pr-comment.yml"),
    "utf8"
  );
  const target = ".github/workflows/mcpcheck-pr-comment.yml";
  if (!force) {
    try {
      await access(target);
      process.stderr.write(
        pc.yellow(`[scaffold-workflow] ${target} already exists (pass --force to overwrite).\n`)
      );
      process.exit(1);
    } catch {
      // doesn't exist — proceed
    }
  }
  await mkdir(".github/workflows", { recursive: true });
  await writeFile(target, source, "utf8");
  process.stderr.write(pc.green(`[scaffold-workflow] wrote ${target}\n`));
  process.exit(0);
}

async function handleFmt(argv: string[]): Promise<void> {
  const inPlace = argv.includes("--write") || argv.includes("-w");
  const files = argv.filter((a) => !a.startsWith("-"));
  if (files.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    process.stderr.write(
      "Usage: mcpcheck fmt <file...> [--write]\n" +
        "Pretty-print each MCP config (2-space indent, sorted server keys,\n" +
        "newline at EOF). Without --write, prints to stdout.\n"
    );
    process.exit(files.length === 0 ? 2 : 0);
  }
  const { readFile, writeFile } = await import("node:fs/promises");
  const { parseJsonc } = await import("./jsonc.js");
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    let parsed: unknown;
    try {
      parsed = parseJsonc(raw);
    } catch (err) {
      process.stderr.write(pc.red(`[fmt] ${file}: ${(err as Error).message}\n`));
      continue;
    }
    const out = JSON.stringify(sortServerKeys(parsed), null, 2) + "\n";
    if (inPlace) {
      await writeFile(file, out, "utf8");
      process.stderr.write(pc.green(`[fmt] ${file}\n`));
    } else {
      if (files.length > 1) process.stdout.write(`// ${file}\n`);
      process.stdout.write(out);
    }
  }
  process.exit(0);
}

function sortServerKeys(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return parsed;
  const c = parsed as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === "mcpServers" || k === "servers" || k === "context_servers") {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const sorted: Record<string, unknown> = {};
        for (const serverName of Object.keys(v as Record<string, unknown>).sort()) {
          sorted[serverName] = (v as Record<string, unknown>)[serverName];
        }
        out[k] = sorted;
        continue;
      }
    }
    out[k] = v;
  }
  return out;
}

async function handleAudit(argv: string[]): Promise<void> {
  const files = argv.filter((a) => !a.startsWith("-"));
  if (files.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    process.stderr.write(
      "Usage: mcpcheck audit <file...>\n" +
        "Combined report: lint findings + stats + list-servers. One pass, one screen.\n"
    );
    process.exit(files.length === 0 ? 2 : 0);
  }
  const { listServersFromFile, formatServerRowsText } = await import("./list-servers.js");
  const { statsFromFile, formatStatsText } = await import("./stats.js");
  const rows = [];
  const statsList = [];
  for (const file of files) {
    try {
      rows.push(...(await listServersFromFile(file)));
      statsList.push(await statsFromFile(file));
    } catch (err) {
      process.stderr.write(pc.yellow(`[audit] skip ${file}: ${(err as Error).message}\n`));
    }
  }
  const report = await checkFiles(files);
  process.stdout.write(pc.bold("━━━ Servers ━━━\n"));
  process.stdout.write(formatServerRowsText(rows));
  process.stdout.write("\n" + pc.bold("━━━ Stats ━━━\n"));
  process.stdout.write(formatStatsText(statsList));
  process.stdout.write("\n" + pc.bold("━━━ Findings ━━━\n"));
  process.stdout.write(formatText(report) + "\n");
  process.exit(exitCode(report, "error"));
}

async function handleListServers(argv: string[]): Promise<void> {
  const files = argv.filter((a) => !a.startsWith("-"));
  if (files.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    process.stderr.write(
      "Usage: mcpcheck list-servers <file...>\n" +
        "One line per server with file, name, transport, target, pinned, disabled.\n"
    );
    process.exit(files.length === 0 ? 2 : 0);
  }
  const { listServersFromFile, formatServerRowsText } = await import("./list-servers.js");
  const rows = [];
  for (const file of files) {
    try {
      rows.push(...(await listServersFromFile(file)));
    } catch (err) {
      process.stderr.write(pc.yellow(`[list-servers] skip ${file}: ${(err as Error).message}\n`));
    }
  }
  process.stdout.write(formatServerRowsText(rows));
  process.exit(0);
}

async function handleGraph(argv: string[]): Promise<void> {
  const files = argv.filter((a) => !a.startsWith("-"));
  if (files.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    process.stderr.write(
      "Usage: mcpcheck graph <file...>\n" +
        "Emit a Mermaid flowchart diagram (LR) of the server topology.\n"
    );
    process.exit(files.length === 0 ? 2 : 0);
  }
  const { readFile } = await import("node:fs/promises");
  const { formatGraph } = await import("./graph.js");
  const entries: Array<{ file: string; source: string }> = [];
  for (const file of files) {
    try {
      entries.push({ file, source: await readFile(file, "utf8") });
    } catch (err) {
      process.stderr.write(pc.yellow(`[graph] skip ${file}: ${(err as Error).message}\n`));
    }
  }
  process.stdout.write(formatGraph(entries));
  process.exit(0);
}

async function handlePipe(argv: string[]): Promise<void> {
  const fmt = (extractArg(argv, "--format") ?? extractArg(argv, "-f") ?? "text") as Format;
  const fileName = extractArg(argv, "--filename") ?? "stdin.json";
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stderr.write(
      "Usage: mcpcheck pipe [--format text|json|sarif|github|markdown|junit|html] [--filename name]\n" +
        "Lint config JSON read from stdin. Writes the formatted report to stdout.\n" +
        "Exit 0 if no errors; 1 otherwise (regardless of --format).\n"
    );
    process.exit(0);
  }
  const source = await readStdin();
  const report = await checkFiles([fileName], {});
  // We bypass checkFiles's disk read by invoking checkSource directly against
  // stdin, then packaging a RunReport by hand so formatters still work.
  const { checkSource } = await import("./core.js");
  const fileReport = checkSource(source, fileName);
  const runReport = {
    files: [fileReport],
    errorCount: fileReport.issues.filter((i) => i.severity === "error").length,
    warningCount: fileReport.issues.filter((i) => i.severity === "warning").length,
    infoCount: fileReport.issues.filter((i) => i.severity === "info").length,
    durationMs: 0,
  };
  void report; // ignored — the above is authoritative for pipe mode
  const out = renderReport(fmt, runReport);
  process.stdout.write(out + (fmt === "text" ? "\n" : ""));
  process.exit(runReport.errorCount > 0 ? 1 : 0);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    process.stderr.write(
      pc.yellow("mcpcheck pipe: no stdin detected. Pipe a config JSON into stdin.\n")
    );
    process.exit(2);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as string | Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

async function handleSnapshot(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    process.stderr.write(
      "Usage: mcpcheck snapshot <file...>\n" +
        "Copy each file to <file>.mcpcheck-bak. Safe-before-fix insurance.\n"
    );
    process.exit(argv.length === 0 ? 2 : 0);
  }
  const { copyFile } = await import("node:fs/promises");
  for (const file of argv.filter((a) => !a.startsWith("-"))) {
    const target = `${file}.mcpcheck-bak`;
    try {
      await copyFile(file, target);
      process.stderr.write(pc.green(`[snapshot] ${file} → ${target}\n`));
    } catch (err) {
      process.stderr.write(pc.red(`[snapshot] ${file}: ${(err as Error).message}\n`));
    }
  }
  process.exit(0);
}

async function handleRestore(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    process.stderr.write(
      "Usage: mcpcheck restore <file...>\n" +
        "Restore each file from <file>.mcpcheck-bak (leaves the backup in place).\n"
    );
    process.exit(argv.length === 0 ? 2 : 0);
  }
  const { copyFile } = await import("node:fs/promises");
  for (const file of argv.filter((a) => !a.startsWith("-"))) {
    const source = `${file}.mcpcheck-bak`;
    try {
      await copyFile(source, file);
      process.stderr.write(pc.green(`[restore] ${source} → ${file}\n`));
    } catch (err) {
      process.stderr.write(pc.red(`[restore] ${file}: ${(err as Error).message}\n`));
    }
  }
  process.exit(0);
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

/**
 * Look for `~/.mcpcheck/config.json` and return the parsed partial, or
 * undefined if it doesn't exist / isn't valid JSON. Used to let users set
 * repo-wide defaults (severity overrides, include/exclude) once per
 * machine rather than per-project.
 */
function tryLoadGlobalConfig(): Partial<Mcpcheckconfig> | undefined {
  try {
    const path = homedir() + "/.mcpcheck/config.json";
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as Partial<Mcpcheckconfig>;
  } catch {
    return undefined;
  }
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

async function loadIgnoreRules(): Promise<Awaited<ReturnType<typeof loadIgnoreFile>>> {
  return loadIgnoreFile(".mcpcheckignore");
}

/**
 * Return the list of paths (relative to the git repo root) that differ
 * between the working tree and `base`. `undefined` if this isn't a git
 * repository or `git` isn't available — callers should fall back to
 * running against every input in that case.
 */
async function gitChangedFiles(base: string): Promise<string[] | undefined> {
  const { spawnSync } = await import("node:child_process");
  const res = spawnSync("git", ["diff", "--name-only", base], { encoding: "utf8" });
  if (res.status !== 0) return undefined;
  return res.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function trimCwd(p: string): string {
  const cwd = process.cwd();
  if (p.startsWith(cwd + "/")) return p.slice(cwd.length + 1);
  return p;
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
    case "html":
      return formatHtml(report);
    case "csv":
      return formatCsv(report);
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
