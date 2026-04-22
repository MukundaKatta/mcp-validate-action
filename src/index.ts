/**
 * mcpcheck public API.
 */

export { checkSource, aggregateReports } from "./core.js";
export { checkFiles } from "./core-fs.js";
export { applyFixes } from "./fix.js";
export {
  DEFAULT_CONFIG,
  mergeConfig,
} from "./config.js";
export { loadConfigFile } from "./config-fs.js";
export { BUILTIN_RULES } from "./rules/index.js";
export { loadPlugins, hasLicense, type Plugin, type PremiumApi } from "./plugins.js";
export { formatText } from "./formatters/text.js";
export { formatJson } from "./formatters/json.js";
export { formatSarif } from "./formatters/sarif.js";
export { formatGithub } from "./formatters/github.js";
export { pathsForClient, knownClients, CLIENT_PATHS } from "./cli-metadata.js";
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
