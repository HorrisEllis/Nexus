'use strict';
// tests/modules/test-nexus-self-and-cos-run.test.js — 0.39.261.
// James: "i want a nexus repo in idearium, that immutable with nested compartments per system so i can
// manage nexus from inside nexus … make sure the graphs are hooked in … the run button in cos to work
// fully, preferably in js … remove as much external dependancies as possible." Mid-build, from his live
// Agent tab: the file_tree tool call "did nothing", the reply showed three times, repos all said
// "building", and "a full idea tab … a tab for debugging … the most compressed semantix for the chunks".
//
//   NS-0xx  immutable store: content-addressed, read-only blobs; snapshots; hard-link checkout
//   NS-1xx  apply gate: scoped, based (conflicts refused), recorded, rollback; branches in COS
//   NS-2xx  nested COS compartments; systems partition the tree
//   RT-0xx  COS runtime: packages resolve from the root (CJS + ESM), ports shift, network is isolated
//   CR-0xx  COS run menu: options + reasons; system tests found by reference
//   TL-0xx  tool calls read from a rendered page (the "tool did nothing" bug)
//   FD-0xx  the Agent feed never triples a reply
//   RP-0xx  repos start 'specced'; Idea + Debug routes; addPhase round-trips through loom
//   GL-0xx  chunk glyphs: compressed, deterministic, used in the agent's context
//   DP-0xx  dependencies replaced in-house: lib/zip.js, lib/micro-http.js, nano-ws port mode
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-self-test-'));
process.env.NEXUS_SELF_DIR = path.join(TMP, 'self');
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

// a small fake Nexus tree: two kernels + core, with a data dir that must be skipped
function fakeTree() {
  const live = fs.mkdtempSync(path.join(TMP, 'live-'));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(live, rel)), { recursive: true }); fs.writeFileSync(path.join(live, rel), text); };
  w('guardian/server.js', "require('../lib/util.js');\nmodule.exports = 1;\n");
  w('guardian/spec/guardian.spec', 'spec:\n  meta:\n    name: guardian\n');
  w('guardian/data/runtime.json', '{"volatile":true}');
  w('cortex/boot.js', 'module.exports = 2;\n');
  w('lib/util.js', 'module.exports = { u: 1 };\n');
  w('package.json', '{"name":"fake"}\n');
  return live;
}

