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
| [`plaintext-http-with-token`](#plaintext-http-with-token) | error | no | The URL starts with `http://` (non-local) AND the server declares `Authorization` / `X-API-Key` / `Cookie` / similar. |
| [`autoapprove-wildcard`](#autoapprove-wildcard) | error | no | Server opts every tool call out of user confirmation. |
| [`args-with-newline`](#args-with-newline) | error | no | An entry in `args` contains `\n` or `\r`. |
| [`missing-digest-pin`](#missing-digest-pin) | info | no | `docker run image:1.0.0` pins the tag, but tags can be re-pushed. |
| [`url-embedded-credentials`](#url-embedded-credentials) | error | no | `url: "https://user:password@host/…"` embeds RFC 3986 userinfo. |
| [`password-flag-literal`](#password-flag-literal) | error | no | `args` contains `--password foo` / `--token xyz` / `--api-key abc` with a literal value (not `${VAR}`). |
| [`non-ascii-server-name`](#non-ascii-server-name) | info | no | A server map key has characters outside basic ASCII. |
| [`duplicate-image`](#duplicate-image) | warning | no | Two server entries resolve to the same `docker run image:tag` reference. |
| [`secret-in-args`](#secret-in-args) | error | no | A string in `args` matches a known API-key format. |
| [`cwd-not-absolute`](#cwd-not-absolute) | warning | no | Server declares `cwd: "./foo"` / `cwd: "foo"`. |
| [`empty-env-value`](#empty-env-value) | warning | no | An `env` entry has value `""`. |
| [`invalid-env-var-name`](#invalid-env-var-name) | warning | no | An env var name doesn't match `[A-Z_][A-Z0-9_]*`. |
| [`placeholder-value`](#placeholder-value) | error | no | An `env` value looks like template text (`YOUR_API_KEY_HERE`, `<token>`, `xxx…`, `replace-me`, `TODO`). |
| [`empty-args`](#empty-args) | warning | no | A command that needs arguments (`npx` / `uvx` / `docker` / shells) has `args: []`. |
| [`typosquat-package`](#typosquat-package) | error | no | An `npx` / `uvx` package name is within edit distance 3 of an official `@modelcontextprotocol/*` server but doesn't match it. |
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

## plaintext-http-with-token

**Credential header sent over plain HTTP**

- Default severity: `error`
- Autofix: no

The URL starts with `http://` (non-local) AND the server declares `Authorization` / `X-API-Key` / `Cookie` / similar.

That token rides over the wire in cleartext; any on-path attacker sees it. `invalid-url` warns about plain http to non-local hosts in general; this rule fires only on the unambiguously-bad case where a credential is also being sent.

**Fix:** switch the URL scheme to https (or drop the credential header if the server really is open).

## autoapprove-wildcard

**`autoApprove` / `alwaysAllow` contains `"*"`**

- Default severity: `error`
- Autofix: no

Server opts every tool call out of user confirmation.

The whole point of client-side confirmation prompts is to protect the user from the server doing something destructive without their approval. `["*"]` hands that protection away in one line.

**Fix:** list the specific tool names that are safe to run without confirmation.

## args-with-newline

**Literal newline inside an `args` string**

- Default severity: `error`
- Autofix: no

An entry in `args` contains `\n` or `\r`.

Almost always a paste of a multiline script into a single JSON string. The MCP client hands each `args` entry to the OS process as-is; the child sees a literal newline in argv, which isn't what the user meant.

**Fix:** split into separate `args` entries, or if you really need a multiline script, wrap in `bash -c` with the whole script as one arg.

## missing-digest-pin

**Docker image is tag-pinned but not digest-pinned**

- Default severity: `info`
- Autofix: no

`docker run image:1.0.0` pins the tag, but tags can be re-pushed.

Tag pins stop working the moment someone re-pushes the tag. Digest pins (`image@sha256:…`) are content-addressed. Fires only on images that already have a tag — `:latest` / missing tag / mutable-tag cases are caught by `unstable-reference` first.

**Fix:** `docker inspect --format='{{index .RepoDigests 0}}' image:1.0.0` prints the digest-pinned form.

## url-embedded-credentials

**URL with embedded credentials**

- Default severity: `error`
- Autofix: no

`url: "https://user:password@host/…"` embeds RFC 3986 userinfo.

Embedded credentials end up in browser history, proxy access logs, and error traces. Worse than `plaintext-http-with-token`: not just cleartext on wire, cleartext in persistent storage.

**Fix:** move the credential into a `headers.Authorization` with `${VAR}` substitution; drop the userinfo from the URL.

## password-flag-literal

**Credential flag in args with literal value**

- Default severity: `error`
- Autofix: no

`args` contains `--password foo` / `--token xyz` / `--api-key abc` with a literal value (not `${VAR}`).

Catches the "I copied the CLI example" class of leak that `secret-in-args` misses: the literal value doesn't match a known provider's format, but the flag name makes it obvious what it is.

**Fix:** move the credential into `env` with `${VAR}`. Most tools accept `$VAR` in args or read an env var directly.

## non-ascii-server-name

**Server name contains non-ASCII characters**

- Default severity: `info`
- Autofix: no

A server map key has characters outside basic ASCII.

Usually a stray smart quote, nbsp, or emoji pasted during a rename. Works in the happy path but breaks subtly when the client URL-encodes, logs, or passes the name to a shell.

**Fix:** rename to ASCII.

## duplicate-image

**Two servers run the same docker image**

- Default severity: `warning`
- Autofix: no

Two server entries resolve to the same `docker run image:tag` reference.

Usually a copy-paste leftover where the user meant to edit something about the second entry and didn't. Legitimate duplicates exist (different env, different ports, staged vs prod), so default severity is warning. Same tag-detection logic as `unstable-reference` — the rule skips the docker subcommand and flag-values before picking the image argument.

## secret-in-args

**Hardcoded secret in `args`**

- Default severity: `error`
- Autofix: no

A string in `args` matches a known API-key format.

`hardcoded-secret` only scans `env`. People copy invocations like `mcp-server-foo --token sk-abc123…` into `args` and commit the file; this rule catches the other half of the problem.

**Fix:** move the credential into `env` with `${VAR}` substitution. Most servers accept `$TOKEN` in args or read the env var directly.

## cwd-not-absolute

**Server `cwd` is a relative path**

- Default severity: `warning`
- Autofix: no

Server declares `cwd: "./foo"` / `cwd: "foo"`.

Same story as `relative-path` for `command`: different MCP clients launch the subprocess from different starting directories. A relative `cwd` that works in one client almost always breaks in another.

**Fix:** use an absolute path.

## empty-env-value

**Env var with an empty-string value**

- Default severity: `warning`
- Autofix: no

An `env` entry has value `""`.

Setting `"API_KEY": ""` is not the same as omitting the key: the variable still exists in the subprocess's environment with value `""`. Libraries that check `if (VAR)` treat it as absent; libraries that check `if (VAR !== undefined)` see it as set. The resulting inconsistency is painful to debug.

**Fix:** either set the real value (often `"${VAR}"` substitution), or remove the key entirely.

## invalid-env-var-name

**Env var name isn't POSIX-portable**

- Default severity: `warning`
- Autofix: no

An env var name doesn't match `[A-Z_][A-Z0-9_]*`.

Mixed case, hyphens, or leading digits work in some shells and trip others. Node and Python accept pretty much anything; plain `/bin/sh` and a handful of smaller clients don't.

**Fix:** rename to ALL_CAPS. If you rely on a specific casing for a third-party client, disable the rule for that server.

## placeholder-value

**Env value is a copy-paste placeholder**

- Default severity: `error`
- Autofix: no

An `env` value looks like template text (`YOUR_API_KEY_HERE`, `<token>`, `xxx…`, `replace-me`, `TODO`).

The config was probably pasted from a README and never completed. These values don't trigger `hardcoded-secret` (wrong format) and cause a confusing runtime failure at launch rather than at lint time.

**Fix:** replace with the real value, or (usually what you want) `${VAR}` substitution.

## empty-args

**Package / container runner with empty args**

- Default severity: `warning`
- Autofix: no

A command that needs arguments (`npx` / `uvx` / `docker` / shells) has `args: []`.

`npx` without a package, `uvx` without a package, `docker` without a subcommand, or `bash` without a script each exit with help text rather than running anything. Nine times in ten, `args: []` is a half-edited config — the user meant to add a package or subcommand and didn't.

**Fix:** either fill in the missing args or remove the key entirely (omitting `args` is different from setting it to `[]`).

## typosquat-package

**Package name looks like a typo of an official MCP server**

- Default severity: `error`
- Autofix: no

An `npx` / `uvx` package name is within edit distance 3 of an official `@modelcontextprotocol/*` server but doesn't match it.

Typosquatted npm packages are a real supply-chain attack vector — registering `@modelcontextprotoco/server-filesystem` (missing a letter) is a one-day project for a motivated attacker and mcpcheck's other rules won't catch it.

The rule keeps a short, curated list of well-known official MCP servers and flags invocations that *almost* match. It won't complain about legitimate third-party servers; it only fires when the name is suspiciously close to a marquee upstream.

**Fix:** check the real package name against the [official list](https://github.com/modelcontextprotocol/servers). If you meant the upstream, fix the spelling.

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

