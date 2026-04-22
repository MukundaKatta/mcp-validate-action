/**
 * Node-only config-file loading. Kept separate from `config.ts` so the pure
 * defaults and merging logic can be bundled for the browser.
 */

import { readFileSync } from "node:fs";
import { mergeConfig } from "./config.js";
import type { Mcpcheckconfig } from "./types.js";

export function loadConfigFile(path: string): Mcpcheckconfig {
  const raw = readFileSync(path, "utf8");
  return mergeConfig(JSON.parse(raw) as Partial<Mcpcheckconfig>);
}
