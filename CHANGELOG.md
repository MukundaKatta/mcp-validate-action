# Changelog

All notable changes to `mcpcheck` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Policy-as-code plugin** — `extensions/enterprise-plugin/` ships
  `@mcpcheck/enterprise`, a plugin loadable via `config.plugins` that
  adds three rules: `enterprise/allowed-command`, `enterprise/denied-image`,
  and `enterprise/allowed-package`. Policy lives in a separate
  `.mcpcheck.enterprise.json` next to `mcpcheck.config.json`; missing or
  empty lists disable the corresponding rule. 11 tests cover exact / glob
  matches, version-suffix stripping, scoped packages, and docker argv
  parsing.
- **`--client=<name>` flag** — `mcpcheck --client cursor`
  (`claude-desktop`, `claude-code`, `windsurf`, `zed`, `cline`) scans only
  that client's paths. Replaces the need to remember the right glob when
  debugging one setup.
- **5 more secret providers** — Mailgun (`key-…`), Replicate (`r8_…`),
  Perplexity (`pplx-…`), Groq (`gsk_…`), xAI / Grok (`xai-…`). All AI
  providers MCP servers commonly wrap.
- **VS Code: `Explain rule` picks up the rule under the cursor** — with
  no argument, the command now reads the active editor's cursor position,
  finds the nearest mcpcheck diagnostic, and opens its docs. Falls back
  to the old quickpick when the cursor isn't on a finding.
- **JSON Schema for `mcpcheck.config.json`** — a generated `schema.json`
  (committed at the repo root and also served by the playground at
  `schema.json`) gives autocomplete, inline validation, and rule
  descriptions in every editor that understands JSON Schema (VS Code,
  JetBrains, Neovim with jsonls). `mcpcheck init`-generated configs ship
  with a matching `$schema` pointer. The VS Code extension registers the
  schema via `contributes.jsonValidation` so it applies automatically to
  `mcpcheck.config.json` / `.mcpcheck.json` even without `$schema`. New
  `npm run schema:gen` / `schema:check` scripts keep the schema in sync
  with `RulesConfig`; CI and `prepublishOnly` refuse to land a change that
  drifts.
- **Web playground** — `playground/` ships a static site that lints an MCP
  config live in the browser. Paste / type a config, see diagnostics with
  precise line numbers and clickable rule-id code links, hit "Fix all" to
  apply every autofix. Same engine as CLI / GH Action / VS Code extension;
  nothing leaves the browser. Auto-deployed to GitHub Pages via a new
  `pages.yml` workflow.
- **`mcpcheck/browser` subpath export** — a dedicated browser-safe entry
  that re-exports `checkSource`, `applyFixes`, `locate`, `parseJsonc`,
  `explainRule`, `RULE_DOCS`, and the built-in rules with zero `node:*`
  dependencies, so downstream web apps, workers, and Deno can embed
  mcpcheck without shimming `node:fs`.
- **`core-fs.ts` / `config-fs.ts`** — internal split separating the
  fs-dependent helpers (`checkFiles`, `loadConfigFile`) from the pure
  ones. No change to the public Node-facing API: `import { checkFiles,
  loadConfigFile } from "mcpcheck"` still works.
- **VS Code extension** — `extensions/vscode/` ships `mcpcheck-vscode`, a
  self-contained extension that runs the same rules inline while you edit
  MCP configs. Provides a Quick Fix for hardcoded secrets, a
  `mcpcheck: Fix all` command, and a `mcpcheck: Explain rule...` command
  that opens the rule docs in a Markdown preview. Diagnostics link
  directly to per-rule documentation via the rule-id code link.
  mcpcheck is bundled into the extension via esbuild; no external CLI
  install required.
- **Public API additions for embedders** — `locate`, `parseJsonc`,
  `stripJsonc`, `explainRule`, `listRuleIds`, and `RULE_DOCS` are now
  exported from the package root so downstream tools (including the VS
  Code extension) can render diagnostics with precise byte offsets and
  self-documenting rule metadata.
- **`mcpcheck init`** — scaffold `mcpcheck.config.json` (with every rule
  spelled out at its default) and `.github/workflows/mcpcheck.yml` (runs
  mcpcheck on every PR, uploads SARIF to Code Scanning). `--config-only`,
  `--workflow-only`, and `--force` control scope and overwrite behaviour.
