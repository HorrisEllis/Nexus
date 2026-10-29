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
    // 0.60.278 VE4 — "full changes" (§17.12): every release's commits by default; { recent: true } for the last ~30 only. Idempotent:
    // a release already held gets only what it lacked (versionium/lib/releases.js release(), nothing rewritten)
    json(res, 200, await NR.sync(_self, { commits: b.recent ? 'recent' : (b.commits === false ? null : 'all') }));
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
