'use strict';
/**
 * versionium/routes/nexus-releases.js — Nexus's own releases and their changelogs, served by their owner (VS2, 0.60.277)
 *
 * James, 2026-10-29, choosing (a) of two ways to keep §5.15 (docs/2026-10-07-versionium-releases-phasemap.spec): "a" — Versionium owns the
 * changelogs and the release logic that reads them. Every other system asks here; none reads versionium/changelogs or requires versionium/lib.
 *
 *   GET  /api/versionium/nexus/releases              → { releases }        each release read from lib's version lines, the changelogs and git
 *   POST /api/versionium/nexus/releases/sync         { all } → the sync    recorded as Versionium releases (POST /api/versionium/releases)
 *   GET  /api/versionium/nexus/changelog?version=     → { version, name, rel, text }   404 when there is none
 *   GET  /api/versionium/nexus/changes?since=&write=1 → { since, markdown } | the write
 *   GET  /api/versionium/nexus/agreement              → lib's agreement with the changelog line only Versionium can say
 */
const http = require('http');
const config = require('../config.js');
const { json, readBody } = require('../lib/http-utils.js');

/** the sync records through Versionium's own POST /api/versionium/releases, so its events fire exactly as for any caller */
function _self(method, urlPath, body, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: '127.0.0.1', port: config.PORT, path: urlPath, method, timeout,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let b = ''; res.on('data', c => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timed out')));
    if (data) req.write(data); req.end();
  });
}

async function handle(req, res, { method, pathname, url }) {
  if (!pathname.startsWith('/api/versionium/nexus/')) return false;
  const NR = require('../lib/nexus-releases.js');
  if (pathname === '/api/versionium/nexus/releases' && method === 'GET') { json(res, 200, { ok: true, releases: NR.read() }); return true; }
  if (pathname === '/api/versionium/nexus/releases/sync' && method === 'POST') {
    const b = await readBody(req).catch(() => ({})) || {};
    // 0.60.278 VE4 — "full changes" (§17.12): every release's commits. 0.60.285 — but never inside this process: 0.60.278 ran the all-history
    // read here by default and Versionium was silent for 1113 s after boot (James's log, 2026-10-29). Now the default (a boot) records the
    // releases with their newest ~30 releases' commits at once, and the full backfill runs in a child process (syncInWorker), started
    // then in the background — or awaited when the caller asks { all: true } (the Releases page's Sync). Idempotent either way.
    if (b.all) { json(res, 200, await NR.syncInWorker(_self)); return true; }
    const r = await NR.sync(_self, { commits: b.commits === false ? null : 'recent' });
    if (b.commits !== false && !b.noBackfill) NR.syncInWorker(_self).catch(() => {});   // the rest of history, off this process
    json(res, 200, { ...r, backfill: b.commits === false || b.noBackfill ? null : 'started in a child process' });
    return true;
  }
  if (pathname === '/api/versionium/nexus/changelog' && method === 'GET') {
    const C = require('../lib/changelogs.js');
    const version = String(url.searchParams.get('version') || require('../../lib/release-version.js').current().version || '').replace(/^v/, '');
    const c = C.read(undefined, version);
    json(res, c ? 200 : 404, c ? { ok: true, ...c } : { ok: false, error: `no changelog for ${version} in ${C.DIR}` });
    return true;
  }
  if (pathname === '/api/versionium/nexus/changes' && method === 'GET') {
    const N = require('../lib/release-notes.js');
    const since = url.searchParams.get('since') || null;
    json(res, 200, url.searchParams.get('write') === '1' ? N.write({ since }) : { ok: true, since, markdown: N.markdown(NR.read(), { since }) });
    return true;
  }
  if (pathname === '/api/versionium/nexus/agreement' && method === 'GET') { json(res, 200, { ok: true, agreement: NR.agreement() }); return true; }
  return false;
}

module.exports = { handle };
