# mcpcheck programmatic API

Everything the CLI does is exposed as a library. Two entry points:

- `import { ... } from "mcpcheck"` — full Node API (includes `checkFiles`, `loadConfigFile` that read from disk).
- `import { ... } from "mcpcheck/browser"` — fs-free subset suitable for browsers, Workers, and Deno. Same rules, same formatters, just no `node:fs`.

This page documents the shapes the public API commits to. See `src/types.ts` for the types, or import them directly.

## Lint a config in memory

```ts
import { checkSource, type FileReport } from "mcpcheck";

const source = await fs.readFile("mcp.json", "utf8");
const report: FileReport = checkSource(source, "mcp.json");

for (const issue of report.issues) {
  console.log(issue.severity, issue.ruleId, issue.jsonPath, issue.message);
}
```

`checkSource(source, file, opts?)` returns `{ file, fatal, issues }`. `fatal === true` only when the JSON didn't parse at all; every other rule result lives in `issues`. Options:

```ts
interface CheckOptions {
  config?: Partial<Mcpcheckconfig>;   // rule severities, include/exclude, plugins
  extraRules?: Rule[];                // additional rules merged with built-ins
}
```

## Apply autofixes

```ts
import { checkSource, applyFixes } from "mcpcheck";

const report = checkSource(source, "mcp.json");
const { output, applied, skipped } = applyFixes(source, report.issues);
// output — new source; applied/skipped — which fixes were used / overlapped
```

Fixes are applied back-to-front so earlier byte offsets stay valid. Overlapping fixes are first-wins. The only built-in rule that produces fixes is `hardcoded-secret` (replaces the value with `"${VAR}"` substitution).

## Run over multiple files on disk

```ts
import { checkFiles } from "mcpcheck";

const report = await checkFiles(["mcp.json", ".cursor/mcp.json"]);
// report: { files: FileReport[], errorCount, warningCount, infoCount, durationMs }
```

## Format a report

```ts
import {
  formatText, formatJson, formatSarif,
  formatGithub, formatMarkdown, formatJunit,
} from "mcpcheck";

process.stdout.write(formatMarkdown(report));
```

All formatters take a `RunReport`. Text is ANSI-colored for TTY; JSON/SARIF/JUnit/GitHub/Markdown are deterministic byte output.

## Explain a rule from code

```ts
import { explainRule, listRuleIds, RULE_DOCS } from "mcpcheck";

console.log(explainRule("hardcoded-secret"));   // or "all" to dump every rule
console.log(listRuleIds());                     // all 15 built-in ids
console.log(RULE_DOCS.find(d => d.autofix));    // every rule with an autofix
```

`RULE_DOCS` is the single source of truth behind `docs/RULES.md`, the generated `schema.json`'s rule descriptions, and the CLI's `--explain`.

## Resolve precise byte offsets from a jsonPath

```ts
import { locate } from "mcpcheck";

const loc = locate(source, "mcpServers.github.env.GITHUB_TOKEN");
// { line, column, startOffset, endOffset }
```

Used by editor integrations (the VS Code extension) to render `vscode.Diagnostic`s on the exact bytes of the offending value rather than the whole line.

## Write a plugin

```ts
// my-rules/src/index.ts
import type { Plugin, Rule } from "mcpcheck";

const noBetaServers: Rule = (ctx) => {
  // ctx.config: unknown   — the parsed MCP config (run typeof guards)
  // ctx.source: string    — original source (for locate/makeFix)
  // ctx.file:   string    — file path (for jsonPath prefixing)
  // ctx.rules:  RulesConfig — mcpcheck's per-rule severity settings
  // → returns Issue[]
  return [];
};

const plugin: Plugin = { rules: [noBetaServers] };
export default plugin;
```

Users then add `"plugins": ["your-package-name"]` to `mcpcheck.config.json`. See `extensions/rule-plugin-starter/` for a buildable template, or `extensions/enterprise-plugin/` for a real policy-as-code plugin.

## Browser / Worker

Same surface minus `checkFiles` and `loadConfigFile`:

```ts
import { checkSource, applyFixes, locate, explainRule } from "mcpcheck/browser";
```

Runs without `node:fs`. Bundles to ~30 KB with esbuild.

## Stability

- `Issue`, `Fix`, `FileReport`, `RunReport`, `Severity`, `RuleConfig`, `RulesConfig`, `Mcpcheckconfig`, `Rule`, `RuleContext`, `Plugin`: stable public types.
- `RULE_DOCS`, `listRuleIds`, `explainRule`: stable. New rules may appear; existing ids won't change without a major.
- Formatters: stable outputs (other tools parse them — SARIF, JUnit, GitHub annotations).
- Internal helpers (`src/rules/*`, `src/jsonc.ts`, `src/locate.ts`): re-exported through the barrel but considered "use at your own risk for now" — we may tighten them in a future minor.
