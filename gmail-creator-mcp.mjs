#!/usr/bin/env node
/**
 * gmail-creator MCP server
 *
 * Wraps create-accounts.mjs as 4 MCP tools:
 *   create_accounts  — dry-run (sync) or real run (background spawn)
 *   get_creation_job — poll a background job's progress
 *   list_accounts    — parse accounts.csv with multiline-tolerant logic
 *   get_account_status — find records by username or email
 *
 * Stdout is MCP protocol — all diagnostics go to stderr.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import { execFile, spawn as cpSpawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Constants ───────────────────────────────────────────────────────
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR =
  process.env.DATA_DIR || path.join(SCRIPT_DIR, ".gmail-creator-data");
const ACCOUNTS_CSV = path.join(SCRIPT_DIR, "accounts.csv");
const CREATE_SCRIPT = path.join(SCRIPT_DIR, "create-accounts.mjs");

const ISO_TS_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Env vars forwarded to child processes
const CHILD_ENV_KEYS = [
  "FIVESIM_API_KEY",
  "SMS_PROVIDER",
  "SMS_API_KEY",
  "FIVESIM_REGION",
  "PROXY_SERVER",
  "PROXY_USER",
  "PROXY_PASS",
];

// CLI flag mapping: tool arg name → CLI flag
const FLAG_MAP = {
  start: "--start",
  end: "--end",
  dry_run: "--dry-run",
  sms_provider: "--sms-provider",
  region: "--region",
  mobile: "--mobile",
  baseline: "--baseline",
  cdp: "--cdp",
  operator: "--operator",
  test_url: "--test-url",
  proxy: "--proxy",
};

// ── Tool Definitions ────────────────────────────────────────────────
const tools = [
  {
    name: "create_accounts",
    description:
      "Create Google accounts via the automated Playwright flow. " +
      "With dry_run=true runs synchronously and returns a preview. " +
      "Without dry_run spawns a background job and returns a job_id for polling.",
    inputSchema: {
      type: "object",
      properties: {
        start: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 1,
          description: "First account index (qws943XX)",
        },
        end: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 1,
          description: "Last account index (qws943XX)",
        },
        dry_run: {
          type: "boolean",
          default: false,
          description: "Preview mode — no accounts created",
        },
        sms_provider: {
          type: "string",
          description: "SMS provider name (default: 5sim)",
        },
        region: {
          type: "string",
          description: "5sim region for phone numbers",
        },
        mobile: {
          type: "boolean",
          description: "Use mobile viewport",
        },
        baseline: {
          type: "boolean",
          description: "Use baseline (non-stealth) mode",
        },
        cdp: {
          type: "boolean",
          description: "Use CDP connection mode",
        },
        operator: {
          type: "string",
          description: "Force specific 5sim operator",
        },
        test_url: {
          type: "string",
          description: "Force specific signup URL by name",
        },
        proxy: {
          type: "string",
          description: "Proxy server address",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_creation_job",
    description:
      "Check the status of a background account creation job. " +
      "Returns job metadata, PID liveness, and tail of stdout/stderr logs.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: {
          type: "string",
          description: "Job ID returned by create_accounts",
        },
        tail_lines: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          default: 50,
          description: "Number of log lines to return from end",
        },
      },
      required: ["job_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_accounts",
    description:
      "List accounts from accounts.csv. Handles multiline status fields. " +
      "Returns newest first with optional status/username filters.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by status substring (case-insensitive)",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          default: 50,
          description: "Maximum accounts to return",
        },
        username_prefix: {
          type: "string",
          description: "Filter by username prefix",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_account_status",
    description:
      "Find account records by username or email. " +
      "Returns the latest record by default, or full history if include_history=true.",
    inputSchema: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: "Account username to look up",
        },
        email: {
          type: "string",
          description: "Account email to look up",
        },
        include_history: {
          type: "boolean",
          default: false,
          description: "Return all records (retries) instead of only the latest",
        },
      },
      additionalProperties: false,
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

/** Return JSON MCP content block. */
function toJsonResponse(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/** Return MCP error content (isError flag). */
function toErrorResponse(message) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

/** Build env object for child process, forwarding relevant env vars. */
function childEnv() {
  const env = { ...process.env };
  // Ensure PATH is forwarded for node resolution
  return env;
}

/** Build CLI args array from tool arguments. */
function buildCliArgs(args) {
  const cli = [];
  for (const [key, flag] of Object.entries(FLAG_MAP)) {
    const val = args[key];
    if (val === undefined || val === null) continue;
    if (typeof val === "boolean") {
      if (val) cli.push(flag);
    } else {
      cli.push(flag, String(val));
    }
  }
  return cli;
}

/** Read last N lines from a file. */
async function tailFile(filePath, n) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    return lines.slice(-n).filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

/** Check if a PID is alive. */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── CSV Parser ──────────────────────────────────────────────────────

/**
 * Parse accounts.csv with tolerance for multiline status fields.
 *
 * Strategy: A logical CSV row ENDS when the line ends with an ISO timestamp
 * (YYYY-MM-DDTHH:MM:SS.mmmZ). Lines not ending with that pattern are
 * continuation lines belonging to the previous row's status field.
 *
 * Field split: first 7 comma-separated fields from the left, timestamp
 * from the right, everything in between is the status field.
 */
function parseAccountsCsv(csvContent) {
  const rawLines = csvContent.split("\n");
  if (rawLines.length < 2) return [];

  // Skip header line
  const dataLines = rawLines.slice(1);

  // Reconstruct logical rows
  const logicalRows = [];
  let current = "";

  for (const line of dataLines) {
    const trimmed = line.trimEnd();
    if (!trimmed && !current) continue;

    if (current) {
      current += "\n" + trimmed;
    } else {
      current = trimmed;
    }

    // A logical row ends when the line ends with an ISO timestamp
    if (ISO_TS_RE.test(trimmed)) {
      logicalRows.push(current);
      current = "";
    }
  }

  // Parse each logical row into fields
  const accounts = [];
  for (const row of logicalRows) {
    // Split by comma — but status field can contain commas.
    // Strategy: extract first 7 fields from left, timestamp from right,
    // everything in between is status.
    const lastComma = row.lastIndexOf(",");
    if (lastComma === -1) continue;

    const timestamp = row.slice(lastComma + 1).trim();
    const beforeTimestamp = row.slice(0, lastComma);

    // Now split beforeTimestamp to get first 7 fields + status
    const parts = beforeTimestamp.split(",");
    if (parts.length < 8) continue; // need at least 7 fields + status

    const username = parts[0] || "";
    const email = parts[1] || "";
    const password = parts[2] || "";
    const firstName = parts[3] || "";
    const lastName = parts[4] || "";
    const koreanName = parts[5] || "";
    const cost = parts[6] || "";
    // Everything from index 7 onward is the status (may contain commas)
    const status = parts.slice(7).join(",");

    accounts.push({
      username,
      email,
      password,
      firstName,
      lastName,
      koreanName,
      cost,
      status,
      timestamp,
    });
  }

  return accounts;
}

/** Read and parse accounts.csv. */
async function loadAccounts() {
  try {
    const content = await fs.readFile(ACCOUNTS_CSV, "utf-8");
    return parseAccountsCsv(content);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

// ── Job Management ──────────────────────────────────────────────────

const JOBS_DIR = path.join(DATA_DIR, "jobs");

/** Scan for any running job (concurrency guard). */
async function findRunningJob() {
  try {
    const files = await fs.readdir(JOBS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(JOBS_DIR, file), "utf-8");
        const job = JSON.parse(raw);
        if (job.status === "running" && isPidAlive(job.pid)) {
          return job;
        }
      } catch {
        // skip corrupt job files
      }
    }
  } catch {
    // JOBS_DIR may not exist yet
  }
  return null;
}

/** Read a job file by ID. */
async function readJob(jobId) {
  const jobPath = path.join(JOBS_DIR, `${jobId}.json`);
  try {
    const raw = await fs.readFile(jobPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/** Write job metadata. */
async function writeJob(job) {
  const jobPath = path.join(JOBS_DIR, `${job.job_id}.json`);
  await fs.writeFile(jobPath, JSON.stringify(job, null, 2));
}

// ── Tool Handlers ───────────────────────────────────────────────────

async function handleCreateAccounts(args) {
  const {
    start = 1,
    end = 1,
    dry_run = false,
  } = args;

  const cliArgs = buildCliArgs(args);

  if (dry_run) {
    // Synchronous dry-run via execFile
    return new Promise((resolve, reject) => {
      execFile(
        "node",
        [CREATE_SCRIPT, ...cliArgs],
        {
          env: childEnv(),
          cwd: SCRIPT_DIR,
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        },
        (err, stdout, stderr) => {
          if (err && err.killed) {
            reject(
              new McpError(ErrorCode.InternalError, "Dry-run timed out after 30s")
            );
            return;
          }
          resolve(
            toJsonResponse({
              mode: "dry-run",
              start,
              end,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exit_code: err ? err.code || 1 : 0,
            })
          );
        }
      );
    });
  }

  // Real run — background spawn
  const running = await findRunningJob();
  if (running) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `A creation job is already running: ${running.job_id} (pid ${running.pid})`
    );
  }

  const jobId = `gmail-${Date.now()}-${randomBytes(2).toString("hex")}`;
  const stdoutLog = path.join(JOBS_DIR, `${jobId}.stdout.log`);
  const stderrLog = path.join(JOBS_DIR, `${jobId}.stderr.log`);

  const stdoutStream = createWriteStream(stdoutLog);
  const stderrStream = createWriteStream(stderrLog);

  const child = cpSpawn("node", [CREATE_SCRIPT, ...cliArgs], {
    env: childEnv(),
    cwd: SCRIPT_DIR,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.pipe(stdoutStream);
  child.stderr.pipe(stderrStream);

  const job = {
    job_id: jobId,
    pid: child.pid,
    status: "running",
    started_at: new Date().toISOString(),
    finished_at: null,
    exit_code: null,
    range: { start, end },
    stdout_log: stdoutLog,
    stderr_log: stderrLog,
    accounts_file: ACCOUNTS_CSV,
  };

  child.on("exit", async (code) => {
    try {
      const current = await readJob(jobId);
      if (current) {
        current.status = code === 0 ? "completed" : "failed";
        current.finished_at = new Date().toISOString();
        current.exit_code = code;
        await writeJob(current);
      }
    } catch {
      // best-effort update
    }
  });

  child.unref();
  await writeJob(job);

  return toJsonResponse({
    job_id: jobId,
    pid: child.pid,
    started_at: job.started_at,
    range: { start, end },
    status: "running",
  });
}

async function handleGetCreationJob(args) {
  const { job_id, tail_lines = 50 } = args;
  if (!job_id || typeof job_id !== "string") {
    throw new McpError(ErrorCode.InvalidParams, "job_id is required");
  }

  const job = await readJob(job_id);
  if (!job) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Job not found: ${job_id}`
    );
  }

  // Check PID liveness for running jobs
  if (job.status === "running") {
    if (!isPidAlive(job.pid)) {
      job.status = "completed";
      job.finished_at = new Date().toISOString();
      await writeJob(job);
    }
  }

  const stdoutTail = await tailFile(job.stdout_log, tail_lines);
  const stderrTail = await tailFile(job.stderr_log, tail_lines);

  return toJsonResponse({
    job_id: job.job_id,
    status: job.status,
    pid: job.pid,
    started_at: job.started_at,
    finished_at: job.finished_at,
    exit_code: job.exit_code,
    range: job.range,
    stdout_tail: stdoutTail,
    stderr_tail: stderrTail,
    accounts_file: job.accounts_file,
  });
}

async function handleListAccounts(args) {
  const { status, limit = 50, username_prefix } = args;

  let accounts = await loadAccounts();

  // Newest first
  accounts.reverse();

  // Apply filters
  if (typeof status === "string" && status.length > 0) {
    const lower = status.toLowerCase();
    accounts = accounts.filter((a) =>
      a.status.toLowerCase().includes(lower)
    );
  }
  if (typeof username_prefix === "string" && username_prefix.length > 0) {
    accounts = accounts.filter((a) =>
      a.username.startsWith(username_prefix)
    );
  }

  accounts = accounts.slice(0, limit);

  return toJsonResponse({
    total: accounts.length,
    accounts,
  });
}

async function handleGetAccountStatus(args) {
  const { username, email, include_history = false } = args;

  if (
    (!username || typeof username !== "string") &&
    (!email || typeof email !== "string")
  ) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "At least one of username or email is required"
    );
  }

  const allAccounts = await loadAccounts();

  let matches = allAccounts.filter((a) => {
    if (username && email) {
      return a.username === username && a.email === email;
    }
    if (username) return a.username === username;
    return a.email === email;
  });

  if (matches.length === 0) {
    return toErrorResponse(
      `No records found for ${username ? `username=${username}` : `email=${email}`}`
    );
  }

  if (include_history) {
    return toJsonResponse({
      count: matches.length,
      records: matches,
    });
  }

  // Return only the latest (last in file = last element)
  return toJsonResponse({
    record: matches[matches.length - 1],
  });
}

// ── Server Setup ────────────────────────────────────────────────────

const server = new Server(
  { name: "gmail-creator", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments ?? {};

  try {
    switch (toolName) {
      case "create_accounts":
        return await handleCreateAccounts(args);

      case "get_creation_job":
        return await handleGetCreationJob(args);

      case "list_accounts":
        return await handleListAccounts(args);

      case "get_account_status":
        return await handleGetAccountStatus(args);

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${toolName}`
        );
    }
  } catch (error) {
    if (error instanceof McpError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, msg);
  }
});

// ── Bootstrap ───────────────────────────────────────────────────────

async function main() {
  // Ensure data directories exist
  await fs.mkdir(JOBS_DIR, { recursive: true });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(msg);
  process.exit(1);
});
