# CLAUDE.md

Guidance for Claude Code (and other LLM agents) working in this repo.

## Repo layout

```
src/                        CLI + library source (TypeScript, ESM, tsc → dist/)
  core.ts / core-fs.ts      pure checkSource / fs-bound checkFiles split
  config.ts / config-fs.ts  pure defaults+mergeConfig / fs-bound loadConfigFile
  browser.ts                fs-free barrel export for web/Worker/Deno
  rules/                    built-in rule implementations (one file per rule)
  rule-docs.ts              single source of truth for rule descriptions;
                            drives --explain, docs/RULES.md, schema descriptions
  formatters/               text, json, sarif, github, markdown, junit
  cli.ts                    commander wiring; subcommands handled pre-parse
tests/                      node:test via tsx; one fixture per real client shape
schema.json                 generated JSON schema for mcpcheck.config.json
schema/mcp-config.schema.json  hand-authored JSON schema for mcp.json configs
docs/RULES.md               generated rule reference (npm run docs:gen)
playground/                 static browser playground (esbuild-bundled)
extensions/vscode/          VS Code extension (esbuild-bundled)
extensions/enterprise-plugin/   policy-as-code plugin (allow/deny lists)
extensions/rule-plugin-starter/ template for custom rule packs
scripts/                    gen-rules-md, gen-schema, bench, check-licenses
.github/workflows/          CI (build, test, extension, playground, docker, pages, enterprise-plugin)
examples/github-actions/    drop-in workflow templates for users
```

## Invariants the CI enforces

- `docs/RULES.md` is generated from `src/rule-docs.ts` (`npm run docs:check`)
- `schema.json` is generated from `RulesConfig` + `RULE_DOCS` (`npm run schema:check`)
- `schema/mcp-config.schema.json`'s server properties match
  `KNOWN_SERVER_FIELDS` exactly (pinned by `tests/core.test.ts`)
- Every sub-package ships with a `LICENSE` file (`npm run licenses:check`)
- Scaffolded `mcpcheck init` config matches the in-code defaults exactly
- VSIX contains `out/extension.cjs` + both JSON schemas
- Playground dist contains both JSON schemas and mcpcheck rules are in the bundle

Adding a new rule? You need to touch:
1. `src/rules/<your-rule>.ts` — the implementation
2. `src/rules/index.ts` — add to `BUILTIN_RULES`
3. `src/types.ts` + `src/config.ts` — add the config key
4. `src/rule-docs.ts` — add a `RuleDoc` entry (docs + schema regenerate)
5. `tests/core.test.ts` — positive + negative cases
6. `CHANGELOG.md` — entry under `[Unreleased]`

CI will fail on docs/schema drift if you skip 4.

## Commit / PR style

- Commit messages: one-line imperative subject, body optional. No
  Conventional Commit prefixes; see `git log` for the house style.
- **Never** add Claude / Anthropic as co-author to commits in this repo.
  Commits represent the human maintainer.
- Sub-packages have their own lifecycle: when touching
  `extensions/vscode`, rebuild + type-check there; same for
  `playground/` and the plugins. CI has a job for each.

## Fixtures that match secret regexes

`tests/fixtures/*.json` and inline secret tests in `tests/core.test.ts`
deliberately contain values that match the `hardcoded-secret` patterns —
that's the point of a secret linter. These are **synthetic** and GitHub
push protection has rejected PRs that used real-looking values (e.g.,
Discord tokens with real snowflake IDs). When adding a new secret
provider test, pick a placeholder like `"FAKEFAKEFAKE…"` or
`"a".repeat(N)` that matches the regex but clearly isn't a real token.

## Publishing

Publishing is **never** automatic. Version bumps, tagging, `npm publish`,
and `vsce publish` are all explicit maintainer actions. Don't bump
versions in a refactor PR. Don't tag releases without being asked.

The Docker image (`ghcr.io/mukundakatta/mcpcheck`) publishes
automatically on `main` pushes and semver tags — that's the only
auto-publish channel.

## When in doubt

Look at `CONTRIBUTING.md` for the per-sub-package lifecycle and the
PR checklist. `docs/RULES.md` lists every rule with examples.
`npm run bench` gives you concrete perf numbers.