- **`-q`, `--quiet`** — in text output, hide files with zero issues while
  keeping aggregate counts. JSON / SARIF / GitHub formats are unchanged
  (they're consumed by other tools and must stay deterministic).
- **CLI examples in `--help`.**
- **Graceful error for bad `--config`.** A malformed `mcpcheck.config.json`
  now exits with a clear `Failed to load --config file …` message instead
  of an opaque stack trace.
- **`dangerous-command` rule (default: error).** Flags privilege escalation
  (`sudo`, `doas`, `pkexec`, `runas`, `gosu`, `su`), remote-shell pipes
  (`curl https://... | sh`, also detected through `bash -c` / `sh -c`
  wrappers), docker `--privileged`, host-root bind mounts (`-v /:/host`,
  `--mount source=/,...`), `--unsafe-perm` / `--allow-run-as-root` flags,
  and literal `rm -rf /` sequences in `args`.
- **More secret providers.** Added GitLab PATs (`glpat-`), Twilio API keys
  (`SK` + 32 hex), SendGrid keys (`SG.…`), Hugging Face tokens (`hf_`),
  npm access tokens (`npm_`), Stripe restricted keys (`rk_live_` /
  `rk_test_`), and Google Cloud service-account JSON blobs pasted into an
  env value (detected via the `private_key_id` signature).
- **`mcpcheck --explain <rule-id>`** and **`mcpcheck --list-rules`.** Print
  per-rule documentation directly from the CLI. The docs are generated from
  the same source as [docs/RULES.md](docs/RULES.md), so the two cannot drift.
- **`docs/RULES.md`** generated rule reference plus `npm run docs:gen` /
  `npm run docs:check`; `prepublishOnly` now refuses to publish if the
  generated docs are out of date.
- **Zed support.** `context_servers` (Zed's key inside `~/.config/zed/settings.json`)
  is recognised as a valid server map; Zed configs previously fell through to
  `empty-servers` and skipped every per-server rule.
- **JSONC tolerance.** Line comments (`// ...`), block comments (`/* ... */`),
  and trailing commas are stripped before JSON parsing. Matches the lenient
  parser used by Claude Desktop, Cursor, and VS Code. Line numbers in
  diagnostics are preserved.
- **Auto-discovery of per-user config paths.** Running `mcpcheck` with no
  arguments now also scans known locations for Claude Desktop (macOS / Linux /
  Windows), Claude Code (`~/.claude.json`), Cursor, Windsurf, and Zed.
- **Tilde expansion.** `~/foo.json` and `~/.cursor/mcp.json` passed as explicit
  arguments are expanded to the user's home directory.
- **Docker image detection.** The `unstable-reference` rule now understands
  `docker run [flags] image[:tag]` syntax: it skips the `run` / `exec` / `pull`
  subcommand and flag values (`-e`, `-v`, `--env-file`, …) and finds the actual
  image argument. Previously `docker run image:1.0.0` was misreported as
  "`docker run` unpinned".

### Changed

- **Azure OpenAI secret heuristic is now context-scoped.** The 32-char hex
  pattern only fires when the env var name suggests Azure / OpenAI / Cognitive
  Services (e.g. `AZURE_OPENAI_API_KEY`, `OAI_KEY`). Previously it flagged
  every MD5 hash and UUID-hex value as a secret.

### Documentation

- README supported-clients table now lists each client's top-level key and
  real per-OS config paths (including Windows `%APPDATA%` and Linux XDG paths
  for Claude Desktop).
- README lists JSONC tolerance and secret-provider coverage up front.
- Added a "build from source" install path for users who want to run mcpcheck
  before the npm package is published.

## [1.0.0] - 2026-04-21

### Added

- Initial TypeScript rewrite: CLI, programmatic API, GitHub Action.
- 13 built-in rules covering structural, transport, env, URL, and
  reference-stability checks.
- SARIF 2.1.0 formatter for GitHub Code Scanning.
- Plugin system for custom rule packs.
- Autofix for `hardcoded-secret` (replaces the string with `${VAR}`
  substitution).

## [0.1.0] - 2026-04-20

### Added

- Initial release.
