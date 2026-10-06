'use strict';
// tests/modules/test-architect.test.js — 0.39.298 AR2, docs/2026-10-02-workshop-codex-rewind-phasemap.spec (AR2).
// James: "build the spec workshop, with architect for archiecture using the component registry, components store with
// dependancies … idea -> spec workshop -> architect -> destroy and rebuild blueprint -> Idearium repo -> Cos?"
// The phase's proof: "a spec naming an existing component reuses it; a dependency on nothing is a gap; layers come out
// bottom-up".
//
//   AR-01  the index: loom's real registry + the component store, one search; tests and spec documents left out; an
//          existing component is reused, the store's built bytes before loom at a tie
//   AR-02  the analysis: a dependency on nothing is a gap; self, cycle and layer inversion are gaps; levels bottom-up;
//          a dependency on an existing component resolves outside
//   AR-03  James decides: reuse a named ref (a missing ref is a gap), force new, back to auto; remove keeps, restore
//   AR-04  the agent only proposes: YAML → proposals, the components untouched; accept, accept all; a bad answer or no
//          agent is said and adds nothing
//   AR-05  the file beside the spec: archPathFor; archText → fromArchText keeps the decisions
//   AR-06  the real router: a workshop → its architecture (one per spec) → save refused until the spec is in a repo →
//          saved beside it; registry search; draft with a stand-in; a repo's saved architecture read back
//   AR-07  the surfaces: routes + caps, the page served in the Void's look, the CLI, the workshop's ARCHITECT station
//   AR-08  0.39.299 AR3–AR5 — the one canvas (stripped from MASTERMIND): bands bottom-up, every dependency drawn lower,
//          the sweep cuts crossings, a pinned card keeps its place, a wide band wraps; a placed component keeps its place
//          (a move changes nothing else, null unpins, the file keeps it); both Architects mount it; the Build tab is idearium's
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '../..');
const yaml = require('js-yaml');
let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

