/**
 * Build the mcpcheck web playground.
 *
 *  - Bundles `src/main.ts` + the mcpcheck browser entrypoint into a single
 *    self-contained script, then drops `index.html` and `styles.css` next
 *    to it so `dist/` is a ready-to-deploy static site (GitHub Pages, S3,
 *    Cloudflare Pages, whatever).
 *  - Watch mode (`--watch`) rebuilds on change and keeps dist up to date.
 *
 * Intentionally no framework or bundler dependency beyond esbuild: the whole
 * playground is <100 lines of DOM code, and adding React just to render three
 * panes would dwarf the mcpcheck bundle it's meant to showcase.
 */
import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "browser",
  target: "es2022",
  format: "iife",
  outfile: "dist/app.js",
  sourcemap: true,
  minify: !watch,
  logLevel: "info",
};

function copyStatics() {
  cpSync("public/index.html", "dist/index.html");
  cpSync("public/styles.css", "dist/styles.css");
  // Mirror both JSON schemas so the playground URL doubles as a stable
  // schema host:
  //   mukundakatta.github.io/mcpcheck/schema.json            -> mcpcheck.config.json
  //   mukundakatta.github.io/mcpcheck/mcp-config.schema.json -> mcp.json etc
  cpSync("../schema.json", "dist/schema.json");
  cpSync("../schema/mcp-config.schema.json", "dist/mcp-config.schema.json");
}

if (watch) {
  const ctx = await context({
    ...options,
    plugins: [
      {
        name: "copy-statics",
        setup(b) {
          b.onEnd(() => copyStatics());
        },
      },
    ],
  });
  await ctx.watch();
  console.log("esbuild: watching...");
} else {
  await build(options);
  copyStatics();
  console.log("playground: built to dist/");
}
