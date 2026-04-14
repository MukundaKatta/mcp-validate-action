# MCP Config Validator — GitHub Action

[![test](https://github.com/MukundaKatta/mcp-validate-action/actions/workflows/test.yml/badge.svg)](https://github.com/MukundaKatta/mcp-validate-action/actions)
[![Marketplace](https://img.shields.io/badge/marketplace-mcp--validate-blue)](https://github.com/marketplace/actions/mcp-config-validator)

Validates [MCP](https://modelcontextprotocol.io) server configs on every push — catches malformed `mcp.json`, `.mcp.json`, and `claude_desktop_config.json` before they break clients.

## Why

MCP configs are JSON files hand-edited by humans. Typos, missing fields, and hardcoded secrets all slip in. Clients like Claude Desktop, Cursor, and Cline error-out in opaque ways when configs are wrong. This action catches the common ones at CI time:

- ❌ Missing both `command` and `url`
- ❌ Hardcoded API keys in `env` (`sk-...`, `ghp_...`, etc.)
- ❌ Invalid JSON
- ❌ Invalid transport (`websocket`, `grpc`, ...)
- ⚠️ Relative paths in `command` (brittle)
- ⚠️ Unknown fields (may be client-specific or typos)

## Usage

```yaml
# .github/workflows/mcp-validate.yml
name: MCP validate
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: MukundaKatta/mcp-validate-action@v1
```

### Options

```yaml
- uses: MukundaKatta/mcp-validate-action@v1
  with:
    config-path: '**/{mcp,claude_desktop_config,.mcp}.json'  # default
    strict: false            # fail on warnings too
    fail-on-missing: false   # fail if no config files found
```

### Outputs

| Output | Description |
|--------|-------------|
| `files-checked` | Number of config files validated |
| `errors` | Error count |
| `warnings` | Warning count |

## Example output

```
✓ .mcp.json
::group::examples/broken.json — 2 error(s), 1 warning(s)
::error file=examples/broken.json::servers.leaky.env.KEY: looks like a hardcoded API key/secret
::error file=examples/broken.json::servers.bad: must have either "command" or "url"
::warning file=examples/broken.json::servers.local.command: relative path is fragile
::endgroup::

Checked 2 file(s): 2 error(s), 1 warning(s)
```

## Development

```bash
npm install
npm test       # run fixture tests
npm run build  # bundle to dist/ via ncc
```

Before releasing a new version, run `npm run build` and commit `dist/` — GitHub Actions run from the bundled file.

## Releasing

```bash
npm run build
git add dist
git commit -m "build: v0.1.1"
git tag -a v0.1.1 -m "v0.1.1"
git push && git push --tags
git tag -f v1 && git push -f origin v1   # move rolling v1 tag
```

## License

MIT
