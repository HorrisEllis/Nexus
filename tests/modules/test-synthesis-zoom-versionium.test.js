'use strict';
// tests/modules/test-synthesis-zoom-versionium.test.js — 0.39.300, docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec.
// James: "make sure its enterprise grade, beautiful. need increments of zoom. like each system is a node, which zooming in
// has the components as nodes. also can you debug versionium. i need this all to be able to code what i need, expand it
// and make sure it all interconnects. find spec workshop. synthesize as much gaps as possible, and fill the highest amount
// of leverage first. and then we need to add that to the intelligence system. like synthesis needs to be expanded, immensly"
//
//   SZ-01  VX1 — versionium down: idearium's snapshot routes answer a stated 502 (were an unhandled 500), a missing
//          commit with versionium up is a 404; versionium says an outage once and a taken port in a sentence (exit 1)
//   SZ-02  WS3 — the pipeline together: Create ▾ lists Void → Workshop → Architect; Build ▾ has no retired Spec Builder;
//          the pipeline's Architect opens with no repo; every station reaches the Void
//   SZ-03  AZ1 — the increments: systems by level (a cycle shares one), each system's components inside its box, the
//          wires between systems summed; the canvas exposes step / goLevel / openGroup; the repo tab groups by system
//   SZ-04  SY1 — the operators on a fixture: chain (what each gap unblocks, dangling deps), cluster (the same gap said
//          twice is one, both sources kept), leverage explained, an unreadable map weighed by what it hides, the fill order
//   SZ-05  SY1 — the sources on a fixture tree: YAML maps, a map that is not YAML (read by structure, comment statuses),
//          stated gaps, the known-gap register, code markers, loom; runs kept, history, ingest
//   SZ-06  SY2 — the routes through intelligence's real route table; the registry and command index declare them;
//          the Architect pushes its gaps on save
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '../..');
const yaml = require('js-yaml');
let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

