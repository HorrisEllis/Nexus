'use strict';
// tests/modules/test-registry-drives-build.test.js — 0.39.309 SB12, docs/2026-10-05-build-from-the-spec-phasemap.spec.
// James: "Each block is then chunked, then each component is chunked. Using the register as a dependancy and file
// check list." · "wire it up."
//
//   RD-01  parseRegistry: a valid components list; a missing end, a self-edge, an upward lean, a cycle, an unsafe path
//          and no list at all are each said, never dropped
//   RD-02  toPlan → createFileTreeSpec: one file per component, each waiting on exactly the files its wires name
//   RD-03  checklist: missing, unparsed and extra files against the promise
//   RD-04  the registry section's prompt asks for the components list
//   RD-05  the real router: codegen plans FROM the registry (no agent asked), keeps it on the code spec, and verify
//          reports the promised files that are missing; a spec with no usable registry says why
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '../..');
let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

const REGISTRY = [
  '## Component Registry',
  '',
  'The song maker is a clock, a pattern store, a sequencer and the page that plays them.',
  '',
  '```yaml',
  'components:',
  '  - id: song.kernel.clock',
  '    file: src/kernel/clock.js',
  '    layer: kernel',
  '    purpose: the tempo every part follows',
  '  - id: song.kernel.pattern',
  '    file: src/kernel/pattern.js',
  '    layer: kernel',
  '    purpose: a 16-step pattern',
  '  - id: song.engine.sequencer',
  '    file: src/engine/sequencer.js',
  '    layer: engine',
  '    depends_on: [song.kernel.clock]',
  '    exports: [createSequencer]',
  '    emits: [step]',
  '  - id: song.runtime.app',
  '    file: src/app.js',
  '    layer: runtime',
  '    depends_on: [src/engine/sequencer.js, src/kernel/pattern.js]',
  '  - id: song.test.sequencer',
  '    file: test/sequencer.test.js',
  '    layer: test',
  '    depends_on: [song.engine.sequencer]',
  '```',
].join('\n');

