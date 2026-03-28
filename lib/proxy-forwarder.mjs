/**
 * Local proxy forwarder for authenticated upstream proxies.
 *
 * Chrome/Chromium in headless mode cannot handle HTTP 407 Proxy-Auth challenges.
 * This module starts a local HTTP/CONNECT proxy (no auth) that forwards all traffic
 * to an authenticated upstream proxy, injecting the Proxy-Authorization header.
 *
 * Usage:
 *   const { server, localUrl } = await startProxyForwarder({
 *     upstream: 'http://geo.iproyal.com:12321',
 *     username: 'user',
 *     password: 'pass',
 *   });
 *   // Pass localUrl (e.g. "http://127.0.0.1:18080") to Chrome --proxy-server
 *   // Later: server.close()
 */

import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';

/**
 * Start a local proxy forwarder.
 * @param {object} opts
 * @param {string} opts.upstream - Upstream proxy URL (e.g. "http://host:port")
 * @param {string} opts.username - Upstream proxy username
 * @param {string} opts.password - Upstream proxy password
 * @param {number} [opts.localPort=0] - Local port (0 = auto-assign)
 * @returns {Promise<{ server: http.Server, port: number, localUrl: string }>}
 */
export async function startProxyForwarder({ upstream, username, password, localPort = 0 }) {
  const upstreamUrl = new URL(upstream);
  const upstreamHost = upstreamUrl.hostname;
  const upstreamPort = parseInt(upstreamUrl.port, 10) || 80;
  const proxyAuth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  const server = http.createServer();

  // Handle regular HTTP requests (GET, POST, etc.)
  server.on('request', (clientReq, clientRes) => {
    const options = {
      hostname: upstreamHost,
      port: upstreamPort,
      method: clientReq.method,
      path: clientReq.url, // Full URL for proxy request
      headers: {
        ...clientReq.headers,
        'proxy-authorization': proxyAuth,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes);
    });

    proxyReq.on('error', (err) => {
      console.error(`[proxy-forwarder] HTTP request error: ${err.message}`);
      if (!clientRes.headersSent) {
        clientRes.writeHead(502);
      }
      clientRes.end('Bad Gateway');
    });

    clientReq.pipe(proxyReq);
  });

  // Handle CONNECT tunneling (HTTPS)
  server.on('connect', (req, clientSocket, head) => {
    // req.url is "host:port" for CONNECT
    const connectPayload = `CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\nProxy-Authorization: ${proxyAuth}\r\n\r\n`;

    const upstreamSocket = net.connect(upstreamPort, upstreamHost, () => {
      upstreamSocket.write(connectPayload);
    });

    let connected = false;
    let responseBuffer = '';

    upstreamSocket.on('data', (chunk) => {
      if (!connected) {
        responseBuffer += chunk.toString();
        const headerEnd = responseBuffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return; // Wait for full header

        const statusLine = responseBuffer.split('\r\n')[0];
        const statusCode = parseInt(statusLine.split(' ')[1], 10);

        if (statusCode === 200) {
          connected = true;
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

          // Forward any remaining data after headers
          const remaining = responseBuffer.slice(headerEnd + 4);
          if (remaining.length > 0) {
            clientSocket.write(remaining);
          }

          // Pipe bidirectionally
          upstreamSocket.pipe(clientSocket);
          clientSocket.pipe(upstreamSocket);

          // Write the head data if present
          if (head && head.length > 0) {
            upstreamSocket.write(head);
          }
        } else {
          console.error(`[proxy-forwarder] CONNECT failed: ${statusLine}`);
          clientSocket.write(`HTTP/1.1 ${statusCode} Proxy Error\r\n\r\n`);
          clientSocket.end();
          upstreamSocket.end();
        }
      }
    });

    upstreamSocket.on('error', (err) => {
      console.error(`[proxy-forwarder] CONNECT error: ${err.message}`);
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.end();
    });

    clientSocket.on('error', (err) => {
      if (err.code !== 'ECONNRESET') {
        console.error(`[proxy-forwarder] Client socket error: ${err.message}`);
      }
      upstreamSocket.destroy();
    });

    upstreamSocket.on('close', () => {
      clientSocket.destroy();
    });

    clientSocket.on('close', () => {
      upstreamSocket.destroy();
    });
  });

  // Handle server-level errors
  server.on('error', (err) => {
    console.error(`[proxy-forwarder] Server error: ${err.message}`);
  });

  return new Promise((resolve, reject) => {
    server.listen(localPort, '127.0.0.1', () => {
      const port = server.address().port;
      const localUrl = `http://127.0.0.1:${port}`;
      resolve({ server, port, localUrl });
    });
    server.on('error', reject);
  });
}
