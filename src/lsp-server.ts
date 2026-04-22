/**
 * `mcpcheck lsp` — Language Server Protocol server on stdio.
 *
 * Covers the minimum every editor client needs: initialize lifecycle,
 * `textDocument/didOpen` / `didChange` (full sync) / `didSave` / `didClose`,
 * and `textDocument/publishDiagnostics`. No code actions yet — the VS Code
 * extension handles those directly; other LSP clients can add them later.
 *
 * Framing: LSP-classic Content-Length headers with `\r\n\r\n` separators.
 * Logs to stderr; stdout is reserved for protocol messages.
 */

import { checkSource } from "./core.js";
import { locate } from "./locate.js";
import type { Issue } from "./types.js";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

const MCP_FILENAME_RE =
  /(mcp\.json|\.mcp\.json|claude_desktop_config\.json|cline_mcp_settings\.json|\.cursor\/mcp\.json|\.codeium\/windsurf\/mcp_config\.json|\.claude\/mcp\.json|\.claude\.json)$/;

const openDocs = new Map<string, string>();

export async function runLspServer(): Promise<void> {
  process.stdin.setEncoding("utf8");
  let buf = "";
  process.stdin.on("data", (chunk: string) => {
    buf += chunk;
    for (;;) {
      const parsed = tryReadMessage(buf);
      if (!parsed) break;
      buf = parsed.rest;
      void handle(parsed.message);
    }
  });
  process.stderr.write("[mcpcheck] LSP server listening on stdio\n");
}

function tryReadMessage(buf: string): { message: JsonRpcMessage; rest: string } | undefined {
  const headerEnd = buf.indexOf("\r\n\r\n");
  if (headerEnd < 0) return undefined;
  const header = buf.slice(0, headerEnd);
  const m = /Content-Length:\s*(\d+)/i.exec(header);
  if (!m) return undefined;
  const len = Number.parseInt(m[1]!, 10);
  const bodyStart = headerEnd + 4;
  if (buf.length < bodyStart + len) return undefined;
  const body = buf.slice(bodyStart, bodyStart + len);
  try {
    return { message: JSON.parse(body) as JsonRpcMessage, rest: buf.slice(bodyStart + len) };
  } catch {
    return { message: { jsonrpc: "2.0" }, rest: buf.slice(bodyStart + len) };
  }
}

function send(message: JsonRpcMessage): void {
  const body = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
  process.stdout.write(header + body);
}

async function handle(msg: JsonRpcMessage): Promise<void> {
  const { method, id, params } = msg;
  const p = (params ?? {}) as Record<string, unknown>;
  try {
    switch (method) {
      case "initialize":
        send({
          jsonrpc: "2.0",
          id: id!,
          result: {
            capabilities: {
              textDocumentSync: { openClose: true, change: 1, save: { includeText: true } },
              diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
            },
            serverInfo: { name: "mcpcheck-lsp", version: "1.0.0" },
          },
        });
        return;
      case "initialized":
        return;
      case "shutdown":
        send({ jsonrpc: "2.0", id: id!, result: null });
        return;
      case "exit":
        process.exit(0);
        return;
      case "textDocument/didOpen": {
        const td = (p["textDocument"] ?? {}) as { uri: string; text: string };
        openDocs.set(td.uri, td.text);
        publishDiagnostics(td.uri);
        return;
      }
      case "textDocument/didChange": {
        const td = (p["textDocument"] ?? {}) as { uri: string };
        const changes = ((p["contentChanges"] ?? []) as Array<{ text: string }>);
        const last = changes[changes.length - 1];
        if (last?.text !== undefined) openDocs.set(td.uri, last.text);
        publishDiagnostics(td.uri);
        return;
      }
      case "textDocument/didSave": {
        const td = (p["textDocument"] ?? {}) as { uri: string };
        const text = p["text"];
        if (typeof text === "string") openDocs.set(td.uri, text);
        publishDiagnostics(td.uri);
        return;
      }
      case "textDocument/didClose": {
        const td = (p["textDocument"] ?? {}) as { uri: string };
        openDocs.delete(td.uri);
        send({
          jsonrpc: "2.0",
          method: "textDocument/publishDiagnostics",
          params: { uri: td.uri, diagnostics: [] },
        });
        return;
      }
      default:
        if (id !== undefined) {
          send({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Method not found: ${method ?? ""}` },
          });
        }
    }
  } catch (err) {
    if (id !== undefined) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: (err as Error).message },
      });
    }
  }
}

function publishDiagnostics(uri: string): void {
  const source = openDocs.get(uri);
  if (source === undefined) return;
  const path = uriToPath(uri);
  if (!MCP_FILENAME_RE.test(path)) {
    send({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri, diagnostics: [] },
    });
    return;
  }
  const report = checkSource(source, path);
  const diags = report.issues.map((i) => issueToDiagnostic(source, i));
  send({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: { uri, diagnostics: diags },
  });
}

function issueToDiagnostic(source: string, issue: Issue): unknown {
  const range = rangeFor(source, issue);
  const severity = issue.severity === "error" ? 1 : issue.severity === "warning" ? 2 : 3;
  return {
    range,
    severity,
    code: issue.ruleId,
    source: "mcpcheck",
    message: issue.message,
  };
}

function rangeFor(source: string, issue: Issue): unknown {
  if (issue.fix) {
    return {
      start: offsetToLsp(source, issue.fix.start),
      end: offsetToLsp(source, issue.fix.end),
    };
  }
  if (issue.jsonPath) {
    const loc = locate(source, issue.jsonPath);
    if (loc) {
      return {
        start: offsetToLsp(source, loc.startOffset),
        end: offsetToLsp(source, loc.endOffset),
      };
    }
  }
  const line = Math.max(0, (issue.line ?? 1) - 1);
  return { start: { line, character: 0 }, end: { line: line + 1, character: 0 } };
}

function offsetToLsp(source: string, offset: number): { line: number; character: number } {
  let line = 0;
  let col = 0;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === "\n") {
      line += 1;
      col = 0;
    } else {
      col += 1;
    }
  }
  return { line, character: col };
}

function uriToPath(uri: string): string {
  if (uri.startsWith("file://")) {
    try {
      return decodeURIComponent(uri.slice(7));
    } catch {
      return uri.slice(7);
    }
  }
  return uri;
}
