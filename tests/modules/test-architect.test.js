'use strict';
// tests/modules/test-architect.test.js — 0.39.298 AR2, docs/2026-10-02-workshop-codex-rewind-phasemap.spec (AR2).
// James: "with architect for archiecture using the component registry, components store with dependancies" · "all of
// it needs to be isolated, in its own pages" · "no lowercase. and make sure its enterprise grade".
//
//   AR-01  the model: four layers bottom-up, components added / edited / removed (kept) / restored, the limits
//   AR-02  the agent's line form is parsed; anything else is ignored; the prompt carries the spec and what exists
//   AR-03  the agent proposes, James accepts (one or all): a dependency written before its component resolves after
//   AR-04  analyze: the build order bottom-up, gaps, cycles, layer violations — said, never hidden
//   AR-05  reuse before build: matched against a registry and the store; REUSE only among its matches
//   AR-06  the architecture file round-trips as YAML
//   AR-07  the router, a stand-in agent: workshop → architect → propose → accept all → match (loom's real registry) →
//          reuse → save beside the spec; from a repo's spec; refusals (no repo, no component lines)
//   AR-08  the page and the shell: its own page, the Void's look, capitals, no browser prompt, the stations, the CLI
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
  const A = await imp('idearium/lib/architect.js');
  const fresh = () => A.makeArchitecture({ title: 'Orbit Garden', source: { kind: 'blank' }, sections: [{ id: 'purpose', title: 'Purpose', body: '<!-- imported: x -->\n\nPlan beds by sunlight.' }] }).arch;

  await test('AR-01', 'the model: layers, edits, removal kept, limits', () => {
    assert.deepStrictEqual(A.LAYER_IDS, ['foundation', 'library', 'service', 'interface']);
    assert.deepStrictEqual(['foundation', 'LIBRARY', 'a web page', 'the job queue server', 'storage of readings', 'rules'].map(A.layerOf), [0, 1, 3, 2, 0, 1]);
    assert.ok(A.makeArchitecture({ title: '' }).error);
    const a = fresh();
    assert.strictEqual(a.sections[0].body, 'Plan beds by sunlight.', 'the import tag is not part of the spec');
    const sun = A.editComponent(a, { add: true, name: 'Sun Table', layer: 'foundation', purpose: 'sun hours per square metre' }).component;
    const plan = A.editComponent(a, { add: true, name: 'Bed Planner', layer: 'library', dependsOn: ['Sun Table', 'weather feed'] }).component;
    assert.deepStrictEqual(plan.dependsOn, ['sun-table', 'weather feed'], 'a name that exists resolves to its id; one that does not is kept as written');
    assert.strictEqual(A.editComponent(a, { add: true, name: 'Sun Table' }).component.id, 'sun-table-2', 'ids stay unique');
    A.editComponent(a, { id: 'sun-table-2', remove: true });
    assert.ok(a.removed.find(r => r.id === 'sun-table-2') && !a.components.find(c => c.id === 'sun-table-2'), 'removed is kept (§0.3)');
    A.editComponent(a, { restore: 'sun-table-2' }); assert.ok(a.components.find(c => c.name === 'Sun Table' && c.id !== 'sun-table'));
    assert.match(A.editComponent(a, { add: true, name: 'n'.repeat(81) }).error, /limit is 80/);
    assert.match(A.editComponent(a, { id: sun.id, purpose: 'p'.repeat(1001) }).error, /limit is 1000/);
    assert.match(A.editComponent(a, { id: 'nope', name: 'x' }).error, /no component/);
    assert.match(A.editComponent(a, { id: sun.id, reuse: 'not-a-match' }).error, /reuse one of its matches/);
  });

  await test('AR-02', 'the line form, and nothing else', () => {
    const text = 'Here is the layout:\nCOMPONENT: Sun Table | LAYER: foundation | PURPOSE: hours of sun per bed | DEPENDS: none\n- COMPONENT: Bed Planner | LAYER: library | PURPOSE: places beds | DEPENDS: Sun Table, Weather Feed\nsome chatter\n2) COMPONENT: Garden Page | LAYER: interface | PURPOSE: shows the plan | DEPENDS: Bed Planner';
    const p = A.parseComponents(text);
    assert.deepStrictEqual(p.map(x => [x.name, x.layer, x.dependsOn]), [['Sun Table', 0, []], ['Bed Planner', 1, ['Sun Table', 'Weather Feed']], ['Garden Page', 3, ['Bed Planner']]]);
    assert.deepStrictEqual(A.parseComponents('nothing useful here'), []);
    const a = fresh(); A.editComponent(a, { add: true, name: 'Sun Table', layer: 0 });
    const prompt = A.proposePrompt(a);
    assert.match(prompt, /He decides; you propose/); assert.match(prompt, /FOUNDATION — data, storage/); assert.match(prompt, /COMPONENT: <short name> \| LAYER:/);
    assert.match(prompt, /Plan beds by sunlight/); assert.ok(prompt.includes("(do not repeat them):\n- Sun Table (foundation)"));
  });

  await test('AR-03', 'the agent proposes; James accepts', () => {
    const a = fresh();
    const { added } = A.addProposals(a, A.parseComponents('COMPONENT: Garden Page | LAYER: interface | PURPOSE: p | DEPENDS: Bed Planner\nCOMPONENT: Bed Planner | LAYER: library | PURPOSE: q | DEPENDS: none'));
    assert.strictEqual(a.components.length, 0, 'a proposal is not the architecture');
    A.decide(a, added[0].uuid, { action: 'accept' });
    assert.deepStrictEqual(a.components[0].dependsOn, ['Bed Planner'], 'not there yet — kept as written');
    A.decide(a, added[1].uuid, { action: 'accept' });
    assert.deepStrictEqual(a.components.find(c => c.id === 'garden-page').dependsOn, ['bed-planner'], 'resolves once it exists');
    assert.strictEqual(a.components[0].by, 'agent, accepted by james');
    assert.ok(A.decide(a, added[1].uuid, { action: 'accept' }).error, 'not twice');
    const more = A.addProposals(a, [{ name: 'Bed Planner', layer: 1, purpose: '', dependsOn: [] }, { name: 'Sensor', layer: 0, purpose: '', dependsOn: [] }]).added;
    assert.deepStrictEqual(more.map(p => p.name), ['Sensor'], 'one that exists is not proposed again');
    A.decide(a, more[0].uuid, { action: 'dismiss' }); assert.strictEqual(more[0].status, 'dismissed');
  });

  await test('AR-04', 'analyze: order, gaps, cycles, layer violations', () => {
    const a = fresh();
    for (const [n, l, d] of [['Garden Page', 3, ['Bed Planner']], ['Bed Planner', 1, ['Sun Table', 'Weather Feed']], ['Sun Table', 0, []], ['Logger', 0, ['Garden Page']]]) A.editComponent(a, { add: true, name: n, layer: l, dependsOn: d });
    a.components.find(c => c.id === 'garden-page').dependsOn = ['bed-planner'];
    a.components.find(c => c.id === 'bed-planner').dependsOn = ['sun-table', 'Weather Feed'];
    const an = A.analyze(a);
    assert.ok(an.order.indexOf('sun-table') < an.order.indexOf('bed-planner') && an.order.indexOf('bed-planner') < an.order.indexOf('garden-page'), JSON.stringify(an.order));
    assert.deepStrictEqual(an.gaps, [{ component: 'bed-planner', needs: 'Weather Feed' }]);
    assert.deepStrictEqual(an.violations.map(v => [v.component, v.needs]), [['logger', 'garden-page']], 'a foundation leaning on an interface');
    assert.strictEqual(an.cycles.length, 0);
    a.components.find(c => c.id === 'sun-table').dependsOn = ['logger'];
    const cy = A.analyze(a).cycles;
    assert.ok(cy.length >= 1 && cy[0].includes('logger') && cy[0].includes('sun-table'), JSON.stringify(cy));
    assert.deepStrictEqual(A.analyze(a).counts.byLayer.map(x => x.n), [2, 1, 0, 1]);
  });

  await test('AR-05', 'reuse before build', () => {
    const registry = [{ id: 'nexus.lib.component-store', name: 'lib/component-store.js', namespace: 'nexus' }, { id: 'nexus.idearium.lib.void', name: 'idearium/lib/void.js', namespace: 'nexus' }, { id: 'nexus.cortex.memory.jaa-db', name: 'cortex/memory/jaa-db.js', namespace: 'nexus' }];
    const m = A.matchesFor({ name: 'Component Store' }, { registry, store: () => [{ id: 'store:p/lib/store.js@1', file: 'lib/store.js', why: '1 version' }] });
    assert.strictEqual(m[0].id, 'nexus.lib.component-store'); assert.strictEqual(m[0].score, 1);
    assert.ok(m.find(x => x.source === 'store'));
    assert.deepStrictEqual(A.matchesFor({ name: 'Weather Feed' }, { registry }), [], 'nothing alike — new');
    const a = fresh(); const c = A.editComponent(a, { add: true, name: 'Component Store', layer: 0 }).component;
    c.matches = m;
    A.editComponent(a, { id: c.id, reuse: 'nexus.lib.component-store' });
    assert.strictEqual(c.reuse.id, 'nexus.lib.component-store'); assert.strictEqual(A.analyze(a).counts.reuse, 1);
    A.editComponent(a, { id: c.id, reuse: null }); assert.strictEqual(c.reuse, null);
  });

  await test('AR-06', 'the file round-trips', () => {
    const a = fresh(); a.specPath = 'spec/orbit-garden.spec';
    A.editComponent(a, { add: true, name: 'Sun Table', layer: 0 }); A.editComponent(a, { add: true, name: 'Bed Planner', layer: 1, dependsOn: ['Sun Table', 'Weather'] });
    const doc = yaml.load(A.archText(a, yaml));
    assert.strictEqual(doc.architecture.name, 'Orbit Garden'); assert.deepStrictEqual(doc.build_order, ['sun-table', 'bed-planner']);
    assert.deepStrictEqual(doc.components.map(c => [c.id, c.layer]), [['sun-table', 'foundation'], ['bed-planner', 'library']]);
    assert.deepStrictEqual(doc.gaps, [{ component: 'bed-planner', needs: 'Weather' }]);
  });

  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await imp('idearium/api/index.js');
  const R = (m, p, b) => api._route(m, p, b);

  await test('AR-07', 'the router: workshop → architect → propose → accept → match → reuse → save', async () => {
    api._setAgentAsk(async (prompt) => ({ ok: true, by: 'stand-in', text: /COMPONENT: <short name>/.test(prompt)
      ? 'COMPONENT: Component Store | LAYER: foundation | PURPOSE: keeps the built components | DEPENDS: none\nCOMPONENT: Bed Planner | LAYER: library | PURPOSE: places beds by sun | DEPENDS: Component Store, Weather Feed\nCOMPONENT: Garden Page | LAYER: interface | PURPOSE: shows the plan | DEPENDS: Bed Planner'
      : 'n/a' }));
    const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Orbit Garden' })).json.workshop;
    await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'A planner that places garden beds by measured sunlight.' }] });
    const noRepo = (await R('POST', '/api/architect', { from: { kind: 'workshop', id: w.uuid } })).json;
    const x = await R('POST', `/api/architect/${noRepo.architecture.uuid}/save`, {});
    assert.strictEqual(x.status, 400, 'nothing to save yet'); // (no components)
    const sv = await R('POST', `/api/workshop/${w.uuid}/save`, {}); assert.strictEqual(sv.status, 200, JSON.stringify(sv.json));
    const src = await R('GET', '/api/architect/sources');
    assert.ok(src.json.workshops.find(s => s.uuid === w.uuid)); assert.ok(src.json.repos.find(r => r.uuid === sv.json.repoUuid));
    const c = await R('POST', '/api/architect', { from: { kind: 'workshop', id: w.uuid } });
    assert.strictEqual(c.status, 200, JSON.stringify(c.json));
    const id = c.json.architecture.uuid;
    assert.strictEqual(c.json.architecture.sections[0].body, 'A planner that places garden beds by measured sunlight.');
    const p = await R('POST', `/api/architect/${id}/propose`, {});
    assert.strictEqual(p.status, 200, JSON.stringify(p.json)); assert.strictEqual(p.json.added.length, 3);
    assert.strictEqual(p.json.architecture.components.length, 0, 'proposals only');
    const all = await R('POST', `/api/architect/${id}/proposal/all`, { action: 'accept' });
    assert.strictEqual(all.json.decided.length, 3);
    const an = all.json.analysis;
    assert.deepStrictEqual(an.gaps, [{ component: 'bed-planner', needs: 'Weather Feed' }]);
    assert.deepStrictEqual(an.order, ['component-store', 'bed-planner', 'garden-page']);
    const store = all.json.architecture.components.find(x => x.id === 'component-store');
    assert.ok(store.matches.find(m => m.id === 'nexus.lib.component-store'), `loom's real registry offers its own component store: ${JSON.stringify(store.matches)}`);
    const re = await R('POST', `/api/architect/${id}`, { component: { id: 'component-store', reuse: 'nexus.lib.component-store' } });
    assert.strictEqual(re.json.analysis.counts.reuse, 1);
    const add = await R('POST', `/api/architect/${id}`, { component: { add: true, name: 'Weather Feed', layer: 'foundation' } });
    assert.strictEqual(add.json.component.id, 'weather-feed');
    const fix = await R('POST', `/api/architect/${id}`, { component: { id: 'bed-planner', dependsOn: ['component-store', 'weather-feed'] } });
    assert.deepStrictEqual(fix.json.analysis.gaps, [], 'the gap is closed');
    const m = await R('POST', `/api/architect/${id}/match`, {}); assert.ok(m.json.registry > 1000, `loom's registry read: ${m.json.registry}`);
    const s = await R('POST', `/api/architect/${id}/save`, {});
    assert.strictEqual(s.status, 200, JSON.stringify(s.json)); assert.strictEqual(s.json.path, 'spec/orbit-garden.architecture.yaml');
    const file = api.getRepoLayer().readFile(s.json.repoUuid, 'spec/orbit-garden.architecture.yaml');
    const doc = yaml.load(file.content);
    assert.deepStrictEqual(doc.build_order, ['component-store', 'weather-feed', 'bed-planner', 'garden-page']);
    assert.deepStrictEqual(doc.components.find(x => x.id === 'component-store').reuse, { source: 'registry', id: 'nexus.lib.component-store' });
    // from the repo's spec directly
    const fromRepo = await R('POST', '/api/architect', { from: { kind: 'repo', id: s.json.repoUuid } });
    assert.strictEqual(fromRepo.status, 200, JSON.stringify(fromRepo.json)); assert.strictEqual(fromRepo.json.architecture.specPath, 'spec/orbit-garden.spec');
    // refusals
    const lone = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Lonely' })).json.workshop;
    const la = (await R('POST', '/api/architect', { from: { kind: 'workshop', id: lone.uuid } })).json.architecture;
    await R('POST', `/api/architect/${la.uuid}`, { component: { add: true, name: 'Thing' } });
    assert.strictEqual((await R('POST', `/api/architect/${la.uuid}/save`, {})).status, 409, 'its spec is not in a repo yet — said');
    api._setAgentAsk(async () => ({ ok: true, text: 'I think you should build something nice.' }));
    const bad = await R('POST', `/api/architect/${la.uuid}/propose`, {});
    assert.strictEqual(bad.status, 502); assert.match(bad.json.error, /without a single COMPONENT line/);
    assert.strictEqual((await R('POST', '/api/architect', { from: { kind: 'nope' } })).status, 400);
    assert.strictEqual((await R('GET', '/api/architect/nope')).status, 404);
    api._setAgentAsk(null);
  });

  await test('AR-08', 'the page and the shell', () => {
    const page = fs.readFileSync(path.join(ROOT, 'idearium/ui/architect.html'), 'utf8');
    assert.match(page, /href="css\/void-theme\.css"/); assert.match(page, /src="js\/void-sky\.js"/); assert.match(page, /<title>THE ARCHITECT<\/title>/); assert.match(page, /data-title="THE ARCHITECT"/);
    const tips = [...page.matchAll(/title="([^"$]*)"/g)].map(m => m[1]).filter(t => /[a-z]/.test(t));
    assert.deepStrictEqual(tips, [], 'no lowercase tooltip');
    const code = page.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(!/\bprompt\(|\bconfirm\(/.test(code), 'no browser prompt()/confirm()');
    assert.match(page, /const LAYERS = \['FOUNDATION', 'LIBRARY', 'SERVICE', 'INTERFACE'\]/);
    for (const st of ['OPENING THE ARCHITECT', 'THE ARCHITECT IS UNREACHABLE']) assert.ok(page.includes(st), st);
    const A_ = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.match(A_, /cleanUrl === '\/architect\.html'/);
    for (const act of ['architect.list', 'architect.create', 'architect.propose', 'architect.decide', 'architect.save']) assert.match(A_, new RegExp(`'${act.replace('.', '\\.')}':\\s*CAPS\\.`));
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/ui/workshop.html'), 'utf8'), /\/architect\.html\?from=\$\{encodeURIComponent\('workshop:' \+ W\.uuid\)\}/, 'the workshop opens the next station');
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8'), /onclick="openArchitect\(\)"/);
    const cli = fs.readFileSync(path.join(ROOT, 'idearium/cli/index.js'), 'utf8');
    for (const c of ['list', 'new', 'show', 'propose', 'accept', 'add', 'reuse', 'save']) assert.match(cli, new RegExp(`async 'architect\\.${c}'`));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
