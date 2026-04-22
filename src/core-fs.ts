/**
 * Node-only file-system entry points that sit on top of the pure `checkSource`
 * in `core.ts`. Split out so `core.ts` can be bundled for the browser without
 * pulling in `node:fs`.
 */

import { readFile } from "node:fs/promises";
import { checkSource, aggregateReports, type CheckOptions } from "./core.js";
import type { FileReport, RunReport } from "./types.js";

/**
 * Validate a list of files on disk, returning one RunReport with aggregate
 * counts and total duration.
 */
export async function checkFiles(
  files: string[],
  opts: CheckOptions = {}
): Promise<RunReport> {
  const start = Date.now();
  const results: FileReport[] = [];
  for (const file of files) {
    try {
      const source = await readFile(file, "utf8");
      results.push(checkSource(source, file, opts));
    } catch (err) {
      results.push({
        file,
        fatal: true,
        issues: [
          {
            ruleId: "unreadable",
            severity: "error",
            message: `Could not read file: ${(err as Error).message}`,
            jsonPath: "",
          },
        ],
      });
    }
  }
  return aggregateReports(results, Date.now() - start);
}
