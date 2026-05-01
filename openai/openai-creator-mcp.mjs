#!/usr/bin/env node
/**
 * OpenAI Account Creator MCP Server
 *
 * Provides MCP tools for OpenAI account automation:
 * - create_accounts: Start account creation job
 * - get_creation_job: Check job status
 * - list_accounts: List created accounts
 * - get_account_status: Get single account status
 *
 * Environment:
 *   FIVESIM_API_KEY - API key for SMS verification
 *   FIVESIM_REGION - Default region (default: russia)
 *   PROXY_SERVER - Optional proxy
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ACCOUNTS_CSV = join(import.meta.dirname, "..", "openai-accounts.csv");
const SCRIPT_PATH = join(import.meta.dirname, "create-accounts.mjs");

// Track active jobs
const activeJobs = new Map();

// ── Tool Definitions ─────────────────────────────────────────────────
const TOOLS = [
  {
    name: "create_accounts",
    description: "Create OpenAI accounts with email pattern qws943XX@gmail.com",
    inputSchema: {
      type: "object",
      properties: {
        start: {
          type: "integer",
          description: "Starting number (1-50)",
          minimum: 1,
          maximum: 100,
        },
        end: {
          type: "integer",
          description: "Ending number (1-50)",
          minimum: 1,
          maximum: 100,
        },
        dry_run: {
          type: "boolean",
          description: "Preview mode - don't actually create accounts",
        },
        api_key: {
          type: "string",
          description: "5sim API key (or use FIVESIM_API_KEY env var)",
        },
        region: {
          type: "string",
          description: "SMS region (russia, indonesia, etc.)",
        },
      },
      required: ["start", "end"],
    },
  },
  {
    name: "get_creation_job",
    description: "Get status of a running account creation job",
    inputSchema: {
      type: "object",
      properties: {
        job_id: {
          type: "string",
          description: "Job ID returned by create_accounts",
        },
      },
      required: ["job_id"],
    },
  },
  {
    name: "list_accounts",
    description: "List all created OpenAI accounts from CSV",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_account_status",
    description: "Get status of a specific account",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Email address to check",
        },
      },
      required: ["email"],
    },
  },
];

// ── CSV Parser ───────────────────────────────────────────────────────
function parseAccountsCsv() {
  if (!existsSync(ACCOUNTS_CSV)) {
    return [];
  }

  const content = readFileSync(ACCOUNTS_CSV, "utf8");
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const record = {};
    headers.forEach((h, i) => {
      record[h.trim()] = values[i]?.trim() || "";
    });
    return record;
  });
}

// ── Tool Handlers ────────────────────────────────────────────────────
async function handleCreateAccounts(args) {
  const start = args.start;
  const end = args.end;
  const dryRun = args.dry_run || false;
  const apiKey = args.api_key || process.env.FIVESIM_API_KEY || "";
  const region = args.region || process.env.FIVESIM_REGION || "russia";

  if (!dryRun && !apiKey) {
    return {
      content: [
        {
          type: "text",
          text: "Error: API key required. Provide --api-key or set FIVESIM_API_KEY",
        },
      ],
      isError: true,
    };
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const logFile = `/tmp/openai-creator-${jobId}.log`;

  const scriptArgs = [
    SCRIPT_PATH,
    "--start", String(start),
    "--end", String(end),
    "--region", region,
  ];

  if (dryRun) scriptArgs.push("--dry-run");
  if (apiKey) {
    scriptArgs.push("--api-key", apiKey);
  }

  const child = spawn("node", scriptArgs, {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FIVESIM_API_KEY: apiKey },
  });

  // Store job info
  activeJobs.set(jobId, {
    pid: child.pid,
    start,
    end,
    dryRun,
    region,
    startTime: new Date().toISOString(),
    logFile,
    status: "running",
  });

  // Capture output
  let output = "";
  child.stdout.on("data", (data) => {
    output += data.toString();
  });
  child.stderr.on("data", (data) => {
    output += data.toString();
  });

  child.on("exit", (code) => {
    const job = activeJobs.get(jobId);
    if (job) {
      job.status = code === 0 ? "completed" : "failed";
      job.exitCode = code;
      job.output = output;
    }
  });

  child.unref();

  return {
    content: [
      {
        type: "text",
        text: `Started account creation job: ${jobId}\n` +
              `Range: qws943${String(start).padStart(2, "0")} → qws943${String(end).padStart(2, "0")}\n` +
              `Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n` +
              `Region: ${region}\n` +
              `PID: ${child.pid}\n\n` +
              `Use get_creation_job with job_id="${jobId}" to check status.`,
      },
    ],
  };
}

async function handleGetCreationJob(args) {
  const jobId = args.job_id;
  const job = activeJobs.get(jobId);

  if (!job) {
    return {
      content: [
        {
          type: "text",
          text: `Job not found: ${jobId}`,
        },
      ],
      isError: true,
    };
  }

  let statusText = `Job: ${jobId}\n`;
  statusText += `Status: ${job.status}\n`;
  statusText += `Started: ${job.startTime}\n`;
  statusText += `Range: ${job.start} - ${job.end}\n`;
  statusText += `Region: ${job.region}\n`;
  statusText += `Dry Run: ${job.dryRun}\n`;

  if (job.output) {
    // Show last 50 lines of output
    const lines = job.output.split("\n").slice(-50);
    statusText += `\nRecent output:\n${lines.join("\n")}`;
  }

  return {
    content: [
      {
        type: "text",
        text: statusText,
      },
    ],
  };
}

async function handleListAccounts() {
  const accounts = parseAccountsCsv();

  if (accounts.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No accounts found. Create accounts first using create_accounts tool.",
        },
      ],
    };
  }

  // Summary by status
  const byStatus = {};
  accounts.forEach((acc) => {
    const status = acc.status || "unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;
  });

  let text = `Total accounts: ${accounts.length}\n\n`;
  text += "By status:\n";
  for (const [status, count] of Object.entries(byStatus)) {
    text += `  ${status}: ${count}\n`;
  }

  // Show recent accounts
  text += "\nRecent accounts:\n";
  const recent = accounts.slice(-10);
  recent.forEach((acc) => {
    text += `  ${acc.email} | ${acc.status} | ${acc.timestamp?.split("T")[0] || "N/A"}\n`;
  });

  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

async function handleGetAccountStatus(args) {
  const email = args.email;
  const accounts = parseAccountsCsv();
  const account = accounts.find((a) => a.email === email);

  if (!account) {
    return {
      content: [
        {
          type: "text",
          text: `Account not found: ${email}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(account, null, 2),
      },
    ],
  };
}

// ── Server Setup ─────────────────────────────────────────────────────
const server = new Server(
  {
    name: "openai-creator-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_accounts":
        return await handleCreateAccounts(args);
      case "get_creation_job":
        return await handleGetCreationJob(args);
      case "list_accounts":
        return await handleListAccounts(args);
      case "get_account_status":
        return await handleGetAccountStatus(args);
      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// ── Start Server ─────────────────────────────────────────────────────
const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);

// Log to stderr only (stdout is MCP transport)
console.error("OpenAI Creator MCP Server running on stdio");
