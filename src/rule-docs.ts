/**
 * Per-rule long-form documentation used by both `docs/RULES.md` generation and
 * the `mcpcheck --explain <rule-id>` CLI flag. Keeping the prose in one file
 * means the docs and the CLI explanation never drift.
 *
 * Each entry is written as if answering three questions:
 *   1. What exactly does the rule flag?
 *   2. Why does it matter in an MCP config specifically?
 *   3. How do I make it stop firing?
 */

export interface RuleDoc {
  id: string;
  title: string;
  defaultSeverity: "error" | "warning" | "info";
  autofix: boolean;
  summary: string;
  /** Multi-paragraph markdown. */
  details: string;
}

export const RULE_DOCS: RuleDoc[] = [
  {
    id: "invalid-json",
    title: "File is not parseable JSON (or JSONC)",
    defaultSeverity: "error",
    autofix: false,
    summary: "Config failed to parse even after stripping comments and trailing commas.",
    details: `mcpcheck first tries to parse the file as JSONC (JSON with \`//\` and \`/* */\` comments and trailing commas — what Claude Desktop, Cursor, and VS Code actually accept). If that still fails, the file is reported as \`invalid-json\` and every other rule is skipped for that file.

**Fix:** open the file and check the line number in the error message. Common culprits are unescaped backslashes in Windows paths (\`"C:\\Users..."\` must be \`"C:\\\\Users..."\`) and stray commas between top-level keys.`,
  },
  {
    id: "missing-transport",
    title: "Server has no transport",
    defaultSeverity: "error",
    autofix: false,
    summary: "A server entry has neither \`command\` (stdio) nor \`url\` (http/sse).",
    details: `Every MCP server declaration has to tell the client how to reach it. For local processes that's \`"command": "npx"\` (plus optional \`args\`); for remote servers that's \`"url": "https://…"\`.

**Fix:** add one of the two. If you meant to disable the entry, set \`"disabled": true\` instead of leaving it transport-less.`,
  },
  {
    id: "conflicting-transport",
    title: "Transport fields contradict each other",
    defaultSeverity: "error",
    autofix: false,
    summary: "Both \`command\` and \`url\` are set, or \`transport\` disagrees with them.",
    details: `MCP supports stdio (local process) and http/sse (remote). Setting both \`command\` and \`url\` on the same server makes the client pick one, and different clients pick differently. Setting \`"transport": "sse"\` while also setting \`command\` is the same problem in a louder voice.

**Fix:** remove whichever field doesn't match your intent.`,
  },
  {
    id: "invalid-command",
    title: "\`command\` is missing or not a string",
    defaultSeverity: "error",
    autofix: false,
    summary: "\`command\` must be a non-empty string.",
    details: `Nothing exotic to say here — \`command\` is passed verbatim to the OS process launcher and has to be a string.

**Fix:** set it to the binary you want to run (\`"npx"\`, \`"node"\`, \`"/usr/local/bin/my-mcp"\`).`,
  },
  {
    id: "invalid-args",
    title: "\`args\` is not an array of strings",
    defaultSeverity: "error",
    autofix: false,
    summary: "\`args\` has to be an array of strings.",
    details: `Clients pass \`args\` directly to the OS as argv. Numbers, booleans, nested arrays — none of that works.

**Fix:** quote every argument as a JSON string.`,
  },
  {
    id: "invalid-env",
    title: "\`env\` is not a string-valued object",
    defaultSeverity: "error",
    autofix: false,
    summary: "\`env\` must be an object, and each value must be a string.",
    details: `Environment variables are string key-value pairs at the OS level. JSON numbers and booleans are not valid values.

**Fix:** wrap values in quotes (\`"DEBUG": "1"\`, not \`"DEBUG": 1\`).`,
  },
  {
    id: "hardcoded-secret",
    title: "Hardcoded API key",
    defaultSeverity: "error",
    autofix: true,
    summary: "A value in \`env\` matches a known secret format (OpenAI, Anthropic, GitHub, AWS, Stripe, Twilio, SendGrid, HuggingFace, npm, GitLab, Slack, Azure, Google).",
    details: `Your MCP config is often committed to a repo, synced across machines, or pasted into docs. Hardcoded API keys in \`env\` values are a common source of leaks.

mcpcheck matches on format (prefix + length + charset), so the check runs offline and does not talk to any provider.

**Fix:** either run \`mcpcheck --fix\`, which replaces the value with \`"\${VAR_NAME}"\` (MCP clients expand that from the shell at launch), or remove the value and export the variable in your shell profile.`,
  },
  {
    id: "invalid-url",
    title: "URL is malformed, non-http(s), or insecure",
    defaultSeverity: "error",
    autofix: false,
    summary: "\`url\` does not parse, isn't http/https, or is plain http to a non-local host.",
    details: `Remote MCP servers must speak http or https. Plain \`http://\` to anything that isn't \`localhost\`, \`127.0.0.1\`, \`::1\`, a \`.localhost\` host, or a \`.local\` host is downgraded to a warning (you probably meant to, but it will leak the bearer token on the wire).

**Fix:** use \`https://\` for anything on the internet.`,
  },
  {
    id: "invalid-transport",
    title: "\`transport\` value is not one of the accepted tokens",
    defaultSeverity: "error",
    autofix: false,
    summary: "\`transport\` must be one of \`stdio\`, \`sse\`, \`streamable-http\`.",
    details: `Clients that look at \`transport\` use it to pick the transport implementation. Values outside the set silently get ignored or fall back to \`stdio\`, and you then get "the server isn't responding" with no better hint.

**Fix:** pick one of the supported values, or delete the field and let the client infer it from \`command\` vs \`url\`.`,
  },
  {
    id: "unknown-field",
    title: "Unknown field on a server",
    defaultSeverity: "warning",
    autofix: false,
    summary: "A field on the server object isn't in the MCP schema.",
    details: `This is a typo-catcher. \`"commnad"\` instead of \`"command"\`, \`"autoApprve"\` instead of \`"autoApprove"\`. Some fields are client-specific extensions and are deliberately unknown to mcpcheck (that's why the default severity is \`warning\`, not \`error\`).

**Fix:** fix the typo, or turn the rule off in \`mcpcheck.config.json\` if you rely on a client-specific extension.`,
  },
  {
    id: "relative-path",
    title: "\`command\` starts with \`./\` or \`../\`",
    defaultSeverity: "warning",
    autofix: false,
    summary: "The command is a relative path.",
    details: `Different MCP clients resolve \`cwd\` differently — some from the user's home, some from the directory containing the config, some from wherever the app bundle was launched. A relative \`command\` that works in testing often breaks on another user's machine.

**Fix:** use an absolute path, or put the binary on \`PATH\` and reference it by name.`,
  },
  {
    id: "empty-servers",
    title: "Config has no server entries",
    defaultSeverity: "warning",
    autofix: false,
    summary: "No \`mcpServers\` / \`servers\` / \`context_servers\` key, or it is empty.",
    details: `Not necessarily a bug — Claude Code's \`~/.claude.json\` holds other state too — but very often the sign of a file that was partially edited or a key that got typo'd.

**Fix:** add servers, or disable the rule for files you know don't carry a server map.`,
  },
  {
    id: "duplicate-server-name",
    title: "Case-insensitive duplicate server name",
    defaultSeverity: "error",
    autofix: false,
    summary: "Two server entries differ only by case.",
    details: `Server names appear in prompts and logs; if you have \`"GitHub"\` and \`"github"\` you will confuse both the model and yourself, and on case-insensitive filesystems clients may overwrite one with the other.

**Fix:** rename one.`,
  },
  {
    id: "unstable-reference",
    title: "Unpinned package or image reference",
    defaultSeverity: "warning",
    autofix: false,
    summary: "\`npx <pkg>\` / \`uvx <pkg>\` / \`docker run <image>\` without a pinned version.",
    details: `Most MCP servers are distributed via \`npx\`, \`uvx\`, or \`docker\`. Running them unpinned means you get whatever the registry says is latest on every launch, which is how configs that worked yesterday start failing tomorrow (and how supply-chain attacks get delivered).

**Fix:** pin the exact version: \`npx -y @org/pkg@1.2.3\`, \`uvx pkg==1.2.3\`, \`docker run image:1.2.3\` (explicit tag, not \`:latest\` and not implicit).`,
  },
  {
    id: "http-without-auth",
    title: "HTTPS server without an Authorization header",
    defaultSeverity: "warning",
    autofix: false,
    summary: "A URL-transport server targets an https endpoint but declares no `Authorization` header.",
    details: `Most remote MCP servers require a bearer token or similar auth. A config with an https URL and no \`Authorization\` is almost always a missed env substitution — the user meant to add \`"headers": { "Authorization": "Bearer \${API_TOKEN}" }\` and forgot.

Plain-http local endpoints are handled separately by the \`invalid-url\` rule (http to non-localhost is already flagged). Real public no-auth endpoints exist — mock servers, open-data servers — so this defaults to warning rather than error.

**Fix:** add a headers block with the substituted token, or disable the rule for this server if the endpoint really is open.`,
  },
  {
    id: "placeholder-value",
    title: "Env value is a copy-paste placeholder",
    defaultSeverity: "error",
    autofix: false,
    summary: "An `env` value looks like template text (`YOUR_API_KEY_HERE`, `<token>`, `xxx…`, `replace-me`, `TODO`).",
    details: `The config was probably pasted from a README and never completed. These values don't trigger \`hardcoded-secret\` (wrong format) and cause a confusing runtime failure at launch rather than at lint time.

**Fix:** replace with the real value, or (usually what you want) \`\${VAR}\` substitution.`,
  },
  {
    id: "empty-args",
    title: "Package / container runner with empty args",
    defaultSeverity: "warning",
    autofix: false,
    summary: "A command that needs arguments (`npx` / `uvx` / `docker` / shells) has `args: []`.",
    details: `\`npx\` without a package, \`uvx\` without a package, \`docker\` without a subcommand, or \`bash\` without a script each exit with help text rather than running anything. Nine times in ten, \`args: []\` is a half-edited config — the user meant to add a package or subcommand and didn't.

**Fix:** either fill in the missing args or remove the key entirely (omitting \`args\` is different from setting it to \`[]\`).`,
  },
  {
    id: "typosquat-package",
    title: "Package name looks like a typo of an official MCP server",
    defaultSeverity: "error",
    autofix: false,
    summary: "An `npx` / `uvx` package name is within edit distance 3 of an official `@modelcontextprotocol/*` server but doesn't match it.",
    details: `Typosquatted npm packages are a real supply-chain attack vector — registering \`@modelcontextprotoco/server-filesystem\` (missing a letter) is a one-day project for a motivated attacker and mcpcheck's other rules won't catch it.

The rule keeps a short, curated list of well-known official MCP servers and flags invocations that *almost* match. It won't complain about legitimate third-party servers; it only fires when the name is suspiciously close to a marquee upstream.

**Fix:** check the real package name against the [official list](https://github.com/modelcontextprotocol/servers). If you meant the upstream, fix the spelling.`,
  },
  {
    id: "shell-metachars",
    title: "Shell metacharacters without a shell",
    defaultSeverity: "error",
    autofix: false,
    summary: "`command` contains `|`, `;`, `$(…)`, backticks, `&&`, `||`, `&`, or `$VAR` but isn't a shell.",
    details: `MCP clients hand \`command + args\` straight to the OS process launcher — they do not invoke a shell. So \`"command": "curl foo | sh"\` runs \`curl\` with \`foo\`, \`|\`, and \`sh\` as literal argv. The pipe is a harmless string as far as curl is concerned, and the user's actual intent never happens.

If you need a shell pipeline, wrap the whole thing in \`bash -c "…"\` (and then expect \`dangerous-command\` to look at it hard).

**Fix:** either remove the shell metacharacters, or change \`command\` to \`bash\` / \`sh\` and put the pipeline in \`args[1]\` after \`-c\`.`,
  },
  {
    id: "duplicate-env-key",
    title: "Case-colliding env var names on a server",
    defaultSeverity: "warning",
    autofix: false,
    summary: "Two entries in `env` differ only by case (e.g. `API_KEY` and `ApiKey`).",
    details: `POSIX env vars are case-sensitive at the OS level, so the MCP client hands both variables to the subprocess. Whichever one the subprocess actually reads wins; the other is silently ignored. That's almost always a typo or a copy-paste leftover.

**Fix:** delete whichever entry is the mistake.`,
  },
  {
    id: "dangerous-command",
    title: "Privilege escalation, remote-shell pipe, or host-root mount",
    defaultSeverity: "error",
    autofix: false,
    summary: "Config instructs the client to execute \`curl | sh\`, \`sudo\`, \`docker --privileged\`, \`-v /:/\`, or similar.",
    details: `An MCP config is a latent instruction: the client runs it every time it starts. Configs that fetch-and-pipe into a shell, escalate privilege, or mount the host root into a container effectively hand your machine to whatever is on the other end.

The rule flags:

- Privilege-escalation wrappers: \`sudo\`, \`doas\`, \`pkexec\`, \`runas\`, \`gosu\`, \`su\`.
- "Run as root" flags: \`--unsafe-perm\`, \`--allow-root\`, \`--allow-run-as-root\`.
- Remote-shell pipes: any argv that contains both a fetcher (\`curl\`, \`wget\`, \`iwr\`, \`Invoke-WebRequest\`) and a shell sink (\`| sh\`, \`| bash\`, \`| zsh\`, \`| pwsh\`, \`| iex\`).
- Docker \`--privileged\`.
- Docker volumes that mount the host root: \`-v /:/anything\`, \`--mount source=/,...\`.
- A literal \`rm -rf /\` sequence anywhere in \`args\`.

**Fix:** don't do any of these. If the upstream server really needs extra privilege, wrap it in a small setuid helper that you audit once, and point the config at that helper.`,
  },
];

export function explainRule(id: string): string | undefined {
  if (id === "all" || id === "*") {
    return RULE_DOCS.map(renderOne).join("\n\n" + "─".repeat(72) + "\n\n") + "\n";
  }
  const doc = RULE_DOCS.find((d) => d.id === id);
  if (!doc) return undefined;
  return renderOne(doc);
}

function renderOne(doc: RuleDoc): string {
  return [
    `${doc.id}  —  ${doc.title}`,
    `default: ${doc.defaultSeverity}${doc.autofix ? "  •  autofix: yes" : ""}`,
    "",
    doc.summary,
    "",
    doc.details,
    "",
  ].join("\n");
}

export function listRuleIds(): string[] {
  return RULE_DOCS.map((d) => d.id);
}
