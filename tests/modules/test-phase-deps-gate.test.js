'use strict';
/**
 * tests/modules/test-phase-deps-gate.test.js — DG1 (0.60.125).
 * James (2026-10-17), asked whether a phase build should be refused while its depends_on are still open, chose
 * "Refuse, say why (Recommended)". Why: PC1_the_point_first was built twelve times by five agents while the three
 * decisions it depends on (his) were open.
 *
 *   DG-01  lib/phase-deps-gate.js: an OPEN decision and an unfinished phase are open; a decided one, a complete phase
 *          (by the manager's status or the map's DONE) are not; a name found nowhere is said, not blocking; a map that is
 *          not YAML refuses nothing and says why; the real PC1 waits on PC0b and PC0c
 *   DG-02  through idearium's real router: ▶ build of a phase with an open decision → 409 DEPS_OPEN, its question in the
 *          refusal, no run started; anyway: true passes the gate (it then stops at the snapshot here: no Versionium)
 *   DG-03  the door every ▶ build uses (plan-panel.js phaseBuildPost) and the command's --anyway
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, er = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = er; } };

const MAP = `name: shop
decisions:
  D0_kinds:
    asked: "which kinds first?"
    status: OPEN
  D1_store:
    asked: "files or a db?"
    chosen: files
    status: DECIDED
phases:
  S0_base:
    status: DONE 0.1.0 — built
    files: [lib/base.js]
  S1_mid:
    status: OPEN
    files: [lib/mid.js]
  S2_top:
    status: OPEN
    depends_on: [D0_kinds, D1_store, S0_base, S1_mid, ZZ_nowhere]
    files: [lib/top.js]
  S3_free:
    status: OPEN
    depends_on: [D1_store, S0_base]
    files: [lib/free.js]
`;

(async () => {
  const G = require(path.join(ROOT, 'lib/phase-deps-gate.js'));

  await test('DG-01', 'open decisions and unfinished phases are open; decided, done and unknown are not blocking', async () => {
    const g = G.openDeps({ phase: 'S2_top', mapText: MAP, phases: [] });
    assert.strictEqual(g.checked, true);
    assert.deepStrictEqual(g.open.map(o => [o.key, o.kind]), [['D0_kinds', 'decision'], ['S1_mid', 'phase']]);
    assert.strictEqual(g.open[0].asked, 'which kinds first?');
    assert.deepStrictEqual(g.unknown, ['ZZ_nowhere']);
    const g2 = G.openDeps({ phase: 'S2_top', mapText: MAP, phases: [{ phase_key: 'S1_mid', status: 'complete' }] });
    assert.deepStrictEqual(g2.open.map(o => o.key), ['D0_kinds'], 'the manager\'s complete counts');
    assert.deepStrictEqual(G.openDeps({ phase: 'S3_free', mapText: MAP }).open, []);
    const bad = G.openDeps({ phase: 'S2_top', mapText: 'phases: [unclosed' });
    assert.deepStrictEqual([bad.checked, bad.open.length], [false, 0]); assert.ok(bad.why);
    assert.ok(/S2_top waits on D0_kinds \(a decision still OPEN: "which kinds first\?"\); S1_mid \(OPEN\)/.test(G.line(g, 'S2_top')), G.line(g, 'S2_top'));
    const real = G.openDeps({ phase: 'PC1_the_point_first', mapText: fs.readFileSync(path.join(ROOT, 'docs/2026-10-17-pieces-not-order-phasemap.spec'), 'utf8') });
    assert.deepStrictEqual(real.open.map(o => o.key), ['PC0b_first_kinds', 'PC0c_who_cuts'], 'the phase that cost twelve attempts');
  });

  await test('DG-02', 'the real router: 409 DEPS_OPEN with the question, no run; anyway passes the gate', async () => {
    const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
    const L = api.getRepoLayer();
    let made = null;
    for (let i = 0; i < 20; i++) {
      made = await quiet(async () => L.ingest({ name: `dg-${Date.now()}`, source: 'test', compartmentId: 'c-dg', files: [{ path: 'docs/shop-phasemap.spec', content: MAP }, { path: 'lib/base.js', content: 'module.exports = 1;\n' }] }));
      if (!(made && made.error && /no spec-engine/.test(made.error))) break;
      await new Promise(x => setTimeout(x, 250));
    }
    assert.ok(made && made.repo, JSON.stringify(made).slice(0, 200));
    const u = made.repo.uuid;
    const r = await quiet(() => api._route('POST', `/api/repos/${u}/phases/build`, { map: 'docs/shop-phasemap.spec', phase: 'S2_top' }));
    assert.strictEqual(r.status, 409, JSON.stringify(r.json).slice(0, 300));
    assert.strictEqual(r.json.detail.code, 'DEPS_OPEN');
    assert.deepStrictEqual(r.json.detail.open.map(o => o.key), ['D0_kinds', 'S1_mid']);
    assert.ok(/which kinds first\?/.test(r.json.error), r.json.error);
    const a = await quiet(() => api._route('POST', `/api/repos/${u}/phases/build`, { map: 'docs/shop-phasemap.spec', phase: 'S2_top', anyway: true }));
    assert.notStrictEqual(a.json.detail && a.json.detail.code, 'DEPS_OPEN', 'anyway: past the gate');
    const f = await quiet(() => api._route('POST', `/api/repos/${u}/phases/build`, { map: 'docs/shop-phasemap.spec', phase: 'S3_free' }));
    assert.notStrictEqual(f.json.detail && f.json.detail.code, 'DEPS_OPEN', 'nothing open: not refused by the gate');
  });

  await test('DG-03', 'one door for every ▶ build, and the command\'s --anyway', async () => {
    const pp = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8');
    const ph = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/phases.js'), 'utf8');
    assert.ok(/async function phaseBuildPost[\s\S]{0,400}DEPS_OPEN[\s\S]{0,700}confirm\([\s\S]{0,400}anyway: true/.test(pp));
    assert.strictEqual((ph.match(/phaseBuildPost\(/g) || []).length, 2, 'the Phases tab\'s card and detail pane');
    assert.ok(!/api\(`\/api\/repos\/\$\{uuid\}\/phases\/build`/.test(ph), 'no build bypasses the door');
    const { pathToFileURL } = require('url');
    const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = RC.SPEC.find(r => r.key === 'repo.phase');
    const req = row.req({ repo: { uuid: 'u' }, args: ['S2_top', 'build'], flags: { anyway: true } });
    assert.strictEqual(req.body.anyway, true);
    assert.ok(/--anyway/.test(row.usage));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
