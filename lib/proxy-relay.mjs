#!/usr/bin/env node
/**
 * Simple CONNECT proxy relay — forwards HTTP/HTTPS traffic to an upstream
 * proxy that requires Basic auth. Does NOT intercept TLS (no MITM).
 *
 * Usage:
 *   node lib/proxy-relay.mjs [--port 18080]
 *
 * Env vars:
 *   UPSTREAM_PROXY_HOST  (default: geo.iproyal.com)
 *   UPSTREAM_PROXY_PORT  (default: 12321)
 *   UPSTREAM_PROXY_USER
 *   UPSTREAM_PROXY_PASS
 */
import net from 'node:net';
import http from 'node:http';

const UPSTREAM_HOST = process.env.UPSTREAM_PROXY_HOST || 'geo.iproyal.com';
const UPSTREAM_PORT = parseInt(process.env.UPSTREAM_PROXY_PORT || '12321', 10);
const UPSTREAM_USER = process.env.UPSTREAM_PROXY_USER || '';
const UPSTREAM_PASS = process.env.UPSTREAM_PROXY_PASS || '';
const LISTEN_PORT  = parseInt(process.argv.find((a, i, arr) => arr[i - 1] === '--port') || '18080', 10);

const authHeader = UPSTREAM_USER
  ? 'Basic ' + Buffer.from(`${UPSTREAM_USER}:${UPSTREAM_PASS}`).toString('base64')
  : null;

// ── CONNECT tunnel (HTTPS) ──────────────────────────────────────────────
function handleConnect(cReq, cSocket, cHead) {
  const upConn = net.connect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
    // Send CONNECT to upstream with auth
    let connectReq = `CONNECT ${cReq.url} HTTP/1.1\r\nHost: ${cReq.url}\r\n`;
    if (authHeader) connectReq += `Proxy-Authorization: ${authHeader}\r\n`;
    connectReq += '\r\n';
    upConn.write(connectReq);
  });

  let responded = false;
  upConn.once('data', (chunk) => {
    // First chunk is the upstream proxy's HTTP response to CONNECT
    const statusLine = chunk.toString().split('\r\n')[0];
    if (/200/.test(statusLine)) {
      cSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      responded = true;
      // Pipe bidirectionally — remaining data is raw TLS
      if (cHead && cHead.length) upConn.write(cHead);
      upConn.pipe(cSocket);
      cSocket.pipe(upConn);
    } else {
      cSocket.write(`HTTP/1.1 502 Bad Gateway\r\n\r\n${statusLine}\r\n`);
      cSocket.end();
      upConn.end();
    }
  });

  upConn.on('error', (err) => {
    console.error(`[CONNECT] upstream error: ${err.message}`);
    if (!responded) {
      cSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      cSocket.end();
    }
  });
  cSocket.on('error', () => upConn.destroy());
}

// ── Plain HTTP relay ────────────────────────────────────────────────────
function handleRequest(cReq, cRes) {
  const opts = {
    hostname: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    path: cReq.url,
    method: cReq.method,
    headers: { ...cReq.headers },
  };
  if (authHeader) opts.headers['Proxy-Authorization'] = authHeader;

  const upReq = http.request(opts, (upRes) => {
    cRes.writeHead(upRes.statusCode, upRes.headers);
    upRes.pipe(cRes);
  });
  upReq.on('error', (err) => {
    console.error(`[HTTP] upstream error: ${err.message}`);
    cRes.writeHead(502);
    cRes.end('Bad Gateway');
  });
  cReq.pipe(upReq);
}

// ── Server ──────────────────────────────────────────────────────────────
const server = http.createServer(handleRequest);
server.on('connect', handleConnect);
server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.error(`Proxy relay listening on 0.0.0.0:${LISTEN_PORT}`);
  console.error(`Upstream: ${UPSTREAM_HOST}:${UPSTREAM_PORT} (auth: ${authHeader ? 'yes' : 'no'})`);
});
