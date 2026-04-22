/**
 * Shared types for mcpcheck.
 */

export type Severity = "error" | "warning" | "info" | "off";

export interface Issue {
  /** Stable rule id, e.g. "missing-transport". */
  ruleId: string;
  severity: Severity;
  message: string;
  /** Dotted path into the config, e.g. "mcpServers.github.env.GITHUB_TOKEN". */
  jsonPath: string;
  /** 1-based line number into the source file, when known. */
  line?: number;
  /** Optional autofix. */
  fix?: Fix;
}

export interface Fix {
  /** Byte offset in the original source, inclusive. */
  start: number;
  /** Byte offset in the original source, exclusive. */
  end: number;
  /** Replacement text. */
  replacement: string;
  description: string;
}

export interface FileReport {
  file: string;
  issues: Issue[];
  /** True if the file was unparseable / unreadable. */
  fatal: boolean;
}

export interface RunReport {
  files: FileReport[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  durationMs: number;
}

export interface RuleConfig {
  enabled: boolean;
  severity: Severity;
}

export interface RulesConfig {
  missingTransport: RuleConfig;
  conflictingTransport: RuleConfig;
  invalidCommand: RuleConfig;
  invalidArgs: RuleConfig;
  invalidEnv: RuleConfig;
  hardcodedSecret: RuleConfig;
  invalidUrl: RuleConfig;
  invalidTransport: RuleConfig;
  unknownField: RuleConfig;
  relativePath: RuleConfig;
  emptyServers: RuleConfig;
  duplicateServerName: RuleConfig;
  unstableReference: RuleConfig;
  dangerousCommand: RuleConfig;
  httpWithoutAuth: RuleConfig;
  duplicateEnvKey: RuleConfig;
  shellMetachars: RuleConfig;
  typosquatPackage: RuleConfig;
  emptyArgs: RuleConfig;
  placeholderValue: RuleConfig;
  plaintextHttpWithToken: RuleConfig;
  invalidEnvVarName: RuleConfig;
  emptyEnvValue: RuleConfig;
  cwdNotAbsolute: RuleConfig;
  secretInArgs: RuleConfig;
  duplicateImage: RuleConfig;
  nonAsciiServerName: RuleConfig;
  urlEmbeddedCredentials: RuleConfig;
  passwordFlagLiteral: RuleConfig;
  missingDigestPin: RuleConfig;
  autoapproveWildcard: RuleConfig;
  argsWithNewline: RuleConfig;
}

export interface Mcpcheckconfig {
  rules: RulesConfig;
  /** Additional glob patterns to treat as MCP configs. */
  include?: string[];
  /** Glob patterns to ignore. */
  exclude?: string[];
  /** When a license key is present, premium plugins load from here. */
  plugins?: string[];
}

export interface RuleContext {
  /** Parsed JSON. */
  config: unknown;
  /** Raw source text. */
  source: string;
  /** File path (relative to cwd). */
  file: string;
  rules: RulesConfig;
}

export type Rule = (ctx: RuleContext) => Issue[];