async function main() {
  const AR = await imp('idearium/lib/architect.js');
  const CS = require(path.join(ROOT, 'lib/component-store.js'));
  const registry = Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'loom/data/registry.json'), 'utf8')).component);
  const build = (extra = []) => AR.makeIndex({ registry, stored: extra });
  const add = (s, c) => { const r = AR.editComponent(s, { ...c, add: true }); assert.ok(!r.error, r.error); return r.component; };

  await test('AR-01', 'the index: loom + the store, one search; an existing component is reused', () => {
    const idx = build();
    assert.ok(idx.counts.registry > 1000, `loom's registry is read (${idx.counts.registry})`);
    assert.ok(!idx.entries.some(e => /^nexus\.tests\./.test(e.id)), 'tests are not components');
    assert.ok(!idx.entries.some(e => /^spec\./.test(e.id)), 'spec documents are not components');
    const { session: s } = AR.makeSession({ title: 'Tide clock' });
    add(s, { name: 'Blueprint', layer: 'engine' });
    add(s, { name: 'Tide face', layer: 'interface' });
    const a = AR.analyse(s, idx);
    const bp = a.components.find(c => c.id === 'blueprint');
    assert.strictEqual(bp.status, 'reuse', 'a spec naming an existing component reuses it');
    assert.match(bp.match.ref, /^loom:nexus\..*blueprint$/i);
    assert.strictEqual(a.components.find(c => c.id === 'tide-face').status, 'new');
    // the store: the same name built into the store wins over loom at a tie
    const idx2 = build([{ id: 'tide.blueprint', path: 'src/blueprint.js', latest: '1.0.0', purpose: 'the tide blueprint' }]);
    const b2 = AR.analyse(s, idx2).components.find(c => c.id === 'blueprint');
    assert.strictEqual(b2.match.ref, 'store:tide.blueprint@1.0.0', JSON.stringify(b2.candidates));
    // exact id
    const { session: s3 } = AR.makeSession({ title: 'x' });
    add(s3, { name: 'auth', id: 'nexus.auth' });
    assert.strictEqual(AR.analyse(s3, idx).components[0].match.ref, 'loom:nexus.auth');
    assert.ok(AR.search(idx, 'spec engine').some(r => /spec-engine/.test(r.id)), 'search finds by words');
    assert.deepStrictEqual(AR.search(idx, ''), []);
    assert.strictEqual(AR.lookup(idx, 'loom:nexus.auth').id, 'nexus.auth'); assert.strictEqual(AR.lookup(idx, 'nexus.auth').id, 'nexus.auth');
    assert.strictEqual(AR.lookup(idx, 'store:nope@1'), null);
  });

  await test('AR-02', 'a dependency on nothing is a gap; levels bottom-up; layers bottom-up', () => {
    const idx = build();
    const { session: s } = AR.makeSession({ title: 'Garden' });
    add(s, { name: 'Bed store', layer: 'data' });
    add(s, { name: 'Sun planner', layer: 'engine', dependsOn: ['bed-store'] });
    add(s, { name: 'Planner route', layer: 'service', dependsOn: ['sun-planner', 'nexus.auth'] });
    add(s, { name: 'Garden page', layer: 'interface', dependsOn: 'planner-route, rain-oracle' });
    add(s, { name: 'Loop one', layer: 'engine', dependsOn: ['loop-two'] });
    add(s, { name: 'Loop two', layer: 'engine', dependsOn: ['loop-one'] });
    add(s, { name: 'Selfish', layer: 'engine', dependsOn: ['selfish'] });
    add(s, { name: 'Upside down', layer: 'data', dependsOn: ['garden-page'] });
    const a = AR.analyse(s, idx);
    assert.deepStrictEqual(a.levels.slice(0, 4), [['bed-store', 'selfish'], ['sun-planner'], ['planner-route'], ['garden-page']], JSON.stringify(a.levels));
    const kinds = a.gaps.map(g => g.kind).sort();
    assert.deepStrictEqual(kinds, ['cycle', 'layer', 'missing', 'self'], JSON.stringify(a.gaps));
    const miss = a.gaps.find(g => g.kind === 'missing');
    assert.strictEqual(miss.dep, 'rain-oracle'); assert.match(miss.say, /Garden page depends on "rain-oracle", which is neither in this architecture nor in the registry or the store/);
    assert.match(a.gaps.find(g => g.kind === 'cycle').say, /Loop one → Loop two → Loop one/);
    assert.match(a.gaps.find(g => g.kind === 'layer').say, /Upside down \(data\) depends on Garden page \(interface\)/);
    assert.strictEqual(a.components.find(c => c.id === 'loop-one').level, null, 'a cycle is unplaced');
    assert.deepStrictEqual(a.components.find(c => c.id === 'planner-route').external.map(x => x.ref), ['loom:nexus.auth'], 'an existing dependency resolves outside');
    assert.strictEqual(a.stats.gaps, 4); assert.strictEqual(a.stats.components, 8);
  });

  await test('AR-03', 'James decides: reuse a ref, force new, back to auto; remove keeps, restore', () => {
    const idx = build();
    const { session: s } = AR.makeSession({ title: 'x' });
    add(s, { name: 'Blueprint' });
    add(s, { name: 'Ledger thing' });
    assert.ok(AR.editComponent(s, { id: 'ledger-thing', decision: 'reuse' }).error, 'reuse needs a ref');
    AR.editComponent(s, { id: 'ledger-thing', decision: 'reuse', use: 'loom:nexus.auth' });
    let a = AR.analyse(s, idx);
    assert.strictEqual(a.components[1].status, 'reuse'); assert.strictEqual(a.components[1].match.ref, 'loom:nexus.auth');
    AR.editComponent(s, { id: 'blueprint', decision: 'new' });
    a = AR.analyse(s, idx);
    assert.strictEqual(a.components[0].status, 'new', 'new is new, whatever matches');
    AR.editComponent(s, { id: 'ledger-thing', decision: 'auto' });
    assert.strictEqual(s.components[1].use, null, 'back to auto drops the ref'); assert.strictEqual(s.components[1].decision, 'auto');
    AR.editComponent(s, { id: 'ledger-thing', decision: 'reuse', use: 'loom:gone.away' });
    a = AR.analyse(s, idx);
    assert.strictEqual(a.gaps[0].kind, 'reuse-missing'); assert.strictEqual(a.components[1].status, 'new');
    assert.match(AR.editComponent(s, { id: 'blueprint', purpose: 'p'.repeat(2001) }).error, /limit is 2000/);
    assert.match(AR.editComponent(s, { add: true, name: 'n'.repeat(121) }).error, /limit is 120/);
    assert.strictEqual(add(s, { name: 'Blueprint' }).id, 'blueprint-2', 'ids stay unique');
    AR.editComponent(s, { id: 'blueprint', remove: true });
    assert.ok(!s.components.find(c => c.id === 'blueprint') && s.removed.find(c => c.id === 'blueprint'), 'removed is kept (§0.3)');
    AR.restoreComponent(s, 'blueprint');
    assert.ok(s.components.find(c => c.id === 'blueprint') && !s.removed.length);
    assert.ok(AR.editComponent(s, { id: 'nope', name: 'x' }).error);
  });

  await test('AR-04', 'the agent only proposes; James decides', async () => {
    const idx = build();
    const { session: s } = AR.makeSession({ title: 'Garden', sections: [{ id: 'purpose', title: 'Purpose', body: 'A planner that schedules beds by sunlight, with a blueprint.' }] });
    add(s, { name: 'Bed store', layer: 'data' });
    let seen = '';
    AR.setAsk(async (prompt) => { seen = prompt; return { ok: true, by: 'stand-in', text: '```yaml\n- id: sun-planner\n  name: Sun planner\n  tier: component\n  layer: engine\n  purpose: Schedules beds by sunlight.\n  depends_on: [bed-store]\n  seams: [garden.plan]\n- id: garden-page\n  name: Garden page\n  layer: interface\n  depends_on: [sun-planner]\n  reuse: loom:nexus.auth\n```' }; });
    const before = JSON.stringify(s.components);
    const r = await AR.draft(s, { index: idx, yaml });
    assert.ok(!r.error, r.error);
    assert.strictEqual(r.added.length, 2); assert.strictEqual(JSON.stringify(s.components), before, 'the components are untouched');
    assert.match(seen, /you only propose/); assert.match(seen, /bed-store: Bed store/, 'what exists in the architecture is said');
    assert.match(seen, /Build bottom-up/); assert.match(seen, /loom:/, 'existing components are offered for reuse');
    assert.strictEqual(r.added[1].component.use, 'loom:nexus.auth'); assert.strictEqual(r.added[1].component.decision, 'reuse');
    const d = AR.decide(s, r.added[0].uuid, { action: 'accept' });
    assert.strictEqual(d.component.id, 'sun-planner'); assert.strictEqual(d.component.by, 'agent, accepted by james');
    assert.ok(AR.decide(s, r.added[0].uuid, { action: 'accept' }).error, 'not twice');
    AR.decide(s, r.added[1].uuid, { action: 'dismiss' }); assert.strictEqual(r.added[1].status, 'dismissed');
    AR.decide(s, r.added[1].uuid, { action: 'reopen' });
    assert.strictEqual(AR.decideAll(s, 'accept').decided, 1);
    const a = AR.analyse(s, idx);
    assert.deepStrictEqual(a.levels, [['bed-store'], ['sun-planner'], ['garden-page']]);
    const n = s.proposals.length;
    AR.setAsk(async () => ({ ok: true, text: 'Sure! Here is a plan: build it.' }));
    assert.match((await AR.draft(s, { index: idx, yaml })).error, /not answer with a list|not YAML/);
    AR.setAsk(async () => ({ ok: false, error: 'copilot unreachable' }));
    assert.match((await AR.draft(s, { index: idx, yaml })).error, /did not answer: copilot unreachable/);
    AR.setAsk(null);
    assert.match((await AR.draft(s, { index: idx, yaml })).error, /no agent connected/);
    assert.strictEqual(s.proposals.length, n, 'nothing added on a failure');
  });

  await test('AR-05', 'the file beside the spec keeps the decisions', () => {
    assert.strictEqual(AR.archPathFor('spec/orbit-garden.spec'), 'spec/orbit-garden.architecture.yaml');
    assert.strictEqual(AR.archPathFor(null, 'Orbit Garden'), 'spec/orbit-garden.architecture.yaml');
    const idx = build();
    const { session: s } = AR.makeSession({ title: 'Orbit garden', specPath: 'spec/orbit-garden.spec' });
    add(s, { name: 'Bed store', layer: 'data', seams: ['beds.read'] });
    add(s, { name: 'Blueprint', layer: 'engine', dependsOn: ['bed-store'], decision: 'new' });
    add(s, { name: 'Ledger', layer: 'engine', decision: 'reuse', use: 'loom:nexus.auth' });
    const text = AR.archText(s, AR.analyse(s, idx), yaml);
    assert.match(text, /^# Orbit garden — architecture, laid out by the Architect/);
    const doc = yaml.load(text);
    assert.strictEqual(doc.architecture.spec, 'spec/orbit-garden.spec');
    assert.deepStrictEqual(doc.levels.map(l => l.components), [['bed-store', 'ledger'], ['blueprint']]);
    const back = AR.fromArchText(text, yaml);
    assert.deepStrictEqual(back.map(c => [c.id, c.decision, c.use, c.dependsOn.join()]), [['bed-store', 'auto', null, ''], ['blueprint', 'new', null, 'bed-store'], ['ledger', 'reuse', 'loom:nexus.auth', '']]);
    const { session: again } = AR.makeSession({ title: 'Orbit garden', components: back });
    assert.deepStrictEqual(AR.analyse(again, idx).components.map(c => c.status), ['new', 'new', 'reuse'], 'the decisions survive');
    assert.deepStrictEqual(AR.fromArchText('not: [valid', yaml), []);
  });

  // ── the real router ──
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await imp('idearium/api/index.js');
  const R = (m, p, b) => api._route(m, p, b);

  await test('AR-06', 'the router: workshop → architecture → saved beside the spec; one per spec; read back', async () => {
    const l0 = await R('GET', '/api/architect');   // loads the module (it installs the real agent) — the stand-in goes in after
    assert.strictEqual(l0.status, 200, JSON.stringify(l0.json));
    const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Orbit garden' })).json.workshop;
    await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'A planner that schedules garden beds by sunlight, with a blueprint.' }] });
    const c = await R('POST', '/api/architect', { from: { kind: 'workshop', id: w.uuid } });
    assert.strictEqual(c.status, 200, JSON.stringify(c.json));
    const a = c.json.architecture;
    assert.strictEqual(a.title, 'Orbit garden'); assert.strictEqual(a.workshopUuid, w.uuid); assert.strictEqual(c.json.existing, false);
    assert.ok(c.json.index.registry > 1000, 'loom is the registry');
    assert.match(a.sections[0].body, /garden beds by sunlight/);
    const again = await R('POST', '/api/architect', { from: { kind: 'workshop', id: w.uuid } });
    assert.strictEqual(again.json.existing, true); assert.strictEqual(again.json.architecture.uuid, a.uuid, 'one architecture per spec');
    const u = await R('POST', `/api/architect/${a.uuid}`, { components: [{ add: true, name: 'Bed store', layer: 'data' }, { add: true, name: 'Blueprint', layer: 'engine', dependsOn: ['bed-store'] }, { add: true, name: 'Garden page', layer: 'interface', dependsOn: ['blueprint', 'rain-oracle'] }] });
    assert.strictEqual(u.status, 200, JSON.stringify(u.json));
    assert.strictEqual(u.json.analysis.components.find(x => x.id === 'blueprint').status, 'reuse');
    assert.deepStrictEqual(u.json.analysis.gaps.map(g => g.dep), ['rain-oracle']);
    assert.strictEqual((await R('POST', `/api/architect/${a.uuid}`, { components: [{ add: true, name: '' }] })).status, 400);
    const reg = await R('GET', '/api/architect/registry?q=spec%20engine');
    assert.strictEqual(reg.status, 200); assert.ok(reg.json.results.some(r => /spec-engine/.test(r.id)));
    // draft with a stand-in agent
    const AR2 = await imp('idearium/lib/architect.js');
    AR2.setAsk(async () => ({ ok: true, text: '- id: sun-clock\n  name: Sun clock\n  layer: engine\n  depends_on: [bed-store]\n', by: 'stand-in' }));
    const d = await R('POST', `/api/architect/${a.uuid}/draft`, {});
    assert.strictEqual(d.status, 200, JSON.stringify(d.json)); assert.strictEqual(d.json.added.length, 1);
    assert.strictEqual(d.json.architecture.components.length, 3, 'a draft adds no component');
    const dd = await R('POST', `/api/architect/${a.uuid}/proposal/${d.json.added[0].uuid}`, { action: 'accept' });
    assert.strictEqual(dd.status, 200, JSON.stringify(dd.json)); assert.strictEqual(dd.json.component.id, 'sun-clock');
    // save: the spec must be in a repo first, then beside it
    const early = await R('POST', `/api/architect/${a.uuid}/save`, {});
    assert.strictEqual(early.status, 409); assert.match(early.json.error, /save it from the spec workshop first/);
    const ws = await R('POST', `/api/workshop/${w.uuid}/save`, {});
    assert.strictEqual(ws.status, 200, JSON.stringify(ws.json));
    const sv = await R('POST', `/api/architect/${a.uuid}/save`, {});
    assert.strictEqual(sv.status, 200, JSON.stringify(sv.json));
    assert.strictEqual(sv.json.archPath, 'spec/orbit-garden.architecture.yaml'); assert.strictEqual(sv.json.repoUuid, ws.json.repoUuid);
    const file = api.getRepoLayer().readFile(ws.json.repoUuid, 'spec/orbit-garden.architecture.yaml');
    assert.ok(!file.error, file.error);
    const doc = yaml.load(file.content);
    assert.deepStrictEqual(doc.components.map(x => x.id), ['bed-store', 'blueprint', 'garden-page', 'sun-clock']);
    assert.ok(doc.gaps.some(g => /rain-oracle/.test(g)), 'the gap is in the file, said');
    // a repo whose architecture was saved by hand: opened from the repo, its components are read back
    const w2 = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Tide clock' })).json.workshop;
    await R('POST', `/api/workshop/${w2.uuid}`, { sections: [{ id: 'purpose', body: 'A clock that tells the tide.' }] });
    const s2 = (await R('POST', `/api/workshop/${w2.uuid}/save`, {})).json;
    api.getRepoLayer().writeFile(s2.repoUuid, 'spec/tide-clock.architecture.yaml', 'components:\n  - id: tide-table\n    name: Tide table\n    layer: data\n    decision: new\n', { preserveWhitespace: true });
    const c3 = await R('POST', '/api/architect', { from: { kind: 'repo', id: s2.repoUuid } });
    assert.strictEqual(c3.status, 200, JSON.stringify(c3.json));
    assert.deepStrictEqual(c3.json.architecture.components.map(x => [x.id, x.decision]), [['tide-table', 'new']]);
    assert.strictEqual(c3.json.architecture.specPath, 'spec/tide-clock.spec');
    const l = await R('GET', '/api/architect');
    assert.ok(l.json.architectures.find(x => x.uuid === a.uuid && x.archPath === 'spec/orbit-garden.architecture.yaml'));
    assert.strictEqual((await R('GET', '/api/architect/nope')).status, 404);
    assert.strictEqual((await R('POST', '/api/architect', { from: { kind: 'idea', id: 'x' } })).status, 400);
    assert.strictEqual((await R('POST', '/api/architect', { from: { kind: 'workshop', id: 'nope' } })).status, 404);
  });

  await test('AR-07', 'the surfaces', () => {
    const A = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    for (const [m, segs, act] of [['GET', "'api','architect'", 'architect.list'], ['POST', "'api','architect'", 'architect.create'], ['GET', "'api','architect','registry'", 'architect.registry'],
      ['GET', "'api','architect',':id'", 'architect.show'], ['POST', "'api','architect',':id'", 'architect.update'], ['POST', "'api','architect',':id','draft'", 'architect.draft'],
      ['POST', "'api','architect',':id','proposal',':pid'", 'architect.decide'], ['POST', "'api','architect',':id','save'", 'architect.save']]) {
      assert.ok(new RegExp(`\\['${m}',\\s*\\[${segs.replace(/[[\]()]/g, '\\$&')}\\],\\s*'${act.replace('.', '\\.')}'\\]`).test(A), `${m} ${segs}`);
      assert.match(A, new RegExp(`'${act.replace('.', '\\.')}':\\s*CAPS\\.`));
    }
    assert.match(A, /cleanUrl === '\/architect\.html'/);
    assert.match(A, /channel: 'idearium-architect'/, 'the same copilot route the repo agents use');
    const page = fs.readFileSync(path.join(ROOT, 'idearium/ui/architect.html'), 'utf8');
    assert.match(page, /js\/window-chrome\.js/); assert.match(page, /href="css\/void-theme\.css"/, 'the Void\'s look, shared'); assert.match(page, /src="js\/void-sky\.js"/);
    assert.match(page, /<title>THE ARCHITECT<\/title>/); assert.match(page, /data-title="THE ARCHITECT"/);
    const tips = [...page.matchAll(/title="([^"$]*)"/g)].map(m => m[1]).filter(t => /[a-z]/.test(t));
    assert.deepStrictEqual(tips, [], 'no lowercase tooltip');
    const code = page.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(!/\bprompt\(|\bconfirm\(/.test(code), 'no browser prompt()/confirm() — they speak lowercase');
    for (const st of ['OPENING THE ARCHITECT', 'THE ARCHITECT IS UNREACHABLE', 'REUSE', 'NEW', 'GAP']) assert.ok(page.includes(st), st);
    assert.match(page, /const AGENT_MS = 330000/);
    const wpage = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/workshop.js'), 'utf8');   // 0.39.354 WS7 — the page's script is its own file
    assert.match(wpage, /architect\.html\?from=workshop:/, 'the workshop\'s ARCHITECT station opens the architect');
    const cli = fs.readFileSync(path.join(ROOT, 'idearium/cli/index.js'), 'utf8');
    for (const c of ['list', 'new', 'show', 'add', 'draft', 'accept', 'dismiss', 'save']) assert.match(cli, new RegExp(`async 'architect\\.${c}'`));
  });

  await test('AR-08', 'the one canvas: layout bottom-up, crossings cut, places kept; both Architects on it', () => {
    require(path.join(ROOT, 'idearium/ui/js/arch-canvas.js'));
    const C = globalThis.ArchCanvas;
    const bands = [{ key: 'data' }, { key: 'engine' }, { key: 'service' }];
    const nodes = [{ id: 'a', band: 'data' }, { id: 'b', band: 'data' }, { id: 'c', band: 'engine' }, { id: 'd', band: 'engine' }, { id: 'e', band: 'service' }];
    const edges = [{ from: 'c', to: 'b' }, { from: 'd', to: 'a' }, { from: 'e', to: 'c' }, { from: 'e', to: 'd' }];
    const L = C.layout(nodes, edges, bands);
    assert.deepStrictEqual(L.bands.map(b => b.key), ['data', 'engine', 'service']);
    assert.ok(L.bands[0].y > L.bands[1].y && L.bands[1].y > L.bands[2].y, 'bands stack bottom-up: data lowest');
    for (const e of edges) assert.ok(L.pos[e.from].y < L.pos[e.to].y, `${e.from} sits above what it needs (${e.to})`);
    const naive = { a: { x: 0, y: 2 }, b: { x: 1, y: 2 }, c: { x: 0, y: 1 }, d: { x: 1, y: 1 }, e: { x: 0, y: 0 } };   // by name: c above a, d above b — the wires cross
    assert.ok(C.crossings(naive, edges) > 0 && C.crossings(L.pos, edges) === 0, `the sweep cuts the crossings (${C.crossings(naive, edges)} → ${C.crossings(L.pos, edges)})`);
    const P = C.layout([...nodes.slice(0, 4), { id: 'e', band: 'service', x: 999, y: -50, pinned: true }], edges, bands);
    assert.deepStrictEqual(P.pos.e, { x: 999, y: -50 }, 'a card placed by hand keeps its place');
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, band: 'data' }));
    const W = C.layout(many, [], bands.slice(0, 1), { maxPerRow: 7 });
    assert.strictEqual(new Set(Object.values(W.pos).map(p => p.y)).size, 3, 'a wide band wraps into rows');
    assert.match(C.card({ title: 'Bed <store>', badge: 'NEW', chips: [{ t: '1 GAP', cls: 'gap' }] }), /Bed &lt;store&gt;.*ac-chip gap/s, 'the card escapes');
    // places: a move is only a move; null unpins; the file keeps it
    const { session: s } = AR.makeSession({ title: 'Placed', specPath: 'spec/placed.spec' });
    add(s, { name: 'Bed store', layer: 'data' });
    const before = s.components[0].by;
    s.components[0].by = 'agent, accepted by james';
    const hist = s.history.length;
    assert.ok(AR.editComponent(s, { id: 'bed-store', x: 120.4, y: 300 }).moved);
    assert.deepStrictEqual([s.components[0].x, s.components[0].y, s.components[0].by], [120, 300, 'agent, accepted by james'], 'who wrote it does not change');
    assert.strictEqual(s.history.length, hist, 'a move is not history');
    assert.ok(AR.editComponent(s, { id: 'bed-store', x: 'left', y: 3 }).error);
    const back = AR.fromArchText(AR.archText(s, AR.analyse(s, build()), yaml), yaml);
    assert.deepStrictEqual(back[0].at, [120, 300], 'the file keeps the place');
    assert.strictEqual(AR.makeSession({ title: 'x', components: back }).session.components[0].x, 120);
    AR.editComponent(s, { id: 'bed-store', x: null, y: null });
    assert.ok(!('x' in s.components[0]), 'null unpins'); void before;
    // the surfaces
    const page = fs.readFileSync(path.join(ROOT, 'idearium/ui/architect.html'), 'utf8');
    assert.match(page, /src="js\/arch-canvas\.js"/); assert.match(page, /href="css\/arch-canvas\.css"/); assert.match(page, /ArchCanvas\.mount\(\$\('map'\), \{\s*linkable: true/);
    assert.match(page, /onLink: \(from, to\) => link\(from, to\)/, 'a handle dropped on a card is a dependency');
    const idx = fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8');
    assert.match(idx, /id="architect-frame"[^>]*data-src="architect\.html"/, 'Build › Architect is idearium\'s own page');
    assert.ok(!/data-src="\.\.\/architect\/arch-builder\.html"/.test(idx), 'not the data-less arch-builder');
    assert.match(idx, /<script src="js\/arch-canvas\.js"><\/script>/); assert.match(idx, /href="css\/arch-canvas\.css"/);
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    assert.match(app, /ARCHREG\.canvas = ArchCanvas\.mount\(document\.getElementById\('ra-map'\)/, 'the repo tab mounts the same canvas');
    assert.ok(!/function _archSvg\(/.test(app), 'the column SVG is gone');
    const canvas = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/arch-canvas.js'), 'utf8');
    assert.match(canvas, /Stripped from MASTERMIND's nexus-canvas\.js/);
    const css = fs.readFileSync(path.join(ROOT, 'idearium/ui/css/arch-canvas.css'), 'utf8');
    assert.ok(!/^\s*(html|body)\b/m.test(css), 'scoped: nothing page-wide, so the repo tab cannot leak into idearium');
    for (const f of [page, idx]) { const tips = [...f.matchAll(/class="ax[^"]*"[^>]*title="([^"$]*)"/g)].map(m => m[1]).filter(t => /[a-z]/.test(t)); assert.deepStrictEqual(tips, [], 'no lowercase tooltip on the canvas shell'); }
    const tipsApp = [...app.slice(app.indexOf('const ARCHREG')).slice(0, 20000).matchAll(/title="([^"$]*)"/g)].map(m => m[1]).filter(t => /[a-z]/.test(t));
    assert.deepStrictEqual(tipsApp, [], 'no lowercase tooltip in the repo tab');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
