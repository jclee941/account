#!/usr/bin/env node
/**
 * inject-vscdb-token.mjs — Inject OAuth tokens into Antigravity's VSCDB
 * 
 * Encodes tokens as protobuf (matching Antigravity's OAuthTokenInfo schema),
 * wraps in the UnifiedStateSyncMap format, base64-encodes, and writes to
 * the state.vscdb SQLite database.
 *
 * No npm dependencies — uses raw protobuf encoding and sqlite3 CLI.
 *
 * Usage:
 *   node antigravity/inject-vscdb-token.mjs \
 *     --access-token "ya29.xxx" \
 *     --refresh-token "1//0exxx" \
 *     --token-type "Bearer" \
 *     [--expiry-seconds 1710000000] \
 *     [--is-gcp-tos] \
 *     [--vscdb-path "/path/to/state.vscdb"] \
 *     [--dry-run]
 *
 *   # Or read from antigravity-accounts.json by email:
 *   node antigravity/inject-vscdb-token.mjs --from-accounts qws94301@gmail.com
 *
 * Protobuf schema (from Antigravity main.js reverse engineering):
 *   message OAuthTokenInfo {
 *     string access_token = 1;
 *     string token_type = 2;
 *     string refresh_token = 3;
 *     google.protobuf.Timestamp expiry = 4;
 *     // field 5 skipped
 *     bool is_gcp_tos = 6;
 *   }
 *
 * VSCDB storage format:
 *   key: "antigravityUnifiedStateSync.oauthToken"
 *   value: base64(USSMap { data: { "oauthTokenInfoSentinelKey": Row { value: base64(OAuthTokenInfo_bytes) } } })
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── Protobuf manual encoder (no deps) ───

/** Encode a varint (unsigned) */
function encodeVarint(value) {
  const bytes = [];
  let v = typeof value === 'bigint' ? value : BigInt(value);
  if (v === 0n) return Buffer.from([0]);
  while (v > 0n) {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    bytes.push(byte);
  }
  return Buffer.from(bytes);
}

/** Encode a protobuf field tag */
function encodeTag(fieldNumber, wireType) {
  return encodeVarint((fieldNumber << 3) | wireType);
}

/** Encode a length-delimited field (wire type 2) */
function encodeLengthDelimited(fieldNumber, data) {
  const tag = encodeTag(fieldNumber, 2);
  const len = encodeVarint(data.length);
  return Buffer.concat([tag, len, data]);
}

/** Encode a string field */
function encodeString(fieldNumber, value) {
  if (!value) return Buffer.alloc(0);
  const data = Buffer.from(value, 'utf-8');
  return encodeLengthDelimited(fieldNumber, data);
}

/** Encode a varint field (wire type 0) */
function encodeVarintField(fieldNumber, value) {
  if (!value && value !== 0 && value !== 0n) return Buffer.alloc(0);
  const tag = encodeTag(fieldNumber, 0);
  const val = encodeVarint(value);
  return Buffer.concat([tag, val]);
}

/** Encode a bool field */
function encodeBool(fieldNumber, value) {
  if (!value) return Buffer.alloc(0);
  return encodeVarintField(fieldNumber, 1);
}

/**
 * Encode OAuthTokenInfo protobuf message
 * Fields: 1=access_token, 2=token_type, 3=refresh_token, 4=expiry(Timestamp), 6=is_gcp_tos
 */
function encodeOAuthTokenInfo({ accessToken, tokenType, refreshToken, expirySeconds, isGcpTos }) {
  const parts = [];
  parts.push(encodeString(1, accessToken));
  parts.push(encodeString(2, tokenType || 'Bearer'));
  parts.push(encodeString(3, refreshToken));
  
  // Field 4: google.protobuf.Timestamp { int64 seconds = 1; int32 nanos = 2; }
  if (expirySeconds) {
    const tsMsg = encodeVarintField(1, BigInt(expirySeconds));
    parts.push(encodeLengthDelimited(4, tsMsg));
  }
  
  // Field 5 is skipped in the schema
  // Field 6: is_gcp_tos (bool)
  parts.push(encodeBool(6, isGcpTos));
  
  return Buffer.concat(parts.filter(p => p.length > 0));
}

/**
 * Encode the UnifiedStateSyncMap wrapper
 * Structure (matching Antigravity's @bufbuild/protobuf USS map):
 *   message USSMap {                         // j3 = pr(Za, 0)
 *     map<string, Row> data = 1;             // repeated Entry { key, Row }
 *   }
 *   message Row {                            // IU = pr(Za, 1)
 *     string value = 1;                      // base64-encoded inner protobuf
 *   }
 *
 * The Row.value field is a BASE64 STRING of the inner protobuf message.
 * When Antigravity reads it, it calls sc(row.value, messageType) which
 * does atob(value) → Uint8Array → protobuf parse.
 */
