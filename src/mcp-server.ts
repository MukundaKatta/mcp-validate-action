/**
 * `mcpcheck mcp-server` — run mcpcheck itself as an MCP server.
 *
 * After adding this to your own MCP config:
 *
 *   "mcpServers": {
 *     "mcpcheck": { "command": "mcpcheck", "args": ["mcp-server"] }
 *   }
 *
 * you can ask Claude Code / Cursor / any MCP-capable client things like
 * "lint my mcp.json" or "explain the dangerous-command rule" and the model
 * calls our tools under the hood.
 *
 * Protocol: JSON-RPC 2.0 over stdio, newline-delimited. No Content-Length
 * framing (that's LSP). Minimal surface — we implement `initialize`,
 * `tools/list`, `tools/call`; notifications are accepted silently. Errors
 * map to JSON-RPC error objects (-32601 for unknown method, -32602 for bad
 * params, -32603 for internal error).
 *
 * Logs intentionally go to stderr, not stdout — stdout carries the
 * protocol and a single stray `console.log` would break the client.
 */

import { homedir } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { checkSource } from "./core.js";
import { applyFixes } from "./fix.js";
import { explainRule, listRuleIds } from "./rule-docs.js";
import { statsFromSource } from "./stats.js";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "mcpcheck";
const SERVER_VERSION = "1.0.0";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<ToolResult>;
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export async function runMcpServer(): Promise<void> {
  const tools = buildTools();
  const stdin = process.stdin;
  stdin.setEncoding("utf8");

  let buffer = "";
  stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) void handleLine(line, tools);
      newline = buffer.indexOf("\n");
    }
  });
  stdin.on("end", () => process.exit(0));

  process.stderr.write(`[mcpcheck] MCP server listening on stdio\n`);
}

async function handleLine(line: string, tools: Tool[]): Promise<void> {
  let msg: JsonRpcRequest;
  try {
    msg = JSON.parse(line) as JsonRpcRequest;
  } catch {
    respond({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  // Notifications (no `id`) get no reply even on error.
  const isNotification = msg.id === undefined;
  try {
    const result = await dispatch(msg, tools);
    if (!isNotification) respond({ jsonrpc: "2.0", id: msg.id!, result });
  } catch (err) {
    if (!isNotification) {
      respond({
        jsonrpc: "2.0",
        id: msg.id!,
        error: {
          code: (err as { code?: number })?.code ?? -32603,
          message: (err as Error).message ?? "Internal error",
        },
      });
    }
  }
}

async function dispatch(msg: JsonRpcRequest, tools: Tool[]): Promise<unknown> {
  const params = (msg.params ?? {}) as Record<string, unknown>;
  switch (msg.method) {
    case "initialize":
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      };
    case "notifications/initialized":
    case "initialized":
      return {};
    case "tools/list":
      return {
        tools: tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      };
    case "tools/call": {
      const name = String(params["name"] ?? "");
      const args = (params["arguments"] ?? {}) as Record<string, unknown>;
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        throw Object.assign(new Error(`Unknown tool "${name}"`), { code: -32601 });
      }
      return tool.handler(args);
    }
    case "ping":
      return {};
    default:
      throw Object.assign(new Error(`Method not found: ${msg.method}`), { code: -32601 });
  }
}

function respond(message: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function buildTools(): Tool[] {
  return [
    {
      name: "lint_config",
      description:
        "Lint an MCP config file. Returns every issue (severity, rule id, line, message).",
      inputSchema: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string", description: "Absolute or tilde-expanded path to the config." },
        },
      },
      handler: async (args) => {
        const path = expandTilde(String(args["path"] ?? ""));
        const source = await readFile(path, "utf8");
        const report = checkSource(source, path);
        if (report.issues.length === 0) {
          return text(`${path}: no issues.`);
        }
        const lines = report.issues.map(
          (i) =>
            `line ${i.line ?? "?"} ${i.severity.padEnd(8)} ${i.ruleId} — ${i.message}` +
            (i.fix ? `\n  fix: ${i.fix.description}` : "")
        );
        return text(`${path}\n${lines.join("\n")}`);
      },
    },
    {
      name: "explain_rule",
      description:
        'Return docs for an mcpcheck rule. Pass "all" to dump every rule.',
      inputSchema: {
        type: "object",
        required: ["rule_id"],
        properties: {
          rule_id: {
            type: "string",
            description: 'Rule id or "all".',
          },
        },
      },
      handler: async (args) => {
        const id = String(args["rule_id"] ?? "");
        const doc = explainRule(id);
        if (!doc) return textError(`Unknown rule "${id}". Try list_rules.`);
        return text(doc);
      },
    },
    {
      name: "list_rules",
      description: "List every rule id mcpcheck knows about.",
      inputSchema: { type: "object", properties: {} },
      handler: async () => text(listRuleIds().join("\n")),
    },
    {
      name: "fix_config",
      description:
        "Apply every available autofix to an MCP config and return the new source.",
      inputSchema: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string" },
          write: { type: "boolean", description: "Write the fixed source back to disk (default: false)" },
        },
      },
      handler: async (args) => {
        const path = expandTilde(String(args["path"] ?? ""));
        const write = args["write"] === true;
        const source = await readFile(path, "utf8");
        const report = checkSource(source, path);
        const { output, applied } = applyFixes(source, report.issues);
        if (write && applied.length > 0) {
          await writeFile(path, output, "utf8");
        }
        return text(
          `Applied ${applied.length} autofix(es) to ${path}${write ? " (written)" : " (dry run — pass write=true to save)"}\n\n${output}`
        );
      },
    },
    {
      name: "stats_config",
      description: "Inventory summary: server count, transport mix, pinning, env usage.",
      inputSchema: {
        type: "object",
        required: ["path"],
        properties: { path: { type: "string" } },
      },
      handler: async (args) => {
        const path = expandTilde(String(args["path"] ?? ""));
        const source = await readFile(path, "utf8");
        const stats = statsFromSource(source, path);
        return text(JSON.stringify(stats, null, 2));
      },
    },
  ];
}

function text(s: string): ToolResult {
  return { content: [{ type: "text", text: s }] };
}

function textError(s: string): ToolResult {
  return { content: [{ type: "text", text: s }], isError: true };
}

function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return homedir() + p.slice(1);
  return p;
}
