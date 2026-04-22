# mcpcheck rule reference

Every rule has an id, a default severity, and (sometimes) an autofix. You can
explain any rule from the CLI without opening this file:

```bash
mcpcheck --explain hardcoded-secret
mcpcheck --list-rules
```

This page is generated from `src/rule-docs.ts`. Don't edit it by hand.

## Index

| ID | Default | Autofix | Summary |
|---|---|---|---|
| [`invalid-json`](#invalid-json) | error | no | Config failed to parse even after stripping comments and trailing commas. |
| [`missing-transport`](#missing-transport) | error | no | A server entry has neither `command` (stdio) nor `url` (http/sse). |
| [`conflicting-transport`](#conflicting-transport) | error | no | Both `command` and `url` are set, or `transport` disagrees with them. |
| [`invalid-command`](#invalid-command) | error | no | `command` must be a non-empty string. |
| [`invalid-args`](#invalid-args) | error | no | `args` has to be an array of strings. |
| [`invalid-env`](#invalid-env) | error | no | `env` must be an object, and each value must be a string. |
| [`hardcoded-secret`](#hardcoded-secret) | error | yes | A value in `env` matches a known secret format (OpenAI, Anthropic, GitHub, AWS, Stripe, Twilio, SendGrid, HuggingFace, npm, GitLab, Slack, Azure, Google). |
| [`invalid-url`](#invalid-url) | error | no | `url` does not parse, isn't http/https, or is plain http to a non-local host. |
| [`invalid-transport`](#invalid-transport) | error | no | `transport` must be one of `stdio`, `sse`, `streamable-http`. |
| [`unknown-field`](#unknown-field) | warning | no | A field on the server object isn't in the MCP schema. |
| [`relative-path`](#relative-path) | warning | no | The command is a relative path. |
| [`empty-servers`](#empty-servers) | warning | no | No `mcpServers` / `servers` / `context_servers` key, or it is empty. |
| [`duplicate-server-name`](#duplicate-server-name) | error | no | Two server entries differ only by case. |
| [`unstable-reference`](#unstable-reference) | warning | no | `npx <pkg>` / `uvx <pkg>` / `docker run <image>` without a pinned version. |
| [`http-without-auth`](#http-without-auth) | warning | no | A URL-transport server targets an https endpoint but declares no `Authorization` header. |
| [`shell-metachars`](#shell-metachars) | error | no | `command` contains `\|`, `;`, `$(…)`, backticks, `&&`, `\|\|`, `&`, or `$VAR` but isn't a shell. |
| [`duplicate-env-key`](#duplicate-env-key) | warning | no | Two entries in `env` differ only by case (e.g. `API_KEY` and `ApiKey`). |
| [`dangerous-command`](#dangerous-command) | error | no | Config instructs the client to execute `curl \| sh`, `sudo`, `docker --privileged`, `-v /:/`, or similar. |

## invalid-json

**File is not parseable JSON (or JSONC)**

- Default severity: `error`
- Autofix: no

Config failed to parse even after stripping comments and trailing commas.

mcpcheck first tries to parse the file as JSONC (JSON with `//` and `/* */` comments and trailing commas — what Claude Desktop, Cursor, and VS Code actually accept). If that still fails, the file is reported as `invalid-json` and every other rule is skipped for that file.

**Fix:** open the file and check the line number in the error message. Common culprits are unescaped backslashes in Windows paths (`"C:\Users..."` must be `"C:\\Users..."`) and stray commas between top-level keys.

## missing-transport

**Server has no transport**

- Default severity: `error`
- Autofix: no

A server entry has neither `command` (stdio) nor `url` (http/sse).

Every MCP server declaration has to tell the client how to reach it. For local processes that's `"command": "npx"` (plus optional `args`); for remote servers that's `"url": "https://…"`.

**Fix:** add one of the two. If you meant to disable the entry, set `"disabled": true` instead of leaving it transport-less.

## conflicting-transport

**Transport fields contradict each other**

- Default severity: `error`
- Autofix: no

Both `command` and `url` are set, or `transport` disagrees with them.

MCP supports stdio (local process) and http/sse (remote). Setting both `command` and `url` on the same server makes the client pick one, and different clients pick differently. Setting `"transport": "sse"` while also setting `command` is the same problem in a louder voice.

**Fix:** remove whichever field doesn't match your intent.

## invalid-command

**`command` is missing or not a string**

- Default severity: `error`
- Autofix: no

`command` must be a non-empty string.

Nothing exotic to say here — `command` is passed verbatim to the OS process launcher and has to be a string.

**Fix:** set it to the binary you want to run (`"npx"`, `"node"`, `"/usr/local/bin/my-mcp"`).

## invalid-args

**`args` is not an array of strings**

- Default severity: `error`
- Autofix: no

`args` has to be an array of strings.

Clients pass `args` directly to the OS as argv. Numbers, booleans, nested arrays — none of that works.

**Fix:** quote every argument as a JSON string.

## invalid-env

**`env` is not a string-valued object**

- Default severity: `error`
- Autofix: no

`env` must be an object, and each value must be a string.

Environment variables are string key-value pairs at the OS level. JSON numbers and booleans are not valid values.

**Fix:** wrap values in quotes (`"DEBUG": "1"`, not `"DEBUG": 1`).

## hardcoded-secret

**Hardcoded API key**

- Default severity: `error`
- Autofix: yes

A value in `env` matches a known secret format (OpenAI, Anthropic, GitHub, AWS, Stripe, Twilio, SendGrid, HuggingFace, npm, GitLab, Slack, Azure, Google).

Your MCP config is often committed to a repo, synced across machines, or pasted into docs. Hardcoded API keys in `env` values are a common source of leaks.

mcpcheck matches on format (prefix + length + charset), so the check runs offline and does not talk to any provider.

**Fix:** either run `mcpcheck --fix`, which replaces the value with `"${VAR_NAME}"` (MCP clients expand that from the shell at launch), or remove the value and export the variable in your shell profile.

## invalid-url

**URL is malformed, non-http(s), or insecure**

- Default severity: `error`
- Autofix: no

`url` does not parse, isn't http/https, or is plain http to a non-local host.

Remote MCP servers must speak http or https. Plain `http://` to anything that isn't `localhost`, `127.0.0.1`, `::1`, a `.localhost` host, or a `.local` host is downgraded to a warning (you probably meant to, but it will leak the bearer token on the wire).

**Fix:** use `https://` for anything on the internet.

## invalid-transport

**`transport` value is not one of the accepted tokens**

- Default severity: `error`
- Autofix: no

`transport` must be one of `stdio`, `sse`, `streamable-http`.

Clients that look at `transport` use it to pick the transport implementation. Values outside the set silently get ignored or fall back to `stdio`, and you then get "the server isn't responding" with no better hint.

**Fix:** pick one of the supported values, or delete the field and let the client infer it from `command` vs `url`.

## unknown-field

**Unknown field on a server**

- Default severity: `warning`
- Autofix: no

A field on the server object isn't in the MCP schema.

This is a typo-catcher. `"commnad"` instead of `"command"`, `"autoApprve"` instead of `"autoApprove"`. Some fields are client-specific extensions and are deliberately unknown to mcpcheck (that's why the default severity is `warning`, not `error`).

**Fix:** fix the typo, or turn the rule off in `mcpcheck.config.json` if you rely on a client-specific extension.

## relative-path

**`command` starts with `./` or `../`**

- Default severity: `warning`
- Autofix: no

The command is a relative path.

Different MCP clients resolve `cwd` differently — some from the user's home, some from the directory containing the config, some from wherever the app bundle was launched. A relative `command` that works in testing often breaks on another user's machine.

**Fix:** use an absolute path, or put the binary on `PATH` and reference it by name.

## empty-servers

**Config has no server entries**

- Default severity: `warning`
- Autofix: no

No `mcpServers` / `servers` / `context_servers` key, or it is empty.

Not necessarily a bug — Claude Code's `~/.claude.json` holds other state too — but very often the sign of a file that was partially edited or a key that got typo'd.

**Fix:** add servers, or disable the rule for files you know don't carry a server map.

## duplicate-server-name

**Case-insensitive duplicate server name**

- Default severity: `error`
- Autofix: no

Two server entries differ only by case.

Server names appear in prompts and logs; if you have `"GitHub"` and `"github"` you will confuse both the model and yourself, and on case-insensitive filesystems clients may overwrite one with the other.

**Fix:** rename one.

## unstable-reference

**Unpinned package or image reference**

- Default severity: `warning`
- Autofix: no

`npx <pkg>` / `uvx <pkg>` / `docker run <image>` without a pinned version.

Most MCP servers are distributed via `npx`, `uvx`, or `docker`. Running them unpinned means you get whatever the registry says is latest on every launch, which is how configs that worked yesterday start failing tomorrow (and how supply-chain attacks get delivered).

**Fix:** pin the exact version: `npx -y @org/pkg@1.2.3`, `uvx pkg==1.2.3`, `docker run image:1.2.3` (explicit tag, not `:latest` and not implicit).

## http-without-auth

**HTTPS server without an Authorization header**

- Default severity: `warning`
- Autofix: no

A URL-transport server targets an https endpoint but declares no `Authorization` header.

Most remote MCP servers require a bearer token or similar auth. A config with an https URL and no `Authorization` is almost always a missed env substitution — the user meant to add `"headers": { "Authorization": "Bearer ${API_TOKEN}" }` and forgot.

Plain-http local endpoints are handled separately by the `invalid-url` rule (http to non-localhost is already flagged). Real public no-auth endpoints exist — mock servers, open-data servers — so this defaults to warning rather than error.

**Fix:** add a headers block with the substituted token, or disable the rule for this server if the endpoint really is open.

## shell-metachars

**Shell metacharacters without a shell**

- Default severity: `error`
- Autofix: no

`command` contains `|`, `;`, `$(…)`, backticks, `&&`, `||`, `&`, or `$VAR` but isn't a shell.

MCP clients hand `command + args` straight to the OS process launcher — they do not invoke a shell. So `"command": "curl foo | sh"` runs `curl` with `foo`, `|`, and `sh` as literal argv. The pipe is a harmless string as far as curl is concerned, and the user's actual intent never happens.

If you need a shell pipeline, wrap the whole thing in `bash -c "…"` (and then expect `dangerous-command` to look at it hard).

**Fix:** either remove the shell metacharacters, or change `command` to `bash` / `sh` and put the pipeline in `args[1]` after `-c`.

## duplicate-env-key

**Case-colliding env var names on a server**

- Default severity: `warning`
- Autofix: no

Two entries in `env` differ only by case (e.g. `API_KEY` and `ApiKey`).

POSIX env vars are case-sensitive at the OS level, so the MCP client hands both variables to the subprocess. Whichever one the subprocess actually reads wins; the other is silently ignored. That's almost always a typo or a copy-paste leftover.

**Fix:** delete whichever entry is the mistake.

## dangerous-command

**Privilege escalation, remote-shell pipe, or host-root mount**

- Default severity: `error`
- Autofix: no

Config instructs the client to execute `curl | sh`, `sudo`, `docker --privileged`, `-v /:/`, or similar.

An MCP config is a latent instruction: the client runs it every time it starts. Configs that fetch-and-pipe into a shell, escalate privilege, or mount the host root into a container effectively hand your machine to whatever is on the other end.

The rule flags:

- Privilege-escalation wrappers: `sudo`, `doas`, `pkexec`, `runas`, `gosu`, `su`.
- "Run as root" flags: `--unsafe-perm`, `--allow-root`, `--allow-run-as-root`.
- Remote-shell pipes: any argv that contains both a fetcher (`curl`, `wget`, `iwr`, `Invoke-WebRequest`) and a shell sink (`| sh`, `| bash`, `| zsh`, `| pwsh`, `| iex`).
- Docker `--privileged`.
- Docker volumes that mount the host root: `-v /:/anything`, `--mount source=/,...`.
- A literal `rm -rf /` sequence anywhere in `args`.

**Fix:** don't do any of these. If the upstream server really needs extra privilege, wrap it in a small setuid helper that you audit once, and point the config at that helper.

