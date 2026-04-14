# Launch checklist for `mcp-validate-action`

## Ship v0.1.0

```bash
# 1. Create the repo
gh repo create MukundaKatta/mcp-validate-action --public --description "GitHub Action to validate MCP server configs (mcp.json, claude_desktop_config.json)"

# 2. Copy these files into a fresh checkout
cd ~/code
gh repo clone MukundaKatta/mcp-validate-action
cd mcp-validate-action
cp -r /Users/ubl/career-ops/output/tier2/mcp-validate-action/* .
cp /Users/ubl/career-ops/output/tier2/mcp-validate-action/.github . -r

# 3. Install, test, build
npm install
npm test
npm run build

# 4. First commit
git add -A
git commit -m "initial release: v0.1.0"

# 5. Tag and push
git tag -a v0.1.0 -m "v0.1.0"
git tag -a v1 -m "v1 rolling"
git push origin main --tags
```

## Publish to Marketplace

1. Visit https://github.com/MukundaKatta/mcp-validate-action/releases/new
2. Tag: `v0.1.0`
3. Check "Publish this Action to the GitHub Marketplace"
4. Pick category: `Code quality` or `Utilities`
5. Write short release notes

## Promote

1. **Post on X:**
   > "Shipped `mcp-validate-action` — a GitHub Action that validates MCP server configs (mcp.json, claude_desktop_config.json) on every push. Catches hardcoded API keys, invalid transports, and malformed JSON before they break Claude/Cursor/Cline at runtime.
   >
   > https://github.com/marketplace/actions/mcp-config-validator"

2. **Post to r/ClaudeAI and r/ChatGPTCoding:**
   Short: "Built a GitHub Action that validates MCP configs. If you commit mcp.json files and have fat-fingered one before, this catches it in CI."

3. **Comment on MCP GitHub Discussions:**
   https://github.com/orgs/modelcontextprotocol/discussions — post in Show and Tell.

4. **Open a PR to awesome-mcp lists:**
   - https://github.com/punkpeye/awesome-mcp-servers
   - https://github.com/wong2/awesome-mcp-servers
   Add a "Tooling" section entry.

## Why this works

- **First-mover on a narrow need.** Nobody else has this Action in the marketplace as of launch.
- **Zero maintenance friction.** Pure static validation, no external services, no secrets.
- **Broad audience.** Anyone committing MCP configs is a potential installer. That's a fast-growing population.
- **Every install = your avatar in someone's .github/workflows/ directory.** Permanent passive discovery.

## Followup features (v0.2+)

- Schema-based validation against published MCP JSON Schema once it's stable
- Lint `mcp.json` in VS Code settings files
- Detect circular server dependencies in multi-server configs
- Validate `resources` and `prompts` URIs when those ship
