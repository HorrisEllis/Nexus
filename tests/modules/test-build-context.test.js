'use strict';
// §0.39.308 — James: "We need the agents to use it. Also what about the .node types. Also combining primitives or
// invariants to build higher leverage code for less tokens." Pins lib/build-context.js: a file's build agent is told
// the interfaces (never the code) of what it builds on, who will use it, its registry relations when it exists,
// proven primitives from OTHER projects (never a failed one, never its own project), the spec's invariants that name
// its subject — within one budget, with what was left out said; and the chunk build sends it.
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

test('BC-008', 'the chunk build sends it: idearium\'s build dispatch packs a file chunk\'s context into its memory channel', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../idearium/api/index.js'), 'utf8');
  assert.ok(/require\('\.\.\/\.\.\/lib\/build-context\.js'\)\.pack\(\{ manifest, chunk, repo, repoDir, buildsOn: !chunk\.file \}\)/.test(src));
  assert.ok(src.includes('memory = [buildCtx.text, memory]'), 'the pack rides in the memory channel, beside the prompt');
  assert.ok(src.includes('buildContext: buildCtx ?'), 'the completion event says what it was told');
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

(async () => {
  for (const { id, desc, fn } of queue) {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
  }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
