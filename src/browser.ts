/**
 * Browser-safe public API. Re-exports everything a non-Node consumer needs to
 * lint an MCP config in memory: `checkSource`, `applyFixes`, `locate`,
 * `parseJsonc`, rule docs, default config. Excludes anything that imports
 * `node:fs` (which would break browser / Worker bundles).
 *
 * Consumers: the `playground/` web app, the VS Code extension's pure-JS
 * fallback path, and any future Cloudflare Worker / Deno deployment.
 */

export { checkSource, aggregateReports } from "./core.js";
export { applyFixes } from "./fix.js";
export { DEFAULT_CONFIG, mergeConfig } from "./config.js";
export { BUILTIN_RULES } from "./rules/index.js";
export { formatText } from "./formatters/text.js";
export { formatJson } from "./formatters/json.js";
export { formatSarif } from "./formatters/sarif.js";
export { formatGithub } from "./formatters/github.js";
export { locate, type Location } from "./locate.js";
export { parseJsonc, stripJsonc } from "./jsonc.js";
export { explainRule, listRuleIds, RULE_DOCS, type RuleDoc } from "./rule-docs.js";
export type {
  Issue,
  Fix,
  FileReport,
  RunReport,
  Severity,
  RuleConfig,
  RulesConfig,
  Mcpcheckconfig,
  Rule,
  RuleContext,
} from "./types.js";
