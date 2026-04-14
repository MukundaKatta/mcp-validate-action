// MCP Config Validator — GitHub Action entry point
// Validates mcp.json / claude_desktop_config.json / .mcp.json files against MCP spec.
//
// Checks per server entry:
//   - Required fields present (command OR url)
//   - command is a string if present
//   - args is an array of strings if present
//   - env is an object with string values if present
//   - url is a valid URL if present
//   - transport is "stdio" | "sse" | "streamable-http" if present
//   - No conflicting transport/url/command combinations
//   - Warnings for common mistakes (hardcoded API keys, relative paths, unknown fields)

const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');
const core = require('@actions/core');

const VALID_TRANSPORTS = ['stdio', 'sse', 'streamable-http'];
const KNOWN_SERVER_FIELDS = new Set(['command', 'args', 'env', 'url', 'transport', 'cwd', 'headers', 'disabled', 'autoApprove', 'alwaysAllow']);

function validateServer(name, server, issues) {
  if (typeof server !== 'object' || server === null || Array.isArray(server)) {
    issues.errors.push(`servers.${name}: must be an object`);
    return;
  }

  const hasCommand = 'command' in server;
  const hasUrl = 'url' in server;

  if (!hasCommand && !hasUrl) {
    issues.errors.push(`servers.${name}: must have either "command" (stdio) or "url" (http/sse)`);
  }
  if (hasCommand && hasUrl) {
    issues.errors.push(`servers.${name}: cannot have both "command" and "url"; pick a transport`);
  }

  if (hasCommand) {
    if (typeof server.command !== 'string' || !server.command.trim()) {
      issues.errors.push(`servers.${name}.command: must be a non-empty string`);
    } else if (server.command.startsWith('./') || server.command.startsWith('../')) {
      issues.warnings.push(`servers.${name}.command: relative path "${server.command}" is fragile — prefer absolute path or a command on PATH`);
    }
    if ('args' in server) {
      if (!Array.isArray(server.args)) {
        issues.errors.push(`servers.${name}.args: must be an array`);
      } else {
        server.args.forEach((a, i) => {
          if (typeof a !== 'string') {
            issues.errors.push(`servers.${name}.args[${i}]: must be a string`);
          }
        });
      }
    }
  }

  if (hasUrl) {
    if (typeof server.url !== 'string') {
      issues.errors.push(`servers.${name}.url: must be a string`);
    } else {
      try {
        const parsed = new URL(server.url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          issues.errors.push(`servers.${name}.url: protocol must be http or https`);
        }
      } catch {
        issues.errors.push(`servers.${name}.url: not a valid URL`);
      }
    }
  }

  if ('transport' in server) {
    if (!VALID_TRANSPORTS.includes(server.transport)) {
      issues.errors.push(`servers.${name}.transport: must be one of ${VALID_TRANSPORTS.join(', ')}`);
    }
    if (hasCommand && server.transport !== 'stdio') {
      issues.warnings.push(`servers.${name}: transport="${server.transport}" but has "command" — stdio is implied for command-based servers`);
    }
  }

  if ('env' in server) {
    if (typeof server.env !== 'object' || server.env === null || Array.isArray(server.env)) {
      issues.errors.push(`servers.${name}.env: must be an object`);
    } else {
      for (const [k, v] of Object.entries(server.env)) {
        if (typeof v !== 'string') {
          issues.errors.push(`servers.${name}.env.${k}: must be a string`);
        } else if (/^(sk-|AIza|xoxb-|ghp_|gho_|github_pat_)/.test(v)) {
          issues.errors.push(`servers.${name}.env.${k}: looks like a hardcoded API key/secret — use "\${VAR_NAME}" or env var substitution instead`);
        } else if (/\$\{[A-Z_][A-Z0-9_]*\}/.test(v)) {
          // OK — using variable substitution
        }
      }
    }
  }

  // Unknown fields → warning
  for (const k of Object.keys(server)) {
    if (!KNOWN_SERVER_FIELDS.has(k)) {
      issues.warnings.push(`servers.${name}.${k}: unknown field (may be client-specific)`);
    }
  }
}

function validateFile(filePath) {
  const issues = { errors: [], warnings: [] };
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    issues.errors.push(`failed to read: ${e.message}`);
    return issues;
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    issues.errors.push(`invalid JSON: ${e.message}`);
    return issues;
  }

  const servers = json.mcpServers ?? json.servers;
  if (!servers) {
    issues.warnings.push(`no "mcpServers" or "servers" key found — is this an MCP config?`);
    return issues;
  }
  if (typeof servers !== 'object' || Array.isArray(servers)) {
    issues.errors.push(`"mcpServers" must be an object keyed by server name`);
    return issues;
  }

  if (Object.keys(servers).length === 0) {
    issues.warnings.push(`empty servers object`);
  }

  for (const [name, server] of Object.entries(servers)) {
    validateServer(name, server, issues);
  }

  return issues;
}

async function run() {
  try {
    const configPath = core.getInput('config-path') || '**/{mcp,claude_desktop_config,.mcp}.json';
    const strict = core.getBooleanInput('strict');
    const failOnMissing = core.getBooleanInput('fail-on-missing');

    const files = globSync(configPath, {
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
    });

    if (files.length === 0) {
      const msg = `No files matched "${configPath}"`;
      if (failOnMissing) core.setFailed(msg);
      else core.warning(msg);
      core.setOutput('files-checked', 0);
      core.setOutput('errors', 0);
      core.setOutput('warnings', 0);
      return;
    }

    let totalErrors = 0;
    let totalWarnings = 0;

    for (const file of files) {
      const issues = validateFile(file);
      if (issues.errors.length === 0 && issues.warnings.length === 0) {
        core.info(`✓ ${file}`);
        continue;
      }
      core.startGroup(`${file} — ${issues.errors.length} error(s), ${issues.warnings.length} warning(s)`);
      for (const e of issues.errors) {
        core.error(e, { file });
        totalErrors++;
      }
      for (const w of issues.warnings) {
        core.warning(w, { file });
        totalWarnings++;
      }
      core.endGroup();
    }

    core.setOutput('files-checked', files.length);
    core.setOutput('errors', totalErrors);
    core.setOutput('warnings', totalWarnings);

    core.info(`\nChecked ${files.length} file(s): ${totalErrors} error(s), ${totalWarnings} warning(s)`);

    if (totalErrors > 0) {
      core.setFailed(`${totalErrors} validation error(s) found`);
    } else if (strict && totalWarnings > 0) {
      core.setFailed(`strict mode: ${totalWarnings} warning(s) found`);
    }
  } catch (e) {
    core.setFailed(`action crashed: ${e.message}`);
  }
}

run();
