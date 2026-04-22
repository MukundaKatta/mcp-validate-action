export const VALID_TRANSPORTS = ["stdio", "sse", "streamable-http"] as const;

export const KNOWN_SERVER_FIELDS = new Set([
  "command",
  "args",
  "env",
  "url",
  "transport",
  "cwd",
  "headers",
  "disabled",
  "autoApprove",
  "alwaysAllow",
  "type", // Cursor/Windsurf alternative to transport
  "description",
  "icon",
  "name",
]);

/**
 * Regex patterns for secrets that should never be hardcoded. We match on a
 * conservative set of well-known prefixes used by popular API providers.
 *
 * `keyHint` (optional) scopes the check to env var names that match — used for
 * patterns like "any 32-char hex" which would otherwise fire on MD5 hashes,
 * UUIDs without dashes, and any other incidental hex string.
 */
export interface SecretPattern {
  name: string;
  re: RegExp;
  keyHint?: RegExp;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  { name: "OpenAI API key", re: /^sk-(proj-|svcacct-|admin-|live-)?[A-Za-z0-9_-]{20,}$/ },
  { name: "Anthropic API key", re: /^sk-ant-[A-Za-z0-9_-]{20,}$/ },
  { name: "Google AI API key", re: /^AIza[0-9A-Za-z_-]{30,}$/ },
  { name: "GitHub personal token", re: /^(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}$/ },
  { name: "GitHub fine-grained PAT", re: /^github_pat_[A-Za-z0-9_]{30,}$/ },
  { name: "GitLab personal token", re: /^glpat-[A-Za-z0-9_-]{20,}$/ },
  { name: "Slack bot token", re: /^xox[abp]-[0-9]+-[0-9]+-[A-Za-z0-9]+$/ },
  { name: "AWS access key", re: /^AKIA[0-9A-Z]{16}$/ },
  { name: "Stripe secret key", re: /^(sk|rk)_(live|test)_[A-Za-z0-9]{20,}$/ },
  { name: "Twilio API key", re: /^SK[0-9a-fA-F]{32}$/ },
  { name: "SendGrid API key", re: /^SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/ },
  { name: "Hugging Face token", re: /^hf_[A-Za-z0-9]{30,}$/ },
  { name: "npm access token", re: /^npm_[A-Za-z0-9]{36}$/ },
  { name: "Mailgun API key", re: /^key-[a-f0-9]{32}$/ },
  { name: "Replicate API token", re: /^r8_[A-Za-z0-9]{40,}$/ },
  { name: "Perplexity API key", re: /^pplx-[A-Za-z0-9]{40,}$/ },
  { name: "Groq API key", re: /^gsk_[A-Za-z0-9]{40,}$/ },
  { name: "xAI (Grok) API key", re: /^xai-[A-Za-z0-9]{30,}$/ },
  // Google Cloud service account keys are JSON blobs; people sometimes paste the
  // whole thing into a single env var value. Match on the private_key_id field,
  // which is always a 40-char hex string immediately preceded by that key name.
  {
    name: "Google Cloud service account JSON",
    re: /"private_key_id"\s*:\s*"[a-f0-9]{40}"/,
  },
  {
    name: "Azure / OpenAI-compatible API key",
    re: /^[a-f0-9]{32}$/i,
    // Only fire when the env var name actually suggests Azure OpenAI / Cognitive
    // Services, so we don't false-positive on MD5 hashes, UUID-hex forms, etc.
    keyHint: /AZURE|COGNITIVE|\bOAI\b|OPENAI/i,
  },
];

export const ENV_INTERPOLATION = /\$\{[A-Z_][A-Z0-9_]*\}|\$[A-Z_][A-Z0-9_]*/;
