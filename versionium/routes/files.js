'use strict';
/**
 * versionium/routes/files.js — HTTP surface of the per-file layer (MCO-B).
 * Logic lives in lib/files.js; this only parses, bounds and maps errors.
 * Spec: versionium/spec/versionium.file-versioning.spec.
 *
 *   POST /api/versionium/files/plan     { repository, tree }
 *   POST /api/versionium/files/record   { repository, commitId, tree, contents }
 *   GET  /api/versionium/files/limits   (maxFileBytes, maxRecordBytes, keyframeInterval)
 *   GET  /api/versionium/files/tree     ?repository=&commitId=
 *   GET  /api/versionium/files/content  ?repository=&commitId=&path=   (base64)
 */
const files = require('../lib/files.js');
const config = require('../config.js');
const { json, readRawBody } = require('../lib/http-utils.js');

const STATUS = {
  BAD_INPUT: 400, BAD_PATH: 400, HASH_MISMATCH: 400, TOO_LARGE: 400,
  NO_COMMIT: 404, NOT_IN_TREE: 404, WRONG_COMMIT: 409,
};

function fail(res, e) {
  if (e && e.code && files.FilesError && e instanceof files.FilesError) {
    json(res, STATUS[e.code] || 500, { ok: false, error: e.message, code: e.code, file: e.file || null });
  } else {
    json(res, 500, { ok: false, error: `files layer failed: ${e && e.message}` });
  }
}

async function body(req, res) {
  // base64 inflates by 4/3; allow the record limit that, plus envelope slack.
  const max = Math.ceil(config.FILE_MAX_RECORD_BYTES * 1.4) + 1024 * 1024;
  try {
    const raw = await readRawBody(req, max);
    return JSON.parse(raw.toString('utf8') || '{}');
  } catch (e) {
    json(res, /exceeds/.test(e.message) ? 413 : 400, { ok: false, error: /exceeds/.test(e.message) ? `request body over ${max} bytes — send fewer files per record call` : `invalid JSON body: ${e.message}`, code: 'BAD_BODY' });
    return null;
  }
}

async function handle(req, res, { method, pathname, url }) {
  if (!pathname.startsWith('/api/versionium/files/')) return false;

  if (pathname === '/api/versionium/files/plan' && method === 'POST') {
    const b = await body(req, res); if (b === null) return true;
    try { json(res, 200, { ok: true, ...files.plan({ repository: b.repository, tree: b.tree }) }); } catch (e) { fail(res, e); }
    return true;
  }

  if (pathname === '/api/versionium/files/record' && method === 'POST') {
    const b = await body(req, res); if (b === null) return true;
    try {
      const r = files.record({ repository: b.repository, commitId: b.commitId, tree: b.tree, contents: b.contents, mode: b.mode === undefined ? 'delta' : b.mode });
      // MISSING_CONTENT is a normal negotiation step, not a fault: 409 + the list.
      if (r.ok === false) json(res, 409, { ok: false, code: r.code, error: `content still needed for ${r.missing.length} file(s)`, missing: r.missing });
      else json(res, 200, r);
    } catch (e) { fail(res, e); }
    return true;
  }

  // 0.39.263 — content ahead of record(), in batches under the per-request cap
  if (pathname === '/api/versionium/files/stage' && method === 'POST') {
    const b = await body(req, res); if (b === null) return true;
    try { json(res, 200, files.stage({ contents: b.contents })); } catch (e) { fail(res, e); }
    return true;
  }

  // 0.39.263 — which commits hold this path, and at what content (newest first)
  if (pathname === '/api/versionium/files/versions' && method === 'GET') {
    try {
      const p = url.searchParams.get('path');
      if (!p) throw new files.FilesError('BAD_INPUT', 'path is required');
      const list = files.versions(p, { repository: url.searchParams.get('repository') || null, limit: parseInt(url.searchParams.get('limit'), 10) || 200 });
      json(res, 200, { ok: true, path: p, count: list.length, versions: list });
    } catch (e) { fail(res, e); }
    return true;
  }

  if (pathname === '/api/versionium/files/limits' && method === 'GET') {
    json(res, 200, { ok: true, ...files.limits() });
    return true;
  }

  if (pathname === '/api/versionium/files/tree' && method === 'GET') {
    try {
      const repository = url.searchParams.get('repository'), commitId = url.searchParams.get('commitId');
      if (!repository || !commitId) throw new files.FilesError('BAD_INPUT', 'repository and commitId are required');
      json(res, 200, { ok: true, ...files.tree(repository, commitId) });
    } catch (e) { fail(res, e); }
    return true;
  }

  if (pathname === '/api/versionium/files/content' && method === 'GET') {
    try {
      const repository = url.searchParams.get('repository'), commitId = url.searchParams.get('commitId'), p = url.searchParams.get('path');
      if (!repository || !commitId || !p) throw new files.FilesError('BAD_INPUT', 'repository, commitId and path are required');
      if (!files.validPath(p)) throw new files.FilesError('BAD_PATH', `unsafe or invalid path: ${JSON.stringify(p)}`);
      const c = files.content(repository, commitId, p);
      json(res, 200, { ok: true, path: c.path, sha256: c.sha256, bytes: c.bytes.length, content_b64: c.bytes.toString('base64') });
    } catch (e) { fail(res, e); }
    return true;
  }

  return false;
}

module.exports = { handle };
