# mcpcheck

[![npm](https://img.shields.io/npm/v/mcpcheck.svg)](https://www.npmjs.com/package/mcpcheck)
[![CI](https://github.com/MukundaKatta/mcpcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/MukundaKatta/mcpcheck/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A linter for **MCP (Model Context Protocol)** config files. Works on every client that reads `mcp.json` / `.mcp.json` / `claude_desktop_config.json` / Zed's `context_servers`: Claude Desktop, Claude Code, Cursor, Cline, Windsurf, Zed.

Fast: median **~42µs per config** on a mid-sized Mac (`npm run bench`) — thousands of files per second, no cache required.

**Try it live:** [`mukundakatta.github.io/mcpcheck`](https://mukundakatta.github.io/mcpcheck/) — paste a config, see diagnostics, apply autofixes, all in-browser.

- **CLI** — `mcpcheck` auto-discovers configs for each client or lints anything you glob at it.
- **Web playground** — paste a config in your browser, see diagnostics and Quick Fixes live. See [playground/](./playground).
- **VS Code extension** — inline diagnostics and Quick Fixes while you edit your MCP config. See [extensions/vscode/](./extensions/vscode).
- **GitHub Action** — inline PR annotations + SARIF for Code Scanning.
- **Autofix** — replaces hardcoded secrets with `${VAR}` interpolation.
- **Secret detection** — OpenAI, Anthropic, GitHub, GitLab, Slack, AWS, Stripe, Twilio, SendGrid, Hugging Face, npm, Google AI, Google Cloud service JSON, and context-scoped Azure OpenAI keys.
- **Dangerous-command detection** — `sudo`, `curl | sh`, docker `--privileged`, host-root mounts, `--unsafe-perm`.
- **JSONC-tolerant** — comments and trailing commas are accepted, matching what Claude Desktop and Cursor actually parse.
- **Programmatic API** — compose rules into your own pipeline.

```
$ mcpcheck
.cursor/mcp.json
  line 14   error   hardcoded-secret
    Server "github" env.GITHUB_TOKEN looks like a hardcoded GitHub personal token.
    at mcpServers.github.env.GITHUB_TOKEN
    fix: Replace hardcoded secret with ${GITHUB_TOKEN} env-var substitution
  line 22   warning relative-path
    Server "local" command "./scripts/run.sh" is a relative path.
    at mcpServers.local.command

Checked 1 file(s) in 3ms: 1 error, 1 warning.
```

## Install

```bash
npm install -g mcpcheck
```

Or one-off:

```bash
npx mcpcheck
```

Or build from source:

```bash
git clone https://github.com/MukundaKatta/mcpcheck
cd mcpcheck
npm install
npm run build
node dist/cli.js        # same behavior as `mcpcheck`
```

Or Docker:

```bash
docker run --rm -v "$PWD:/work" -w /work ghcr.io/mukundakatta/mcpcheck
docker run --rm -v "$PWD:/work" -w /work ghcr.io/mukundakatta/mcpcheck mcp.json --format sarif
```

Tags: `:latest`, `:main`, `:vYYYY.M.D`. Multi-arch (`linux/amd64` + `linux/arm64`).

## Usage

### CLI

```bash
mcpcheck                                     # scan common MCP config paths
mcpcheck ~/.cursor/mcp.json                  # single file
mcpcheck --client cursor                     # only this client's paths
mcpcheck '**/mcp.json' --format sarif        # emit SARIF for Code Scanning
mcpcheck config.json --fix                   # apply autofixes in place
mcpcheck config.json --fail-on warning       # strict CI
mcpcheck --quiet                             # only show files that have issues
mcpcheck --explain hardcoded-secret          # print docs for one rule
mcpcheck --list-rules                        # list every built-in rule id
mcpcheck init                                # scaffold mcpcheck.config.json + CI
mcpcheck diff a.json b.json                  # show which issues changed between two configs
mcpcheck --baseline-write                    # snapshot today's issues
mcpcheck --baseline                          # in CI: fail only on new issues
mcpcheck upgrade-pins mcp.json --write       # pin every unpinned npx/uvx pkg
mcpcheck --watch mcp.json                    # re-run on file change
```

| Flag | Purpose |
|---|---|
| `--format text\|json\|sarif\|github` | Output format (default `text`) |
| `--fix` | Apply autofixes in place (secret to `${VAR}` substitution) |
| `--config <path>` | JSON config file |
| `--fail-on error\|warning\|info\|never` | Exit-code threshold (default `error`) |
| `--output <path>` | Write formatted output to a file |
| `-q`, `--quiet` | In text output, hide files with no issues |
| `--client <name>` | Scan only one client's paths: `cursor`, `claude-desktop`, `claude-code`, `windsurf`, `zed`, `cline` |
| `--explain <rule-id>` | Print rule docs and exit |
| `--list-rules` | List built-in rule ids and exit |
| `-v`, `--version` | Print version |

### `mcpcheck init`

Scaffold a project's lint setup in one command:

```bash
mcpcheck init                  # writes mcpcheck.config.json + .github/workflows/mcpcheck.yml
mcpcheck init --config-only    # only the config file
mcpcheck init --workflow-only  # only the GH Actions workflow
mcpcheck init --force          # overwrite existing files
```

The generated workflow runs mcpcheck on every PR that touches an MCP config and uploads SARIF so findings appear in your repo's Security tab.

### GitHub Action

```yaml
# .github/workflows/mcpcheck.yml
name: mcpcheck
on: [pull_request]
permissions:
  contents: read
  pull-requests: write
  security-events: write
jobs:
  mcpcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: MukundaKatta/mcpcheck@v1
        with:
          paths: '**/mcp.json **/claude_desktop_config.json'
          fail-on: error
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: mcpcheck.sarif
```

What this does:

1. Emits inline PR annotations via `::error`/`::warning` on the exact line of each offending field.
2. Writes SARIF 2.1.0 so Code Scanning picks it up (Security tab + annotations that persist across PR updates).
3. Fails the job based on `fail-on`.

### Programmatic

```ts
import { checkSource, applyFixes } from "mcpcheck";

const report = checkSource(json, "mcp.json");
console.log(report.issues);

const { output, applied } = applyFixes(json, report.issues);
console.log(`Fixed ${applied.length} issue(s).`);
```

## Rules

| ID | Checks | Default severity | Autofix |
|---|---|---|---|
| `invalid-json` | File is not parseable JSON/JSONC. | error | no |
| `missing-transport` | Server must have `command` or `url`. | error | no |
| `conflicting-transport` | Both `command` and `url` set, or `transport` disagrees. | error | no |
| `invalid-command` | `command` missing or not a string. | error | no |
| `invalid-args` | `args` is not an array of strings. | error | no |
| `invalid-env` | `env` is not an object of strings. | error | no |
| `hardcoded-secret` | Env value matches a known secret pattern (OpenAI, Anthropic, GitHub, GitLab, Slack, AWS, Stripe, Twilio, SendGrid, Hugging Face, npm, Google AI, Google Cloud service JSON, Azure OpenAI). | error | **yes** |
| `invalid-url` | `url` is not valid, not http/https, or plain http to a non-local host. | error | no |
| `invalid-transport` | `transport` is not `stdio`/`sse`/`streamable-http`. | error | no |
| `unknown-field` | Server has a field not in the MCP schema. | warning | no |
| `relative-path` | `command` starts with `./` or `../`. | warning | no |
| `empty-servers` | Config has no `mcpServers` / `servers` / `context_servers`. | warning | no |
| `duplicate-server-name` | Two server names that differ only by case. | error | no |
| `unstable-reference` | `npx <pkg>` / `uvx <pkg>` / `docker <img:latest>` without a pinned version. | warning | no |
| `dangerous-command` | Privilege escalation (`sudo`), remote-shell pipe (`curl \| sh`), host-root mount (`-v /:/`), docker `--privileged`, or `--unsafe-perm`. | error | no |

Full per-rule docs live at [docs/RULES.md](./docs/RULES.md) and are also available from the CLI:

```bash
mcpcheck --list-rules                   # print all rule ids
mcpcheck --explain hardcoded-secret     # print the docs for one rule
```

The `hardcoded-secret` rule recognises prefixes from every major provider (see [constants.ts](./src/rules/constants.ts)) and always proposes a fix: the value becomes `"${ENV_VAR}"`, which every MCP client expands from the caller's shell.

## Configuration

```json
// mcpcheck.config.json
{
  "$schema": "https://raw.githubusercontent.com/MukundaKatta/mcpcheck/main/schema.json",
  "rules": {
    "unknownField": { "severity": "off" },
    "relativePath": { "severity": "error" },
    "unstableReference": { "severity": "error" }
  },
  "plugins": ["@my-org/mcpcheck-custom-rules"]
}
```

Every rule accepts `{ "enabled": boolean, "severity": "error" | "warning" | "info" | "off" }`. Run with `--config mcpcheck.config.json`.

The `$schema` pointer gives you autocomplete and inline validation in any editor that understands JSON Schema (VS Code, JetBrains, Neovim with `jsonls`). The VS Code extension also registers the schema for any file named `mcpcheck.config.json` or `.mcpcheck.json` automatically.

## Plugins

Plugins are npm packages that export `{ rules?: Rule[], premium?: (api) => void }`. See [src/plugins.ts](./src/plugins.ts). Example:

```ts
// @acme/mcpcheck-internal-rules
import type { Plugin } from "mcpcheck";
const plugin: Plugin = {
  rules: [
    // your Rule functions
  ],
};
export default plugin;
```

Then in `mcpcheck.config.json`: `{"plugins": ["@acme/mcpcheck-internal-rules"]}`.

## Premium

See [docs/PREMIUM.md](./docs/PREMIUM.md) for policy-as-code, hosted dashboard, and extra rule packs. The OSS core runs identically with or without a license; premium is an additive plugin layer.

## Supported clients

mcpcheck doesn't care which client reads the config, it only validates against the MCP protocol. Tested config layouts:

| Client | Typical path | Top-level key |
|---|---|---|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) / `%APPDATA%/Claude/claude_desktop_config.json` (Windows) / `~/.config/Claude/claude_desktop_config.json` (Linux) | `mcpServers` |
| Claude Code | `~/.claude.json`, `<repo>/.mcp.json`, `<repo>/.claude/mcp.json` | `mcpServers` |
| Cursor | `~/.cursor/mcp.json`, `<repo>/.cursor/mcp.json` | `mcpServers` |
| Cline | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` | `mcpServers` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| Zed | `~/.config/zed/settings.json` | `context_servers` |
| Generic / in-repo | `mcp.json`, `.mcp.json` | `mcpServers` or `servers` |

Running `mcpcheck` with no arguments scans every path in the table above, plus `**/mcp.json` / `**/.mcp.json` / `**/claude_desktop_config.json` in the current working directory.

## Development

```bash
npm install
npm run build
npm test         # 42 passing
npm run docs:gen # regenerate docs/RULES.md from src/rule-docs.ts
```

## License

MIT
