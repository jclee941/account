#!/usr/bin/env node
/**
 * Stage 3 batch verification processor.
 *
 * Reads verification-batch-queue.jsonl, processes entries that are due (runAt <= now),
 * validates OAuth refresh tokens against Google, updates accounts.csv final status,
 * and removes successfully processed entries from the queue.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_QUEUE_FILE = join(__dirname, '..', 'verification-batch-queue.jsonl');
const DEFAULT_ACCOUNTS_FILE = join(__dirname, '..', 'accounts.csv');
const OAUTH_CLIENT_ID = process.env.GMAIL_OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.GMAIL_OAUTH_CLIENT_SECRET;
if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
  throw new Error('GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET must be set');
}

async function validateRefreshToken(refreshToken) {
  if (!refreshToken) {
    return { valid: false, error: 'no_token', description: 'No refresh token provided' };
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: OAUTH_CLIENT_ID,
        client_secret: OAUTH_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json();

    if (response.ok && data.access_token) {
      return {
        valid: true,
        accessToken: data.access_token,
        expiresIn: data.expires_in,
        scope: data.scope,
      };
    }

    return {
      valid: false,
      error: data.error || 'unknown',
      description: data.error_description || '',
    };
  } catch (err) {
    return {
      valid: false,
      error: 'network_error',
      description: String(err.message),
    };
  }
}

function getArg(name, fallback = '') {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const DRY_RUN = process.argv.includes('--dry-run');
const QUEUE_FILE = getArg('queue-file', DEFAULT_QUEUE_FILE);
const ACCOUNTS_FILE = getArg('accounts-file', DEFAULT_ACCOUNTS_FILE);

function normalizeEmail(email) {
  if (!email) return '';
  const trimmed = String(email).trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.includes('@') ? trimmed : `${trimmed}@gmail.com`;
}

function escapeCsv(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];

    if (c === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (c === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && csvText[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += c;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function stringifyCsv(rows) {
  const out = rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
  return out.length ? `${out}\n` : '';
}

function mergeVerificationStages(existing, batchPassed) {
  const base = String(existing || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !s.startsWith('batch:'));

  base.push(`batch:${batchPassed ? 'pass' : 'fail'}`);
  return base.join(';');
}

function parseQueueFile(queuePath) {
  if (!existsSync(queuePath)) return [];
  const raw = readFileSync(queuePath, 'utf-8');
  if (!raw.trim()) return [];

  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line, lineNo) => {
    try {
      return {
        kind: 'entry',
        line,
        lineNo: lineNo + 1,
        data: JSON.parse(line),
      };
    } catch (err) {
      return {
        kind: 'malformed',
        line,
        lineNo: lineNo + 1,
        error: err.message,
      };
    }
  });
}

function isReadyQueueEntry(entry, nowMs) {
  if (!entry?.data || entry.kind !== 'entry') return false;
  if (entry.data.processed === true) return false;
  const runAtMs = Date.parse(String(entry.data.runAt || ''));
  if (!Number.isFinite(runAtMs)) return false;
  return runAtMs <= nowMs;
}

function updateAccountForBatchResult(rows, email, batchPassed, details = '') {
  if (!rows.length) {
    return { updated: false, reason: 'empty_csv' };
  }

  const header = rows[0];
  const indexByName = Object.fromEntries(header.map((name, idx) => [String(name).trim(), idx]));

  const emailIdx = indexByName.email;
  const statusIdx = indexByName.status;
  const finalStatusIdx = indexByName.finalStatus;
  const stagesIdx = indexByName.verificationStages;
  const signalsIdx = indexByName.verificationSignals;
  const confidenceIdx = indexByName.verificationConfidence;
  const tsIdx = indexByName.timestamp;

  if (emailIdx == null || statusIdx == null) {
    return { updated: false, reason: 'missing_email_or_status_column' };
  }

  const targetEmail = normalizeEmail(email);
  let selectedRowIdx = -1;
  let selectedTs = Number.NEGATIVE_INFINITY;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowEmail = normalizeEmail(row[emailIdx]);
    if (!rowEmail || rowEmail !== targetEmail) continue;

    const ts = Date.parse(String(row[tsIdx] || ''));
    const score = Number.isFinite(ts) ? ts : i;
    if (score >= selectedTs) {
      selectedTs = score;
      selectedRowIdx = i;
    }
  }

  if (selectedRowIdx === -1) {
    return { updated: false, reason: 'account_not_found' };
  }

  const row = rows[selectedRowIdx];
  const status = batchPassed ? 'verified_full' : 'failed_batch';

  row[statusIdx] = status;

  if (finalStatusIdx != null) {
    row[finalStatusIdx] = status;
  }

  if (stagesIdx != null) {
    row[stagesIdx] = mergeVerificationStages(row[stagesIdx], batchPassed);
  }

  if (signalsIdx != null) {
    const signal = batchPassed ? 'oauth_token_valid' : `oauth_token_invalid${details ? `:${details}` : ''}`;
    const existing = String(row[signalsIdx] || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !s.startsWith('oauth_token_valid') && !s.startsWith('oauth_token_invalid'));
    existing.push(signal);
    row[signalsIdx] = existing.join(';');
  }

  if (confidenceIdx != null && batchPassed) {
    row[confidenceIdx] = '100.0';
  }

  return { updated: true, rowIndex: selectedRowIdx, status };
}

async function processReadyEntry(entry, accountRows) {
  const email = normalizeEmail(entry?.data?.account?.email);
  const refreshToken = entry?.data?.account?.refreshToken;

  if (!email) {
    return {
      ok: false,
      retryable: false,
      reason: 'missing_email',
      message: 'Queue entry has no account.email',
    };
  }

  try {
    const validation = await validateRefreshToken(refreshToken);
    const passed = Boolean(validation?.valid);
    const details = validation?.error || '';

    const updateResult = updateAccountForBatchResult(accountRows, email, passed, details);
    if (!updateResult.updated) {
      return {
        ok: false,
        retryable: false,
        reason: 'account_update_failed',
        message: `Could not update accounts.csv for ${email}: ${updateResult.reason}`,
      };
    }

    return {
      ok: true,
      retryable: false,
      email,
      passed,
      validation,
      message: passed
        ? `${email} -> verified_full`
        : `${email} -> failed_batch (${validation?.error || 'invalid_token'})`,
    };
  } catch (err) {
    return {
      ok: false,
      retryable: true,
      reason: 'validation_error',
      message: `${email}: ${err.message}`,
    };
  }
}

function usage() {
  console.log(`Usage:
  node account/process-batch-verification.mjs [--dry-run] [--queue-file <path>] [--accounts-file <path>]

Options:
  --dry-run               Show changes without writing files
  --queue-file <path>     Queue JSONL path (default: ${DEFAULT_QUEUE_FILE})
  --accounts-file <path>  Accounts CSV path (default: ${DEFAULT_ACCOUNTS_FILE})
`);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  const nowMs = Date.now();
  const queueRows = parseQueueFile(QUEUE_FILE);

  if (!queueRows.length) {
    console.log(`[Batch] Queue is empty: ${QUEUE_FILE}`);
    return;
  }

  if (!existsSync(ACCOUNTS_FILE)) {
    throw new Error(`accounts.csv not found: ${ACCOUNTS_FILE}`);
  }

  const csvRows = parseCsv(readFileSync(ACCOUNTS_FILE, 'utf-8'));
  if (!csvRows.length) {
    throw new Error(`accounts.csv is empty: ${ACCOUNTS_FILE}`);
  }

  const keptQueueLines = [];
  let readyCount = 0;
  let processedCount = 0;
  let passedCount = 0;
  let failedCount = 0;
  let deferredCount = 0;
  let malformedCount = 0;

  for (const entry of queueRows) {
    if (entry.kind === 'malformed') {
      malformedCount += 1;
      console.error(`[Batch] Skipping malformed queue line ${entry.lineNo}: ${entry.error}`);
      keptQueueLines.push(entry.line);
      continue;
    }

    if (!isReadyQueueEntry(entry, nowMs)) {
      keptQueueLines.push(entry.line);
      continue;
    }

    readyCount += 1;
    const result = await processReadyEntry(entry, csvRows);

    if (result.ok) {
      processedCount += 1;
      if (result.passed) passedCount += 1;
      else failedCount += 1;
      console.log(`[Batch] Processed: ${result.message}`);
      continue;
    }

    if (result.retryable) {
      deferredCount += 1;
      const data = {
        ...entry.data,
        attempts: Number(entry.data?.attempts || 0) + 1,
        lastError: result.message,
        lastTriedAt: new Date().toISOString(),
      };
      keptQueueLines.push(JSON.stringify(data));
      console.error(`[Batch] Deferred: ${result.message}`);
      continue;
    }

    // Non-retryable errors are considered processed to prevent dead-letter loops.
    processedCount += 1;
    failedCount += 1;
    console.error(`[Batch] Processed with error: ${result.message}`);
  }

  const queueOut = keptQueueLines.length ? `${keptQueueLines.join('\n')}\n` : '';
  const csvOut = stringifyCsv(csvRows);

  if (DRY_RUN) {
    console.log('[Batch] DRY RUN — no files written.');
  } else {
    writeFileSync(QUEUE_FILE, queueOut, 'utf-8');
    writeFileSync(ACCOUNTS_FILE, csvOut, 'utf-8');
  }

  console.log('');
  console.log('[Batch] Summary');
  console.log(`  queue file      : ${QUEUE_FILE}`);
  console.log(`  accounts file   : ${ACCOUNTS_FILE}`);
  console.log(`  ready           : ${readyCount}`);
  console.log(`  processed       : ${processedCount}`);
  console.log(`  verified_full   : ${passedCount}`);
  console.log(`  failed_batch    : ${failedCount}`);
  console.log(`  deferred        : ${deferredCount}`);
  console.log(`  malformed_kept  : ${malformedCount}`);
  console.log(`  remaining_queue : ${keptQueueLines.length}`);
}

main().catch((err) => {
  console.error('[Batch] Fatal error:', err.message);
  process.exit(1);
});
