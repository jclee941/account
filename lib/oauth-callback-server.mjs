import { createServer } from 'node:http';

export function createCallbackServer({
  port = 0,
  callbackPath = '/oauth2callback',
  timeoutMs = 180_000,
  host = 'localhost',
  baseUrl,
  responseMode = 'text',
  successText = 'Authorization successful! You can close this tab.',
  successHtml,
  successRedirectUrl,
  redirectNonCallbackTo,
  onResolve,
} = {}) {
  let server = null;
  let timeoutId = null;
  let listening = false;
  let resolved = false;
  let actualPort = null;
  let resolveStarted;
  let rejectStarted;
  let resolveCode;
  let rejectCode;

  const startedPromise = new Promise((resolve, reject) => {
    resolveStarted = resolve;
    rejectStarted = reject;
  });

  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Prevent unhandled rejection when close() is called before waitForCode()
  codePromise.catch(() => {});

  const handleSuccessResponse = (res) => {
    if (responseMode === 'redirect' && successRedirectUrl) {
      res.writeHead(301, { Location: successRedirectUrl });
      res.end();
      return;
    }

    if (successHtml) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(successHtml);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(successText);
  };

  const closeServer = async () => {
    clearTimeout(timeoutId);
    if (!server || !listening) {
      return;
    }
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
    listening = false;
  };

  server = createServer(async (req, res) => {
    const origin = baseUrl || `http://${host}:${actualPort || port || 80}`;
    const requestUrl = new URL(req.url || '/', origin);

    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }

    if (requestUrl.pathname !== callbackPath) {
      if (redirectNonCallbackTo) {
        res.writeHead(301, { Location: redirectNonCallbackTo });
        res.end();
        return;
      }
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    const code = requestUrl.searchParams.get('code');
    const scope = requestUrl.searchParams.get('scope') || '';
    const state = requestUrl.searchParams.get('state') || '';
    const error = requestUrl.searchParams.get('error');
    const errorDescription = requestUrl.searchParams.get('error_description') || '';

    if (error) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        rejectCode(new Error(`OAuth error: ${error}${errorDescription ? ` (${errorDescription})` : ''}`));
      }
      handleSuccessResponse(res);
      setTimeout(() => {
        closeServer().catch(() => {});
      }, 1000);
      return;
    }

    if (!code) {
      res.statusCode = 400;
      res.end('Missing authorization code');
      return;
    }

    if (resolved) {
      res.statusCode = 409;
      res.end('Authorization code already received');
      return;
    }

    resolved = true;
    clearTimeout(timeoutId);
    handleSuccessResponse(res);

    const payload = {
      code,
      scope,
      state,
      port: actualPort,
      requestUrl: requestUrl.toString(),
    };

    const extra = typeof onResolve === 'function' ? await onResolve(payload) : null;
    resolveCode(extra ? { ...payload, ...extra } : payload);

    setTimeout(() => {
      closeServer().catch(() => {});
    }, 1000);
  });

  server.on('error', (err) => {
    clearTimeout(timeoutId);
    if (!listening) {
      rejectStarted(err);
    }
    if (!resolved) {
      resolved = true;
      rejectCode(err);
    }
  });

  server.listen(port, host, () => {
    listening = true;
    const address = server.address();
    actualPort = typeof address === 'object' && address ? address.port : null;
    resolveStarted();

    timeoutId = setTimeout(() => {
      if (resolved) {
        return;
      }
      resolved = true;
      closeServer().finally(() => {
        rejectCode(new Error(`OAuth callback timeout after ${Math.round(timeoutMs / 1000)} seconds`));
      });
    }, timeoutMs);
  });

  return {
    waitUntilListening: () => startedPromise,
    waitForCode: () => codePromise,
    getPort: () => actualPort,
    close: async () => {
      if (!resolved) {
        resolved = true;
        rejectCode(new Error('OAuth callback server closed before receiving code'));
      }
      await closeServer();
    },
  };
}
