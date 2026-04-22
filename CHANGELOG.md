# Changelog

All notable changes to `mcpcheck` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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
