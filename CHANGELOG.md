# Changelog

All notable changes to `mcpcheck` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **`mcpcheck audit <file...>`** — combined report: list-servers +
  stats + lint findings in one pass, one screen.
- **New rule: `duplicate-image`** (warning) — two servers resolve
  to the same `docker run image:tag`. Usually a copy-paste leftover.
  27 built-in rules.
- **3 more secret providers** — Databricks (`dapi…`), Bitbucket
  app passwords (context-scoped), Freshdesk (context-scoped).
- **New rule: `secret-in-args`** (error) — `hardcoded-secret` only
  scanned `env`; this rule catches the other half where users
  paste `mcp-server-foo --token sk-abc…` into `args`. Same
  secret-pattern set, skipping keyHint-scoped patterns since
  there's no env-name context. 26 built-in rules.
- **3 more providers** — Airtable personal access tokens (`pat…`),
  Vercel Blob tokens (`vercel_blob_(rw|ro)_…`), Lambda Labs
  (`secret_…`, context-scoped to `LAMBDA`).
- **`--strict`** — alias for `--profile strict`. Errors cleanly if
  combined with a conflicting `--profile`.
- **`--color=always|never|auto`** + `--no-color` alias + respect for
  `NO_COLOR` and `FORCE_COLOR` env vars. A `color-boot.ts` shim
  imported before picocolors locks in the right mode at module-load
  time so `mcpcheck ... --no-color | less` stays ANSI-clean.
- **`mcpcheck why <rule-id>`** — friendlier alias for
  `--explain <rule-id>`. Same output, more natural invocation.
- **2 more secret providers** — Modal auth tokens (`ak-…` /
  `as-…`), Helicone (`sk-helicone-…`).
- **Richer `--help`** — the top-level help now also lists every
  subcommand by name under a "Subcommands" section so `mcpcheck
  --help` surfaces what's available without grepping the CHANGELOG.
- **`mcpcheck list-servers <file...>`** — one row per server across
  every input file with columns for file, name, transport, target
  (npx package / docker image / url hostname), pinned-ness,
  disabled. Complements `stats` (counts) and `graph` (diagram).
- **New rule: `cwd-not-absolute`** (warning) — `cwd` field is a
  relative path. Same cross-client-inconsistency story as
  `relative-path` for `command`. 25 built-in rules.
- **`--sort-by <severity|rule|line|file>`** — stable sort within
  each file. Easier to eyeball "all the errors together" output.
- **New rule: `empty-env-value`** (warning) — `"API_KEY": ""` is
  different from omitting the key: the subprocess sees the variable
  with value `""`. Causes "sometimes auth, sometimes not" inconsistency
  between libraries that check `if (VAR)` vs `if (VAR !== undefined)`.
  24 built-in rules.
- **3 more providers** — Stripe webhook secrets (`whsec_…`), Slack
  incoming-webhook URLs (`hooks.slack.com/services/T…/B…/…`), Asana
  personal access tokens.
- **`.github/workflows/release.yml`** — on any `v*` tag push, runs
  install + build + tests then creates a GitHub release with notes
  extracted from the matching `## [version]` section of
  `CHANGELOG.md`. Safe-by-default: only fires on tags, never on
  branch pushes.
- **New rule: `plaintext-http-with-token`** (error) — fires only on
  the third quadrant that the existing URL rules miss: http:// URL
  to a non-local host AND an `Authorization` / `X-API-Key` /
  `Cookie` / similar credential header. That token rides in
  cleartext.
- **New rule: `invalid-env-var-name`** (warning) — env key doesn't
  match POSIX `[A-Z_][A-Z0-9_]*`. Mixed case / hyphens / leading
  digits silently drop in some shells. 23 built-in rules now.
- **`mcpcheck scaffold-workflow [--force]`** — copies
  `examples/github-actions/mcpcheck-pr-comment.yml` into
  `.github/workflows/` so a brand-new repo gets lint + PR comments
  in one command.
- **2 more secret providers** — Anyscale (`esecret_…`), Inngest
  signing keys (`signkey-(prod|branch|test)-…`).
- **New rule: `placeholder-value`** (error) — flags env values that
  look like template text: `YOUR_API_KEY_HERE`, `<token>`, `xxx…`,
  `replace-me`, `TODO`, `PLACEHOLDER`, `changeme`. Doesn't trip
  `hardcoded-secret` (wrong format) so pre-this-release a lint pass
  could miss half-finished configs entirely. 21 built-in rules now.
- **`mcpcheck fmt <file...>` / `--write`** — pretty-print 2-space,
  sort server-map keys alphabetically, newline at EOF. Preserves
  unrelated top-level keys so `zed/settings.json`-style configs
  don't lose unrelated state.
