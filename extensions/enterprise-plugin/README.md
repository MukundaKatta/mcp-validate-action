# @mcpcheck/enterprise

Policy-as-code plugin for [mcpcheck](https://github.com/MukundaKatta/mcpcheck). Adds org-wide allow/deny-lists on top of the OSS rule set.

## Install

```bash
npm install --save-dev @mcpcheck/enterprise
```

## Enable

In `mcpcheck.config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/MukundaKatta/mcpcheck/main/schema.json",
  "plugins": ["@mcpcheck/enterprise"],
  "rules": { }
}
```

Then drop a policy file at the project root, named `.mcpcheck.enterprise.json`:

```json
{
  "allowedCommands": ["npx", "uvx", "docker", "/usr/local/bin/mcp-*"],
  "deniedImages":    ["ghcr.io/bad-org/*", "*:latest"],
  "allowedPackages": ["@modelcontextprotocol/*", "@my-org/*"]
}
```

Every list is optional. A missing or empty list disables the corresponding rule.

## Rules

| ID | Purpose |
|---|---|
| `enterprise/allowed-command` | The server's `command` must match an entry in `allowedCommands` (glob-like `*` is supported). |
| `enterprise/denied-image` | Docker images matching any pattern in `deniedImages` are refused. Understands `docker run [flags] image:tag` — flag values are skipped. |
| `enterprise/allowed-package` | `npx`/`uvx` packages must match an entry in `allowedPackages`. Version suffixes (`@1.2.3`) are stripped before matching; scoped packages (`@scope/name@1.2.3`) are handled correctly. |

## Why

Organisations running many internal MCP servers want a single source of truth over which commands and images are OK to run, separate from the OSS hygiene checks (hardcoded secrets, `--privileged`, etc.). This plugin adds that layer without forking mcpcheck.

## License

MIT
