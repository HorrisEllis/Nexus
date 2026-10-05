'use strict';
// §0.39.309 — James: "Parse rhe axioms in the docs folder. Do not deviate They are law" · "They need context. All of it.
// From the hat/repo". Adds: the four editable build blocks (renderBuild — enabled only, empty sends nothing, never in a
// chat prompt), the build persona as the edited persona block, hostile inputs (§12.1), the loom map's real wires (rule 3).
// §0.39.308 — James: "We need the agents to use it. Also what about the .node types. Also combining primitives or
// invariants to build higher leverage code for less tokens." Pins lib/build-context.js: a file's build agent is told
// the interfaces (never the code) of what it builds on, who will use it, its registry relations when it exists,
// proven primitives from OTHER projects (never a failed one, never its own project), the spec's invariants that name
// its subject — within one budget, with what was left out said; and the chunk build sends it.
require('../../lib/test-sandbox.js').ensure();   // a test process never writes real data
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const _store = tmp('bc-store-'), _repo = tmp('bc-repo-');
process.env.NEXUS_COMPONENTS_DIR = _store;
process.on('exit', () => { for (const d of [_store, _repo]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } });
const _log = console.log;
console.log = (...a) => { if (/^\[(jaa|component|idearium|spec-engine)\b/i.test(String(a[0] || ''))) return; _log(...a); };

let passed = 0, failed = 0;
const queue = [];
function test(id, desc, fn) { queue.push({ id, desc, fn }); }   // run in order, each awaited (BC-011 imports the ESM spec-engine)

const BC = require('../../lib/build-context.js');
const CS = require('../../lib/component-store.js');

const STATE = `/**\n * The song's state: tempo, tracks and the playhead.\n */\nconst EventEmitter = require('events');\nfunction createState({ tempo = 120 } = {}) { return { tempo, tracks: [], playhead: 0 }; }\nfunction setTempo(state, bpm) { if (bpm <= 0) throw new Error('tempo must be positive'); state.tempo = bpm; return state; }\nmodule.exports = { createState, setTempo };\n`;
const CLOCK = `/** The transport clock: ticks at the song's tempo. */\nfunction startClock(state, onTick) { return setInterval(() => onTick(state.playhead++), 60000 / state.tempo); }\nmodule.exports = { startClock };\n`;
const chunk = (id, p, layer, purpose, extra = {}) => ({ uuid: `u-${id}`, sectionId: id, realPath: p, file: { path: p, layer, purpose }, status: 'pending', dependsOn: [], ...extra });
const manifest = () => ({
  uuid: 'spec-daw', name: 'daw for my girl · code',
  description: 'A small DAW. The tempo MUST always be a positive number of beats per minute. The playhead never moves backwards. Every track must have a name. The UI is dark.',
  chunks: [
    chunk('state', 'src/kernel/state.js', 'kernel', 'the song state: tempo, tracks, playhead', { status: 'complete', content: STATE }),
    chunk('clock', 'src/kernel/clock.js', 'kernel', 'the transport clock ticking at the tempo', { status: 'complete', content: CLOCK }),
    chunk('mixer', 'src/kernel/mixer.js', 'kernel', 'mixes tracks', { status: 'pending' }),
    chunk('transport', 'src/engine/transport.js', 'engine', 'play, stop and seek the playhead at the song tempo', { dependsOn: ['state', 'clock', 'mixer'] }),
    chunk('ui', 'src/ui/controls.js', 'ui', 'the play and stop buttons', { dependsOn: ['transport'] }),
  ],
});

test('BC-001', 'BUILDS ON: the built dependencies as interfaces + glyphs, never their code; an unbuilt one is not invented', () => {
  const m = manifest();
  const r = BC.pack({ manifest: m, chunk: m.chunks[3], stored: false });
  assert.ok(r.text.includes('BUILDS ON'), r.text);
  assert.ok(r.text.includes('src/kernel/state.js') && r.text.includes('exports: createState, setTempo'), r.text);
  assert.ok(r.text.includes('src/kernel/clock.js') && r.text.includes('exports: startClock'), r.text);
  assert.ok(/glyph: .*setTempo/.test(r.text), 'a glyph line names what the dependency defines');
  assert.ok(!r.text.includes('state.tempo = bpm'), 'no dependency code is pasted');
  assert.ok(!r.text.includes('src/kernel/mixer.js'), 'a pending dependency is not described as built');
  assert.strictEqual(r.sections.buildsOn, 2);
});

test('BC-002', 'USED BY: the files that depend on this one, so it exports what they need', () => {
  const m = manifest();
  const r = BC.pack({ manifest: m, chunk: m.chunks[3], stored: false });
  assert.ok(r.text.includes('USED BY') && r.text.includes('src/ui/controls.js — the play and stop buttons'), r.text);
});

test('BC-003', 'INVARIANTS: the spec\'s obligations that name this file\'s subject, and not the ones that do not', () => {
  const m = manifest();
  const r = BC.pack({ manifest: m, chunk: m.chunks[3], stored: false });
  assert.ok(r.text.includes('INVARIANTS'), r.text);
  assert.ok(r.text.includes('The tempo MUST always be a positive number'), r.text);
  assert.ok(r.text.includes('The playhead never moves backwards'), r.text);
  assert.ok(!r.text.includes('The UI is dark'), 'a sentence with no obligation is not an invariant');
});

test('BC-004', 'PRIMITIVES: a proven component from another project, by interface; never its own project, never a failed one', () => {
  const other = `/** A transport: play, stop and seek a playhead against a tempo clock. */\nfunction play(t) { t.playing = true; }\nfunction stop(t) { t.playing = false; }\nfunction seek(t, pos) { if (pos < 0) throw new Error('no'); t.playhead = pos; }\nmodule.exports = { play, stop, seek };\n`;
  CS.put({ project: 'drum machine', path: 'src/engine/transport.js', content: other, contract: { path: 'src/engine/transport.js', layer: 'engine', purpose: 'transport' } });
  CS.put({ project: 'daw for my girl · code', path: 'src/engine/transport-old.js', content: other.replace('seek', 'seekOwn'), contract: { path: 'src/engine/transport-old.js', layer: 'engine', purpose: 'transport' } });
  const bad = `/** A broken transport playhead tempo. */\nmodule.exports = { brokenPlay() {} };\n`;
  CS.put({ project: 'bad synth', path: 'src/engine/transport.js', content: bad, contract: { path: 'src/engine/transport.js', layer: 'engine', purpose: 'transport' } });
  CS.markFailed({ project: 'bad synth', path: 'src/engine/transport.js', content: bad });
  const m = manifest();
  const r = BC.pack({ manifest: m, chunk: m.chunks[3] });
  assert.ok(r.text.includes('PROVEN PRIMITIVES'), r.text);
  assert.ok(/store:drum-machine\.[^\s]+@1\.0\.\d+/.test(r.text) && r.text.includes('exports: play, stop, seek'), r.text);
  assert.ok(!r.text.includes('t.playing = true'), 'a stored component\'s bytes are never injected');
  assert.ok(!r.text.includes('seekOwn'), 'its own project\'s components are BUILDS ON\'s, not primitives');
  assert.ok(!r.text.includes('brokenPlay'), 'a version that failed verification is never offered');
  const off = BC.pack({ manifest: m, chunk: m.chunks[3], stored: false });
  assert.ok(!off.text.includes('PROVEN PRIMITIVES') && off.sources.primitives === 'off');
});

test('BC-005', 'RELATIONS: when the file exists in the repo, its registry card — requires, one level further, required by, events', () => {
  const w = (p, t) => { fs.mkdirSync(path.dirname(path.join(_repo, p)), { recursive: true }); fs.writeFileSync(path.join(_repo, p), t); };
  w('src/kernel/state.js', STATE);
  w('src/kernel/clock.js', `const { createState } = require('./state');\nmodule.exports = { startClock() {} };\n`);
  w('src/engine/transport.js', `const { startClock } = require('../kernel/clock');\nfunction play(bus) { bus.emit('transport:play'); }\nmodule.exports = { play };\n`);
  w('src/ui/controls.js', `const { play } = require('../engine/transport');\nbus.on('transport:play', () => {});\n`);
  const file = (p) => ({ id: `file:${p}`, kind: 'file', file: p });
  const edge = (a, b) => ({ from: `file:${a}`, to: `file:${b}`, kind: 'imports', resolution: 'resolved' });
  fs.writeFileSync(path.join(_repo, 'graph.json'), JSON.stringify({
    nodes: ['src/kernel/state.js', 'src/kernel/clock.js', 'src/engine/transport.js', 'src/ui/controls.js'].map(file),
    edges: [edge('src/kernel/clock.js', 'src/kernel/state.js'), edge('src/engine/transport.js', 'src/kernel/clock.js'), edge('src/ui/controls.js', 'src/engine/transport.js')],
  }));
  const m = manifest();
  const r = BC.pack({ manifest: m, chunk: m.chunks[3], repo: { uuid: 'r1' }, repoDir: _repo, stored: false });
  assert.ok(r.text.includes('RELATIONS'), JSON.stringify(r.sources));
  assert.ok(r.text.includes('requires: src/kernel/clock.js'), r.text);
  assert.ok(r.text.includes('and through them: src/kernel/state.js'), 'the upstream walk goes one level further');
  assert.ok(r.text.includes('required by (keep their imports working): src/ui/controls.js'), r.text);
  assert.ok(r.text.includes('emits transport:play → heard by src/ui/controls.js'), r.text);
  const fresh = BC.pack({ manifest: m, chunk: m.chunks[4], repo: { uuid: 'r1' }, repoDir: path.join(_repo, 'nope'), stored: false });
  assert.ok(!fresh.text.includes('RELATIONS') && typeof fresh.sources.relations === 'string', 'no repo graph → said, not invented');
});

test('BC-006', 'one budget: never exceeded, what was cut is listed; a bottom-layer file passes its share on', () => {
  const m = manifest();
  for (let i = 0; i < 30; i++) m.chunks.push(chunk(`k${i}`, `src/kernel/part${i}.js`, 'kernel', `transport helper ${i} for the playhead`, { status: 'complete', content: `/** helper ${i} */\nmodule.exports = { helper${i}() {} };\n` }));
  m.chunks[3].dependsOn.push(...Array.from({ length: 30 }, (_, i) => `k${i}`));
  const r = BC.pack({ manifest: m, chunk: m.chunks[3], budget: 1500, stored: false });
  assert.ok(r.chars <= 1500 + 260, `${r.chars} chars`);   // the budget + the closing "left out" line
  assert.ok(r.left.length > 0 && r.text.includes('left out for the budget'), 'the cut is said');
  const bottom = BC.pack({ manifest: m, chunk: m.chunks[0], stored: false });
  assert.ok(!bottom.text.includes('BUILDS ON') && bottom.sources.buildsOn.includes('bottom layer'));
  assert.ok(bottom.text.includes('USED BY'), 'still told who will use it');
});

test('BC-007', 'never throws; nothing to say → empty text', () => {
  assert.strictEqual(BC.pack({}).text, '');
  const r = BC.pack({ manifest: { name: 'x', chunks: [] }, chunk: { uuid: 'a', sectionId: 'a', realPath: 'a.js' }, stored: false });
  assert.strictEqual(r.text, '');
});

test('BC-008', 'the chunk build sends it through the editable build blocks, beside the prompt, and says what was sent', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../idearium/api/index.js'), 'utf8');
  const build = src.slice(src.indexOf("case 'speceng.build':"), src.indexOf("case 'speceng.chunk.complete':"));
  assert.ok(/require\('\.\.\/\.\.\/lib\/build-context\.js'\)\.pack\(\{ manifest, chunk, repo, repoDir, buildsOn: !chunk\.file \}\)/.test(build));
  assert.ok(build.includes("PB.enabledBuild(PB.getBlocks(who.repoUuid || null))"), 'only enabled build blocks are searched');
  for (const id of ['build-context', 'build-memory', 'build-atlas', 'build-code']) assert.ok(build.includes(`on.has('${id}')`), `${id} is gated on its block`);
  assert.ok(build.includes('PB.renderBuild(PB.getBlocks(who.repoUuid || null), data)'), 'what is sent is the rendered blocks');
  assert.ok(!/memory = \[buildCtx\.text/.test(build), 'nothing is prepended around the blocks');
  assert.ok(/console\.warn\(`\[idearium\/api\] speceng\.build .*context source\(s\) failed/.test(build), '§1.2 a failed source is said');
  assert.ok(build.includes('buildContext: memoryInfo ?'), 'the completion event says what was sent');
  const tax = require('../../idearium/event-taxonomy.cjs');
  const ev = Object.values(tax.EVENTS || tax).find(e => e && Array.isArray(e.payloadShape) && e.payloadShape.includes('detectionComposite'));
  assert.ok(ev && ev.payloadShape.includes('buildContext'), 'E14: the event declares buildContext');
});

test('BC-012', 'the build blocks: on by default, editable, only the enabled ones with data are sent, never in a chat prompt', () => {
  const PB = require('../../lib/repo-prompt-blocks.js');
  const ids = ['build-memory', 'build-context', 'build-atlas', 'build-code'];
  for (const id of ids) { const b = PB.DEFAULT_BLOCKS.find(x => x.id === id); assert.ok(b && b.enabled && b.when === 'build', id); }
  const all = PB.renderBuild(PB.DEFAULT_BLOCKS, { memory: 'MEM', build: 'REL', atlas: 'ATL', code: 'CODE' });
  assert.deepStrictEqual(all.used, ids);
  assert.ok(all.text.includes('MEM') && all.text.includes('REL') && all.text.includes('ATL') && all.text.includes('CODE'));
  const off = PB.DEFAULT_BLOCKS.map(b => (b.id === 'build-atlas' ? { ...b, enabled: false } : b));
  const r = PB.renderBuild(off, { memory: 'MEM', build: 'REL', atlas: 'ATL', code: '' });
  assert.ok(!r.text.includes('ATL'), 'a block switched off sends nothing');
  assert.ok(!r.text.includes('Code already in this repo'), 'a block with no data sends nothing, not an empty heading');
  assert.ok(!PB.enabledBuild(off).has('build-atlas') && PB.enabledBuild(off).has('build-code'));
  const edited = PB.DEFAULT_BLOCKS.map(b => (b.id === 'build-context' ? { ...b, text: 'MY OWN WORDS\n{build}' } : b));
  assert.ok(PB.renderBuild(edited, { build: 'REL' }).text.startsWith('MY OWN WORDS\nREL'), 'sent exactly as edited');
  const chat = PB.render({ persona: 'P', message: 'hi', backend: 'ollama', memory: 'MEM', atlas: 'ATL' });
  for (const id of ids) assert.ok(!chat.used.includes(id), `${id} never in a chat prompt`);
  for (const id of ids) assert.ok(PB.IDS.includes(id) && (PB.PLACEHOLDERS[id] || []).length === 1, `${id} is editable with its placeholder`);
});

test('BC-013', 'the build persona is the repo\'s persona block as edited — off sends none', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../idearium/api/index.js'), 'utf8');
  const fn = src.slice(src.indexOf('function _personaAsEdited'), src.indexOf('function _buildIdentity'));
  assert.ok(/if \(!b\.enabled\) return '';/.test(fn) && /split\('\{persona\}'\)\.join\(generated\)/.test(fn), fn);
  assert.ok(/personaPrompt: _personaAsEdited\(repo,/.test(src), '_buildIdentity wears it');
});

test('BC-009', 'BUILDS ON walks dependsOn all the way down (a layer names only the nearest one below)', () => {
  const m = manifest();
  m.chunks.push(chunk('pkg', 'package.json', 'runtime', 'the package', { status: 'complete', content: '{"name":"daw"}', dependsOn: ['transport'] }));
  m.chunks[3].status = 'complete'; m.chunks[3].content = 'module.exports = { play() {} };\n';
  const t = chunk('t', 'test/transport.test.js', 'test', 'proves the transport plays', { dependsOn: ['pkg'] });
  m.chunks.push(t);
  const r = BC.pack({ manifest: m, chunk: t, stored: false });
  for (const f of ['package.json', 'src/engine/transport.js', 'src/kernel/state.js', 'src/kernel/clock.js']) assert.ok(r.text.includes(f), `${f} reached through the closure:\n${r.text}`);
  assert.ok(r.text.indexOf('src/engine/transport.js') < r.text.indexOf('src/kernel/state.js'), 'the file the test names comes first');
});

test('BC-010', 'rankFiles: a file the purpose NAMES first, then shared words; interfaceOf never carries code', () => {
  const files = [
    { realPath: 'lib/zeta.js', content: 'module.exports = { z() {} };', file: { layer: 'kernel', purpose: 'unrelated' } },
    { realPath: 'lib/tempo.js', content: 'module.exports = { bpm() { return 1; } };', file: { layer: 'kernel', purpose: 'tempo math' } },
    { realPath: 'lib/index.js', content: 'module.exports = {};', file: { layer: 'kernel', purpose: 'the barrel' } },
  ];
  const r = BC.rankFiles({ realPath: 'src/engine/clock.js', file: { layer: 'engine', purpose: 'ticks using tempo' } }, files);
  assert.strictEqual(r[0].realPath, 'lib/tempo.js');
  const i = BC.interfaceOf(files[1]);
  assert.ok(i.includes('exports: bpm') && !i.includes('return 1'), i);
});

test('BC-011', 'the file prompt: the most relevant files in full, EVERY other lower file by interface — none silently dropped', async () => {
  const { pathToFileURL } = require('url');
  process.env.IDEARIUM_DATA_DIR = tmp('bc-id-');
  const se = await import(pathToFileURL(path.join(__dirname, '../../idearium/spec-engine/index.js')).href);
  const files = [{ path: 'src/engine/transport.js', layer: 'engine', purpose: 'plays the song using state and clock' }];
  for (let i = 0; i < 16; i++) files.push({ path: `src/kernel/part${i}.js`, layer: 'kernel', purpose: `helper ${i}` });
  files.push({ path: 'src/kernel/state.js', layer: 'kernel', purpose: 'the song state' }, { path: 'src/kernel/clock.js', layer: 'kernel', purpose: 'the clock' });
  const m = se.createFileTreeSpec({ name: 'bc-prompt', description: 'x', plan: { planSource: 'test', files } });
  for (const c of m.chunks) if (c.file.layer === 'kernel') { c.status = 'complete'; c.content = `/** ${c.file.purpose} */\nmodule.exports = { ${path.basename(c.realPath, '.js')}Fn() { return 'BODY-${c.realPath}'; } };\n`; }
  const target = m.chunks.find(c => c.realPath === 'src/engine/transport.js');
  const prompt = se.buildChunkPrompt(m, target, '');
  const full = prompt.slice(prompt.indexOf('FILES ALREADY BUILT BELOW THIS LAYER'), prompt.indexOf('THE OTHER FILES BELOW'));
  assert.ok(full.includes('--- src/kernel/state.js') && full.includes('--- src/kernel/clock.js'), 'the files its purpose names are in full');
  assert.strictEqual((full.match(/^--- /gm) || []).length, 3, 'at most 3 in full');
  const rest = prompt.slice(prompt.indexOf('THE OTHER FILES BELOW'));
  assert.strictEqual((rest.match(/^- src\/kernel\/part\d+\.js/gm) || []).length, 15, 'every other kernel file by interface (16 helpers − 1 shown in full)');
  assert.ok(!/BODY-src\/kernel\/part/.test(rest), 'no code in the interface list');
});

test('BC-014', '§12.1 hostile inputs: a dependsOn cycle, null and unicode content, a corrupt graph.json, a corrupt store index, a huge file', () => {
  const m = manifest();
  m.chunks[0].dependsOn = ['transport']; m.chunks[3].dependsOn = ['state'];          // state ↔ transport
  const cyc = BC.pack({ manifest: m, chunk: m.chunks[3], stored: false });
  assert.ok(cyc.text.includes('src/kernel/state.js'), 'the closure stops at the repeat and still answers');
  const m2 = manifest();
  m2.chunks[0].content = null; m2.chunks[1].content = 'module.exports = { tempo: "♩ = 120 — 速度" };\n';
  const u = BC.pack({ manifest: m2, chunk: m2.chunks[3], stored: false });
  assert.ok(!u.text.includes('src/kernel/state.js (kernel)'), 'a null-content dependency is not described as built');
  assert.ok(u.text.includes('src/kernel/clock.js'), 'unicode content is read');
  const bad = tmp('bc-bad-');
  fs.mkdirSync(path.join(bad, 'src/engine'), { recursive: true });
  fs.writeFileSync(path.join(bad, 'src/engine/transport.js'), 'module.exports = {};');
  fs.writeFileSync(path.join(bad, 'graph.json'), '{ not json');
  const g = BC.pack({ manifest: manifest(), chunk: manifest().chunks[3], repo: { uuid: 'bad' }, repoDir: bad, stored: false });
  assert.strictEqual(typeof g.sources.relations, 'string', 'a corrupt graph is named, not thrown');
  const prevIdx = path.join(_store, 'index.json'), keep = fs.existsSync(prevIdx) ? fs.readFileSync(prevIdx, 'utf8') : null;
  fs.writeFileSync(prevIdx, '{ corrupt');
  const c = BC.pack({ manifest: manifest(), chunk: manifest().chunks[3] });
  assert.ok(typeof c.sources.primitives === 'string' || typeof c.sources.primitives === 'number', JSON.stringify(c.sources));
  if (keep !== null) fs.writeFileSync(prevIdx, keep);
  const m3 = manifest();
  m3.chunks[0].content = '/** big */\nmodule.exports = { ' + Array.from({ length: 4000 }, (_, i) => `f${i}() {}`).join(', ') + ' };\n';
  const h = BC.pack({ manifest: m3, chunk: m3.chunks[3], budget: 1200, stored: false });
  assert.ok(h.chars <= 1200 + 260, `${h.chars}`);
  assert.ok(BC.interfaceOf(m3.chunks[0]).length < 2000, 'a huge file\'s interface stays small (14 exports, a clipped glyph)');
});

test('BC-015', 'loom: build-context is mapped with its real require edges and its consumers (CLAUDE.md rule 3), bootstrap runs it', () => {
  const ROOT = path.join(__dirname, '..', '..');
  const { idFor } = require(path.join(ROOT, 'loom/scanners/source-map'));
  const { mapBuildContext, FILES, CONSUMERS, BOUNDARY_IMPORTS } = require(path.join(ROOT, 'loom/maps/build-context-map.js'));
  const src = fs.readFileSync(path.join(ROOT, 'lib/build-context.js'), 'utf8');
  for (const dep of ['lib/chunk-glyph.js', 'lib/registry-harness.js', 'lib/component-store.js']) {
    assert.ok(new RegExp(`require\\('\\./${path.basename(dep, '.js')}\\.js'\\)`).test(src), `build-context really requires ${dep}`);
    assert.ok(FILES[0][2].includes(idFor(dep)), `${dep} is a wire`);
  }
  for (const [consumer, dep, where] of CONSUMERS) {
    const file = where.split(' ')[0];
    const base = path.basename(Object.entries({ [idFor('lib/build-context.js')]: 'lib/build-context.js', [idFor('lib/repo-prompt-blocks.js')]: 'lib/repo-prompt-blocks.js', [idFor('lib/context-atlas.js')]: 'lib/context-atlas.js', [idFor('lib/repo-context.js')]: 'lib/repo-context.js' }).find(([id]) => id === dep)[1], '.js');
    assert.ok(new RegExp(`require\\('[^']*${base}(\\.js)?'\\)`).test(fs.readFileSync(path.join(ROOT, file), 'utf8')), `${file} requires ${base} (${consumer})`);
  }
  assert.deepStrictEqual(BOUNDARY_IMPORTS, ['nexus.idearium.spec-engine']);
  const decl = { component: [], hook: [], wire: [] };
  const out = mapBuildContext({ declare: (k, o) => { decl[k].push(o); return { ok: true }; } });
  assert.strictEqual(out.failures.length, 0);
  assert.strictEqual(decl.component.length, 1);
  assert.strictEqual(decl.wire.length, CONSUMERS.length + FILES[0][2].length);
  assert.ok(decl.component.every(c => /^nexus-loom-map-.*-v1-0000-2026-1005-001$/.test(c.uuid)), 'every component has a UUID (§5.1)');
  const BOOT = fs.readFileSync(path.join(ROOT, 'loom/bootstrap.js'), 'utf8');
  assert.ok(/mapBuildContext\(driver\)/.test(BOOT) && /maps\/build-context-map'\)\.FILES/.test(BOOT));
  const reg = require(path.join(ROOT, 'loom/data/registry.json'));
  const wires = new Set(Object.values(reg.wire).map(w => `${w.from_hook_id} -> ${w.to_hook_id}`));
  for (const [consumer, dep] of CONSUMERS) assert.ok(wires.has(`${dep}.export -> ${consumer}.import`), `registry carries ${dep} → ${consumer}`);
  assert.ok(/UUID: nexus-lib-build-context-v1-/.test(src), 'the module has its UUID (§5.1)');
});

(async () => {
  for (const { id, desc, fn } of queue) {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
  }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
