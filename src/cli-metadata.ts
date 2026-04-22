/**
 * Shared CLI metadata — lives outside `cli.ts` so non-CLI modules (the
 * shell-completion generator, editor integrations) can re-use the same
 * lists without pulling in commander.
 */

/** Pre-baked path sets for the `--client=<name>` convenience flag. */
export const CLIENT_PATHS: Record<string, string[]> = {
  cursor: ["~/.cursor/mcp.json", "**/.cursor/mcp.json"],
  "claude-desktop": [
    "~/Library/Application Support/Claude/claude_desktop_config.json",
    "~/.config/Claude/claude_desktop_config.json",
    "~/AppData/Roaming/Claude/claude_desktop_config.json",
    "**/claude_desktop_config.json",
  ],
  "claude-code": [
    "~/.claude.json",
    "**/.claude/mcp.json",
    "**/.mcp.json",
    "**/mcp.json",
  ],
  windsurf: [
    "~/.codeium/windsurf/mcp_config.json",
    "**/.codeium/windsurf/mcp_config.json",
  ],
  zed: ["~/.config/zed/settings.json"],
  cline: ["**/.cline/mcp.json", "**/cline_mcp_settings.json"],
};

export function pathsForClient(name: string): string[] | undefined {
  return CLIENT_PATHS[name];
}

export function knownClients(): string[] {
  return Object.keys(CLIENT_PATHS);
}