async function main() {
  const RP = require(path.join(ROOT, 'lib/registry-plan.js'));
  const se = (await imp('idearium/spec-engine/index.js')).default;

  await test('RD-01', 'parseRegistry: the components, and every problem said', () => {
    const ok = RP.parseRegistry(REGISTRY);
    assert.deepStrictEqual(ok.problems, []);
    assert.deepStrictEqual(ok.components.map(c => c.file), ['src/kernel/clock.js', 'src/kernel/pattern.js', 'src/engine/sequencer.js', 'src/app.js', 'test/sequencer.test.js']);
    assert.deepStrictEqual(ok.components[2].dependsOn, ['src/kernel/clock.js'], 'a dependency by id resolves to its file');
    assert.deepStrictEqual(ok.components[3].dependsOn, ['src/engine/sequencer.js', 'src/kernel/pattern.js'], 'by file too');
    assert.deepStrictEqual(ok.components[2].emits, ['step']);
    const y = (body) => '```yaml\ncomponents:\n' + body + '\n```';
    assert.match(RP.parseRegistry(y('  - {file: a.js, layer: kernel, depends_on: [nope.js]}')).problems[0], /not a component/);
    assert.match(RP.parseRegistry(y('  - {file: a.js, layer: kernel, depends_on: [a.js]}')).problems[0], /itself/);
    assert.match(RP.parseRegistry(y('  - {file: a.js, layer: kernel, depends_on: [b.js]}\n  - {file: b.js, layer: runtime}')).problems[0], /lower layer leaning on a higher/);
    const cyc = RP.parseRegistry(y('  - {file: a.js, layer: kernel, depends_on: [b.js]}\n  - {file: b.js, layer: kernel, depends_on: [a.js]}'));
    assert.match(cyc.problems.join(' '), /cycle/); assert.strictEqual(cyc.components.length, 0, 'a cycle is not built');
    assert.match(RP.parseRegistry(y('  - {file: ../etc/x.js, layer: kernel}')).problems[0], /unsafe/);
    assert.match(RP.parseRegistry(y('  - {file: a.js, layer: middle}')).problems[0], /not one of/);
    assert.match(RP.parseRegistry('just prose about the parts').problems[0], /no `components:` list/);
  });

  await test('RD-02', 'toPlan → the code spec: one file per component, waiting on exactly its wires', async () => {
    const plan = RP.toPlan(RP.parseRegistry(REGISTRY).components);
    assert.strictEqual(plan.planSource, 'registry'); assert.strictEqual(plan.files.length, 5);
    const m = await quiet(() => se.createFileTreeSpec({ name: 'song maker · code', plan }));
    const sid = (p) => m.chunks.find(c => c.realPath === p).sectionId;
    const dep = (p) => (m.chunks.find(c => c.realPath === p).dependsOn || []).slice().sort();
    assert.deepStrictEqual(dep('src/engine/sequencer.js'), [sid('src/kernel/clock.js')], 'the sequencer waits on the clock only — not on every kernel file');
    assert.deepStrictEqual(dep('src/app.js'), [sid('src/engine/sequencer.js'), sid('src/kernel/pattern.js')].sort());
    assert.deepStrictEqual(dep('src/kernel/clock.js'), []);
    assert.deepStrictEqual(m.fileTree.files.find(f => f.path === 'src/app.js').dependsOn, ['src/engine/sequencer.js', 'src/kernel/pattern.js']);
    // a plan without dependsOn keeps the layer rule (every existing caller)
    const old = await quiet(() => se.createFileTreeSpec({ name: 'layer rule', plan: { files: [{ path: 'k.js', layer: 'kernel' }, { path: 'e.js', layer: 'engine' }] } }));
    assert.strictEqual(old.chunks.find(c => c.realPath === 'e.js').dependsOn.length, 1);
  });

  await test('RD-03', 'checklist: missing, unparsed and extra files against the promise', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-check-'));
    const comps = RP.parseRegistry(REGISTRY).components;
    fs.mkdirSync(path.join(dir, 'src/kernel'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/kernel/clock.js'), 'module.exports = { bpm: 120 };\n');
    fs.writeFileSync(path.join(dir, 'src/kernel/pattern.js'), 'module.exports = { steps: [ ;\n');
    fs.writeFileSync(path.join(dir, 'src/notes.js'), '// not in the registry\n');
    fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'test/sequencer.test.js'), '   \n');   // what materialize writes for an unbuilt chunk
    const cl = RP.checklist(comps, dir);
    assert.strictEqual(cl.ok, false);
    assert.deepStrictEqual(cl.missing, ['src/engine/sequencer.js', 'src/app.js', 'test/sequencer.test.js']);
    assert.deepStrictEqual(cl.unparsed.map(u => u.file), ['src/kernel/pattern.js']);
    assert.deepStrictEqual(cl.extra, ['src/notes.js']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test('RD-04', 'the registry section\'s prompt asks for the components list', async () => {
    const m = await quiet(() => se.createSpec({ name: 'song maker' }));
    const p = se.buildChunkPrompt(m, m.chunks.find(c => c.sectionId === 'registry'));
    assert.match(p, /components:/); assert.match(p, /depends_on:/); assert.match(p, /layer: kernel \| engine \| runtime \| test/);
    assert.ok(!/components:/.test(se.buildChunkPrompt(m, m.chunks.find(c => c.sectionId === 'schema'))), 'only the registry section');
  });

  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await imp('idearium/api/index.js');
  const R = (m, p, b) => quiet(() => api._route(m, p, b));

  await test('RD-05', 'the router: codegen builds from the registry; verify checks the promise', async () => {
    const doc = await quiet(() => se.createSpec({ name: `song maker ${Date.now()}`, description: 'a small song maker', templateIds: [] }));
    for (const c of doc.chunks) await quiet(() => se.completeChunk(doc.uuid, c.uuid, c.sectionId === 'registry' ? REGISTRY : `The ${c.sectionTitle} of the song maker, written out in full for the test.`));
    const g = await R('POST', `/api/spec-engine/specs/${doc.uuid}/codegen`, {});
    assert.strictEqual(g.status, 200, JSON.stringify(g.json).slice(0, 400));
    // §0.39.359 SB31 — the code repo is the skeleton with the registry slotted in, still with no agent asked
    assert.strictEqual(g.json.plan.planSource, 'skeleton + registry', 'planned from the registry into the skeleton, no agent asked');
    assert.deepStrictEqual(g.json.plan.slot.components.length, 4, 'every non-test component slotted in');
    assert.deepStrictEqual(g.json.registry, { used: true, components: 5, problems: [] });
    const code = se.loadSpec(g.json.manifest.uuid);
    assert.strictEqual(code.registry.length, 5, 'the registry rides on the code spec — the checklist');
    const paths = code.chunks.map(c => c.realPath);
    for (const f of ['src/app.js', 'src/engine/sequencer.js', 'src/kernel/clock.js', 'src/kernel/pattern.js', 'test/sequencer.test.js', 'server.js', 'registry-components.js', 'lib/node-index.js']) assert.ok(paths.includes(f), f);
    const pending = code.chunks.filter(c => c.status !== 'complete').map(c => c.realPath).sort();
    assert.deepStrictEqual(pending, ['src/app.js', 'src/engine/sequencer.js', 'src/kernel/clock.js', 'src/kernel/pattern.js', 'test/sequencer.test.js'], 'only the registry\'s files are left to build — the skeleton and the slot\'s nodes are written');
    assert.strictEqual(code.chunks.find(c => c.realPath === 'src/app.js').file.layer, 'runtime', 'a slotted file keeps its registry layer');
    assert.ok(g.json.repoUuid, 'its repo');
    const v = await R('POST', `/api/repos/${g.json.repoUuid}/verify`, {});
    const body = v.json.verify || v.json;
    const reg = (body.failures || []).filter(f => f.kind === 'registry').map(f => f.file).sort();
    assert.deepStrictEqual(reg, ['src/app.js', 'src/engine/sequencer.js', 'src/kernel/clock.js', 'src/kernel/pattern.js', 'test/sequencer.test.js'], JSON.stringify(body).slice(0, 400));
    assert.strictEqual(body.verdict, 'failed');
    assert.ok(body.byFile && body.byFile['src/app.js'], 'each missing file is in byFile — what the prove loop sends back to be built');

    // no usable registry → the agent planner, and the reason is said
    const doc2 = await quiet(() => se.createSpec({ name: `prose only ${Date.now()}`, templateIds: [] }));
    for (const c of doc2.chunks) await quiet(() => se.completeChunk(doc2.uuid, c.uuid, `The ${c.sectionTitle}, prose only.`));
    const g2 = await R('POST', `/api/spec-engine/specs/${doc2.uuid}/codegen`, {});
    const reg2 = g2.json.registry || (g2.json.detail && g2.json.detail.registry) || {};   // 200 when an agent planned; 422 (detail) when none could
    assert.strictEqual(reg2.used, false, JSON.stringify(g2.json).slice(0, 300));
    assert.match((reg2.problems || []).join(' '), /no `components:` list/);
  });

  await test('RD-06', '0.47.0 SP3 — a spec that becomes complete plans its file tree by itself, from its registry (the spine); said in the log', async () => {
    const doc = await quiet(() => se.createSpec({ name: `auto tree ${Date.now()}`, description: 'a small song maker', templateIds: [] }));
    for (const c of doc.chunks) {   // through the real route — the path a build lands on
      const r = await R('POST', `/api/spec-engine/specs/${doc.uuid}/chunk/${c.uuid}/complete`, { content: c.sectionId === 'registry' ? REGISTRY : `The ${c.sectionTitle} of the song maker, written out in full for the test.` });
      assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 200));
    }
    let after = null;
    for (let i = 0; i < 60 && !(after && after.codeSpecUuid); i++) { await new Promise(x => setTimeout(x, 250)); after = se.loadSpec(doc.uuid); }
    assert.ok(after && after.codeSpecUuid, 'no code spec was planned on completion');
    const code = se.loadSpec(after.codeSpecUuid);
    const paths = code.fileTree.files.map(f => f.path);
    for (const want of ['src/kernel/clock.js', 'src/kernel/pattern.js']) assert.ok(paths.includes(want), `${want} not in the planned tree`);
    assert.ok(paths.some(p => /registry-components\.js$/.test(p)), 'the skeleton registry (the spine) is in the tree');
    const AL = require(path.join(ROOT, 'lib/activity-log/compartment.js'));
    const repoUuid = (await R('GET', '/api/repos')).json.repos.find(x => x.specUuid === after.codeSpecUuid);
    const rows = AL.list(repoUuid ? repoUuid.uuid : doc.uuid, { kind: 'spec', limit: 10 });
    assert.ok((rows.rows || rows).some(x => x.kind === 'spec.filetree'), 'the plan is said in the activity log');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
