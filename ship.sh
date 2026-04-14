#!/usr/bin/env bash
# One-shot ship script for mcp-validate-action v0.1.0
#
# What it does:
#   1. Validates prereqs (gh CLI, authenticated)
#   2. Creates the GitHub repo
#   3. Initializes git, commits all files, pushes
#   4. Creates release tags (v0.1.0, v1)
#   5. Opens the Marketplace listing URL in your browser
#
# What it does NOT do:
#   - Publish to Marketplace (requires manual clicks for legal reasons)
#   - Post to Reddit/X/HN (do manually after checking the listing)
#
# Run from the action directory:
#   cd /Users/ubl/career-ops/output/tier2/mcp-validate-action
#   bash ship.sh

set -euo pipefail

USER="MukundaKatta"
REPO="mcp-validate-action"
VERSION="v0.1.0"

echo "=== Ship: $USER/$REPO $VERSION ==="
echo ""

# Prereqs
for cmd in gh git node npm; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: $cmd not installed"; exit 1; }
done

gh auth status >/dev/null 2>&1 || { echo "ERROR: run 'gh auth login' first"; exit 1; }

# Confirm we're in the action directory
[[ -f action.yml ]] || { echo "ERROR: run from action directory (no action.yml here)"; exit 1; }
[[ -f dist/index.js ]] || { echo "ERROR: dist/index.js missing. Run 'npm run build' first."; exit 1; }

# Check repo doesn't already exist
if gh repo view "$USER/$REPO" >/dev/null 2>&1; then
  echo "ERROR: $USER/$REPO already exists. Delete it first or rename."
  exit 1
fi

echo "Pre-ship checks:"
npm test 2>&1 | tail -3
echo ""

read -p "Ready to create $USER/$REPO and push. Proceed? (y/N): " confirm
[[ "$confirm" == "y" || "$confirm" == "Y" ]] || { echo "Aborted."; exit 0; }

# Stage a clean copy (skip node_modules)
SHIP_DIR="/tmp/mcp-validate-action-ship-$$"
mkdir -p "$SHIP_DIR"
rsync -a --exclude=node_modules --exclude=.git ./ "$SHIP_DIR/"
cd "$SHIP_DIR"

# Rebuild dist cleanly to be safe
npm install --no-audit --no-fund 2>&1 | tail -3
npm run build 2>&1 | tail -3

# Initialize git
git init -q
git checkout -b main
git add -A
git -c user.name="Mukunda Katta" -c user.email="mukunda.vjcs6@gmail.com" \
  commit -q -m "feat: initial release v0.1.0

MCP Config Validator — GitHub Action that validates MCP server configs
(mcp.json, .mcp.json, claude_desktop_config.json) against the MCP spec.

Checks per server entry:
- Required fields present (command OR url)
- No hardcoded API keys in env
- Valid transport (stdio | sse | streamable-http)
- Valid URL format
- No conflicting transport/url/command combinations

Warnings for:
- Relative paths in command
- Unknown fields (may be client-specific)"

# Create the repo and push
echo "Creating GitHub repo..."
gh repo create "$USER/$REPO" --public \
  --description "GitHub Action to validate MCP (Model Context Protocol) server configs" \
  --source=. --remote=origin --push

# Tag the release
echo "Tagging $VERSION and v1..."
git tag -a "$VERSION" -m "$VERSION — initial release"
git tag -a "v1" -m "rolling v1 tag"
git push origin --tags

# Create GitHub release (draft → user can publish with Marketplace checkbox)
gh release create "$VERSION" \
  --repo "$USER/$REPO" \
  --title "v0.1.0 — initial release" \
  --notes "$(cat <<'RELEASE'
First release of **mcp-validate-action**.

## What it does

Validates MCP server configs (\`mcp.json\`, \`.mcp.json\`, \`claude_desktop_config.json\`) on every push. Catches common mistakes before they break clients like Claude Desktop, Cursor, or Cline at runtime.

## Checks

- ❌ Missing both \`command\` and \`url\`
- ❌ Both \`command\` and \`url\` (conflicting transports)
- ❌ Hardcoded API keys in \`env\` (\`sk-\`, \`ghp_\`, \`AIza\`, \`xoxb-\`)
- ❌ Invalid JSON
- ❌ Invalid transport (\`websocket\`, \`grpc\`, ...)
- ⚠️ Relative paths in \`command\`
- ⚠️ Unknown fields

## Usage

\`\`\`yaml
- uses: MukundaKatta/mcp-validate-action@v1
\`\`\`

See the [README](https://github.com/MukundaKatta/mcp-validate-action#readme) for options.
RELEASE
)" \
  --draft

echo ""
echo "=== Ship summary ==="
echo "  Repo:    https://github.com/$USER/$REPO"
echo "  Release: https://github.com/$USER/$REPO/releases"
echo ""
echo "NEXT STEPS (manual, 5 min):"
echo ""
echo "1. Open the draft release:"
echo "   https://github.com/$USER/$REPO/releases"
echo "   → check 'Publish this Action to the GitHub Marketplace'"
echo "   → pick category: Code quality / Utilities"
echo "   → accept Marketplace developer agreement (first time only)"
echo "   → click 'Publish release'"
echo ""
echo "2. Marketplace listing:"
echo "   https://github.com/marketplace/actions/mcp-config-validator"
echo ""
echo "3. Post to X (copy from LAUNCH.md)"
echo "4. Open PRs to awesome-mcp lists (see LAUNCH.md)"
echo ""

# Try to open release page
if command -v open >/dev/null 2>&1; then
  open "https://github.com/$USER/$REPO/releases"
fi