- **`mcpcheck graph <file...>`** — emit a Mermaid flowchart of the
  server topology. Stdio servers render as rectangles, url servers
  as rounded rects, disabled servers dimmed with dashed stroke.
  Drop into a README in one cp-paste.
- **2 more secret providers** — Pinecone API keys (UUID-shaped,
  context-scoped), Supabase personal access tokens (`sbp_…`).
- **CLI filter flags** — `--exclude-rule <id>` (repeatable),
  `--only-rule <id>` (repeatable), and `--only-fixable` drop matching
  issues before formatting and exit-code evaluation. Lets CI pipelines
  gate on a specific rule, or a security-focused team drop informational
  findings without touching mcpcheck.config.json.
- **New rule: `empty-args`** (warning) — `npx`/`uvx`/`docker`/shell
  commands with `args: []` get flagged. Almost always a half-edited
  config where the package name or subcommand was dropped. 20
  built-in rules now.
- **3 more secret providers** — Intercom access tokens
  (context-scoped), Segment write keys (context-scoped), Retool
  access tokens (`retool_…`).
- **`mcpcheck pipe`** — reads a config from stdin, lints it, writes the
  formatted report to stdout. All formatters work. Exits 1 on any
  error finding. `git show HEAD:mcp.json | mcpcheck pipe --format json`
  no longer needs a temp file.
- **`--format csv`** — one row per issue with a stable header
  (`file,line,severity,rule,message,json_path,autofix_available`).
  RFC-4180 quoted. For bulk audits piped into a spreadsheet.
- **New rule: `typosquat-package`** (error) — `npx` / `uvx` package
  names within edit distance 3 of an official `@modelcontextprotocol/*`
  server get flagged. Scoped only to MCP-adjacent candidates (names
  containing `mcp`, `server-`, `context`, or starting with `@mod…`)
  so legitimate third-party servers don't trip it. 19 built-in rules.
- **Expanded `unstable-reference` mutable-tag detection.** In addition
  to `:latest` and missing-tag, the rule now flags `:beta`, `:dev`,
  `:develop`, `:nightly`, `:canary`, `:edge`, `:snapshot`, `:main`,
  `:master`, and `:rc[-.]*` Docker tags. Tag detection is scoped
  past the registry-port colon (so `registry:5000/img:1.0` is still
  read correctly).
- **New rule: `shell-metachars`** (error) — `command` contains
  `|`, `;`, `$(…)`, backticks, `&&`/`||`, `&`, or `$VAR` but isn't
  itself a shell (bash/sh/zsh/fish/ksh/dash/pwsh/powershell/cmd).
  MCP clients don't invoke a shell, so the metacharacters are
  passed as literal argv and the pipeline never runs. 18 built-in
  rules.
- **`--format html`** — self-contained single-file HTML report
  with inline CSS, rule-id anchor links to docs/RULES.md, and dark-
  mode support. Ideal for CI artifact uploads.
- **3 more secret providers** — OpenAI session tokens (`sess-`),
  Cohere API keys (context-scoped to `COHERE`), AI21 Labs keys
  (context-scoped to `AI21`).
- **MCP server: `resources/list` + `resources/read`** — the recursive
  MCP server now exposes every built-in rule as a resource under
  `mcpcheck://rules/<id>` with `mimeType: text/markdown`. Clients
  that show an MCP resource browser can list / preview rule docs
  without having to invoke a tool. Initialize advertises
  `resources: {}` in capabilities.
- **`mcpcheck --diff-only [base]`** — restricts the scan to files
  changed vs `base` (default `HEAD`, using `git diff --name-only`).
  No-op with a clear warning if the cwd isn't a git repo. Drops
  PR-review workflows to linting only what the PR actually touched.
- **New rule: `duplicate-env-key`** (warning) — two env var names
  that differ only by case (`API_KEY` vs `ApiKey`). Both get handed
  to the subprocess; only one is read; that's almost always a
  typo. 17 built-in rules now.
- **MCP server: `prompts/list` + `prompts/get`** — the recursive MCP
  server now advertises three prompts in addition to its tools:
  `lint_my_config`, `fix_my_config` (walks through autofixes with a
  confirm step), and `audit_my_setup` (loops every installed client).
  MCP clients can surface these in their slash-command / quick-action
  menus. The spawn test now exercises initialize + tools/call +
  prompts/list in one run (88 tests, up from 87). Capabilities
  advertised in the initialize response include `prompts: {}` so
  older clients that check capabilities route correctly.
- **`mcpcheck snapshot <file...>`** and **`mcpcheck restore <file...>`**
  — one-line safety net before `--fix` or `upgrade-pins`. Snapshot
  copies each file to `<file>.mcpcheck-bak`; restore copies back.
  Kept the backup after restore so you can iterate.
