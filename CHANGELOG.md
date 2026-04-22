# Changelog

All notable changes to `mcpcheck` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **VS Code snippets** — six ready-to-expand snippets for common MCP
  server shapes: filesystem (pinned npx), GitHub (docker + env
  substitution), stdio with env, remote SSE endpoint, uvx Python, and
  a top-level `mcpServers` skeleton. Type `mcp-filesystem` / `mcp-github`
  / `mcp-sse` / `mcp-uvx` / `mcp-stdio` / `mcp-skeleton` in a JSON /
  JSONC file and tab-complete through the placeholders.
- **Playground sample dropdown** — five built-in sample configs (broken
  kitchen sink, clean Claude Desktop, Cursor with remote SSE, Zed's
  `context_servers`, JSONC with comments) to switch between when
  showing the playground off. Replaces the single "Load sample" button.
- **`mcpcheck --explain all`** — dumps every rule's full docs
  (previously one rule per invocation).
- **`mcpcheck doctor`** — per-client health summary in one screen.
  Resolves each known MCP client (Claude Desktop, Claude Code, Cursor,
  Cline, Windsurf, Zed), picks the first candidate path that exists,
  runs `checkSource` + `stats`, and renders aligned lines like
  `✓  Claude Desktop  ~/Library/…  3 server(s), 0 issues`. Exits 1 if
  any installed client has an error-level issue. Think `brew doctor`.
- **Playground social preview** — OpenGraph + Twitter-Card + theme-color
  meta tags, canonical URL, and an inline-SVG favicon. Links to
  `mukundakatta.github.io/mcpcheck` now render nicely in Slack, Discord,
  Twitter, and Mastodon.
- **`extensions/rule-plugin-starter/`** — fork-me template for a custom
  rule pack. Ships one example rule (`my-org/no-beta-servers`), a
  Plugin default export, tsconfig, and test scaffold. The README walks
  through wiring it into `mcpcheck.config.json` via the plugins array.
- **`--format markdown`** — renders a GitHub-flavored Markdown report
  suitable for pasting into a PR comment or slack message (collapsed
  details block per file, severity emoji, autofix hint per issue).
- **`--format junit`** — emits JUnit XML so any CI that understands
  test-report uploads (GitHub Actions' publish-test-results,
  Buildkite, GitLab, CircleCI, Jenkins) can display mcpcheck findings
  in its test-report UI.
- **`mcpcheck stats <file...>`** — inventory summary of an MCP config:
  server count, stdio-vs-url split, runner mix (npx/uvx/docker/other),
  pinned-vs-unpinned count, how many servers declare `env`, how many
  are disabled. Rolls up a TOTAL across multiple files.
- **VS Code status-bar item** — compact `mcpcheck: 3E 2W (4⚡)` pill
  with the active file's error/warning counts and autofix count.
  Click to run `Fix all`. Background color flips to
  `statusBarItem.errorBackground` when errors are present.
- **`examples/github-actions/mcpcheck-pr-comment.yml`** — drop-in
  workflow that runs the Docker image, generates a Markdown report,
  and posts-or-updates a single PR comment with it (idempotent via a
  `<!-- mcpcheck-report -->` marker).
- **Docker image on ghcr.io** — `ghcr.io/mukundakatta/mcpcheck` builds
  on every main push (`:main`) and every semver tag (`:v1.2.3`,
  `:1.2`, `:1`, `:latest`). Multi-arch (linux/amd64 + linux/arm64),
  runs as a non-root user, `/work` is the expected mount point for the
  target repo. Image is built from the repo-local Dockerfile and the
  workflow smoke-tests `--list-rules` and `--version` after push, so a
  broken image never lands on the registry.
- **VS Code: hover shows rule docs** — hovering over any mcpcheck
  squiggle renders the matching rule's `--explain` output in the
  tooltip (MarkdownString), so users never have to click the rule-id
  link to understand what they're looking at.
- **VS Code: CodeLens at the top of every linted MCP config** — shows
  issue counts (`mcpcheck: 3 issue(s) (2 autofixable)`) plus a `Fix all`
  button (when fixes exist) and `Explain...` button. Makes the commands
  discoverable without the command palette.
- **`mcpcheck diff <a.json> <b.json>`** — compare the issues two MCP
  configs produce. Prints a `git diff`-style list of issues added and
  removed (identified by rule id + jsonPath + message), plus an
  unchanged count. Exits 1 when issues were added, 0 otherwise — drops
  right into a PR-review workflow that lints before/after.
- **"Did you mean X?" suggestions on unknown fields.** The
  `unknown-field` rule now runs a Levenshtein search against the
  `KNOWN_SERVER_FIELDS` set; for typos with edit distance ≤ 2
  (`commnad` → `command`, `autoApprve` → `autoApprove`) the error
  message appends a suggestion. Messages stay quiet when nothing is
  close enough.
- **3 more secret providers** — Cloudflare API tokens (`keyHint:
  CLOUDFLARE|CF_API|CF_TOKEN`), Datadog API keys (32-hex, `keyHint:
  DATADOG|DD_API|DD_KEY`), and Discord bot tokens (3-segment dotted
  format). Bringing coverage to 24 provider families.
- **VS Code `mcpcheck: Fix all autofixable issues across workspace`** —
  runs `findFiles` across `mcpcheck.filePatterns`, applies every autofix
  in every match, saves, and re-lints. Surfaces a summary notification
  (`fixed N issue(s) across M file(s)`) when done.
- **JSON Schema for MCP config files themselves** —
  `schema/mcp-config.schema.json` describes the shape of `mcp.json`,
  `.mcp.json`, `claude_desktop_config.json`, `cline_mcp_settings.json`,
  `.cursor/mcp.json`, `.codeium/windsurf/mcp_config.json`, `.claude/mcp.json`,
  and Zed's `context_servers`. The VS Code extension registers it via
  `jsonValidation` so users editing any of those files get autocomplete
  and inline errors (e.g. unknown `command`/`args`/`env`/`transport`
  typos). Playground dist mirrors it at `/mcp-config.schema.json`. A
  test pins that the schema's server properties exactly match
  `KNOWN_SERVER_FIELDS` in `src/rules/constants.ts`, so the two can't
  drift.
- **Benchmark script** — `npm run bench` times `checkSource` over 2000
  iterations (after warmup) and reports avg / p50 / p95 / p99. Median
  ~42µs per config on a mid-sized Mac.
- **Plugin end-to-end test** — the enterprise plugin's test suite now
  runs `checkSource` with plugin rules as `extraRules` and asserts both
  plugin and core built-in rules fire on the same config (12 pass).
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
