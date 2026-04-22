import type { Mcpcheckconfig, RulesConfig } from "./types.js";

export const DEFAULT_CONFIG: Mcpcheckconfig = {
  rules: {
    missingTransport: { enabled: true, severity: "error" },
    conflictingTransport: { enabled: true, severity: "error" },
    invalidCommand: { enabled: true, severity: "error" },
    invalidArgs: { enabled: true, severity: "error" },
    invalidEnv: { enabled: true, severity: "error" },
    hardcodedSecret: { enabled: true, severity: "error" },
    invalidUrl: { enabled: true, severity: "error" },
    invalidTransport: { enabled: true, severity: "error" },
    unknownField: { enabled: true, severity: "warning" },
    relativePath: { enabled: true, severity: "warning" },
    emptyServers: { enabled: true, severity: "warning" },
    duplicateServerName: { enabled: true, severity: "error" },
    unstableReference: { enabled: true, severity: "warning" },
    dangerousCommand: { enabled: true, severity: "error" },
  },
};

export function mergeConfig(
  overrides?: Partial<Mcpcheckconfig>
): Mcpcheckconfig {
  const merged: Mcpcheckconfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (!overrides) return merged;
  if (overrides.include) merged.include = overrides.include;
  if (overrides.exclude) merged.exclude = overrides.exclude;
  if (overrides.plugins) merged.plugins = overrides.plugins;
  if (!overrides.rules) return merged;
  for (const key of Object.keys(overrides.rules) as Array<keyof RulesConfig>) {
    const patch = overrides.rules[key];
    if (!patch) continue;
    merged.rules[key] = { ...merged.rules[key], ...patch };
  }
  return merged;
}