async function main() {
  const store = require('../../lib/nexus-self/store.js');
  const systems = require('../../lib/nexus-self/systems.js');
  const AP = require('../../lib/nexus-self/apply.js');

  // ── NS-0xx store ─────────────────────────────────────────────────────────
  const live = fakeTree();
  let snap1;
  await test('NS-001', 'snapshot stores every file once, skips data/, and groups by owning system', () => {
    snap1 = store.snapshot({ liveRoot: live });
    const s = store.loadSnapshot(snap1.hash);
    const all = store.filesOf(s).map(([p]) => p).sort();
    assert.deepStrictEqual(all, ['cortex/boot.js', 'guardian/server.js', 'guardian/spec/guardian.spec', 'lib/util.js', 'package.json']);
    assert.deepStrictEqual(store.filesOf(s, 'guardian').map(([p]) => p).sort(), ['guardian/server.js', 'guardian/spec/guardian.spec']);
    assert.deepStrictEqual(store.filesOf(s, 'core').map(([p]) => p).sort(), ['lib/util.js', 'package.json']);
  });

  await test('NS-002', 'blobs are content-addressed, read-only, and verified on read', () => {
    const [, sha] = store.filesOf(store.loadSnapshot(snap1.hash), 'cortex')[0];
    const p = store.blobPath(sha);
    assert.strictEqual(store.sha256(fs.readFileSync(p)), sha);
    if (process.platform !== 'win32') assert.strictEqual(fs.statSync(p).mode & 0o222, 0, 'blob must not be writable');
    assert.strictEqual(store.getBlob(sha).toString(), 'module.exports = 2;\n');
  });

  await test('NS-003', 'an unchanged tree re-snapshots to the same hash without re-hashing (index cache)', () => {
    const again = store.snapshot({ liveRoot: live });
    assert.strictEqual(again.hash, snap1.hash);
    assert.strictEqual(again.created, false);
    assert.strictEqual(again.stats.hashed, 0);
  });

  await test('NS-004', 'checkout hard-links the immutable blobs into a working tree', () => {
    const dir = path.join(TMP, 'co');
    const r = store.checkout(snap1.hash, dir);
    assert.strictEqual(r.files, 5);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'lib/util.js'), 'utf8'), 'module.exports = { u: 1 };\n');
  });

  // ── NS-1xx apply gate ────────────────────────────────────────────────────
  await test('NS-101', 'plan refuses a path owned by another system', () => {
    const p = AP.plan({ system: 'guardian', base: snap1.hash, changes: [{ path: 'cortex/boot.js', content: 'x' }], liveRoot: live });
    assert.ok(!p.ok);
    assert.match(p.errors.join(), /belongs to cortex/);
  });

  let applied;
  await test('NS-102', 'apply writes the live file, records before/after, and moves the snapshot', () => {
    applied = AP.apply({ system: 'guardian', base: snap1.hash, changes: [{ path: 'guardian/server.js', content: 'module.exports = 42;\n' }, { path: 'guardian/NEW.md', content: 'new\n' }], reason: 'test', liveRoot: live });
    assert.ok(applied.ok, JSON.stringify(applied));
    assert.strictEqual(fs.readFileSync(path.join(live, 'guardian/server.js'), 'utf8'), 'module.exports = 42;\n');
    assert.notStrictEqual(applied.snapshot, snap1.hash);
    const rec = AP.listApplies().find(a => a.id === applied.applyId);
    assert.strictEqual(rec.status, 'applied');
    assert.deepStrictEqual(rec.items.map(i => i.op).sort(), ['add', 'modify']);
  });

  await test('NS-103', 'an apply against a stale base is a CONFLICT and writes nothing', () => {
    const r = AP.apply({ system: 'guardian', base: snap1.hash, changes: [{ path: 'guardian/server.js', content: 'module.exports = 7;\n' }], liveRoot: live });
    assert.ok(!r.ok);
    assert.strictEqual(r.conflicts[0].path, 'guardian/server.js');
    assert.strictEqual(fs.readFileSync(path.join(live, 'guardian/server.js'), 'utf8'), 'module.exports = 42;\n');
  });

  await test('NS-104', 'rollback restores the before-blobs and removes added files', () => {
    const r = AP.rollback(applied.applyId, { liveRoot: live });
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(fs.readFileSync(path.join(live, 'guardian/server.js'), 'utf8'), "require('../lib/util.js');\nmodule.exports = 1;\n");
    assert.ok(!fs.existsSync(path.join(live, 'guardian/NEW.md')));
    assert.strictEqual(store.head().hash, snap1.hash, 'the tree is back to the first snapshot');
  });

  // ── NS-2xx compartments + systems ────────────────────────────────────────
  await test('NS-201', 'COS compartments nest: parentId on the child, childIds on the parent, tree() walks it', () => {
    const cb = require('../../lib/cos-bridge.js');
    const p = cb.createCompartment({ name: `ns-parent-${Date.now()}` });
    assert.ok(p.ok, p.error);
    const c = cb.createCompartment({ name: `ns-child-${Date.now()}`, parentId: p.compartment.id });
    assert.ok(c.ok, c.error);
    assert.strictEqual(c.compartment.parentId, p.compartment.id);
    assert.ok(cb.getCompartment(p.compartment.id).childIds.includes(c.compartment.id));
    const t = cb.tree(p.compartment.id);
    assert.strictEqual(t.children[0].id, c.compartment.id);
    const bad = cb.createCompartment({ name: `ns-orphan-${Date.now()}`, parentId: 'no-such-compartment' });
    assert.ok(!bad.ok && /parent compartment/.test(bad.error));
  });

  await test('NS-202', 'every autopilot kernel is a system; ownership is total and exclusive', () => {
    for (const n of ['orchestrator', 'cortex', 'guardian', 'idearium', 'architect', 'diagnostic', 'eravos', 'intelligence', 'ollama-bridge', 'versionium', 'copilot', 'loom', 'clear-glass', 'core']) assert.ok(systems.get(n), n);
    assert.strictEqual(systems.ownerOf('ollama/server.js'), 'ollama-bridge');
    assert.strictEqual(systems.ownerOf('lib/x.js'), 'core');
    assert.ok(systems.skipped('idearium/repo/repos', true) && systems.skipped('guardian/data', true));
  });

  await test('NS-203', 'edits happen on a COS branch; changes are diffed against the immutable base', () => {
    const cb = require('../../lib/cos-bridge.js');
    const NSB = require('../../lib/nexus-self/branch.js');
    const comp = cb.createCompartment({ name: `ns-guardian-${Date.now()}` }).compartment;
    const br = NSB.create({ system: 'guardian', compartment: comp, base: snap1.hash });
    assert.ok(NSB.writeFile(br, 'guardian/server.js', 'changed\n').ok);
    assert.ok(NSB.writeFile(br, 'cortex/boot.js', 'x').error, 'a guardian branch cannot edit cortex');
    const ch = NSB.changes(br);
    assert.deepStrictEqual(ch.map(c => `${c.op} ${c.path}`), ['modify guardian/server.js']);
    const ws = NSB.workspace(br);
    assert.strictEqual(fs.readFileSync(path.join(ws.dir, 'guardian/server.js'), 'utf8'), 'changed\n');
    assert.strictEqual(fs.readFileSync(path.join(ws.dir, 'lib/util.js'), 'utf8'), 'module.exports = { u: 1 };\n', 'the rest of the tree is the base');
    fs.rmSync(ws.dir, { recursive: true, force: true });
  });

  // ── RT-0xx runtime ───────────────────────────────────────────────────────
  const RT = require('../../cos/runtime/run.js');
  const rtDir = fs.mkdtempSync(path.join(TMP, 'rt-'));
  fs.writeFileSync(path.join(rtDir, 'cjs.js'), "const y = require('js-yaml'); console.log(typeof y.load);");
  fs.writeFileSync(path.join(rtDir, 'esm.mjs'), "import * as y from 'js-yaml'; console.log(typeof y.load);");
  fs.writeFileSync(path.join(rtDir, 'srv.js'), "const s = require('http').createServer((q, r) => r.end('{\"ok\":true}')).listen(7820, '127.0.0.1', () => { require('http').get('http://127.0.0.1:9000/', () => console.log('LEAK')).on('error', e => console.log('blocked', e.code)); });");
  fs.writeFileSync(path.join(rtDir, 'bad.js'), 'const = 1;');

  await test('RT-001', 'a bare package resolves from the Nexus root, CommonJS and ESM, with no install', async () => {
    for (const f of ['cjs.js', 'esm.mjs']) {
      const r = await RT.runNode({ cwd: rtDir, file: f });
      assert.ok(r.passed, `${f}: ${r.stderr}`);
      assert.strictEqual(r.stdout.trim(), 'function');
    }
  });

  await test('RT-002', 'listen() is port-shifted and outbound connections to other ports are refused', async () => {
    const r = await RT.bootProbe({ cwd: rtDir, file: 'srv.js', expectPort: 7820, bootTimeoutMs: 15000 });
    assert.ok(r.health.ok, JSON.stringify(r.health));
    assert.strictEqual(r.health.port.requested, 7820);
    assert.notStrictEqual(r.health.port.actual, 7820);
    assert.ok(r.refused.includes('127.0.0.1:9000'), `refused: ${r.refused}`);
    assert.ok(!/LEAK/.test(r.stdout));
  });

  await test('RT-003', 'syntax check parses in one process and names the broken file', async () => {
    const r = await RT.syntaxCheck(rtDir);
    const bad = r.results.filter(x => !x.ok).map(x => x.file);
    assert.deepStrictEqual(bad, ['bad.js']);
  });

  await test('RT-004', 'dependency resolution classifies builtin / nexus / missing, and ignores run-time specifiers', () => {
    fs.writeFileSync(path.join(rtDir, 'deps.js'), "require('fs'); require('js-yaml'); require('left-pad-not-here'); require(`./${x}`); require('./nope');");
    const r = RT.resolveDeps(rtDir, { files: ['deps.js'] });
    const via = Object.fromEntries(r.packages.map(p => [p.name, p.via]));
    assert.strictEqual(via.fs, 'builtin'); assert.strictEqual(via['js-yaml'], 'nexus'); assert.strictEqual(via['left-pad-not-here'], 'missing');
    assert.deepStrictEqual(r.brokenRelative.map(b => b.specifier), ['./nope']);
  });

  // ── CR-0xx run menu ──────────────────────────────────────────────────────
  const CR = require('../../lib/cos-run.js');
  await test('CR-001', 'the menu offers every option and says why an option cannot run', () => {
    const opts = CR.options({ uuid: 'x' }, rtDir);
    const ids = opts.map(o => o.id);
    for (const id of ['run.entry', 'run.file', 'boot.probe', 'test.all', 'test.file', 'check.syntax', 'check.deps', 'script.run', 'test.vm']) assert.ok(ids.includes(id), id);
    for (const o of opts) if (!o.available) assert.ok(o.reason, `${o.id} is unavailable without a reason`);
  });

  await test('CR-002', "a Nexus system's tests are found by what they reference, not only where they live", () => {
    const repoTests = CR.testsFor({ nexusSelf: { role: 'system', system: 'guardian', snapshot: store.snapshot({ liveRoot: ROOT }).hash } });
    assert.ok(repoTests.includes('tests/modules/test-back-and-forth.test.js'), 'a tests/ file that requires guardian code is a guardian test');
  });

  // ── TL-0xx tool calls ────────────────────────────────────────────────────
  await test('TL-001', 'a tool call read from a RENDERED page (label line + JSON, no fence) is a call', () => {
    const T = require('../../copilot/tool-runtime.js');
    const r = T._findToolCalls('Let us look first.\n\ntool\n{"name":"file_tree","arguments":{}}', ['file_tree', 'read_file']);
    assert.deepStrictEqual(r.calls.map(c => c.name), ['file_tree']);
    assert.strictEqual(r.text, 'Let us look first.');
    assert.deepStrictEqual(T._findToolCalls('{"name":"rm_rf","arguments":{}}', ['file_tree']).calls, [], 'an unknown name is not a call');
    assert.deepStrictEqual(T._findToolCalls('config {"name": "bob", "age": 3}', ['file_tree']).calls, [], 'ordinary JSON is not a call');
  });

  await test('TL-002', 'the loop runs the tool and sends its result back (the live "tool did nothing" case)', async () => {
    const T = require('../../copilot/tool-runtime.js');
    const repo = fs.mkdtempSync(path.join(TMP, 'tree-'));
    fs.mkdirSync(path.join(repo, 'src')); fs.writeFileSync(path.join(repo, 'src/a.js'), '1');
    let n = 0; const sent = [];
    const dispatch = async (p) => { sent.push(p); n++; return n === 1 ? { ok: true, text: 'tool\n{"name":"file_tree","arguments":{}}' } : { ok: true, text: 'done' }; };
    const r = await T.runViaAgent('chatgpt', dispatch, 'expand', { composed: true, context: { repoDir: repo }, maxIterations: 3 });
    assert.strictEqual(n, 2);
    assert.match(sent[1], /src\/a\.js/);
    assert.strictEqual(r.text, 'done');
  });

  // ── FD-0xx feed ──────────────────────────────────────────────────────────
  await test('FD-001', 'the Agent feed shows one reply when a job is streamed by two readers (the tripled reply)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    const fn = src.match(/function _agentFeedIn\(p\) \{[\s\S]*?\n\}/)[0];
    const state = { rows: [] };
    const ctx = { AGENT_FEED_MAX: 200, CURRENT_API_REPO: null, _agentFeedState: () => state, _agentFeedPaint: () => {} };
    vm.createContext(ctx); vm.runInContext(fn + '\nthis.f = _agentFeedIn;', ctx);
    const full = 'Hello again, James. MASTERMIND remains in scope. Still no index assumed, still none performed.';
    ctx.f({ repoUuid: 'r', jobId: 'j', event: 'chunk', text: full.slice(0, 60), fullLen: 60, source: 'transcript' });
    ctx.f({ repoUuid: 'r', jobId: 'j', event: 'chunk', text: full.slice(60), fullLen: full.length, source: 'transcript' });
    ctx.f({ repoUuid: 'r', jobId: 'j', event: 'chunk', text: full, fullLen: full.length });            // the watch restating it
    ctx.f({ repoUuid: 'r', jobId: 'j', event: 'chunk', text: full.slice(-20), fullLen: full.length });  // a repeat of the tail
    assert.strictEqual(state.text, full);
  });

  await test('FD-002', "every userscript's watch marks its first chunk for a job as a reset", () => {
    for (const p of ['chatgpt', 'claude', 'gemini', 'perplexity', 'deepseek']) {
      const s = fs.readFileSync(path.join(ROOT, `guardian/userscript-${p}.js`), 'utf8');
      assert.ok(s.includes("const _first = typeof _txWatchStreamed === 'undefined' || _txWatchStreamed !== jobId;"), p);
    }
  });

  // ── RP-0xx repos, idea, debug ────────────────────────────────────────────
  await test('RP-001', "addPhase writes a phase loom's parser reads back, with its dependency", async () => {
    const R = await import('../../idearium/repo/roadmap.js');
    const a = R.addPhase({ title: 'Index the vocabulary' });
    const b = R.addPhase({ text: a.text, title: 'Expand canvas events', dependsOn: [a.id] });
    const rm = R.buildRoadmap({ projectId: 'x', maps: [{ path: 'roadmap-phasemap.spec', text: b.text }] });
    assert.deepStrictEqual(rm.phases.map(p => p.phase_key), [a.id, b.id]);
    assert.strictEqual(rm.phases[1].blocked_by.length, 1);
  });

  await test('RP-002', "a new repo starts 'specced', and the idea it came from becomes its idea", async () => {
    const se = await import('../../idearium/spec-engine/index.js');
    const { RepoLayer } = await import('../../idearium/repo/index.js');
    const ideas = [{ uuid: 'idea-1', text: 'grow a canvas', phase: 'seed', tags: [] }];
    const rl = new RepoLayer({ specEngine: se, ideaOS: { db: { ideas } } });
    const r = rl.ingest({ name: 'rp-002', files: [{ path: 'a.js', content: 'x=1\n' }], ideaUuid: 'idea-1' });
    assert.ok(!r.error, r.error);
    assert.strictEqual(r.repo.phase, 'specced');
    assert.strictEqual(r.repo.ideaUuid, 'idea-1');
    assert.strictEqual(ideas[0].phase, 'specced');
    const r2 = rl.ingest({ name: 'rp-002b', files: [{ path: 'b.js', content: 'y=2\n' }] });
    assert.strictEqual(r2.repo.phase, 'specced', "no repo is 'building' just for existing");
  });

  await test('RP-003', 'an immutable repo refuses writes, deletes and forks through RepoLayer', async () => {
    const se = await import('../../idearium/spec-engine/index.js');
    const { RepoLayer } = await import('../../idearium/repo/index.js');
    const rl = new RepoLayer({ specEngine: se });
    const r = rl.ingest({ name: 'rp-003', files: [{ path: 'a.js', content: 'x=1\n' }] });
    rl.annotate(r.repo.uuid, { immutable: true, nexusSelf: { role: 'system', system: 'guardian' } });
    for (const out of [rl.writeFile(r.repo.uuid, 'a.js', 'y'), rl.deleteFile(r.repo.uuid, 'a.js'), rl.fork(r.repo.uuid, 'f'), rl.writeTextFile(r.repo.uuid, 'a.js', 'z')]) assert.strictEqual(out.code, 'IMMUTABLE');
  });

  // ── GL-0xx glyphs ────────────────────────────────────────────────────────
  await test('GL-001', 'a code glyph keeps what the chunk defines, calls and touches, and is much smaller', () => {
    const G = require('../../lib/chunk-glyph.js');
    const text = fs.readFileSync(path.join(ROOT, 'guardian/lib/dispatch-pool.js'), 'utf8');
    const g = G.glyph({ file: 'guardian/lib/dispatch-pool.js', text });
    assert.match(g.glyph, /class DispatchPool/);
    assert.match(g.glyph, /\.release\(/);
    assert.ok(g.ratio > 8, `ratio ${g.ratio}`);
    assert.strictEqual(G.glyph({ file: 'x.js', text }).glyph, g.glyph, 'deterministic');
  });

  await test('GL-002', "the agent's context carries glyphs for chunks beyond its full-text budget", () => {
    const RC = require('../../lib/repo-context.js');
    assert.strictEqual(typeof RC.glyphSection, 'function');
    const s = RC.glyphSection({ a: { file: 'f.js', range: { start_line: 3 }, glyph: 'ƒ go() · → run' } }, ['a']);
    assert.match(s, /f\.js:3 ƒ go\(\) · → run/);
  });

  // ── DP-0xx dependencies ──────────────────────────────────────────────────
  await test('DP-001', 'lib/zip.js round-trips, checks CRC, and refuses zip-slip', () => {
    const Zip = require('../../lib/zip.js');
    const z = new Zip(); z.addFile('a/b.txt', 'hello'.repeat(50)); z.addFile('c.bin', Buffer.from([0, 1, 255]));
    const back = new Zip(z.toBuffer());
    assert.deepStrictEqual(back.getEntries().map(e => [e.entryName, e.getData().length]), [['a/b.txt', 250], ['c.bin', 3]]);
    const bad = Buffer.from(z.toBuffer()); bad[40] ^= 0xff;
    assert.throws(() => new Zip(bad).getEntries()[0].getData(), /CRC|size/);
    assert.throws(() => new Zip(Zip.create([{ path: '../x', data: 'x' }])).extractAllTo(path.join(TMP, 'slip'), true), /outside/);
  });

  await test('DP-002', 'lib/micro-http.js serves the express surface Clear Glass uses', async () => {
    const mh = require('../../lib/micro-http.js');
    const app = mh();
    app.use(mh.json({ limit: '1kb' }));
    app.get('/a/:id', (q, r) => r.json({ id: q.params.id, q: q.query }));
    app.post('/e', (q, r) => r.status(201).json(q.body));
    app.all('/eros/*path', (q, r) => r.json(q.params));
    const s = app.listen(0, '127.0.0.1'); await new Promise(r => s.once('listening', r));
    const B = `http://127.0.0.1:${s.address().port}`;
    try {
      assert.deepStrictEqual(await (await fetch(`${B}/a/7?x=1`)).json(), { id: '7', q: { x: '1' } });
      const p = await fetch(`${B}/e`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"k":1}' });
      assert.strictEqual(p.status, 201); assert.deepStrictEqual(await p.json(), { k: 1 });
      assert.strictEqual((await fetch(`${B}/e`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' })).status, 400);
      assert.deepStrictEqual(await (await fetch(`${B}/eros/a/b`, { method: 'PUT' })).json(), { path: ['a', 'b'] });
      assert.strictEqual((await fetch(`${B}/none`)).status, 404);
    } finally { s.close(); }
  });

  await test('DP-003', "nano-ws serves on a bare port, keeps ws's instance constants, and no longer clobbers the global WebSocket", async () => {
    const { WebSocketServer } = require('../../lib/nano-ws.js');
    assert.strictEqual(typeof globalThis.WebSocket, 'function', 'loading nano-ws must not replace the global WebSocket');
    const wss = new WebSocketServer({ port: 0 });
    await new Promise(r => wss.once('listening', r));
    wss.on('connection', (ws) => { assert.strictEqual(ws.readyState, ws.OPEN); ws.on('message', m => ws.send(`echo:${m}`)); });
    const got = await new Promise((resolve, reject) => {
      const c = new WebSocket(`ws://127.0.0.1:${wss.address().port}`);
      c.addEventListener('open', () => c.send('hi'));
      c.addEventListener('message', (e) => { resolve(e.data); c.close(); });
      c.addEventListener('error', reject);
    });
    await new Promise(r => wss.close(r));
    assert.strictEqual(got, 'echo:hi');
  });

  await test('DP-004', 'no removed package is required anywhere Nexus runs, and the root declares what remains', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.deepStrictEqual(Object.keys(pkg.dependencies), ['js-yaml']);
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'docs', '_archive', 'unintegrated', 'data', 'erosmancer'].includes(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(c|m)?js$/.test(e.name)) {
          const s = fs.readFileSync(p, 'utf8');
          if (/require\(\s*['"](adm-zip|express|multer|vectra|node-fetch|uuid|ws)['"]\s*\)/.test(s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\\n]|\\.)*"/g, '""'))) offenders.push(path.relative(ROOT, p));
        }
      }
    };
    walk(ROOT);
    const allowed = new Set(['lib/vector-memory.js']);   // prefers vectra when a person installs it; runs on the in-house index otherwise
    assert.deepStrictEqual(offenders.filter(f => !allowed.has(f) && !/test/.test(f)), []);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
