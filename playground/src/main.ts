/**
 * mcpcheck web playground — client-side driver.
 *
 * The UI is intentionally plain DOM: one <textarea>, a results pane, a couple
 * of buttons, a dialog for rule explanations. All the work is delegated to
 * the `mcpcheck` browser entry (`checkSource`, `applyFixes`, `explainRule`).
 *
 * Re-lints are debounced by 200ms so typing feels live without blowing up
 * on very large configs. Autofix is applied in one pass, then the lint
 * re-runs so the secret-substitution disappears from the diagnostics list
 * immediately.
 */

import {
  checkSource,
  applyFixes,
  explainRule,
  type Issue,
} from "mcpcheck/browser";

const SAMPLE = `{
  // Paste your MCP config here. This sample shows what a real
  // misconfigured config looks like — try hitting "Fix all".
  "mcpServers": {
    "leaky": {
      "command": "node",
      "args": ["server.js"],
      "env": {
        "OPENAI_API_KEY": "sk-proj-hardcodedVALUE1234567890abcdefghij"
      }
    },
    "unpinned": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "dangerous": {
      "command": "bash",
      "args": ["-c", "curl https://example.com/install.sh | sh"]
    },
    "relative": {
      "command": "./scripts/run.sh"
    }
  }
}
`;

const $input = document.getElementById("input") as HTMLTextAreaElement;
const $filename = document.getElementById("filename") as HTMLInputElement;
const $sample = document.getElementById("sample") as HTMLButtonElement;
const $fix = document.getElementById("fix") as HTMLButtonElement;
const $summary = document.getElementById("summary") as HTMLDivElement;
const $issues = document.getElementById("issues") as HTMLOListElement;
const $dialog = document.getElementById("explain-dialog") as HTMLDialogElement;
const $dialogTitle = document.getElementById("explain-title") as HTMLElement;
const $dialogBody = document.getElementById("explain-body") as HTMLElement;

let debounce: number | undefined;

function run(): void {
  const source = $input.value;
  const file = $filename.value || "mcp.json";

  if (!source.trim()) {
    $summary.textContent = "Start typing to see diagnostics…";
    $summary.className = "summary";
    $issues.replaceChildren();
    $fix.disabled = true;
    return;
  }

  const report = checkSource(source, file);
  renderReport(report.issues);
}

function scheduleRun(): void {
  if (debounce !== undefined) window.clearTimeout(debounce);
  debounce = window.setTimeout(run, 200);
}

function renderReport(issues: Issue[]): void {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const infos = issues.filter((i) => i.severity === "info").length;
  const fixable = issues.filter((i) => i.fix).length;

  if (issues.length === 0) {
    $summary.textContent = "No issues. ✓";
    $summary.className = "summary ok";
  } else {
    const parts: string[] = [];
    if (errors) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
    if (warnings) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
    if (infos) parts.push(`${infos} info`);
    $summary.textContent = parts.join(", ") + (fixable ? `  •  ${fixable} autofixable` : "");
    $summary.className = "summary " + (errors > 0 ? "err" : "warn");
  }
  $fix.disabled = fixable === 0;

  $issues.replaceChildren(...issues.map(renderIssue));
}

function renderIssue(issue: Issue): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "issue";

  const loc = document.createElement("span");
  loc.className = "loc";
  loc.textContent = issue.line ? `line ${issue.line}` : "—";
  li.appendChild(loc);

  const sev = document.createElement("span");
  sev.className = `sev ${issue.severity}`;
  sev.textContent = issue.severity;
  li.appendChild(sev);

  const body = document.createElement("div");
  body.className = "body";

  const msg = document.createElement("div");
  msg.textContent = issue.message + " ";
  const ruleBtn = document.createElement("button");
  ruleBtn.className = "rule";
  ruleBtn.type = "button";
  ruleBtn.textContent = issue.ruleId;
  ruleBtn.title = `Explain ${issue.ruleId}`;
  ruleBtn.addEventListener("click", () => openExplain(issue.ruleId));
  msg.appendChild(ruleBtn);
  body.appendChild(msg);

  if (issue.jsonPath) {
    const path = document.createElement("div");
    path.className = "path";
    path.textContent = "at " + issue.jsonPath;
    body.appendChild(path);
  }

  if (issue.fix) {
    const fix = document.createElement("div");
    fix.className = "fix";
    fix.textContent = "fix: " + issue.fix.description;
    body.appendChild(fix);
  }

  li.appendChild(body);
  return li;
}

function openExplain(ruleId: string): void {
  const text = explainRule(ruleId);
  if (!text) {
    $dialogTitle.textContent = ruleId;
    $dialogBody.textContent = "No documentation found for this rule.";
  } else {
    // Split the first line off as a title; the rest stays in the <pre>.
    const nl = text.indexOf("\n");
    $dialogTitle.textContent = nl > 0 ? text.slice(0, nl) : ruleId;
    $dialogBody.textContent = nl > 0 ? text.slice(nl + 1).trimStart() : text;
  }
  $dialog.showModal();
}

function fixAll(): void {
  const source = $input.value;
  const file = $filename.value || "mcp.json";
  const report = checkSource(source, file);
  const { output, applied } = applyFixes(source, report.issues);
  if (applied.length === 0) return;
  $input.value = output;
  run();
  // Briefly flash the summary to signal that something happened.
  const prev = $summary.textContent ?? "";
  $summary.textContent = `Applied ${applied.length} autofix(es). ${prev}`;
  window.setTimeout(run, 1000);
}

$input.addEventListener("input", scheduleRun);
$filename.addEventListener("input", scheduleRun);
$sample.addEventListener("click", () => {
  $input.value = SAMPLE;
  run();
});
$fix.addEventListener("click", fixAll);

// Boot: load the sample so the page is useful immediately.
$input.value = SAMPLE;
run();
