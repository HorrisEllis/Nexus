'use strict';
/**
 * ollama/lib/http-utils.js
 * Small, dependency-free helpers every route module uses.
 */

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve({}); } });
    req.on('error', reject);
  });
}

// §ADDED 2026-07-06 — reads raw bytes for a real file upload without
// JSON.parse corrupting binary content. Decoded as UTF-8 ("plaintext"
// per the original request), capped generously since a dropped file
// could be a whole source file or log dump, not just a short prompt.
function readRawBody(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    // §SD0 0.56.0 — over the limit the socket was destroyed, so the caller's 413 never arrived: the sender read
    // "read ECONNRESET", which looks exactly like versionium being down. The rest of the body is drained and dropped
    // instead, and the caller answers 413 on a live connection.
    let over = false;
    req.on('data', c => {
      if (over) return;
      size += c.length;
      if (size > maxBytes) { over = true; chunks.length = 0; reject(new Error(`upload exceeds ${maxBytes} byte limit`)); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!over) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

module.exports = { json, readBody, readRawBody };