- **3 more secret providers** — Sentry DSNs (URL form with inline
  client key), Alibaba Cloud AccessKey (`LTAI…`, context-scoped to
  ALIYUN/ALIBABA env names), Tencent Cloud SecretId (`AKID…`).
  33 distinct prefix families.
- **`.mcpcheckignore`** — gitignore-style file in the cwd that removes
  matching paths from the input list. Supports `#` comments, `**`
  across slashes, `*` within a segment, leading `!` to re-include,
  trailing `/` for dir-only. Resolved against paths relative to cwd;
  paths outside cwd match against the basename.
- **Global config `~/.mcpcheck/config.json`** — layers *under* any
  `--config` the user passes, so you can turn a rule off once per
  machine instead of duplicating `mcpcheck.config.json` in every
  repo. Missing or malformed global config silently falls through
  to defaults.
- **`mcpcheck version`** — subcommand, not just the flag. Emits JSON
  (`name`, `version`, `ruleCount`, `rules`, `schemas`) for tools
  that want to assert a minimum-rule-count in CI or pin a specific
  mcpcheck version against the rules they depend on.
- **LSP: Quick Fix + Hover** — the LSP server now advertises
  `codeActionProvider` (quickfix + source.fixAll) and `hoverProvider`.
  In any LSP-capable editor, overlap a secret diagnostic → Quick Fix
  replaces the value with `${VAR}` just like the VS Code extension.
  Multiple fixable issues in one file also surface a single
  "fix all autofixable" source action. Hover over a squiggle → rule
  docs render from the same source as `--explain` / docs/RULES.md.
- **New rule: `http-without-auth`** (warning) — URL-transport server
  targeting an https endpoint with no `Authorization` header. Real
  remote MCP servers almost always need a bearer token; a config
  shipping without one is usually a forgotten env substitution. Plain
  http is still handled by `invalid-url`; this rule only looks at
  https. 16 built-in rules now.
- **Homebrew formula template** — `packaging/homebrew/mcpcheck.rb`
  plus a README that walks through publishing a tap
  (`brew tap MukundaKatta/mcpcheck && brew install mcpcheck`) once
  the CLI is on npm. Bump procedure is three shell lines.
- **`mcpcheck lsp`** — Language Server Protocol server on stdio.
  Neovim, Helix, Emacs (eglot), Zed, Sublime, Kate, and every other
  LSP-capable editor now gets mcpcheck diagnostics with no plugin.
  Implements the minimum lifecycle (`initialize` / `initialized` /
  `shutdown` / `exit`), full-sync `textDocument/didOpen` / `didChange` /
  `didSave` / `didClose`, and publishes `textDocument/publishDiagnostics`
  with precise ranges (via `locate()`), rule id as `code`, severity
  mapped to LSP levels (error=1, warning=2, info=3), and `mcpcheck`
  as `source`. Spawn-based integration test pins the
  initialize→didOpen→publishDiagnostics flow over Content-Length
  framing (86 tests, up from 85). README has copy-pasteable setup
  blocks for Neovim lspconfig, Helix, Zed, and Emacs eglot.
- **`mcpcheck mcp-server`** — run mcpcheck *as* an MCP server so
  Claude Code / Cursor / any MCP-capable client can call it. Exposes
  five tools: `lint_config`, `explain_rule`, `list_rules`,
  `fix_config` (with optional `write=true`), and `stats_config`.
  JSON-RPC 2.0 over stdio, newline-delimited, no network. Spawn test
  (initialize → tools/list → tools/call) pins the protocol shape
  (85 core tests, up from 81).
- **4 more secret providers** — Auth0 client secrets (context-scoped
  to `AUTH0_CLIENT_SECRET`-style env names), PlanetScale OAuth + API
  tokens (`pscale_…`), Supabase service_role / anon JWTs
  (context-scoped to env names containing `SUPABASE`). Clerk uses
  the same `sk_live_…` / `sk_test_…` prefix as Stripe, so it's
  already covered by the Stripe pattern. 33 patterns now (actually
  matching 30 distinct prefix families).
- **`mcpcheck merge <a.json> <b.json> [...]`** — union two or more
  MCP configs. Server maps combine; on name collisions, later files
  win. If inputs use different server-map keys (`mcpServers` vs
  `context_servers`), the merged output collapses them under the
  canonical `mcpServers` key so the result is a valid single config.
  `--output <path>` writes to disk, else stdout.
- **`mcpcheck convert <file.json> --to <client>`** — rewrite the
  top-level server key to match a client's convention. Targets:
  `claude-desktop`, `claude-code`, `cursor`, `cline`, `windsurf`,
  `zed` (uses `context_servers`), `generic` (uses `servers`). Unrelated
  top-level keys are preserved, so `zed/settings.json`-style
  configs convert cleanly.
