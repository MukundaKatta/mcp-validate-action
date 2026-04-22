# mcpcheck playground

Paste an MCP config, see issues live, apply autofixes — entirely in the browser. Same engine as the CLI, GitHub Action, and VS Code extension.

## Develop

```bash
# From the repo root, the first time:
npm install && npm run build

# Then, in this directory:
cd playground
npm install
npm run watch    # esbuild watch mode, rebuilds on change
```

Open `dist/index.html` in a browser, or serve the `dist/` directory with any static HTTP server. The bundle is ~29 KB; `dist/` is a drop-in static site — there's no backend.

## Deploy

`main` branch pushes auto-deploy via `.github/workflows/pages.yml` to GitHub Pages. Enable Pages in the repo settings with the source set to **GitHub Actions**.

To deploy somewhere else, upload `playground/dist/` as-is (S3 + CloudFront, Cloudflare Pages, Netlify drop zone — all work).

## How it works

- `src/main.ts` imports from `mcpcheck/browser`, a subpath export that re-exports the pure (fs-free) parts of the library: `checkSource`, `applyFixes`, `locate`, `parseJsonc`, `explainRule`, and the rule docs.
- esbuild bundles everything into `dist/app.js` for the browser.
- Re-lints are debounced 200 ms; every diagnostic has a clickable rule-id that opens the same rule documentation the CLI's `--explain` command prints.
- No network calls. No telemetry. The config you paste never leaves the tab.
