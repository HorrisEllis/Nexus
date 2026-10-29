'use strict';
/**
 * tests/modules/test-versionium-owns-releases.test.js — Versionium owns the changelogs and the release logic that reads them (VS1–VS4, 0.60.277)
 * James, 2026-10-29, choosing between "(a) the release logic moves into Versionium" and "(b) the files go back to a place Nexus's root owns":
 * "a" — keeping §5.15 (docs/AXIOMS-v3.1.md): one owner per kind of data, the others through its contract, one outage breaks no other.
 *
 *   VO-01  Versionium serves them: releases, a changelog (404 when there is none), the changes since a release, the agreement with its changelog line
 *   VO-02  each route is declared in Versionium's contract (registry-components.js) and its mirror (interaction-contract.json)
 *   VO-03  no other system requires the moved code, nothing names lib/changelogs|nexus-releases|release-notes, and the drawbridge ratchet adds nothing
 *   VO-04  an outage is said, not spread: Idearium's release routes answer "Versionium is down", and its version route falls back to lib's places
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }
const get = (port, p) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p }, (r) => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: JSON.parse(b || '{}') })); }).on('error', rej));

(async () => {
  console.log('\n⬡  Versionium owns the releases and their changelogs\n');
  const V = require(path.join(ROOT, 'lib/version.js')).system;
  const route = require(path.join(ROOT, 'versionium/routes/nexus-releases.js'));
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try { if (await route.handle(req, res, { method: req.method, url, pathname: url.pathname })) return; } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ ok: false, error: e.message })); }
    res.writeHead(404); res.end('{}');
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  try {
    await test('VO-01', 'served by Versionium: releases, a changelog (404 when none), the changes, the agreement with its changelog line', async () => {
      const cl = await get(port, `/api/versionium/nexus/changelog?version=${V}`);
      assert.deepStrictEqual([cl.status, cl.body.rel], [200, `versionium/changelogs/CHANGELOG-${V}.md`]);
      assert.ok(/^# /.test(cl.body.text));
      assert.strictEqual((await get(port, '/api/versionium/nexus/changelog?version=0.0.1')).status, 404);
      const rel = await get(port, '/api/versionium/nexus/releases');
      assert.ok(rel.body.releases.length > 400 && rel.body.releases.some(r => r.version === V && r.changelogPath === `versionium/changelogs/CHANGELOG-${V}.md`));
      const ag = await get(port, '/api/versionium/nexus/agreement');
      const places = ag.body.agreement.places.map(p => p.place);
      assert.ok(places.includes('lib/version.js system') && places.includes(`versionium/changelogs/CHANGELOG-${V}.md`), places.join(' | '));
      const ch = await get(port, '/api/versionium/nexus/changes?since=0.60.270');
      assert.ok(typeof ch.body.markdown === 'string' && /0\.60\.27/.test(ch.body.markdown));
      assert.strictEqual((await get(port, '/api/versionium/other')).status, 404, 'not its route: passed on');
    });
  } finally { srv.close(); }

  await test('VO-02', 'every route declared in its contract and its mirror', async () => {
    const reg = require(path.join(ROOT, 'versionium/registry-components.js'));
    const comps = reg.components || reg;
    const mirror = JSON.parse(fs.readFileSync(path.join(ROOT, 'versionium/interaction-contract.json'), 'utf8')).routes.map(r => `${r.method} ${r.path}`);
    for (const r of ['GET /api/versionium/nexus/releases', 'POST /api/versionium/nexus/releases/sync', 'GET /api/versionium/nexus/changelog', 'GET /api/versionium/nexus/changes', 'GET /api/versionium/nexus/agreement']) {
      assert.ok(comps.some(c => `${c.route.method} ${c.route.path}` === r), `${r} not in registry-components`);
      assert.ok(mirror.includes(r), `${r} not in interaction-contract.json`);
    }
    assert.ok(/require\('\.\/routes\/nexus-releases\.js'\)/.test(fs.readFileSync(path.join(ROOT, 'versionium/server.js'), 'utf8')), 'the server serves it');
  });

  await test('VO-03', 'no other system requires the moved code; nothing names the old lib paths; the ratchet adds nothing', async () => {
    for (const f of ['lib/changelogs.js', 'lib/nexus-releases.js', 'lib/release-notes.js']) assert.ok(!fs.existsSync(path.join(ROOT, f)), `${f} is gone from lib (moved, history kept)`);
    const B = require(path.join(ROOT, 'lib/system-boundary.js'));
    const into = B.scan({ root: ROOT }).crossings.filter(c => /^versionium\/lib\/(changelogs|nexus-releases|release-notes)\.js$/.test(c.to));
    assert.deepStrictEqual(into, [], 'no system requires Versionium\'s release code');
    const r = B.check({ root: ROOT, baseline: JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/contracts/drawbridge-baseline.json'), 'utf8')) });
    assert.ok(r.ok && r.added.length === 0, JSON.stringify(r.added));
    const stale = [];
    for (const f of ['idearium/api/index.js', 'lib/nexus-update.js', 'lib/phase-census.js', 'lib/spec-census.js', 'scripts/release-zip.js', 'cos/app/store.js', 'lib/checks/ck-253-versions.js'])
      if (/require\([^)]*lib\/(changelogs|nexus-releases|release-notes)\.js/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')) && !/versionium\/lib\//.test(f)) stale.push(f);
    assert.deepStrictEqual(stale.filter(f => !/scripts\//.test(f)), []);
  });

  await test('VO-04', 'an outage is said, not spread: Idearium\'s release routes say "Versionium is down"; its version route falls back', async () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const block = (name) => api.slice(api.indexOf(`case '${name}'`), api.indexOf(`case '${name}'`) + 1400);
    for (const n of ['releases.changelog', 'releases.changes']) {
      assert.ok(/_versionium\('GET', `\/api\/versionium\/nexus\//.test(block(n)), `${n} asks Versionium`);
      assert.ok(/Versionium is down or refused/.test(block(n)), `${n} says an outage`);
    }
    const ver = block('system.version');
    assert.ok(/\/api\/versionium\/nexus\/agreement/.test(ver) && /not checked: Versionium is down/.test(ver) && /R\.agreement\(\)/.test(ver), 'the version route falls back to lib\'s places');
    assert.ok(/_vcall\('POST', '\/api\/versionium\/nexus\/releases\/sync'/.test(api), 'the boot sync asks Versionium');
    // lib's own agreement stands without Versionium: CK-253 runs with Versionium not running at all
    assert.ok(require(path.join(ROOT, 'lib/check-catalogue.js')).run('CK-253').ok);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
