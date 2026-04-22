# Changelog

All notable changes to the mcpcheck VS Code extension.

## [0.1.0] — Unreleased

### Added

- Initial release.
- Inline linting for MCP config files (`mcp.json`, `.mcp.json`,
  `claude_desktop_config.json`, `cline_mcp_settings.json`,
  `.cursor/mcp.json`, `.codeium/windsurf/mcp_config.json`, `.claude.json`,
  `.claude/mcp.json`). File patterns configurable via `mcpcheck.filePatterns`.
- Quick Fix for hardcoded secrets (replaces the value with `${VAR}`).
- `mcpcheck: Fix all autofixable issues in active file` command plus a
  per-file Source Fix All code action when more than one fix applies.
- `mcpcheck: Explain rule...` command — pick any rule by id and open its
  documentation in a Markdown preview.
- `mcpcheck.runOn` setting (`onType` / `onSave`).
- Every diagnostic is linked to its rule documentation via a clickable
  rule-id code link.
- JSON Schema for `mcpcheck.config.json` and `.mcpcheck.json` is
  contributed via `jsonValidation`, giving autocomplete, inline errors,
  and rule descriptions while editing the config.
- JSON Schema for **MCP config files themselves** (mcp.json,
  claude_desktop_config.json, cline_mcp_settings.json, .cursor/mcp.json,
  .codeium/windsurf/mcp_config.json, .claude/mcp.json, .claude.json) is
  now registered. Editing any of those files gives autocomplete for
  `command`/`args`/`env`/`transport`/`url`, inline errors on unknown
  fields, and hover descriptions.
- "Explain rule..." with no argument now reads the diagnostic under the
  cursor and opens its docs. Falls back to the quickpick only when the
  cursor isn't on an mcpcheck finding.
- New command: `mcpcheck: Fix all autofixable issues across workspace`.
  Finds every MCP config in the workspace (per `mcpcheck.filePatterns`),
  applies every available autofix, saves the file, and re-lints.
- **Hover** over any mcpcheck squiggle now shows the matching rule's
  full documentation (title + summary + details) in the tooltip.
- **CodeLens** at the top of every linted MCP config file shows the
  issue count and surfaces `Fix all` / `Explain...` buttons inline, so
  commands are discoverable without the command palette.