function encodeUnifiedStateSyncMap(key, innerBytes) {
  // Row { value = base64(innerBytes) }
  // The value field is a STRING (field 1, wire type 2) containing base64
  const b64Inner = innerBytes.toString('base64');
  const rowMsg = encodeString(1, b64Inner);
  
  // Map entry: key (field 1 = string) + Row (field 2 = message)
  // In protobuf map encoding, each map entry is a repeated message with key=1, value=2
  const entryParts = Buffer.concat([
    encodeString(1, key),
    encodeLengthDelimited(2, rowMsg),
  ]);
  
  // USSMap { data = [entry] }  — field 1 repeated
  return encodeLengthDelimited(1, entryParts);
}

// ─── Protobuf decoder (minimal, for verification) ───

function decodeVarintFromBuf(buf, offset) {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos];
    result |= BigInt(byte & 0x7f) << shift;
    pos++;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
  }
  return { value: result, bytesRead: pos - offset };
}

function decodeProtobuf(buf) {
  const fields = [];
  let pos = 0;
  while (pos < buf.length) {
    const { value: tagVal, bytesRead: tagBytes } = decodeVarintFromBuf(buf, pos);
    pos += tagBytes;
    const fieldNumber = Number(tagVal >> 3n);
    const wireType = Number(tagVal & 7n);
    
    if (wireType === 0) { // varint
      const { value, bytesRead } = decodeVarintFromBuf(buf, pos);
      pos += bytesRead;
      fields.push({ fieldNumber, wireType, value: Number(value) });
    } else if (wireType === 2) { // length-delimited
      const { value: len, bytesRead } = decodeVarintFromBuf(buf, pos);
      pos += bytesRead;
      const data = buf.subarray(pos, pos + Number(len));
      pos += Number(len);
      // Try to interpret as string
      let strVal;
      try { strVal = data.toString('utf-8'); } catch { strVal = null; }
      fields.push({ fieldNumber, wireType, data, string: strVal, length: Number(len) });
    } else {
      break; // Unknown wire type
    }
  }
  return fields;
}

// ─── VSCDB operations ───

const DEFAULT_VSCDB = path.join(os.homedir(), '.config/Antigravity/User/globalStorage/state.vscdb');
const VSCDB_KEY = 'antigravityUnifiedStateSync.oauthToken';
const AUTH_STATUS_KEY = 'antigravityAuthStatus';
const SENTINEL_KEY = 'oauthTokenInfoSentinelKey';

