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

    assert.strictEqual(cos.sovereignty.sovereign, true, '0.60.236: its one way out (cortex/memory/jaa-db.js) is gone: cos is sovereign');
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

  await test('RD-05', "his 2026-10-24 \"Aren't systems\": the eight are folded into their home or parked, never listed, never drafted", () => {
    const SB = require(path.join(ROOT, 'lib/system-boundary.js'));
    assert.deepStrictEqual(Object.keys(SB.FOLDED).sort(), ['auth', 'jaa', 'mesh', 'siso', 'warp'], 'remote-desktop and security archived (0.60.232); erosmancer moved into clear-glass (0.60.233); sentinel archived (0.60.234); warp with the kernel (0.60.236)');
    assert.ok(!fs.existsSync(path.join(ROOT, 'erosmancer')) && fs.existsSync(path.join(ROOT, 'clear-glass/erosmancer-os/src/api/server.ts')), 'ErosmancerOS lives in Clear Glass');
    const sys = SB.systems(ROOT);
    for (const f of Object.keys(SB.FOLDED)) assert.ok(!sys.includes(f), `${f} is not a system`);   // the parts stay in the scan (crossings into hooks/ are real edges); they leave only the sovereignty list
    const scan = SB.scan({ root: ROOT });
    assert.ok(!scan.crossings.some(c => c.from === 'orchestrator/orchestrator.js' && /^auth\//.test(c.to)), 'auth is orchestrator\'s: its use is internal');
    const toSiso = scan.crossings.filter(c => /^siso\//.test(c.to));
    assert.ok(toSiso.length && toSiso.every(c => c.toSystem === 'lib' && c.kind === 'kernel'), 'siso is a primitive: a use of the kernel');
    assert.deepStrictEqual(scan.parkedUses, [], 'nothing uses a parked folder (it would be said here)');
    const sov = SB.sovereignty({ root: ROOT });
    assert.ok(!sov.systems.some(r => SB.PARTS.includes(r.system) || SB.FOLDED[r.system]), 'the sovereignty list holds systems only');
    for (const f of Object.keys(SB.FOLDED)) assert.ok(!fs.existsSync(path.join(ROOT, f, 'registry-components.draft.json')), `${f}: its draft was withdrawn`);
    assert.ok(!RD.missing({ root: ROOT }).some(m => SB.FOLDED[m] || SB.PARTS.includes(m)));
  });

  await test('RD-06', 'his 2026-10-24 "15 systems … all the systems in idearium": only Idearium\'s list is a system; every other folder is unhomed, with its users', () => {
    const SB = require(path.join(ROOT, 'lib/system-boundary.js'));
    const S = require(path.join(ROOT, 'lib/nexus-self/systems.js'));
    const real = SB.realSystems();
    assert.strictEqual(real.length, S.SYSTEMS.length); assert.strictEqual(real.length, 16);   // 0.60.237 EW1 — James, 2026-10-24: "okay warp and emerge." emerge (with warp, its runtime) is the 16th system (docs/2026-10-24-emerge-warp-system-phasemap.spec).
    assert.deepStrictEqual(real.find(x => x.id === 'core').folder, 'lib', 'core is the kernel');
    const sov = SB.sovereignty({ root: ROOT });
    const folders = new Set(real.map(x => x.folder));
    assert.ok(sov.systems.every(r => folders.has(r.system)), 'only Idearium\'s systems are listed');
    // 0.60.237 EW1 — James, 2026-10-24: "okay warp and emerge.": emerge is a system (with warp folded into it), 15 with a folder
    assert.strictEqual(sov.systems.length, 15, 'the 15 with a folder (core is the kernel)');
    const unhomed = sov.notSystems.unhomed.map(u => u.folder);
    for (const f of ['nexus', 'meta', 'cli', 'cockpit']) assert.ok(unhomed.includes(f), `${f} is not a system: unhomed`);
    assert.ok(!unhomed.includes('warp') && !unhomed.includes('emerge') && SB.FOLDED.warp === 'emerge', '0.60.237 EW1: warp is emerge\'s (0.60.236 had it with the kernel)');
    assert.ok(Object.keys(sov.notSystems.unhomed.find(u => u.folder === 'nexus').usedBy).length > 3, 'with who uses it');
    for (const f of ['cli', 'cockpit', 'meta', 'nexus', 'warp']) assert.ok(!fs.existsSync(path.join(ROOT, f, 'registry-components.draft.json')), `${f}: its draft was withdrawn`);
    // 0.60.232 his "Archive.": kept in the archive, gone from the tree, never a system
    for (const f of ['remote-desktop', 'security', 'emergence', 'sentinel']) { assert.ok(!fs.existsSync(path.join(ROOT, f)), `${f} left the tree`); assert.ok(fs.existsSync(path.join(ROOT, '_archive/2026-10-24-not-systems', f)), `${f} is kept in the archive`); assert.ok(!unhomed.includes(f)); }
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
