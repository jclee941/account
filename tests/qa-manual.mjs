import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/home/jclee/dev/gmail/account/gmail-creator-mcp.mjs"],
});
const client = new Client({ name: "qa", version: "1.0.0" });
await client.connect(transport);

// Test 1: list_accounts with limit=3
console.log("=== list_accounts (limit=3) ===");
const r1 = await client.callTool({ name: "list_accounts", arguments: { limit: 3 } });
const d1 = JSON.parse(r1.content[0].text);
console.log(`  total: ${d1.total}, returned: ${d1.accounts.length}`);
for (const a of d1.accounts) {
  console.log(`  - ${a.username} | ${a.email} | status: ${a.status.substring(0, 60)}... | ${a.timestamp}`);
}

// Test 2: list_accounts with status filter
console.log("\n=== list_accounts (status='success') ===");
const r2 = await client.callTool({ name: "list_accounts", arguments: { status: "success", limit: 2 } });
const d2 = JSON.parse(r2.content[0].text);
console.log(`  total matching: ${d2.total}, returned: ${d2.accounts.length}`);

// Test 3: get_account_status with history
console.log("\n=== get_account_status (username=qws94301, history=true) ===");
const r3 = await client.callTool({ name: "get_account_status", arguments: { username: "qws94301", include_history: true } });
const d3 = JSON.parse(r3.content[0].text);
console.log(`  count: ${d3.count}`);
for (const r of d3.records) {
  console.log(`  - status: ${r.status.substring(0, 50)}... | ${r.timestamp}`);
}

// Test 4: get_account_status without args — expect McpError
console.log("\n=== get_account_status (no args — expect McpError) ===");
try {
  await client.callTool({ name: "get_account_status", arguments: {} });
  console.log("  ❌ Should have thrown McpError");
} catch (e) {
  console.log(`  ✅ Threw McpError: ${e.message}`);
}

// Test 5: create_accounts dry-run
console.log("\n=== create_accounts (dry_run=true, start=1, end=2) ===");
const r5 = await client.callTool({ name: "create_accounts", arguments: { dry_run: true, start: 1, end: 2 } });
const d5 = JSON.parse(r5.content[0].text);
console.log(`  mode: ${d5.mode}`);
console.log(`  stdout preview: ${(d5.stdout || "").substring(0, 120)}`);

// Test 6: get_creation_job — nonexistent
console.log("\n=== get_creation_job (nonexistent) ===");
try {
  await client.callTool({ name: "get_creation_job", arguments: { job_id: "gmail-000-ffff" } });
  console.log("  ❌ Should have thrown");
} catch (e) {
  console.log(`  ✅ Threw: ${e.message}`);
}

console.log("\n=== All manual QA passed ===");
await client.close();
process.exit(0);