function readVscdb(vscdbPath, key) {
  const escaped = key.replace(/'/g, "''");
  try {
    const result = execSync(
      `sqlite3 "${vscdbPath}" "SELECT value FROM ItemTable WHERE key='${escaped}';"`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    return result;
  } catch {
    return null;
  }
}

function writeVscdb(vscdbPath, key, value) {
  const escapedKey = key.replace(/'/g, "''");
  const escapedValue = value.replace(/'/g, "''");
  
  // Check if key exists
  const existing = readVscdb(vscdbPath, key);
  
  let sql;
  if (existing !== null && existing !== '') {
    sql = `UPDATE ItemTable SET value='${escapedValue}' WHERE key='${escapedKey}';`;
  } else {
    sql = `INSERT INTO ItemTable (key, value) VALUES ('${escapedKey}', '${escapedValue}');`;
  }
  
  execSync(`sqlite3 "${vscdbPath}" "${sql}"`, { timeout: 5000 });
}

// ─── CLI ───

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    accessToken: null,
    refreshToken: null,
    tokenType: 'Bearer',
    expirySeconds: null,
    isGcpTos: false,
    vscdbPath: DEFAULT_VSCDB,
    dryRun: false,
    fromAccounts: null,
    verify: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--access-token': opts.accessToken = args[++i]; break;
      case '--refresh-token': opts.refreshToken = args[++i]; break;
      case '--token-type': opts.tokenType = args[++i]; break;
      case '--expiry-seconds': opts.expirySeconds = parseInt(args[++i]); break;
      case '--is-gcp-tos': opts.isGcpTos = true; break;
      case '--vscdb-path': opts.vscdbPath = args[++i]; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--from-accounts': opts.fromAccounts = args[++i]; break;
      case '--verify': opts.verify = true; break;
      case '--help': printHelp(); process.exit(0);
    }
  }
  
  return opts;
}

function printHelp() {
  console.log(`
Usage: node antigravity/inject-vscdb-token.mjs [options]

Options:
  --access-token TOKEN     OAuth access token (ya29.xxx)
  --refresh-token TOKEN    OAuth refresh token (1//0exxx)
  --token-type TYPE        Token type (default: Bearer)
  --expiry-seconds EPOCH   Token expiry as Unix timestamp
  --is-gcp-tos             Set GCP TOS flag
  --vscdb-path PATH        Path to state.vscdb (default: ~/.config/Antigravity/...)
  --dry-run                Show encoded data without writing
  --from-accounts EMAIL    Read tokens from antigravity-accounts.json by email
  --verify                 Verify current VSCDB token (decode and display)
  --help                   Show this help
`);
}

function loadFromAccounts(email) {
  const accountsPath = path.join(os.homedir(), '.config/opencode/antigravity-accounts.json');
  if (!existsSync(accountsPath)) {
    console.error(`❌ Accounts file not found: ${accountsPath}`);
    process.exit(1);
  }
  
  const data = JSON.parse(readFileSync(accountsPath, 'utf-8'));
  const account = data.accounts.find(a => a.email === email);
  if (!account) {
    console.error(`❌ Account not found: ${email}`);
    console.error(`   Available: ${data.accounts.map(a => a.email).join(', ')}`);
    process.exit(1);
  }
  
  if (!account.refreshToken) {
    console.error(`❌ No refresh token for ${email}`);
    process.exit(1);
  }
  
  return {
    accessToken: account.accessToken || '',
    refreshToken: account.refreshToken,
    tokenType: 'Bearer',
    expirySeconds: account.tokenExpiry ? Math.floor(new Date(account.tokenExpiry).getTime() / 1000) : Math.floor(Date.now() / 1000) + 3600,
    isGcpTos: false,
  };
}

function verifyCurrentToken(vscdbPath) {
  console.log(`\n🔍 Verifying current VSCDB token at: ${vscdbPath}`);
  
  const raw = readVscdb(vscdbPath, VSCDB_KEY);
  if (!raw || raw.length === 0) {
    console.log('   ⚠️  No token stored (empty)');
    return;
  }
  
  console.log(`   Raw base64 length: ${raw.length}`);
  
  try {
    const buf = Buffer.from(raw, 'base64');
    console.log(`   Decoded binary length: ${buf.length}`);
    
    // Decode outer map
    const outerFields = decodeProtobuf(buf);
    for (const entry of outerFields) {
      if (entry.fieldNumber === 1 && entry.data) {
        const entryFields = decodeProtobuf(entry.data);
        const keyField = entryFields.find(f => f.fieldNumber === 1);
        const valueField = entryFields.find(f => f.fieldNumber === 2);
        
        console.log(`   Key: "${keyField?.string}"`);
        
        if (valueField?.data) {
          const rowFields = decodeProtobuf(valueField.data);
          const valueStrField = rowFields.find(f => f.fieldNumber === 1);
          if (valueStrField?.string) {
            // Row.value is a base64 string — decode it to get OAuthTokenInfo bytes
            let tokenBuf;
            try {
              tokenBuf = Buffer.from(valueStrField.string, 'base64');
            } catch {
              // Fallback: try as raw bytes (old format)
              tokenBuf = valueStrField.data;
            }
            if (tokenBuf) {
              const tokenFields = decodeProtobuf(tokenBuf);
              for (const tf of tokenFields) {
                if (tf.fieldNumber === 1) console.log(`   access_token: ${tf.string?.substring(0, 20)}...`);
                if (tf.fieldNumber === 2) console.log(`   token_type: ${tf.string}`);
                if (tf.fieldNumber === 3) console.log(`   refresh_token: ${tf.string?.substring(0, 20)}...`);
                if (tf.fieldNumber === 4 && tf.data) {
                  const tsFields = decodeProtobuf(tf.data);
                  const seconds = tsFields.find(f => f.fieldNumber === 1);
                  if (seconds) {
                    const date = new Date(Number(seconds.value) * 1000);
                    console.log(`   expiry: ${date.toISOString()} (${seconds.value})`);
                  }
                }
                if (tf.fieldNumber === 6) console.log(`   is_gcp_tos: ${tf.value}`);
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error(`   ❌ Decode error: ${e.message}`);
  }
  
  // Also show auth status
  const authStatus = readVscdb(vscdbPath, AUTH_STATUS_KEY);
  console.log(`   authStatus: ${authStatus}`);
}

// ─── Main ───

function main() {
  const opts = parseArgs();
  
  // Verify mode
  if (opts.verify) {
    verifyCurrentToken(opts.vscdbPath);
    return;
  }
  
  // Load tokens
  let tokenData;
  if (opts.fromAccounts) {
    tokenData = loadFromAccounts(opts.fromAccounts);
    console.log(`\n📋 Loaded tokens for: ${opts.fromAccounts}`);
  } else if (opts.refreshToken) {
    tokenData = {
      accessToken: opts.accessToken || '',
      refreshToken: opts.refreshToken,
      tokenType: opts.tokenType,
      expirySeconds: opts.expirySeconds || Math.floor(Date.now() / 1000) + 3600,
      isGcpTos: opts.isGcpTos,
    };
  } else {
    console.error('❌ Provide --refresh-token or --from-accounts EMAIL');
    process.exit(1);
  }
  
  console.log(`   access_token: ${(tokenData.accessToken || '(empty)').substring(0, 30)}...`);
  console.log(`   refresh_token: ${tokenData.refreshToken.substring(0, 20)}...`);
  console.log(`   token_type: ${tokenData.tokenType}`);
  console.log(`   expiry: ${new Date(tokenData.expirySeconds * 1000).toISOString()}`);
  console.log(`   is_gcp_tos: ${tokenData.isGcpTos}`);
  
  // Encode OAuthTokenInfo
  const oauthBytes = encodeOAuthTokenInfo(tokenData);
  console.log(`\n🔧 Encoded OAuthTokenInfo: ${oauthBytes.length} bytes`);
  
  // Wrap in UnifiedStateSyncMap
  const wrappedBytes = encodeUnifiedStateSyncMap(SENTINEL_KEY, oauthBytes);
  console.log(`   Wrapped in map: ${wrappedBytes.length} bytes`);
  
  // Base64 encode
  const b64 = wrappedBytes.toString('base64');
  console.log(`   Base64 length: ${b64.length}`);
  
  // Verify by decoding
  console.log('\n🔍 Verification (decode back):');
  const decoded = Buffer.from(b64, 'base64');
  const outerFields = decodeProtobuf(decoded);
  for (const entry of outerFields) {
    if (entry.fieldNumber === 1 && entry.data) {
      const entryFields = decodeProtobuf(entry.data);
      const keyField = entryFields.find(f => f.fieldNumber === 1);
      console.log(`   Key: "${keyField?.string}" ✓`);
      
      const valueField = entryFields.find(f => f.fieldNumber === 2);
      if (valueField?.data) {
        const rowFields = decodeProtobuf(valueField.data);
        const valueStrField = rowFields.find(f => f.fieldNumber === 1);
        if (valueStrField?.string) {
          // Row.value is base64 — decode to verify inner OAuthTokenInfo
          const tokenBuf = Buffer.from(valueStrField.string, 'base64');
          const tokenFields = decodeProtobuf(tokenBuf);
          const at = tokenFields.find(f => f.fieldNumber === 1);
          const rt = tokenFields.find(f => f.fieldNumber === 3);
          console.log(`   access_token roundtrip: ${at?.string === tokenData.accessToken ? '✓ match' : '✗ MISMATCH'}`);
          console.log(`   refresh_token roundtrip: ${rt?.string === tokenData.refreshToken ? '✓ match' : '✗ MISMATCH'}`);
        }
      }
    }
  }
  
  if (opts.dryRun) {
    console.log('\n🏁 DRY RUN — not writing to VSCDB');
    console.log(`   Would write to: ${opts.vscdbPath}`);
    console.log(`   Key: ${VSCDB_KEY}`);
    console.log(`   Base64 value (first 80 chars): ${b64.substring(0, 80)}...`);
    return;
  }
  
  // Check VSCDB exists
  if (!existsSync(opts.vscdbPath)) {
    console.error(`\n❌ VSCDB not found: ${opts.vscdbPath}`);
    process.exit(1);
  }
  
  // Write to VSCDB
  console.log(`\n💉 Writing to VSCDB: ${opts.vscdbPath}`);
  writeVscdb(opts.vscdbPath, VSCDB_KEY, b64);
  console.log(`   ✓ Wrote ${VSCDB_KEY}`);
  
  // Also set authStatus to indicate signed-in state
  writeVscdb(opts.vscdbPath, AUTH_STATUS_KEY, '"signedIn"');
  console.log(`   ✓ Set ${AUTH_STATUS_KEY} = "signedIn"`);
  
  // Final verification
  console.log('\n🔍 Post-write verification:');
  verifyCurrentToken(opts.vscdbPath);
  
  console.log('\n✅ Token injection complete!');
}

main();
