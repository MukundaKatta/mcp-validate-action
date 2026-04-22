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
  { name: "Cloudflare API token", re: /^[A-Za-z0-9_-]{40}$/, keyHint: /CLOUDFLARE|CF[_-]?API|CF[_-]?TOKEN/i },
  { name: "Datadog API key", re: /^[a-f0-9]{32}$/i, keyHint: /DATADOG|\bDD[_-]?API|\bDD[_-]?KEY/i },
  { name: "Discord bot token", re: /^[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}$/ },
  // DB URIs with an embedded password. We match only when the URL is
  // postgres://user:password@host/... or mongodb://user:password@host/...
  // — the presence of `:<password>@` is the signal that the connection
  // string is carrying a credential rather than being a harmless URL.
  { name: "PostgreSQL URI with password", re: /^postgres(?:ql)?:\/\/[^:@\s]+:[^@\s]+@[^\s]+$/ },
  { name: "MongoDB URI with password", re: /^mongodb(?:\+srv)?:\/\/[^:@\s]+:[^@\s]+@[^\s]+$/ },
  { name: "Figma personal access token", re: /^figd_[A-Za-z0-9_-]{40,}$/ },
  { name: "Notion API token", re: /^secret_[A-Za-z0-9]{43}$/ },
  { name: "Linear API key", re: /^lin_api_[A-Za-z0-9]{40,}$/ },
  { name: "Sentry auth token", re: /^sntrys_[A-Za-z0-9_-]{60,}$/ },
  { name: "Auth0 client secret", re: /^[A-Za-z0-9_-]{64,}$/, keyHint: /AUTH0[_-]?CLIENT[_-]?SECRET/i },
  { name: "PlanetScale API token", re: /^pscale_(oauth|tkn)_[A-Za-z0-9_-]{40,}$/ },
  // Supabase service_role / anon keys are JWTs. Context-scoped so we don't
  // false-positive every 3-segment base64 string that looks like a JWT.
  {
    name: "Supabase service_role / anon JWT",
    re: /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/,
    keyHint: /SUPABASE/i,
  },
  // Sentry DSNs carry both the public and (older) secret key inline — any
  // URL of the shape https://<key>@<org>.ingest.sentry.io/<project> is a
  // leaked client identity even when it's "public", since it tells anyone
  // your project id and ingest host.
  { name: "Sentry DSN", re: /^https?:\/\/[a-f0-9]{32,}@[^\s/]+\.ingest\.sentry\.io\/\d+$/i },
  // Alibaba Cloud AccessKey IDs are "LTAI" + 16–20 chars. Context-scoped
  // because plain AccessKey-looking strings can appear in test data.
  { name: "Alibaba Cloud AccessKey", re: /^LTAI[A-Za-z0-9]{16,20}$/, keyHint: /ALIBABA|ALIYUN|ALIBABACLOUD/i },
  // Tencent Cloud SecretId starts with AKID + 32 alnum.
  { name: "Tencent Cloud SecretId", re: /^AKID[A-Za-z0-9]{32}$/ },
  // OpenAI session tokens used for user auth (different from API keys) —
  // very recognizable `sess-` prefix that only appears on session values.
  { name: "OpenAI session token", re: /^sess-[A-Za-z0-9]{40,}$/ },
  // Cohere API keys are UUID-dash format scoped to a specific env hint.
  {
    name: "Cohere API key",
    re: /^[A-Za-z0-9]{40}$/,
    keyHint: /COHERE/i,
  },
  // AI21 keys are short alnum — high false-positive risk unsupervised, so
  // strictly scoped to env names containing AI21.
  {
    name: "AI21 Labs API key",
    re: /^[A-Za-z0-9]{32,}$/,
    keyHint: /AI21/i,
  },
  // Intercom access tokens are a concatenation of 40+ alnum+underscore chars.
  { name: "Intercom access token", re: /^[A-Za-z0-9_-]{60,}=$/, keyHint: /INTERCOM/i },
  // Segment write keys are 32 chars alnum.
  { name: "Segment write key", re: /^[A-Za-z0-9]{32}$/, keyHint: /SEGMENT/i },
  // Retool personal tokens have a "retool_" prefix followed by alnum.
  { name: "Retool access token", re: /^retool_[A-Za-z0-9_-]{24,}$/ },
  // Pinecone API keys are UUID-shaped; context-scope so we don't fire on
  // every UUID-looking value.
  { name: "Pinecone API key", re: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, keyHint: /PINECONE/i },
  // DeepSeek uses the same `sk-` prefix as OpenAI; the OpenAI pattern
  // already catches these, so no dedicated entry (same label resolution
  // reasoning as Clerk → Stripe).
  // Supabase personal access tokens (different from the service_role JWT).
  { name: "Supabase personal access token", re: /^sbp_[a-f0-9]{40}$/ },
  { name: "Anyscale API key", re: /^esecret_[A-Za-z0-9]{40,}$/ },
  { name: "Inngest signing key", re: /^signkey-(prod|branch|test)-[A-Za-z0-9]{40,}$/ },
  { name: "Stripe webhook secret", re: /^whsec_[A-Za-z0-9]{32,}$/ },
  { name: "Slack webhook URL", re: /^https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8,}\/B[A-Z0-9]{8,}\/[A-Za-z0-9]{16,}$/ },
  { name: "Asana personal access token", re: /^[0-9]+\/[0-9]+:[A-Za-z0-9]{32}$/ },
  // Modal tokens — ak-... prefix (auth key) and as-... (auth secret).
  { name: "Modal auth token", re: /^a[ks]-[A-Za-z0-9_-]{40,}$/ },
  // Helicone — sk-helicone- prefix. Scope to the prefix so it doesn't clash
  // with the generic OpenAI sk- family.
  { name: "Helicone API key", re: /^sk-helicone-[A-Za-z0-9_-]{20,}$/ },
  // Airtable tokens start with `pat` + 14 alnum + `.` + 64 alnum.
  { name: "Airtable personal access token", re: /^pat[A-Za-z0-9]{14}\.[A-Za-z0-9]{64}$/ },
  // Vercel Blob read/write tokens: "vercel_blob_rw_" or "vercel_blob_ro_".
  { name: "Vercel Blob token", re: /^vercel_blob_(rw|ro)_[A-Za-z0-9_-]{40,}$/ },
  // Lambda Labs API keys — context-scoped since they're plain alnum.
  { name: "Lambda Labs API key", re: /^secret_[A-Za-z0-9_-]{40,}$/, keyHint: /LAMBDA/i },
  // Databricks personal access tokens — dapi prefix + 32 hex.
  { name: "Databricks access token", re: /^dapi[a-f0-9]{32}(-\d+)?$/ },
  // Bitbucket app passwords are alphanumeric; scope by env name.
  { name: "Bitbucket app password", re: /^[A-Za-z0-9]{20,}$/, keyHint: /BITBUCKET/i },
  // Freshdesk uses a user-alnum followed by a fixed "X" or similar tail.
  // Narrow prefix + length; context-scope for safety.
  { name: "Freshdesk API key", re: /^[A-Za-z0-9]{20,40}$/, keyHint: /FRESHDESK/i },
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