async function main() {
  await test('SZ-01', 'versionium down is said, never a crash; versionium says an outage once and a taken port plainly', async () => {
    process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
    const api = await import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href);
    for (const [m, p] of [['GET', '/api/snapshots'], ['GET', '/api/snapshots/nope'], ['POST', '/api/snapshots'], ['GET', '/api/snapshots/a/diff/b'], ['POST', '/api/snapshots/nope/restore']]) {
      const r = await api._route(m, p, {});
      assert.strictEqual(r.status, 502, `${m} ${p} → ${r.status} ${JSON.stringify(r.json)}`);
      assert.match(r.json.error, /versionium unreachable/);
    }
    const idx = read('idearium/index.js');
    assert.match(idx, /const vx = \{\s*get: \(p, o\) => nx\.get\('versionium', p, o\)\.catch\(_vxErr\)/, 'one adapter turns the throw into { error }');
    assert.ok(!/nx\.(get|post)\('versionium',\s*`/.test(idx.replace(/const vx = \{[\s\S]*?\};/, '')), 'every snapshot call goes through it');
    const srv = read('versionium/server.js');
    assert.match(srv, /if \(!fieldDownSince\)/); assert.match(srv, /is back after/);
    // a taken port: a sentence and exit 1
    const net = require('net');
    const blocker = net.createServer().listen(0); await new Promise(r => blocker.once('listening', r));
    const port = blocker.address().port;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-'));
    const run = spawnSync(process.execPath, [path.join(ROOT, 'versionium/server.js')], { env: { ...process.env, VERSIONIUM_PORT: String(port), VERSIONIUM_DATA_DIR: tmp, JAA_DATA_DIR: tmp }, timeout: 15000, encoding: 'utf8' });
    blocker.close();
    assert.strictEqual(run.status, 1, `exit ${run.status} ${run.stderr}`);
    assert.match(run.stderr, new RegExp(`port ${port} is already in use`)); assert.ok(!/at Server\.setupListenHandle/.test(run.stderr), 'no raw stack');
  });

  await test('SZ-02', 'the pipeline together: Void → Workshop → Architect, the old builder retired, the Architect without a repo', () => {
    const idx = read('idearium/ui/index.html'), app = read('idearium/ui/js/app.js');
    const create = idx.slice(idx.indexOf('data-group="create"'), idx.indexOf('data-group="build"'));
    const order = ['openVoid()', 'openWorkshop()', 'openArchitect()'].map(x => create.indexOf(x));
    assert.ok(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2], `Create ▾ in pipeline order ${order}`);
    const b0 = idx.indexOf('data-group="build"'), build = idx.slice(b0, idx.indexOf('class="tab-spacer"', b0));
    assert.ok(!/setView\('spec-wizard'\)/.test(build), 'the retired Spec Builder left Build ▾'); assert.match(build, /openWorkshop\(\)/);
    assert.ok(!/setView\('spec-wizard'\)/.test(idx), 'no surface opens the retired builder');
    assert.match(app, /const nestViews = \['brainstorm', 'ideas', 'eravos', 'spec-wizard'\]/, 'the Architect is not a repo\'s view');
    assert.match(app, /function openArchitect\(from = null\)/);
    for (const f of ['idearium/ui/architect.html', 'idearium/ui/workshop.html']) assert.match(read(f), /location\.href = 'void\.html'/, `${f} reaches the Void`);
  });

  await test('SZ-03', 'the increments: systems by level, components inside, wires summed', () => {
    require(path.join(ROOT, 'idearium/ui/js/arch-canvas.js'));
    const C = globalThis.ArchCanvas;
    const L0 = C.groupLevels(['a', 'b', 'c', 'd'], [{ from: 'c', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'b' }, { from: 'd', to: 'c' }]);
    assert.strictEqual(L0.level.a, L0.level.b, 'a cycle shares one level'); assert.ok(L0.level.c > L0.level.b && L0.level.d > L0.level.c);
    assert.deepStrictEqual(L0.cycles.map(c => c.sort()), [['a', 'b']]);
    const nodes = [['lib/a.js', 'lib', 'foundation'], ['lib/b.js', 'lib', 'library'], ['cos/x.js', 'cos', 'library'], ['cos/y.js', 'cos', 'cli'], ['ui/p.js', 'ui', 'ui']]
      .map(([id, group, band]) => ({ id, group, band }));
    const edges = [{ from: 'cos/x.js', to: 'lib/a.js' }, { from: 'cos/y.js', to: 'lib/b.js' }, { from: 'ui/p.js', to: 'cos/y.js' }, { from: 'lib/b.js', to: 'lib/a.js' }];
    const bands = ['foundation', 'library', 'cli', 'ui'].map(k => ({ key: k }));
    const G = C.layoutGrouped(nodes, edges, [{ key: 'lib' }, { key: 'cos' }, { key: 'ui' }], bands);
    const box = (k) => G.boxes.find(b => b.key === k);
    assert.ok(box('lib').y > box('cos').y && box('cos').y > box('ui').y, 'systems bottom-up: what is needed sits lower');
    for (const n of nodes) { const b = box(n.group), p = G.pos[n.id]; assert.ok(p.x >= b.x && p.y >= b.y && p.x < b.x + b.w && p.y < b.y + b.h, `${n.id} inside ${n.group}`); }
    assert.deepStrictEqual(G.gEdges.find(e => e.from === 'cos' && e.to === 'lib'), { from: 'cos', to: 'lib', count: 2 }, 'the wires between systems summed');
    assert.ok(!G.gEdges.find(e => e.from === 'lib' && e.to === 'lib'), 'a system\'s own wires stay inside it');
    const src = read('idearium/ui/js/arch-canvas.js');
    for (const k of ['step, goLevel, openGroup', "label: 'SYSTEMS'", "label: 'COMPONENTS'", "label: 'DETAIL'", "if (e.key === '1') return goLevel('systems')"]) assert.ok(src.includes(k), k);
    const app = read('idearium/ui/js/app.js');
    assert.match(app, /function _archSystemOf\(files\)/); assert.match(app, /ARCHREG\.canvas\.setGraph\(\{ nodes, edges: uniq, bands, groups \}/);
    assert.match(app, /data-ralvl="systems"/); assert.match(read('idearium/ui/css/arch-canvas.css'), /\.ac\.ac-lvl-systems \.ac-node \{ display: none; \}/);
  });

  const SE = require(path.join(ROOT, 'intelligence/synthesis/engine.js'));
  const SS = require(path.join(ROOT, 'intelligence/synthesis/sources.js'));

  await test('SZ-04', 'the operators: chain, cluster, leverage explained, unreadable maps weighed, the fill order', () => {
    const maps = [{ file: 'docs/m1.spec', keys: [{ key: 'A1_base', status: 'open' }, { key: 'B1', status: 'open' }, { key: 'C1', status: 'open' }, { key: 'D1', status: 'open' }, { key: 'Z9_done', status: 'done' }] }];
    const ph = (key, deps, extra = {}) => ({ id: `phase:m1#${key}`, source: 'phasemap', kind: 'phase', title: key, detail: extra.detail || `build ${key}`, refs: ['docs/m1.spec', ...(extra.refs || [])], dependsOn: deps, meta: { map: 'docs/m1.spec', key, layer: extra.layer || 'engine' } });
    const raw = [ph('A1_base', []), ph('B1', ['A1']), ph('C1', ['B1', 'Z9_done']), ph('D1', ['A1_base', 'Q7_ghost']),
      { id: 'known:tests/x.test.js', source: 'known-gaps', kind: 'known-unbuilt', title: 'x.test.js — unbuilt', detail: 'the ledger writer never flushes the ring buffer', refs: ['tests/x.test.js'], dependsOn: [], meta: {} },
      { id: 'marker:lib/ledger.js:9', source: 'code', kind: 'marker', title: 'lib/ledger.js:9', detail: 'the ledger writer never flushes the ring buffer', refs: ['tests/x.test.js', 'lib/ledger.js'], dependsOn: [], meta: {} },
      { id: 'unreadable:docs/m2.spec', source: 'phasemap', kind: 'unreadable-map', title: 'm2 is not valid YAML', detail: 'bad indentation', refs: ['docs/m2.spec'], dependsOn: [], meta: { hides: 12 } }];
    const ch = SE.chain(raw.map(SE.normalise), maps);
    assert.deepStrictEqual([...ch.unblocks.get('phase:m1#A1_base')].sort(), ['phase:m1#B1', 'phase:m1#C1', 'phase:m1#D1'], 'A unblocks B, C (through B) and D');
    assert.strictEqual(ch.dangling.length, 1); assert.match(ch.dangling[0].title, /Q7_ghost/);
    const out = SE.synthesize({ raw, maps, usedBy: { 'lib/ledger.js': 40 }, now: 1, top: 10 });
    const g = (id) => out.gaps.find(x => x.id === id || x.members.some(m => m.id === id));
    assert.ok(g('phase:m1#A1_base').rank < g('phase:m1#C1').rank, 'what unblocks most ranks above what it unblocks');
    assert.strictEqual(g('phase:m1#A1_base').parts.unblocks, 6, 'the score is explained: 3 × log2(1 + 3)');
    const led = g('known:tests/x.test.js');
    assert.strictEqual(led, g('marker:lib/ledger.js:9'), 'the same gap said in the register and the code is one'); assert.deepStrictEqual(led.sources.sort(), ['code', 'known-gaps']);
    assert.ok(led.parts.corroboration > 0 && led.parts.centrality > 0, 'two sources and a wired-in file weigh in');
    assert.ok(g('unreadable:docs/m2.spec').parts.hides > 0, 'an unreadable map is weighed by what it hides');
    assert.ok(g('dangling:phase:m1#D1>Q7_ghost'), 'a dependency on nothing is a gap');
    assert.ok(out.fill.length && out.fill.every((f, i, a) => i === 0 || a[i - 1].density >= f.density), 'the fill order: leverage per unit of work');
    assert.strictEqual(out.fill[0].id, 'unreadable:docs/m2.spec', 'a small fix that unhides much comes first');
    assert.ok(out.plan.find(p => p.id === 'phase:m1#C1').first.some(b => b.id === 'phase:m1#B1'), 'the plan names what to do first');
    assert.ok(out.themes.length && out.stats.synthesized < out.stats.normalised);
  });

  await test('SZ-05', 'the sources on a fixture tree; runs kept; history; ingest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'syn-root-')), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syn-data-'));
    const w = (p, t) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), t); };
    w('docs/2026-01-01-good-phasemap.spec', 'spec:\n  meta:\n    name: good\n    owner: cos · lib\n  phases:\n    G1_base:\n      status: OPEN\n      files: [cos/a.js]\n      does: build the base\n    G2_next:\n      status: OPEN — waits\n      depends_on: [G1]\n    G3_done:\n      status: DONE (0.1)\n  honest_gaps:\n    - "the base has no test"\n');
    w('docs/2026-01-02-broken-phasemap.spec', 'spec:\n  meta:\n    name: broken\n    status: PHASEMAP. James: "a colon: inside" breaks yaml\n  phases:\n    B1_first:   # ← DONE 2026-01-02\n      goal: done already\n    B2_second:\n      status: OPEN\n      depends_on: [B1_first]\n      goal: the second step\n  missing:\n    - M1 a manifest before chunks\n');
    w('tests/known-gaps.yaml', 'type: gap_register\ngaps:\n- file: tests/modules/a.test.js\n  failing: 1\n  kind: regression\n  reason: the rebuild dropped the button\n');
    w('lib/thing.js', '// §KNOWN GAP — nothing retries a dropped write\nmodule.exports = 1;\n');
    w('loom/data/registry.json', JSON.stringify({ component: { a: { id: 'nexus.cos.a', name: 'cos/a.js' }, b: { id: 'nexus.lib.thing', name: 'lib/thing.js' }, c: { id: 'nexus.cos.q', name: 'cos/q.js' }, d: { id: 'nexus.cos.r', name: 'cos/r.js' }, e: { id: 'nexus.cos.s', name: 'cos/s.js' } },
      hook: { h1: { id: 'h1', component_id: 'nexus.cos.a' }, h2: { id: 'h2', component_id: 'nexus.lib.thing' } }, wire: { w1: { from_hook_id: 'h2', to_hook_id: 'h1' } } }));
    const pm = SS.phasemaps({ root, yaml });
    const broken = pm.maps.find(m => /broken/.test(m.file));
    assert.strictEqual(broken.how, 'structure'); assert.ok(broken.parseError);
    assert.deepStrictEqual(broken.keys.map(k => `${k.key}:${k.status}`), ['B1_first:done', 'B2_second:open'], 'a comment status is read');
    assert.ok(pm.gaps.find(g => g.id === 'unreadable:docs/2026-01-02-broken-phasemap.spec' && g.meta.hides === 2), 'the unreadable map, and what it hides');
    assert.ok(pm.gaps.find(g => g.kind === 'stated' && /manifest before chunks/.test(g.detail)), 'a stated gap read by structure');
    assert.ok(pm.gaps.find(g => g.kind === 'stated' && /no test/.test(g.detail)), 'a stated gap read from YAML');
    assert.strictEqual(pm.maps.find(m => /good/.test(m.file)).owner, 'cos');
    const S = require(path.join(ROOT, 'intelligence/synthesis/index.js'));
    const r = S.run({ root, dir, yaml, now: 1000 });
    assert.ok(fs.existsSync(path.join(dir, 'run-1000.json')) && fs.existsSync(path.join(dir, 'latest.json')), 'the run is kept');
    assert.ok(r.stats.bySource['known-gaps'] === 1 && r.stats.bySource.code === 1 && r.stats.bySource.loom === 1, JSON.stringify(r.stats.bySource));
    assert.ok(r.gaps.find(g => g.id === 'phase:2026-01-01-good-phasemap#G1_base').unblocks.includes('phase:2026-01-01-good-phasemap#G2_next'));
    assert.strictEqual(r.stats.maps.unreadable, 1);
    assert.match(S.ingest('', []).error, /name the system/); assert.match(S.ingest('x', 'nope').error, /list/);
    assert.deepStrictEqual(S.ingest('Architect', [{ title: 'a gap', refs: ['spec/a.architecture.yaml'] }, { nothing: 1 }], { dir }), { system: 'architect', accepted: 1, refused: 1 });
    const r2 = S.run({ root, dir, yaml, now: 2000 });
    assert.ok(r2.gaps.find(g => g.id === 'ingest:architect:0'), 'a pushed gap is in the next run');
    assert.deepStrictEqual(S.history({ dir }).map(h => h.at), [2000, 1000]);
  });

  await test('SZ-06', 'the routes through intelligence\'s route table; declared; the Architect pushes its gaps', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syn-routes-'));
    process.env.INTELLIGENCE_SYNTHESIS_DIR = dir;
    const { createRoutes } = require(path.join(ROOT, 'intelligence/routes.js'));
    const stubDb = { query: () => [], count: () => 0, tail: () => [], reloadTable: () => {}, insert: () => {} };
    const routes = createRoutes({ jaaDB: stubDb, getField: () => ({}), intelligence: { getContext: () => ({}) } });
    const call = (m, p, body, q = '') => new Promise(res => routes.handle(m, p, new URLSearchParams(q), body, (status, data) => res({ status, data })));
    for (const p of ['/api/intelligence/synthesis', '/api/intelligence/synthesis/run', '/api/intelligence/synthesis/fill', '/api/intelligence/synthesis/themes', '/api/intelligence/synthesis/ingest', '/api/intelligence/synthesis/history'])
      assert.ok(routes.owns(p.endsWith('run') || p.endsWith('ingest') ? 'POST' : 'GET', p), p);
    assert.ok(routes.owns('GET', '/api/intelligence/synthesis/gap/x'));
    const run = await call('POST', '/api/intelligence/synthesis/run', { top: 5 });
    assert.strictEqual(run.status, 200); assert.ok(run.data.stats.synthesized > 100 && run.data.fill.length && run.data.plan.length === 5, 'the real tree');
    assert.strictEqual((await call('GET', '/api/intelligence/synthesis/run', {})).status, 405);
    const list = await call('GET', '/api/intelligence/synthesis', null, 'q=versionium&limit=3');
    assert.ok(list.data.count >= 1 && list.data.gaps.length <= 3);
    const one = await call('GET', `/api/intelligence/synthesis/gap/${encodeURIComponent(list.data.gaps[0].id)}`);
    assert.strictEqual(one.status, 200); assert.ok(one.data.gap.parts);
    assert.strictEqual((await call('GET', '/api/intelligence/synthesis/gap/nope')).status, 404);
    const ing = await call('POST', '/api/intelligence/synthesis/ingest', { system: 'architect', gaps: [{ title: 'x needs y' }] });
    assert.strictEqual(ing.status, 200); assert.strictEqual((await call('POST', '/api/intelligence/synthesis/ingest', { gaps: [] })).status, 400);
    const reg = require(path.join(ROOT, 'intelligence/registry-components.js'));
    assert.strictEqual(reg.filter(c => /^intelligence\.synthesis/.test(c.id)).length, 7);
    for (const f of ['get-api-intelligence-synthesis', 'post-api-intelligence-synthesis-run', 'post-api-intelligence-synthesis-ingest', 'get-api-intelligence-synthesis-fill']) assert.ok(fs.existsSync(path.join(ROOT, 'intelligence/commands', `${f}.command`)), f);
    assert.match(read('idearium/api/index.js'), /_nexusClient\.post\('intelligence', '\/api\/intelligence\/synthesis\/ingest', \{ system: 'architect', gaps: all \}/);
    delete process.env.INTELLIGENCE_SYNTHESIS_DIR;
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
