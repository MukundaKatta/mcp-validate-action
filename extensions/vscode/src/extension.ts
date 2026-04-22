/**
 * mcpcheck VS Code extension entry point.
 *
 * Responsibilities:
 *   1. Watch JSON/JSONC files and, for those whose path matches an MCP config
 *      pattern, run mcpcheck and publish `vscode.Diagnostic`s.
 *   2. Expose the autofixes mcpcheck already produces as `CodeAction`s.
 *   3. Provide three commands: lint active file, fix all in active file,
 *      explain a rule (shown as a Markdown preview).
 *
 * Heavy work is done by the bundled `mcpcheck` library. The extension is thin
 * translation from mcpcheck's `Issue` / `Fix` types to VS Code's diagnostic
 * and code-action model.
 */

import * as vscode from "vscode";
import * as path from "node:path";
import {
  checkSource,
  locate,
  explainRule,
  listRuleIds,
  type Issue,
  type FileReport,
} from "mcpcheck";

const DIAGNOSTIC_SOURCE = "mcpcheck";

/**
 * Map from a published diagnostic back to the underlying mcpcheck Issue. We
 * need this for the CodeActionProvider — `vscode.Diagnostic` has no way to
 * carry arbitrary payload, and re-linting inside `provideCodeActions` would
 * double the work.
 */
const diagnosticIssues = new WeakMap<vscode.Diagnostic, Issue>();

/** Debounce handles per document URI (for `runOn: onType`). */
const pendingLints = new Map<string, NodeJS.Timeout>();

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  context.subscriptions.push(collection);

  const lintIfEligible = (doc: vscode.TextDocument) => {
    if (!isLintable(doc)) {
      collection.delete(doc.uri);
      return;
    }
    lintDocument(doc, collection);
  };

  // Initial pass over whatever's already open.
  for (const doc of vscode.workspace.textDocuments) lintIfEligible(doc);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(lintIfEligible),
    vscode.workspace.onDidSaveTextDocument(lintIfEligible),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      collection.delete(doc.uri);
      const key = doc.uri.toString();
      const handle = pendingLints.get(key);
      if (handle) {
        clearTimeout(handle);
        pendingLints.delete(key);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (runOnSetting() !== "onType") return;
      scheduleLint(e.document, collection);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("mcpcheck.enable") ||
        e.affectsConfiguration("mcpcheck.filePatterns")
      ) {
        collection.clear();
        for (const doc of vscode.workspace.textDocuments) lintIfEligible(doc);
      }
    }),
    vscode.languages.registerCodeActionsProvider(
      [
        { scheme: "file", language: "json" },
        { scheme: "file", language: "jsonc" },
      ],
      new McpcheckCodeActionProvider(),
      {
        providedCodeActionKinds: [
          vscode.CodeActionKind.QuickFix,
          vscode.CodeActionKind.SourceFixAll,
        ],
      }
    ),
    vscode.commands.registerCommand("mcpcheck.lint", () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (doc) lintIfEligible(doc);
    }),
    vscode.commands.registerCommand("mcpcheck.fixAll", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("mcpcheck: no active editor");
        return;
      }
      await applyAllFixes(editor.document);
      lintIfEligible(editor.document);
    }),
    vscode.commands.registerCommand("mcpcheck.explainRule", async (id?: string) => {
      // Resolution order:
      //   1. explicit argument (from the diagnostic code-link)
      //   2. the mcpcheck diagnostic under the cursor in the active editor
      //   3. a quickpick of every known rule id (manual discovery)
      let ruleId = id;
      if (!ruleId) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const cursor = editor.selection.active;
          const diags = vscode.languages.getDiagnostics(editor.document.uri);
          const atCursor = diags
            .filter((d) => d.source === DIAGNOSTIC_SOURCE && d.range.contains(cursor))
            .sort((a, b) => a.range.start.character - b.range.start.character)[0];
          if (atCursor?.code) {
            const code = atCursor.code;
            if (typeof code === "string" || typeof code === "number") {
              ruleId = String(code);
            } else if (typeof code === "object" && "value" in code) {
              ruleId = String(code.value);
            }
          }
        }
      }
      if (!ruleId) {
        ruleId = await vscode.window.showQuickPick(listRuleIds(), {
          placeHolder: "Pick a rule to explain",
        });
      }
      if (!ruleId) return;
      const text = explainRule(ruleId);
      if (!text) {
        vscode.window.showWarningMessage(`mcpcheck: unknown rule "${ruleId}"`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        content: text,
        language: "markdown",
      });
      await vscode.commands.executeCommand("markdown.showPreview", doc.uri);
    })
  );
}

export function deactivate(): void {
  for (const handle of pendingLints.values()) clearTimeout(handle);
  pendingLints.clear();
}

function scheduleLint(
  doc: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): void {
  if (!isLintable(doc)) return;
  const key = doc.uri.toString();
  const existing = pendingLints.get(key);
  if (existing) clearTimeout(existing);
  pendingLints.set(
    key,
    setTimeout(() => {
      pendingLints.delete(key);
      lintDocument(doc, collection);
    }, 300)
  );
}

/**
 * Does this document look like an MCP config we should lint? Checks the
 * user's configured glob patterns against the file's path, with a JSON /
 * JSONC language gate to avoid running on anything else.
 */
