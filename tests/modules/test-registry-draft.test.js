'use strict';
/**
 * tests/modules/test-registry-draft.test.js — DB16: a registry drafted for every system that has none, from its own source (0.60.229)
 * Map: docs/2026-10-17-system-drawbridge-phasemap.spec DB16_a_registry_for_each_system; docs/2026-10-23-cos-spine-phasemap.spec CS_D7.
 * James, 2026-10-24: "then we need to resume the component registery for each system, get the mall sovereign, then cos phases to
 * migrate." · "1" (registries per system first, COS first)
 *
 *   RD-01  COS's draft, from the tree: its contract's 7 vaultd routes, its event taxonomy pointed at (not copied), the files other
 *          systems reach into (cos/host/index.js by four), its way out by blocker (1 data, 4 primitive)
 *   RD-02  missing(): every system with no registry-components.js, never a folder DB16 reads as part of another system; each has its
 *          draft written as registry-components.draft.json, and the written draft is the one the tree gives now
 *   RD-03  no draft is in force: no system without a registry gained a registry-components.js; loom's loadAll reads no draft
 *   RD-05  0.60.230 his "Aren't systems": auth, erosmancer, jaa, mesh, remote-desktop, security, sentinel, siso folded or parked; the
 *          parts (contracts, hooks, ui …) not listed; no draft for any of them
 *   RD-06  0.60.231 his "15 systems … all the systems in idearium": only lib/nexus-self/systems.js's list is a system; every other
 *          folder is unhomed, with who uses it
 *   RD-04  the real API: the list lowest friction first; one draft says written / not accepted; the command rows reach both
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const RD = require(path.join(ROOT, 'lib/registry-draft.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = e; } };

(async () => {
  console.log('\n  test-registry-draft — DB16 a registry for each system\n');
  const cos = RD.draft('cos', { root: ROOT });

  await test('RD-01', "COS's draft from the tree: contract routes, taxonomy pointed at, files reached into, its way out", () => {
    const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'cos/interaction-contract.json'), 'utf8'));
    assert.strictEqual(cos.components.length, contract.routes.length);
    assert.ok(cos.components.every(c => /served by cos\/vaultd\/server\.js/.test(c.from)));
    assert.ok(cos.components.some(c => c.route.method === 'GET' && c.route.path === '/secrets/:compartmentName/:key'));
    assert.strictEqual(cos.events.taxonomy, 'cos/event-taxonomy.js');
    assert.strictEqual(cos.events.declared, Object.keys(require(path.join(ROOT, 'cos/event-taxonomy.js'))).length, 'counted, not copied');
    const host = cos.reached_into.find(r => r.file === 'cos/host/index.js');
    assert.ok(host && host.by.length >= 3, JSON.stringify(host));

    // 0.60.255 on main: cos loads nothing of another system (out 0), and is sovereign only both ways (0.60.244 SV0, his CS_D7): others still reach in
    assert.strictEqual(cos.sovereignty.out, 0, 'cos reaches into no other system');
    assert.strictEqual(cos.sovereignty.sovereign, cos.sovereignty.in === 0, 'sovereign both ways, as the census reads it');
    assert.strictEqual(cos.draft, true);
  });

  await test('RD-02', 'missing(): every system with no registry, none of the shared folders; each draft written, as the tree gives it now', () => {
    const m = RD.missing({ root: ROOT });
    assert.deepStrictEqual(m.sort(), ['components', 'cos', 'orchestrator'], 'of Idearium\'s systems, these have no registry');
    for (const s of ['idearium', 'cortex', 'versionium']) assert.ok(!m.includes(s), `${s} has a registry`);
    for (const s of RD.NOT_SYSTEMS) assert.ok(!m.includes(s), `${s} is not a system`);
    for (const s of m) {
      const f = path.join(ROOT, s, 'registry-components.draft.json');
      assert.ok(fs.existsSync(f), `${s} has its draft`);
      const w = JSON.parse(fs.readFileSync(f, 'utf8')), now = RD.draft(s, { root: ROOT });
      assert.deepStrictEqual([w.components.length, w.reached_into.length, w.events.handles.length], [now.components.length, now.reached_into.length, now.events.handles.length], `${s}: the written draft is the tree's (regenerate: node lib/registry-draft.js --missing --write)`);
    }
  });

  await test('RD-03', 'no draft is in force: none named registry-components.js; loom reads none of them', () => {
    for (const s of RD.missing({ root: ROOT })) assert.ok(!fs.existsSync(path.join(ROOT, s, 'registry-components.js')));
    const CM = require(path.join(ROOT, 'loom/scanners/capability-map.js'));
    const all = CM.loadAll(); const decls = Array.isArray(all) ? all : (all.components || all.declarations || []);
    assert.ok(!decls.some(d => /registry-components\.draft/.test(String(d._sourceFile || ''))), 'loom read a draft');
  });

  { const l = console.log; console.log = (...a) => { if (!/^\[[\w./-]+\]/.test(String(a[0]))) l(...a); }; }
  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  await test('RD-04', 'the real API: the list lowest friction first; one draft says written and not accepted; the command rows', async () => {
    const l = await quiet(() => api._route('GET', '/api/system/registry-drafts'));
    assert.strictEqual(l.status, 200, JSON.stringify(l.json).slice(0, 200));
    const outs = l.json.systems.map(s => s.out); assert.deepStrictEqual(outs, [...outs].sort((a, b) => a - b), 'fewest ways out first');
    assert.ok(l.json.systems.every(s => s.written));
    const d = (await quiet(() => api._route('GET', '/api/system/registry/cos/draft'))).json;
    assert.deepStrictEqual([d.systemId, d.written, d.accepted], ['cos', true, false]);
    assert.strictEqual((await quiet(() => api._route('GET', '/api/system/registry/nope/draft'))).status, 404);
    const g = (await quiet(() => api._route('GET', '/api/system/registry'))).json;
    assert.ok(g.systems && g.systems[0].declared && Array.isArray(g.edges), 'GET /api/system/registry is still the dependency graph (0.60.229 made it fall through into the drafts)');
    const C = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const rows = (Array.isArray(C) ? C : C.SPEC || Object.values(C).find(Array.isArray));
    const r = rows.find(x => x.key === 'system.drafts');
    assert.deepStrictEqual(r.req({ args: [], flags: {} }), { method: 'GET', path: '/api/system/registry-drafts' });
    assert.deepStrictEqual(r.req({ args: ['cos'], flags: {} }), { method: 'GET', path: '/api/system/registry/cos/draft' });
  });

  // RD-05 / RD-06 were written on brave-cori, whose folds left non-system folders at the top level (FOLDED, realSystems()). On main RF2
  // moved every such folder inside one of the systems (lib/, cos/ …), so FOLDED is empty and the census lists folders. Rewritten for that
  // tree, 0.60.255; the brave-cori versions are kept in _archive/2026-10-26-brave-cori-records/not-ported/ (§0.3).
  await test('RD-05', "his 2026-10-24 \"Aren't systems\": none of them is a top-level folder, none is listed, none is drafted", () => {
    const SB = require(path.join(ROOT, 'lib/system-boundary.js'));
    const sys = SB.systems(ROOT);
    for (const f of ['auth', 'erosmancer', 'jaa', 'mesh', 'remote-desktop', 'security', 'sentinel', 'siso', 'emergence', 'warp', 'nexus', 'cli', 'cockpit', 'meta']) {
      assert.ok(!sys.includes(f), `${f} is not a system`);
      assert.ok(!fs.existsSync(path.join(ROOT, f, 'registry-components.draft.json')), `${f} has no draft`);
    }
    assert.ok(fs.existsSync(path.join(ROOT, 'clear-glass/erosmancer/erosmancer-os/src/api/server.ts')), 'ErosmancerOS lives in Clear Glass');
    for (const m of RD.missing({ root: ROOT })) assert.ok(!RD.NOT_SYSTEMS.has(m), `${m} is drafted though not a system`);
  });

  await test('RD-06', 'his 2026-10-24 "15 systems … all the systems in idearium": every system the census lists is on Idearium\'s list', () => {
    const SB = require(path.join(ROOT, 'lib/system-boundary.js'));
    const S = require(path.join(ROOT, 'lib/nexus-self/systems.js'));
    const names = new Set(S.SYSTEMS.flatMap(x => [x.name, ...(x.dirs || [])]));
    const sov = SB.sovereignty({ root: ROOT });
    assert.ok(sov.systems.length >= 14, `${sov.systems.length} systems`);
    assert.deepStrictEqual(sov.systems.map(r => r.system).filter(x => !names.has(x)), [], 'only Idearium\'s systems are listed');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
