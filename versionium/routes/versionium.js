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
const REL = require('../lib/releases.js');
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
    const { message, branch, causedBy, system, state, from } = body || {};
    if (!message) { json(res, 400, { ok: false, error: 'message is required' }); return true; }
    try {
      // §0.39.279 (staging-self-heal S0) — `from`: the first commit of a new branch records where it forked from
      const commit = engine.commit({ message, branch, causedBy, system: system || null, state: state ?? null, from: from || null });
      _emitEvent('versionium.committed', { commitId: commit.commitId, branch: commit.branch, system: commit.system });
      json(res, 200, { ok: true, commit });
    } catch (e) {
      json(res, 500, { ok: false, error: `versionium commit failed: ${e.message}` });
    }
    return true;
  }

  // §0.60.41 RN1 — tags (immovable) and releases, per repository (docs/2026-10-15-one-contract-raid-releases-phasemap.spec)
  if (pathname === '/api/versionium/tags' || pathname === '/api/versionium/releases' || pathname.startsWith('/api/versionium/releases/')) {
    try {
      if (pathname === '/api/versionium/tags' && method === 'GET') { json(res, 200, { ok: true, tags: REL.tags({ repository: url.searchParams.get('repository') || null }) }); return true; }
      if (pathname === '/api/versionium/releases' && method === 'GET') {
        json(res, 200, { ok: true, releases: REL.releases({ repository: url.searchParams.get('repository') || null, limit: parseInt(url.searchParams.get('n'), 10) || 1000 }) });
        return true;
      }
      if (pathname.startsWith('/api/versionium/releases/') && method === 'GET') {
        const r = REL.get({ repository: url.searchParams.get('repository') || null, version: decodeURIComponent(pathname.slice('/api/versionium/releases/'.length)) });
        json(res, r ? 200 : 404, r ? { ok: true, release: r } : { ok: false, error: 'no such release' });
        return true;
      }
      const body = (await readBody(req)) || {};
      if (pathname === '/api/versionium/tags' && method === 'POST') {
        const t = REL.tag(body);
        if (!t.already) _emitEvent('versionium.tagged', { repository: t.repository, name: t.name, commitId: t.commitId, gitCommit: t.gitCommit });
        json(res, 200, { ok: true, tag: t });
        return true;
      }
      if (pathname === '/api/versionium/releases' && method === 'POST') {
        const list = Array.isArray(body.releases) ? body.releases : [body];
        const out = list.map(r => { try { return REL.release(r); } catch (e) { return { ok: false, version: r && r.version, error: e.message, code: e.code }; } });
        for (const r of out) if (r && r.uuid && !r.already) _emitEvent('versionium.released', { repository: r.repository, version: r.version, tag: r.tag, commitId: r.commitId, gitCommit: r.gitCommit });
        const bad = out.filter(r => r && r.ok === false);
        if (!Array.isArray(body.releases)) { json(res, bad.length ? (bad[0].code === 'TAG_EXISTS' ? 409 : 400) : 200, bad.length ? bad[0] : { ok: true, release: out[0] }); return true; }
        json(res, 200, { ok: !bad.length, recorded: out.filter(r => r && r.uuid && !r.already).length, already: out.filter(r => r && r.already).length, refused: bad });
        return true;
      }
    } catch (e) {
      json(res, e.code === 'TAG_EXISTS' ? 409 : e.code === 'BAD_REQUEST' ? 400 : 500, { ok: false, error: e.message, code: e.code || null });
      return true;
    }
  }

  // §0.39.279 (staging-self-heal S0) — branches with their fork points; POST makes one AT a commit (or a branch's head)
  if (pathname === '/api/versionium/branches' && method === 'GET') {
    json(res, 200, { ok: true, branches: engine.branches() });
    return true;
  }
  if (pathname === '/api/versionium/branches' && method === 'POST') {
    const body = await readBody(req);
    const r = engine.createBranch({ branch: body && body.branch, from: body && body.from !== undefined ? body.from : 'main', causedBy: (body && body.causedBy) || null });
    if (r.ok && r.created) _emitEvent('versionium.branched', { branch: r.branch, forkedFrom: r.forkedFrom });
    json(res, r.ok ? 200 : 400, r);
    return true;
  }

  if (pathname === '/api/versionium/history') {
    const system = url.searchParams.get('system') || null;
    // §0.39.271 V1 — ?branch= and ?n= added (additive; defaults unchanged) so the
    // orchestrator's old /api/cortex/versionium/log?n=&branch= can be answered here.
    const branch = url.searchParams.get('branch') || null;
    // With an explicit ?n= the NEWEST n come back, newest first (a log); without it the
    // original behaviour stands (the first 200 in store order) — every existing caller.
    const nParam = parseInt(url.searchParams.get('n'), 10);
    const n = Math.max(1, Math.min(1000, nParam || 200));
    try {
      const match = r => (!system || r.system === system) && (!branch || r.branch === branch);
      const rows = nParam
        ? jaaDB.query('versionium_commits', match, 1e6).sort((a, b) => (b.wall || 0) - (a.wall || 0)).slice(0, n)
        : jaaDB.query('versionium_commits', match, n);
      json(res, 200, { ok: true, system, branch, count: rows.length, commits: rows });
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