function isLintable(doc: vscode.TextDocument): boolean {
  if (!enabled()) return false;
  if (doc.uri.scheme !== "file") return false;
  if (doc.languageId !== "json" && doc.languageId !== "jsonc") return false;
  const relative = vscode.workspace.asRelativePath(doc.uri, false);
  const patterns = filePatterns();
  for (const pattern of patterns) {
    // Match against both the workspace-relative path and the basename-only form
    // so a user who opens `~/.cursor/mcp.json` outside any workspace still
    // gets linted against their `**/.cursor/mcp.json` pattern.
    const abs = doc.uri.fsPath;
    if (vscode.languages.match({ pattern }, doc) > 0) return true;
    if (
      minimatchLike(relative, pattern) ||
      minimatchLike(abs, pattern) ||
      minimatchLike(path.basename(abs), pattern)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Pragmatic glob matcher — we only need to support the patterns shipped in
 * the default config (`**\/foo.json`, `**\/.cursor/mcp.json`, ...). The full
 * minimatch dependency would be overkill for a handful of patterns, and the
 * real matching duty is already handled by `vscode.languages.match` above.
 */
function minimatchLike(target: string, pattern: string): boolean {
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/[.+^$|()[\]{}]/g, "\\$&")
        .replace(/\*\*\/?/g, "(?:.+/)?")
        .replace(/\*/g, "[^/]*") +
      "$"
  );
  return regex.test(target);
}

function lintDocument(
  doc: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): void {
  try {
    const source = doc.getText();
    const report: FileReport = checkSource(source, doc.fileName);
    const diagnostics: vscode.Diagnostic[] = report.issues.map((issue) => {
      const range = rangeForIssue(doc, source, issue);
      const diag = new vscode.Diagnostic(range, issue.message, severityFor(issue.severity));
      diag.source = DIAGNOSTIC_SOURCE;
      diag.code = {
        value: issue.ruleId,
        target: vscode.Uri.parse(
          `command:mcpcheck.explainRule?${encodeURIComponent(
            JSON.stringify([issue.ruleId])
          )}`
        ),
      };
      diagnosticIssues.set(diag, issue);
      return diag;
    });
    collection.set(doc.uri, diagnostics);
  } catch (err) {
    // Never let a lint crash the editor — surface the error and clear.
    collection.delete(doc.uri);
    console.error("mcpcheck: lint error", err);
  }
}

function rangeForIssue(
  doc: vscode.TextDocument,
  source: string,
  issue: Issue
): vscode.Range {
  // Prefer the autofix range (most precise), then locate() from the jsonPath,
  // then fall back to the whole line reported by the issue.
  if (issue.fix) {
    return new vscode.Range(
      doc.positionAt(issue.fix.start),
      doc.positionAt(issue.fix.end)
    );
  }
  if (issue.jsonPath) {
    const loc = locate(source, issue.jsonPath);
    if (loc) {
      return new vscode.Range(
        doc.positionAt(loc.startOffset),
        doc.positionAt(loc.endOffset)
      );
    }
  }
  const line = Math.max(0, (issue.line ?? 1) - 1);
  const lineText = doc.lineAt(Math.min(line, doc.lineCount - 1));
  return lineText.range;
}

function severityFor(s: Issue["severity"]): vscode.DiagnosticSeverity {
  switch (s) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "info":
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Hint;
  }
}

class McpcheckCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const relevant = context.diagnostics.filter((d) => d.source === DIAGNOSTIC_SOURCE);
    for (const diag of relevant) {
      const issue = diagnosticIssues.get(diag);
      if (!issue?.fix) continue;
      const action = new vscode.CodeAction(
        issue.fix.description,
        vscode.CodeActionKind.QuickFix
      );
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(
        document.uri,
        new vscode.Range(
          document.positionAt(issue.fix.start),
          document.positionAt(issue.fix.end)
        ),
        issue.fix.replacement
      );
      action.diagnostics = [diag];
      action.isPreferred = true;
      actions.push(action);
    }
    // One "fix all" action when there's more than one fixable diagnostic.
    const fixable = relevant.filter((d) => diagnosticIssues.get(d)?.fix);
    if (fixable.length > 1) {
      const all = new vscode.CodeAction(
        `mcpcheck: fix all ${fixable.length} autofixable issue(s)`,
        vscode.CodeActionKind.SourceFixAll
      );
      all.edit = new vscode.WorkspaceEdit();
      for (const diag of fixable) {
        const issue = diagnosticIssues.get(diag)!;
        all.edit.replace(
          document.uri,
          new vscode.Range(
            document.positionAt(issue.fix!.start),
            document.positionAt(issue.fix!.end)
          ),
          issue.fix!.replacement
        );
      }
      all.diagnostics = fixable;
      actions.push(all);
    }
    return actions;
  }
}

async function applyAllFixes(doc: vscode.TextDocument): Promise<void> {
  const report = checkSource(doc.getText(), doc.fileName);
  const fixable = report.issues.filter((i) => i.fix);
  if (fixable.length === 0) {
    vscode.window.showInformationMessage("mcpcheck: no autofixable issues in this file");
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  for (const issue of fixable) {
    edit.replace(
      doc.uri,
      new vscode.Range(
        doc.positionAt(issue.fix!.start),
        doc.positionAt(issue.fix!.end)
      ),
      issue.fix!.replacement
    );
  }
  await vscode.workspace.applyEdit(edit);
}

function enabled(): boolean {
  return vscode.workspace.getConfiguration("mcpcheck").get<boolean>("enable", true);
}

function filePatterns(): string[] {
  return (
    vscode.workspace
      .getConfiguration("mcpcheck")
      .get<string[]>("filePatterns") ?? []
  );
}

function runOnSetting(): "onType" | "onSave" {
  return vscode.workspace
    .getConfiguration("mcpcheck")
    .get<"onType" | "onSave">("runOn", "onType");
}