- **`mcpcheck --print-config`** — dumps the effective merged config
  (defaults + `--profile` + `--config`) to stdout and exits. Useful
  for debugging why a rule is firing at an unexpected severity.
- **6 more secret providers** — PostgreSQL / MongoDB URIs with
  embedded `user:password@host` credentials, Figma personal access
  tokens (`figd_…`), Notion integration tokens (`secret_…43`), Linear
  API keys (`lin_api_…`), and Sentry auth tokens (`sntrys_…`). 30
  provider families now.
- **`mcpcheck --profile <strict|permissive|ci>`** — opinionated
  severity bundles on top of the defaults. `strict` escalates hygiene
  rules to error, `permissive` drops them to info (security-critical
  rules stay at error), `ci` is defaults plus `unknown-field=error`.
  Profile applies before an explicit `--config`, so a user can take
  `--profile strict` and still relax a single rule.
- **`mcpcheck doctor --fix`** — runs `doctor`'s per-client scan, then
  applies every autofix across whichever client configs exist. Re-
  checks after writes so the status reflects the fixed state.
- **npm audit in CI** — the main build job now fails on
  `--audit-level=moderate`. Catches vulnerable dev deps before they
  can ship alongside the library.
- **`docs/ANNOUNCE.md`** — pre-written HN, Reddit, and Twitter launch
  copy, plus a suggested posting order and a long-form Dev.to outline.
  Paste-ready the day `npm publish` ships.
- **`mcpcheck completions <bash|zsh|fish>`** — prints a shell completion
  script. Tab-completes subcommands, flags, enum values (`--format`,
  `--fail-on`, `--client`), rule ids for `--explain`, and `.json` files
  for path-taking flags. Rule ids and client names are inlined at
  generation time so completion stays cold-start-fast.
- **`.pre-commit-hooks.yaml`** — downstream users can now add mcpcheck
  to pre-commit.com with a two-line config (`repo:
  https://github.com/MukundaKatta/mcpcheck`, `id: mcpcheck`). Exposes
  a check-only hook and an autofix-on-commit hook; both scope to
  the known MCP config filename patterns.
- **Repo-level `CLAUDE.md`** — layout map, CI invariants, the
  "adding a rule" 6-step checklist, the secret-fixture /
  push-protection gotcha, and explicit "do not bump versions or add
  Claude as co-author" guardrails.
- **`docs/API.md`** — programmatic API reference: `checkSource`,
  `applyFixes`, `checkFiles`, `locate`, `explainRule`, formatters,
  writing a plugin, the `mcpcheck/browser` subpath, and an explicit
  stability callout for `Issue` / `Fix` / `Plugin` / `Rule`.
- **`src/cli-metadata.ts`** extracts `CLIENT_PATHS` / `pathsForClient`
  / `knownClients` out of `cli.ts` so non-CLI modules (completions,
  editors) can reuse the same lists without pulling in commander.
  Re-exported from the package root.
- **`mcpcheck upgrade-pins <file...>`** — for every unpinned
  `npx <pkg>` / `uvx <pkg>` in the given configs, look up the latest
  version on npm / PyPI and rewrite the package reference in place
  (`--write`) or preview the changes (default dry-run). Docker images
  are skipped for now — Docker Hub / ghcr.io auth-and-rate-limit is
  different enough to deserve its own flag later. Rewrites preserve
  the file's JSONC formatting (comments and whitespace) via raw-source
  string-literal replacement, so you can run it against
  `claude_desktop_config.json`-style commented configs without losing
  your comments.
- **`mcpcheck --watch`** / **`-w`** — stays resident and re-runs the
  scan on every input-file change (fs.watch, 150ms debounce). Ctrl-C
  to exit. For iterative dev, not CI; does not exit on issues.
- **`npm run licenses:check` + CI gate** — fails the build if any
  sub-package (`extensions/*`, root) ships without a LICENSE file.
  Backfilled LICENSE into `extensions/rule-plugin-starter/`.
- **`mcpcheck --baseline` / `--baseline-write`** — adopt mcpcheck on a
  codebase with existing issues without asking the team to fix
  everything at once. `--baseline-write` snapshots today's issues to
  `.mcpcheck.baseline.json` (or a custom path). `--baseline` suppresses
  everything already in that file, so CI only fails on new issues. Keyed
  by `(file, ruleId, jsonPath)` — rewording a diagnostic's message won't
  invalidate your baseline, but renaming a server will (and that's
  correct; the finding is genuinely different).
- **OSS hygiene** — `SECURITY.md` (private advisory workflow, scope,
  non-secret-test-fixture note), `CONTRIBUTING.md` (dev setup,
  per-subpackage lifecycle, PR checklist, commit style), and
  `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.yml`
  (structured issue forms + contact-links to the playground and
  SECURITY advisory flow).
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
