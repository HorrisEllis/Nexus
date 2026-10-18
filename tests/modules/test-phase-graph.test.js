'use strict';
/**
 * tests/modules/test-phase-graph.test.js — DG2 (0.60.147).
 * James, 2026-10-18: "each phase, has to have a dependany graph before executing."
 *
 *   PG-01  lib/phase-graph.js: a mapped phase has a graph (changes, uses, used-by, systems, waits-on, specs, a stable hash);
 *          one that names and maps to nothing has none, with how to give it one; crossings by the boundary rule, known or new
 *   PG-02  real Nexus phases: IM1's graph is ready and shows the crossing its own module already carries (in the baseline);
 *          the system of a file is the census's own (lib is the kernel, tests and docs are no system)
 *   PG-03  idearium's real router: ▶ build of a phase with no graph → 409 NO_GRAPH with the remedy, no run; `anyway` does not
 *          pass it; a phase with a graph passes the gate (stops at the snapshot here); GET …/phases/graph answers both
 *   PG-04  the command row, and the one build door (plan-panel.js phaseBuildPost) refusing NO_GRAPH without offering "anyway"
 *   PG-05  the Phases tab's graph section in Clear Glass against a stubbed api(); no engine → SKIPPED, said
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
process.env.NEXUS_FAILURE_INTAKE = 'off';

let passed = 0, failed = 0, skipped = 0;
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
phases:
  S0_base:
    status: DONE 0.1.0 — built
    files: [lib/base.js]
  S1_mapped:
    status: OPEN
    depends_on: [S0_base]
    files: [lib/top.js]
  S2_nothing:
    status: OPEN
    does: "make it better somehow"
`;

(async () => {
  const PG = require(path.join(ROOT, 'lib/phase-graph.js'));

  await test('PG-01', 'a graph from the mapping; none without one, with the remedy; crossings by the boundary rule, known or new', async () => {
    const mapped = { source: 'declared', files: [{ path: 'cortex/a.js', why: 'declared', exists: true }, { path: 'lib/new.js', why: 'declared', exists: false }],
      requires: [{ path: 'lib/k.js', by: 'cortex/a.js' }, { path: 'guardian/g.js', by: 'cortex/a.js' }, { path: 'cortex/x.js', by: 'lib/new.js' }],
      consumers: [{ path: 'idearium/u.js', of: 'cortex/a.js' }], specs: ['cortex/spec/cortex.spec'], dependsOnInferred: [{ on: 'S0_base', file: 'cortex/a.js' }] };
    const systemOf = (p) => p.split('/')[0];
    const g = PG.graphFor({ phase: 'S1_mapped', map: 'm.spec', mapped, mapText: MAP, depsGate: { open: [], unknown: [] }, systemOf,
      baselineEdges: new Set(['cortex/a.js -> guardian/g.js']) });
    assert.strictEqual(g.ready, true); assert.deepStrictEqual(g.missing, []);
    assert.deepStrictEqual(g.nodes.filter(n => n.role === 'changes').map(n => n.path), ['cortex/a.js', 'lib/new.js']);
    assert.deepStrictEqual(g.systems.sort(), ['cortex', 'lib']);
    const cx = Object.fromEntries(g.crossings.map(c => [`${c.from}>${c.to}`, c]));
    assert.ok(!cx['cortex/a.js>lib/k.js'], 'a system using the kernel is no crossing');
    assert.deepStrictEqual([cx['cortex/a.js>guardian/g.js'].kind, cx['cortex/a.js>guardian/g.js'].known], ['system', true]);
    assert.deepStrictEqual([cx['lib/new.js>cortex/x.js'].kind, cx['lib/new.js>cortex/x.js'].known], ['upward', false]);
    assert.deepStrictEqual([cx['idearium/u.js>cortex/a.js'].kind, cx['idearium/u.js>cortex/a.js'].known], ['system', false]);
    assert.deepStrictEqual(g.waitsOn.phases.map(p => [p.key, p.status]), [['S0_base', 'closed']]);
    const L = PG.lines(g).join('\n');
    assert.ok(/NEW CROSSING lib → cortex: lib\/new\.js → cortex\/x\.js \(the kernel reaching up; not in the baseline/.test(L), L);
    assert.ok(/crosses cortex → guardian: .*already in the ratchet's baseline/.test(L), L);
    const again = () => PG.graphFor({ phase: 'S1_mapped', map: 'm.spec', mapped, mapText: MAP, depsGate: { open: [], unknown: [] }, systemOf, baselineEdges: new Set(['cortex/a.js -> guardian/g.js']) });
    assert.strictEqual(again().hash, g.hash, 'the same graph, the same hash');
    assert.notStrictEqual(PG.graphFor({ phase: 'S1_mapped', map: 'm.spec', mapped: { ...mapped, files: mapped.files.slice(0, 1) }, mapText: MAP, systemOf }).hash, g.hash, 'a changed graph, a new hash');
    const none = PG.graphFor({ phase: 'S2_nothing', map: 'm.spec', mapped: { source: 'none', files: [], requires: [], consumers: [] }, mapText: MAP });
    assert.strictEqual(none.ready, false); assert.ok(/names no file/.test(none.missing[0])); assert.ok(/files: \[\.\.\.\]|map-phases/.test(none.remedy));
    assert.ok(/NO DEPENDENCY GRAPH/.test(PG.lines(none)[0]));
    assert.strictEqual(PG.graphFor({ phase: 'X' }).ready, false, 'never mapped: no graph');
    const open = PG.graphFor({ phase: 'S1_mapped', mapped, mapText: MAP.replace('[S0_base]', '[S0_base, D0_kinds]'), depsGate: { open: [{ key: 'D0_kinds', kind: 'decision', status: 'OPEN' }], unknown: [] } });
    assert.deepStrictEqual(open.waitsOn.decisions.map(d => [d.key, d.open]), [['D0_kinds', true]]);
  });

  await test('PG-02', "real Nexus: IM1's graph is ready and shows its module's known crossing; the census's own system rule", async () => {
    const AM = require(path.join(ROOT, 'lib/phase-map-auto.js'));
    const mapPath = 'docs/2026-10-17-infrastructure-migration-phasemap.spec';
    const text = fs.readFileSync(path.join(ROOT, mapPath), 'utf8');
    const r = AM.forMaps({ root: ROOT, maps: [{ path: mapPath, text }], specsOf: AM.specsOfNexus(ROOT) });
    const m = r.byKey.get(`${mapPath}::IM1_the_shape_census_as_a_command`);
    const g = PG.graphFor({ phase: 'IM1_the_shape_census_as_a_command', map: mapPath, mapped: m, mapText: text, systemOf: PG.boundarySystemOf(ROOT), baselineEdges: PG.baselineEdges(ROOT) });
    assert.strictEqual(g.ready, true, PG.lines(g).join('\n'));
    assert.ok(g.nodes.some(n => n.role === 'changes' && n.path === 'lib/system-boundary.js'));
    const c = g.crossings.find(x => x.from === 'lib/drawbridge-registry.js' && x.to === 'loom/scanners/capability-map.js');
    assert.ok(c && c.kind === 'upward' && c.known === true, JSON.stringify(g.crossings));
    const so = PG.boundarySystemOf(ROOT);
    assert.deepStrictEqual(['lib/x.js', 'cortex/boot.js', 'tests/modules/a.test.js', 'docs/a.spec', 'diagnostic/tests/x.test.js'].map(so), ['lib', 'cortex', null, null, null]);
  });

  let api = null, u = null;
  await test('PG-03', 'the real router: no graph → 409 NO_GRAPH with the remedy, no run, anyway does not pass it; a graph passes; the route', async () => {
    api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
    const L = api.getRepoLayer();
    let made = null;
    for (let i = 0; i < 20; i++) {
      made = await quiet(async () => L.ingest({ name: `pg-${Date.now()}`, source: 'test', compartmentId: 'c-pg', files: [{ path: 'docs/shop-phasemap.spec', content: MAP }, { path: 'lib/base.js', content: 'module.exports = 1;\n' }] }));
      if (!(made && made.error && /no spec-engine/.test(made.error))) break;
      await new Promise(x => setTimeout(x, 250));
    }
    assert.ok(made && made.repo, JSON.stringify(made).slice(0, 200));
    u = made.repo.uuid;
    const before = (await quiet(() => api._route('GET', `/api/repos/${u}/phases/runs`))).json;
    const r = await quiet(() => api._route('POST', `/api/repos/${u}/phases/build`, { map: 'docs/shop-phasemap.spec', phase: 'S2_nothing' }));
    assert.strictEqual(r.status, 409, JSON.stringify(r.json).slice(0, 300));
    assert.strictEqual(r.json.detail.code, 'NO_GRAPH');
    assert.ok(/no dependency graph/.test(r.json.error) && /map-phases|files:/.test(r.json.error), r.json.error);
    const a = await quiet(() => api._route('POST', `/api/repos/${u}/phases/build`, { map: 'docs/shop-phasemap.spec', phase: 'S2_nothing', anyway: true }));
    assert.strictEqual(a.json.detail && a.json.detail.code, 'NO_GRAPH', 'his "has to have": anyway does not pass it');
    const after = (await quiet(() => api._route('GET', `/api/repos/${u}/phases/runs`))).json;
    assert.strictEqual(JSON.stringify(after.runs || after), JSON.stringify(before.runs || before), 'no run was started');
    const ok = await quiet(() => api._route('POST', `/api/repos/${u}/phases/build`, { map: 'docs/shop-phasemap.spec', phase: 'S1_mapped' }));
    assert.notStrictEqual(ok.json.detail && ok.json.detail.code, 'NO_GRAPH', 'a phase with a graph passes the gate');
    const gr = await quiet(() => api._route('GET', `/api/repos/${u}/phases/graph?phase=S1_mapped&map=docs/shop-phasemap.spec`));
    assert.strictEqual(gr.status, 200); const gd = gr.json.data || gr.json;
    assert.strictEqual(gd.graph.ready, true); assert.ok(gd.graph.nodes.some(n => n.path === 'lib/top.js' && n.role === 'changes'));
    assert.deepStrictEqual(gd.graph.waitsOn.phases.map(p => p.key), ['S0_base']);
    const gn = (await quiet(() => api._route('GET', `/api/repos/${u}/phases/graph?phase=S2_nothing`))).json;
    assert.strictEqual((gn.data || gn).graph.ready, false);
    assert.strictEqual((await quiet(() => api._route('GET', `/api/repos/${u}/phases/graph`))).status, 400);
  });

  await test('PG-04', 'the command row; the one build door refuses NO_GRAPH and never offers "anyway" for it', async () => {
    const { pathToFileURL } = require('url');
    const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = RC.SPEC.find(r => r.key === 'repo.phase-graph');
    assert.deepStrictEqual(row.req({ repo: { uuid: 'u' }, args: ['IM1'], flags: { map: 'docs/x.spec' } }), { method: 'GET', path: '/api/repos/u/phases/graph?phase=IM1&map=docs%2Fx.spec' });
    const pp = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8');
    const door = pp.slice(pp.indexOf('async function phaseBuildPost'), pp.indexOf('async function planBuild'));
    assert.ok(/code === 'NO_GRAPH'\) throw _noGraphHeld\(e\)/.test(door), 'NO_GRAPH is thrown with its reason');
    assert.ok(/function _noGraphHeld\(e\)[^\n]*x\.held = true/.test(pp), 'held, with the missing pieces and the remedy');
    assert.ok(door.indexOf('NO_GRAPH') < door.indexOf('confirm('), 'before any confirm — never offered "anyway"');
  });

  // PG-05 — the Phases tab's graph section in Clear Glass (AXIOMS §4.1)
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - PG-05 SKIPPED: Clear Glass has no engine here — the browser check did not run'); skipped++; }
  else {
    let browser = null;
    try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - PG-05 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; }
    if (browser) {
      const { pathToFileURL } = require('url');
      const mappedReady = { source: 'declared', files: [{ path: 'lib/new.js', why: 'declared', exists: false }], requires: [{ path: 'cortex/x.js', by: 'lib/new.js' }], consumers: [] };
      const ready = PG.graphFor({ phase: 'P1', map: 'm.spec', mapped: mappedReady, mapText: '', systemOf: (p) => p.split('/')[0], baselineEdges: new Set() });
      const none = PG.graphFor({ phase: 'P2', map: 'm.spec', mapped: { source: 'none', files: [], requires: [], consumers: [] }, mapText: '' });
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-ui-'));
      fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="a"></div><div id="b"></div><script>
  const CALLS = []; const CURRENT_API_REPO = { uuid: 'r1' };
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  async function api(p) { CALLS.push(p);
    if (p === '/api/repos/r1/phases/graph?phase=P1&map=m.spec') return { graph: ${JSON.stringify(ready)}, lines: ${JSON.stringify(PG.lines(ready))} };
    if (p === '/api/repos/r1/phases/graph?phase=P2&map=m.spec') return { graph: ${JSON.stringify(none)}, lines: ${JSON.stringify(PG.lines(none))} };
    throw new Error('unexpected ' + p); }
</script><script src="${pathToFileURL(path.join(ROOT, 'idearium/ui/js/phase-graph-view.js')).href}"></script></body></html>`);
      try {
        const page = await browser.newPage();
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
        await test('PG-05', "the Phases tab's graph section in Clear Glass: ready with its new crossing marked; none says it will not be built", async () => {
          await page.evaluate(() => { document.getElementById('a').innerHTML = pgSlot({ map: 'm.spec', phase_key: 'P1' }); document.getElementById('b').innerHTML = pgSlot({ map: 'm.spec', phase_key: 'P2' }); });
          await page.waitForFunction(() => /ready/.test(document.getElementById('a').textContent) && /none/.test(document.getElementById('b').textContent));
          const a = await page.$eval('#a', e => e.textContent.replace(/\s+/g, ' '));
          assert.ok(/dependency graph · ready/.test(a) && /changes \(1\): lib\/new\.js \(new\)/.test(a), a);
          assert.ok(await page.$eval('#a .pg-line.pg-bad', e => /NEW CROSSING lib → cortex/.test(e.textContent)), 'the new crossing is marked');
          const b = await page.$eval('#b', e => e.textContent.replace(/\s+/g, ' '));
          assert.ok(/none — this phase is not built until it has one/.test(b) && /missing: it names no file/.test(b), b);
          assert.deepStrictEqual(errors, []);
        });
      } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
