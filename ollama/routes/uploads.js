'use strict';
/**
 * ollama/routes/uploads.js
 * POST /api/upload, GET /api/upload/:id
 * Not in registry-components.js as its own component (it's a helper for
 * jobs.dispatch's uploadId param), but kept as its own route module since
 * it owns its own state slice (state.uploads) and byte-level body reading.
 */

const crypto = require('crypto');
const { state } = require('../lib/state.js');
const { json, readRawBody } = require('../lib/http-utils.js');

async function handle(req, res, { method, pathname }) {
  // Filename comes via X-Filename header (URL-encoded) — same
  // no-multipart convention loom/server.js's upload endpoint uses.
  if (method === 'POST' && pathname === '/api/upload') {
    const rawName = req.headers['x-filename'];
    let buf;
    try { buf = await readRawBody(req); }
    catch (e) { json(res, 413, { ok: false, error: e.message }); return true; }
    if (!buf.length) { json(res, 400, { ok: false, error: 'empty upload' }); return true; }

    const text = buf.toString('utf8');
    const uploadId = crypto.randomUUID();
    state.uploads.set(uploadId, { text, filename: rawName ? decodeURIComponent(rawName) : 'upload.txt', uploadedAt: Date.now() });
    // Bounded — an upload store that only ever grows is its own slow leak.
    if (state.uploads.size > 200) {
      const oldest = [...state.uploads.entries()].sort((a, b) => a[1].uploadedAt - b[1].uploadedAt)[0][0];
      state.uploads.delete(oldest);
    }
    json(res, 200, { ok: true, uploadId, filename: rawName ? decodeURIComponent(rawName) : 'upload.txt', chars: text.length });
    return true;
  }

  if (method === 'GET' && pathname.startsWith('/api/upload/')) {
    const id = pathname.split('/')[3];
    const up = state.uploads.get(id);
    if (!up) { json(res, 404, { ok: false, error: 'upload not found — may have expired' }); return true; }
    json(res, 200, { ok: true, ...up });
    return true;
  }

  return false;
}

module.exports = { handle };
module.exports.commands = [
  { method: 'POST', path: '/api/upload' },
  { method: 'GET', path: '/api/upload/:id', description: 'prefix match — pathname.startsWith(\'/api/upload/\')' },
];
