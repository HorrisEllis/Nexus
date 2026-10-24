'use strict';
/**
 * engines/ui/lib/http.js — request/response helpers for the panel server.
 * Extracted from the ui.js monolith so route modules share one implementation.
 */

const http = require('http');

const MAX_BODY = 1048576; // 1 MB

function jsonR(res, status, obj) {
  if (res.headersSent) return;
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', d => {
      b += d;
      if (b.length > MAX_BODY) { req.destroy(); reject(new Error('body too large')); }
    });
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

/** Pipe a request straight through to another engine's HTTP port. */
function proxyReq(res, port, urlPath, method, body) {
  return new Promise(resolve => {
    const d = body ? JSON.stringify(body) : null;
    const req2 = http.request({
      host: '127.0.0.1', port, method, path: urlPath,
      headers: {
        'Content-Type': 'application/json',
        ...(d ? { 'Content-Length': Buffer.byteLength(d) } : {}),
      },
    }, r => {
      res.writeHead(r.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      r.pipe(res);
      resolve();
    });
    req2.on('error', e => {
      jsonR(res, 502, { error: `engine on port ${port} unreachable: ${e.code || e.message}` });
      resolve();
    });
    req2.setTimeout(8000, () => { req2.destroy(new Error('ETIMEDOUT')); });
    if (d) req2.write(d);
    req2.end();
  });
}

module.exports = { jsonR, readBody, proxyReq, MAX_BODY };
