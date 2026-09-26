'use strict';
/**
 * versionium/routes/versionium.js — the real commit/history/restore/
 * state/calendar API, migrated wholesale from cortex/boot.js's own
 * /api/versionium/* routes (§VS1, docs/2026-09-02-versionium-sovereign-
 * and-cleanup-phasemap.spec). Logic unchanged; only the transport layer
 * (this file's own request parsing) and jaaDB source (engine.js's own
 * sovereign store now, not cortex's) are new.
 */
const engine = require('../lib/engine.js');
const { jaaDB } = require('../lib/store.js');
const { json, readBody } = require('../lib/http-utils.js');

function _emitEvent(type, payload) {
  // §VS1 — event-taxonomy.js documents these as real; this is what makes
  // that documentation true rather than aspirational. Local table, not
  // the shared event_log (this is versionium's own operational log, not
  // the cross-system causal one engine.js/causality.js deliberately
  // write to separately).
  try { jaaDB.insert('versionium_events', { uuid: jaaDB.uid(), type, payload, ts: Date.now() }); } catch (_) {}
}

async function handle(req, res, { method, pathname, url }) {
  if (pathname === '/api/versionium/commit' && method === 'POST') {
    const body = await readBody(req);
    const { message, branch, causedBy, system, state } = body || {};
    if (!message) { json(res, 400, { ok: false, error: 'message is required' }); return true; }
    try {
      const commit = engine.commit({ message, branch, causedBy, system: system || null, state: state ?? null });
      _emitEvent('versionium.committed', { commitId: commit.commitId, branch: commit.branch, system: commit.system });
      json(res, 200, { ok: true, commit });
    } catch (e) {
      json(res, 500, { ok: false, error: `versionium commit failed: ${e.message}` });
    }
    return true;
  }

  if (pathname === '/api/versionium/history') {
    const system = url.searchParams.get('system') || null;
    try {
      const rows = system
        ? jaaDB.query('versionium_commits', r => r.system === system, 200)
        : jaaDB.query('versionium_commits', () => true, 200);
      json(res, 200, { ok: true, system, count: rows.length, commits: rows });
    } catch (e) {
      json(res, 500, { ok: false, error: `versionium history query failed: ${e.message}` });
    }
    return true;
  }

  if (pathname.startsWith('/api/versionium/restore/')) {
    const commitId = pathname.slice('/api/versionium/restore/'.length);
    _emitEvent('versionium.restore.requested', { commitId });
    try {
      const result = engine.restore(commitId);
      if (result.error) {
        _emitEvent('versionium.restore.failed', { commitId, reason: result.error });
        json(res, 404, { ok: false, error: result.error });
        return true;
      }
      const completion = result.context.complete ? result.context.complete() : null;
      json(res, 200, { ok: true, commit: result.commit, completion });
    } catch (e) {
      _emitEvent('versionium.restore.failed', { commitId, reason: e.message });
      json(res, 500, { ok: false, error: `versionium restore failed: ${e.message}` });
    }
    return true;
  }

  if (pathname.startsWith('/api/versionium/state/')) {
    const commitId = pathname.slice('/api/versionium/state/'.length);
    _emitEvent('versionium.state.requested', { commitId });
    try {
      const result = engine.getState(commitId);
      if (result.error) { json(res, 404, { ok: false, error: result.error }); return true; }
      json(res, 200, { ok: true, commit: result.commit, state: result.state });
    } catch (e) {
      json(res, 500, { ok: false, error: `versionium state read failed: ${e.message}` });
    }
    return true;
  }

  if (pathname.startsWith('/api/versionium/calendar/')) {
    const date = pathname.slice('/api/versionium/calendar/'.length);
    try {
      const rows = engine.calendar(date);
      json(res, 200, { ok: true, date, count: rows.length, commits: rows });
    } catch (e) {
      json(res, 500, { ok: false, error: `versionium calendar query failed: ${e.message}` });
    }
    return true;
  }

  return false;
}

module.exports = { handle };
