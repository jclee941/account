#!/usr/bin/env node
/**
 * CDP Network Sniffer for Google Signup Flow
 * Connects to Chrome DevTools on Android (via ADB forward) and captures all network traffic.
 * 
 * Usage: node sniff-signup.mjs [--page-id 4]
 * Prerequisites: adb forward tcp:9222 localabstract:chrome_devtools_remote
 */

import WebSocket from "ws";

const CDP_HOST = "localhost";
const CDP_PORT = 9222;
const PAGE_ID = process.argv.includes("--page-id")
  ? process.argv[process.argv.indexOf("--page-id") + 1]
  : null;

// Store request data keyed by requestId
const requests = new Map();
const responseBodies = new Map();

async function getTargets() {
  const res = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json`);
  return res.json();
}

async function main() {
  const targets = await getTargets();
  const pages = targets.filter((t) => t.type === "page");

  let target;
  if (PAGE_ID) {
    target = pages.find((p) => p.id === PAGE_ID);
  } else {
    // Pick the most recent signup page
    target = pages.find((p) => p.url.includes("accounts.google.com/lifecycle/steps/signup"));
    if (!target) target = pages[0];
  }

  if (!target) {
    console.error("No suitable target found. Available:");
    pages.forEach((p) => console.error(`  [${p.id}] ${p.title} - ${p.url}`));
    process.exit(1);
  }

  console.error(`📡 Connecting to: [${target.id}] ${target.title}`);
  console.error(`   URL: ${target.url}`);
  console.error(`   WS: ${target.webSocketDebuggerUrl}\n`);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let cmdId = 1;

  function send(method, params = {}) {
    const id = cmdId++;
    ws.send(JSON.stringify({ id, method, params }));
    return id;
  }

  ws.on("open", () => {
    console.error("✅ Connected to CDP\n");

    // Enable Network domain with full request/response capture
    send("Network.enable", { maxTotalBufferSize: 100 * 1024 * 1024 });

    // Enable Fetch domain to intercept and see request bodies
    // Actually, Network.enable alone captures most of what we need
    // For request bodies we need Network.requestWillBeSentExtraInfo

    console.error("🔍 Sniffing network traffic... Interact with the signup form on the device.\n");
    console.error("   Press Ctrl+C to stop and dump summary.\n");
    console.error("=".repeat(80));
  });

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());

    // Skip CDP command responses (they have numeric id)
    if (msg.id) return;

    const { method, params } = msg;

    switch (method) {
      case "Network.requestWillBeSent": {
        const { requestId, request, type, redirectResponse } = params;
        const url = new URL(request.url);

        // Filter: only Google account-related requests
        if (
          !url.hostname.includes("google") &&
          !url.hostname.includes("gstatic") &&
          !url.hostname.includes("googleapis")
        ) {
          break;
        }

        // Skip static assets
        if (type === "Image" || type === "Font" || type === "Stylesheet") break;
        if (url.pathname.match(/\.(png|jpg|gif|svg|ico|woff|css|js)$/)) break;

        const entry = {
          url: request.url,
          method: request.method,
          headers: request.headers,
          postData: request.postData || null,
          type,
          timestamp: new Date().toISOString(),
        };

        requests.set(requestId, entry);

        // Log in real-time
        const shortUrl = `${url.pathname}${url.search ? "?" + url.search.slice(0, 80) : ""}`;
        console.log(`\n📤 ${request.method} ${shortUrl}`);
        if (request.postData) {
          console.log(`   POST body (${request.postData.length} chars):`);
          // Try to parse and pretty-print form data
          if (request.headers["Content-Type"]?.includes("application/x-www-form-urlencoded")) {
            const params = new URLSearchParams(request.postData);
            for (const [k, v] of params) {
              const displayVal = v.length > 200 ? v.slice(0, 200) + "..." : v;
              console.log(`     ${k} = ${displayVal}`);
            }
          } else {
            console.log(`   ${request.postData.slice(0, 500)}`);
          }
        }
        break;
      }

      case "Network.responseReceived": {
        const { requestId, response } = params;
        const entry = requests.get(requestId);
        if (!entry) break;

        entry.status = response.status;
        entry.responseHeaders = response.headers;
        entry.mimeType = response.mimeType;

        console.log(`   📥 ${response.status} ${response.mimeType || ""}`);

        // Try to get response body for important requests
        if (
          response.mimeType?.includes("json") ||
          response.mimeType?.includes("html") ||
          response.mimeType?.includes("protobuf")
        ) {
          const bodyId = cmdId;
          send("Network.getResponseBody", { requestId });
          responseBodies.set(bodyId, requestId);
        }
        break;
      }

      case "Network.loadingFinished": {
        // Could fetch body here too
        break;
      }

      default:
        break;
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });

  ws.on("close", () => {
    console.error("\n📊 Connection closed. Dumping summary...");
    dumpSummary();
  });

  // Also handle CDP responses (for getResponseBody)
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (!msg.id || !msg.result) return;

    const requestId = responseBodies.get(msg.id);
    if (!requestId) return;

    const entry = requests.get(requestId);
    if (!entry) return;

    const body = msg.result.body || "";
    entry.responseBody = body;

    if (body.length > 0 && body.length < 5000) {
      console.log(`   📄 Response body (${body.length} chars):`);
      // Try JSON parse
      try {
        const parsed = JSON.parse(body);
        console.log(`   ${JSON.stringify(parsed, null, 2).split("\n").join("\n   ")}`);
      } catch {
        console.log(`   ${body.slice(0, 2000)}`);
      }
    } else if (body.length >= 5000) {
      console.log(`   📄 Response body: ${body.length} chars (truncated)`);
      console.log(`   ${body.slice(0, 1000)}...`);
    }
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.error("\n\n📊 Stopping sniffer...");
    dumpSummary();
    ws.close();
    process.exit(0);
  });
}

function dumpSummary() {
  console.error("\n" + "=".repeat(80));
  console.error("📋 CAPTURED REQUESTS SUMMARY");
  console.error("=".repeat(80));

  const entries = [...requests.values()].filter(
    (e) => e.method === "POST" || e.url.includes("signup") || e.url.includes("lifecycle")
  );

  for (const entry of entries) {
    console.error(`\n${entry.method} ${entry.url}`);
    console.error(`  Status: ${entry.status || "pending"}`);
    console.error(`  Type: ${entry.type}`);
    if (entry.postData) {
      console.error(`  POST Data (${entry.postData.length} chars):`);
      console.error(`  ${entry.postData.slice(0, 500)}`);
    }
    if (entry.responseBody) {
      console.error(`  Response (${entry.responseBody.length} chars):`);
      console.error(`  ${entry.responseBody.slice(0, 500)}`);
    }
  }

  console.error(`\nTotal captured: ${requests.size} requests`);
  console.error(`POST/signup requests: ${entries.length}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
