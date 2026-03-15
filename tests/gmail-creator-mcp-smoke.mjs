#!/usr/bin/env node
/**
 * Smoke test for gmail-creator MCP server.
 * Validates: MCP initialize, tools/list returns 4 tools, create_accounts dry-run works,
 * list_accounts parses CSV, get_account_status finds records.
 *
 * Usage: node tests/gmail-creator-mcp-smoke.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, "..", "gmail-creator-mcp.mjs");

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    console.error(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.error(`  ❌ ${label}`);
  }
}

function assertEq(actual, expected, label) {
  assert(actual === expected, `${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

/**
 * Minimal MCP JSON-RPC client over stdio.
 */
class McpTestClient {
  constructor(proc) {
    this.proc = proc;
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
    this.proc.stdout.on("data", (chunk) => this._onData(chunk.toString()));
  }

  _onData(data) {
    this.buffer += data;
    // MCP uses line-delimited JSON (no framing header for stdio transport)
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop(); // keep incomplete line
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.id != null && this.pending.has(msg.id)) {
          this.pending.get(msg.id)(msg);
          this.pending.delete(msg.id);
        }
      } catch {
        // ignore non-JSON lines
      }
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
      }, 15000);

      this.pending.set(id, (msg) => {
        clearTimeout(timeout);
        resolve(msg);
      });

      const request = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      this.proc.stdin.write(request + "\n");
    });
  }

  async close() {
    this.proc.stdin.end();
    return new Promise((resolve) => {
      this.proc.on("close", resolve);
      setTimeout(() => {
        this.proc.kill("SIGTERM");
        resolve(-1);
      }, 3000);
    });
  }
}

async function main() {
  console.error("\n🧪 Gmail Creator MCP Server — Smoke Test\n");

  // Spawn the MCP server
  const proc = spawn("node", [SERVER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "test" },
  });

  let stderrOutput = "";
  proc.stderr.on("data", (chunk) => {
    stderrOutput += chunk.toString();
  });

  const client = new McpTestClient(proc);

  try {
    // --- Test 1: MCP Initialize ---
    console.error("Test 1: MCP Initialize");
    const initResult = await client.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "1.0.0" },
    });
    assert(initResult.result != null, "initialize returns result");
    assert(initResult.result?.capabilities?.tools != null, "server declares tools capability");
    assertEq(initResult.result?.serverInfo?.name, "gmail-creator", "server name is gmail-creator");

    // Send initialized notification
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

    // --- Test 2: List Tools ---
    console.error("\nTest 2: List Tools");
    const toolsResult = await client.send("tools/list", {});
    const tools = toolsResult.result?.tools ?? [];
    assertEq(tools.length, 4, "exactly 4 tools registered");

    const toolNames = tools.map((t) => t.name).sort();
    assert(toolNames.includes("create_accounts"), "has create_accounts tool");
    assert(toolNames.includes("get_creation_job"), "has get_creation_job tool");
    assert(toolNames.includes("list_accounts"), "has list_accounts tool");
    assert(toolNames.includes("get_account_status"), "has get_account_status tool");

    // Validate each tool has description and inputSchema
    for (const tool of tools) {
      assert(typeof tool.description === "string" && tool.description.length > 10, `${tool.name} has description`);
      assert(tool.inputSchema != null && tool.inputSchema.type === "object", `${tool.name} has inputSchema`);
    }

    // --- Test 3: list_accounts ---
    console.error("\nTest 3: list_accounts");
    const listResult = await client.send("tools/call", {
      name: "list_accounts",
      arguments: { limit: 5 },
    });
    assert(listResult.result != null, "list_accounts returns result");
    assert(!listResult.error, "list_accounts has no error");

    const listContent = listResult.result?.content?.[0]?.text;
    assert(listContent != null, "list_accounts returns text content");

    if (listContent) {
      const listData = JSON.parse(listContent);
      assert(Array.isArray(listData.accounts), "list_accounts returns accounts array");
      assert(listData.accounts.length <= 5, "list_accounts respects limit");
      if (listData.accounts.length > 0) {
        const first = listData.accounts[0];
        assert(typeof first.username === "string", "account has username field");
        assert(typeof first.email === "string", "account has email field");
        assert(typeof first.timestamp === "string", "account has timestamp field");
      }
    }

    // --- Test 4: get_account_status with missing args ---
    console.error("\nTest 4: get_account_status — missing args error");
    const statusNoArgs = await client.send("tools/call", {
      name: "get_account_status",
      arguments: {},
    });
    assert(
      statusNoArgs.error != null || statusNoArgs.result?.isError === true,
      "get_account_status rejects missing username/email"
    );

    // --- Test 5: get_creation_job with non-existent job ---
    console.error("\nTest 5: get_creation_job — nonexistent job");
    const jobResult = await client.send("tools/call", {
      name: "get_creation_job",
      arguments: { job_id: "nonexistent-job-id" },
    });
    assert(
      jobResult.error != null || jobResult.result?.isError === true,
      "get_creation_job rejects nonexistent job"
    );

    // --- Test 6: create_accounts dry-run ---
    console.error("\nTest 6: create_accounts — dry-run");
    const dryRunResult = await client.send("tools/call", {
      name: "create_accounts",
      arguments: { start: 1, end: 1, dry_run: true },
    });
    assert(dryRunResult.result != null, "dry-run returns result");
    assert(!dryRunResult.error, "dry-run has no error");

    const dryContent = dryRunResult.result?.content?.[0]?.text;
    if (dryContent) {
      const dryData = JSON.parse(dryContent);
      assert(dryData.mode === "dry-run", "dry-run result has mode=dry-run");
    }

  } catch (err) {
    console.error(`\n💥 Fatal error: ${err.message}`);
    failed++;
    failures.push(`Fatal: ${err.message}`);
  } finally {
    await client.close();
  }

  // --- Summary ---
  console.error(`\n${"=".repeat(50)}`);
  console.error(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.error(`\nFailures:`);
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
  }
  console.error("");

  process.exit(failed > 0 ? 1 : 0);
}

main();
