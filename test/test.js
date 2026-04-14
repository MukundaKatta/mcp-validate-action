// Minimal smoke test — runs the validator against fixtures, checks expected error counts.
// Not a full unit-test suite; serves as a sanity check before release.

const fs = require('fs');
const path = require('path');
const os = require('os');

// Stub @actions/core so we can run validator logic standalone
const coreStub = {
  _out: {},
  _errors: [],
  _warnings: [],
  _info: [],
  _failed: null,
  getInput: (k) => '',
  getBooleanInput: () => false,
  setOutput: (k, v) => { coreStub._out[k] = v; },
  error: (msg) => coreStub._errors.push(msg),
  warning: (msg) => coreStub._warnings.push(msg),
  info: (msg) => coreStub._info.push(msg),
  setFailed: (msg) => { coreStub._failed = msg; },
  startGroup: () => {},
  endGroup: () => {},
};
require.cache[require.resolve('@actions/core')] = { exports: coreStub };

const fixtures = [
  {
    name: 'valid stdio server',
    config: {
      mcpServers: {
        everything: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-everything']
        }
      }
    },
    expectErrors: 0,
  },
  {
    name: 'valid http server',
    config: {
      mcpServers: {
        remote: { url: 'https://mcp.example.com/sse' }
      }
    },
    expectErrors: 0,
  },
  {
    name: 'missing command and url',
    config: { mcpServers: { bad: { args: ['foo'] } } },
    expectErrors: 1,
  },
  {
    name: 'both command and url',
    config: {
      mcpServers: {
        bad: { command: 'npx', url: 'https://example.com' }
      }
    },
    expectErrors: 1,
  },
  {
    name: 'hardcoded API key in env',
    config: {
      mcpServers: {
        leaky: {
          command: 'node',
          env: { OPENAI_API_KEY: 'sk-proj-hardcoded-secret-DO-NOT-USE' }
        }
      }
    },
    expectErrors: 1,
  },
  {
    name: 'invalid transport',
    config: {
      mcpServers: {
        wat: { command: 'npx', transport: 'websocket' }
      }
    },
    expectErrors: 1,
  },
  {
    name: 'relative path warning',
    config: {
      mcpServers: { local: { command: './scripts/run.sh' } }
    },
    expectErrors: 0,
    expectWarnings: 1,
  },
];

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-validate-'));
let passed = 0;
let failed = 0;

// Load the validator functions directly (skip run())
const srcPath = path.resolve(__dirname, '../src/index.js');
const src = fs.readFileSync(srcPath, 'utf8');
// Extract validateFile for direct testing
const validateFileMatch = /function validateFile[\s\S]*?^}/m.exec(src);
const validateServerMatch = /function validateServer[\s\S]*?^}/m.exec(src);
const constsMatch = /const VALID_TRANSPORTS[\s\S]*?const KNOWN_SERVER_FIELDS = new Set\([^)]+\);/;

const testScript = `
const fs = require('fs');
${constsMatch.exec(src)[0]}
${validateServerMatch[0]}
${validateFileMatch[0]}
module.exports = { validateFile };
`;

const testModulePath = path.join(tmpDir, 'validator.js');
fs.writeFileSync(testModulePath, testScript);
const { validateFile } = require(testModulePath);

for (const fx of fixtures) {
  const filePath = path.join(tmpDir, `${fx.name.replace(/\s/g, '-')}.json`);
  fs.writeFileSync(filePath, JSON.stringify(fx.config, null, 2));

  const issues = validateFile(filePath);
  const errorsOK = issues.errors.length === fx.expectErrors;
  const warningsOK = fx.expectWarnings === undefined || issues.warnings.length >= fx.expectWarnings;

  if (errorsOK && warningsOK) {
    console.log(`✓ ${fx.name}`);
    passed++;
  } else {
    console.log(`✗ ${fx.name}`);
    console.log(`  expected errors=${fx.expectErrors}, got ${issues.errors.length}: ${JSON.stringify(issues.errors)}`);
    if (fx.expectWarnings !== undefined) {
      console.log(`  expected warnings≥${fx.expectWarnings}, got ${issues.warnings.length}: ${JSON.stringify(issues.warnings)}`);
    }
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
