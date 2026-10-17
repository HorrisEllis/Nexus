'use strict';
/**
 * tests/modules/test-test-first.test.js — TF2 (0.60.141): the phase's test is written first, and it shapes the
 * expectations and the conditions. Map: docs/2026-10-17-pieces-not-order-phasemap.spec addendum (c2).
 * James, 2026-10-17: "needs to build a test first then use that to shape expectation and conditions."
 *
 *   TF-01  lib/test-first.js, pure: the test's path (the plan's own test file, else tests/<phase>.test.js); the brief carries
 *          the planned files, their signatures and the rules; extract; what a test requires and calls (destructured,
 *          namespace, import); shape: a name the test calls that the plan lacks joins that file's exports, the test leaves
 *          the coders' files, its run is the FIRST condition; the note each code brick carries
 *   TF-02  validate, for real in a shadow of a repo with no implementation: the missing behaviour → fails-as-expected; a
 *          test that does not parse, uses a name it never defined, or requires a module neither planned nor present →
 *          invalid; a test that already passes → passes-already (proves nothing)
 *   TF-03  end to end, on the real route, skeleton repo, inject path and proof run (the model stubbed, the harness of
 *          test-contract-phase-build): the planner writes the test first (never the coder), it is seen failing, proposed,
 *          the plan is shaped (list() added), the coder is not asked to write the test and every code brief carries it,
 *          and the phase is proven by that test
 *   TF-04  routing.test_first require: a writer that gives no usable test in two tries stops the build, said
 *   TF-05  the switch is a person's (Settings → Routing) and every agent's (`system routing test_first …`)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const listen = (fn, port = 0) => new Promise((res, rej) => {
  const s = http.createServer((q, r) => { let b = ''; q.on('data', d => { b += d; }); q.on('end', () => { r.setHeader('content-type', 'application/json'); const o = fn(q, b ? JSON.parse(b) : {}); r.statusCode = o.status || 200; r.end(JSON.stringify(o.body || {})); }); });
  s.on('error', rej);
  s.listen(port, '127.0.0.1', () => res(s));
});
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const GOOD_TEST = "'use strict';\nconst assert = require('node:assert');\nconst notes = require('../lib/notes.js');\nnotes.add({ text: 'a' });\nnotes.add({ text: 'b' });\nconst l = notes.list();\nassert.ok(l.ok);\nassert.deepStrictEqual(l.notes, ['a', 'b']);\nconsole.log('notes keep order');\n";

(async () => {
  const TF = require(path.join(ROOT, 'lib/test-first.js'));

  await test('TF-01', 'pure: path, brief, extract, uses, shape (the test is the authority), note', async () => {
    const plan = { intent: 'keep notes', files: [
      { path: 'lib/notes.js', layer: 'engine', purpose: 'keeps notes', exports: [{ name: 'add', signature: 'add(args: { text: string }) -> { ok: boolean }', does: 'adds a note' }] },
      { path: 'tests/notes.test.js', layer: 'test', exports: [] }], order: ['lib/notes.js', 'tests/notes.test.js'], conditions: [{ says: 'notes.js is there', check: { kind: 'file', path: 'lib/notes.js' } }] };
    assert.strictEqual(TF.pathFor(plan, 'NT1_notes'), 'tests/notes.test.js', 'the plan\'s own test file');
    assert.strictEqual(TF.pathFor({ files: [{ path: 'lib/a.js' }] }, 'NT1 Notes!'), 'tests/nt1-notes.test.js');
    const b = TF.brief({ plan, phaseKey: 'NT1_notes', does: 'keep notes in order', proof: 'two notes come back in order', testPath: 'tests/notes.test.js', repoName: 'probe', feedback: 'it passed already' });
    for (const want of [/WRITE THE TEST FIRST/, /\.\.\/lib\/notes\.js/, /add\(args: \{ text: string \}\)/, /two notes come back in order/, /node tests\/notes\.test\.js/, /must fail now/, /YOUR LAST TEST WAS NOT USABLE: it passed already/]) assert.ok(want.test(b), `${want} in the brief`);
    assert.ok(!/tests\/notes\.test\.js — /.test(b), 'the test is not listed as a file to require');
    assert.strictEqual(TF.extract('here:\n```js\nconst a = 1;\n```\nthanks'), 'const a = 1;');
    assert.strictEqual(TF.extract('no code at all'), null);
    const u = TF.usesOf("const { add, list: ls } = require('../lib/notes.js');\nconst S = require('../lib/store.js');\nS.put(1); S.get;\nimport { x as y } from '../lib/q.js';\n", 'tests/notes.test.js');
    assert.deepStrictEqual(u.find(x => x.module === 'lib/notes.js').names, ['add', 'list']);
    assert.deepStrictEqual(u.find(x => x.module === 'lib/store.js').names.sort(), ['get', 'put']);
    assert.deepStrictEqual(u.find(x => x.module === 'lib/q.js').names, ['x']);
    const sh = TF.shape(plan, { testPath: 'tests/notes.test.js', code: GOOD_TEST, verdict: 'the planned module is not written yet' });
    assert.deepStrictEqual(sh.added, [{ file: 'lib/notes.js', name: 'list' }]);
    assert.deepStrictEqual(sh.plan.files.map(f => f.path), ['lib/notes.js'], 'the test leaves the coders\' files');
    assert.deepStrictEqual(sh.plan.order, ['lib/notes.js']);
    assert.strictEqual(sh.plan.files[0].exports.find(e => e.name === 'list').signature, 'list(...args)', 'no invented arity (TF1 checks an upper bound)');
    assert.deepStrictEqual(sh.plan.conditions[0].check, { kind: 'tests', run: 'node tests/notes.test.js' });
    assert.ok(/written before the code, and seen failing first/.test(sh.plan.conditions[0].says));
    assert.strictEqual(sh.plan.conditions[1].check.kind, 'file', 'the plan\'s own conditions follow');
    assert.ok(/THE TEST THIS PHASE MUST PASS[\s\S]*tests\/notes\.test\.js[\s\S]*notes keep order/.test(TF.note(sh.plan)));
    assert.strictEqual(TF.note(plan), '');
    assert.strictEqual(plan.files.length, 2, 'shape does not touch the plan it was given');
  });

  await test('TF-02', 'validate for real: missing behaviour fails as expected; a broken or empty test is caught', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tf2-'));
    fs.mkdirSync(path.join(root, 'lib')); fs.writeFileSync(path.join(root, 'lib/old.js'), 'module.exports = { x: 1 };\n');
    const plan = { files: [{ path: 'lib/notes.js', layer: 'engine', exports: [{ name: 'add' }] }], order: ['lib/notes.js'] };
    const tp = 'tests/notes.test.js';
    const v = (code) => TF.validate({ root, plan, testPath: tp, code });
    const good = await v(GOOD_TEST);
    assert.deepStrictEqual([good.ran, good.verdict], [true, 'fails-as-expected'], JSON.stringify(good));
    assert.ok(/not written yet \(lib\/notes\.js\)/.test(good.why), good.why);
    assert.strictEqual((await v('const x = ;')).verdict, 'invalid');
    assert.ok(/uses foo without defining/.test((await v("require('node:assert');\nfoo();\n")).why));
    assert.ok(/neither planned nor in the repo/.test((await v("require('../lib/nothere.js');\n")).why));
    assert.ok(/neither planned nor installed/.test((await v("require('leftpad-not-installed');\n")).why));
    const already = await v("const o = require('../lib/old.js');\nrequire('node:assert').strictEqual(o.x, 1);\n");
    assert.strictEqual(already.verdict, 'passes-already');
    // an existing planned module whose behaviour is missing: an assertion failure is the right failure
    const plan2 = { files: [{ path: 'lib/old.js', layer: 'engine', exports: [{ name: 'y' }] }] };
    const asrt = await TF.validate({ root, plan: plan2, testPath: tp, code: "const o = require('../lib/old.js');\nrequire('node:assert').strictEqual(typeof o.y, 'function');\n" });
    assert.strictEqual(asrt.verdict, 'fails-as-expected', JSON.stringify(asrt));
    assert.ok(!fs.existsSync(path.join(root, 'tests')), 'nothing written into the repo');
  });

  // ── TF-03/TF-04: the real build (only the model stubbed) ──
  const { treeHashOf } = await import(path.join(ROOT, 'idearium/repo/snapshot-files.js'));
  const vers = await listen((q, body) => {
    if (q.url.startsWith('/api/versionium/commit')) return { body: { commit: { commitId: `vtm-${Date.now()}`, branch: body.branch || 'x', wall: Date.now() } } };
    if (q.url.startsWith('/api/versionium/files/limits')) return { body: { maxRequestBytes: 50e6, maxFileBytes: 20e6, maxFiles: 100000 } };
    if (q.url.startsWith('/api/versionium/files/plan')) return { body: { ok: true, need: [], have: (body.tree || []).map(t => t.path) } };
    if (q.url.startsWith('/api/versionium/files/record')) return { body: { ok: true, recorded: true, treeHash: treeHashOf(body.tree || []) } };
    if (q.url.startsWith('/api/versionium/history')) return { body: { commits: [] } };
    return { status: 404, body: { error: 'stub' } };
  }, require(path.join(ROOT, 'lib/nexus-client.js')).resolve('versionium').port);
  const api = await import(path.join(ROOT, 'idearium/api/index.js'));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  let made = null;
  for (let i = 0; i < 20; i++) { made = await R('POST', '/api/spec-engine/specs', { name: `tf-probe-${Date.now()}`, type: 'system', description: 'a probe system' }); if (made.status !== 503) break; await wait(250); }
  const repoUuid = (made.json.data || made.json).repoUuid;
  await R('POST', `/api/repos/${repoUuid}/chunk`, {});
  const ex = await R('POST', `/api/repos/${repoUuid}/expand`, { feature: 'note taking', components: [{ component: 'notes', path: 'lib/notes.js', purpose: 'keeps notes', capability: 'keep notes', commands: ['add', 'list'] }] });
  const exd = ex.json.data || ex.json;
  const map = exd.phasemap && exd.phasemap.path;
  const ph0 = exd.phasemap && exd.phasemap.phases && exd.phasemap.phases[0];
  const pl = await R('GET', `/api/repos/${repoUuid}/plan?map=${encodeURIComponent(map || '')}`);
  const step = ((pl.json.data || pl.json).steps || []).find(s => s.map === map && ph0 && (s.key === ph0.key || String(s.key).startsWith(`${ph0.key}_`)));
  const ph = ph0 && step ? { ...ph0, key: step.key } : null;
  if (!ph) console.log('  (setup: the expanded phase was not found — expand', ex.status, JSON.stringify(ex.json).slice(0, 400), '· plan', pl.status, ')');

  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  await R('POST', '/api/config', { key: 'routing.planner', value: 'claude' });
  await R('POST', '/api/config', { key: 'routing.test_first', value: 'require' });
  const sent = [], asked = []; let testMode = 'good';
  const planOf = () => JSON.stringify({ system: null, read: ['the phase'], intent: 'notes', spec: [],
    files: [
      { path: ph.files[0], new: true, layer: 'engine', purpose: 'keeps notes', exports: [{ name: 'add', signature: 'add(args)' }], imports: [], steps: ['keep notes in memory'] },
      { path: ph.files[1], new: true, layer: 'test', purpose: 'tests notes', exports: [], imports: [`../${ph.files[0]}`], steps: ['require notes and check add'] },
    ], order: ph.files, conditions: [] });
  RA.dispatch = async (a) => {
    if (/-plan\d+$/.test(a.session || '')) return { ok: true, text: '```json\n' + planOf() + '\n```', provider: 'claude', providerUsed: 'claude', elapsedMs: 3 };
    if (/-tf\d+$/.test(a.session || '')) {
      asked.push(String(a.message));
      const t = testMode === 'good' ? GOOD_TEST.replace(/\.\.\/lib\/notes\.js/g, `../${ph.files[0]}`) : "require('node:assert').ok(true);\n";   // 'empty': passes before any code
      return { ok: true, text: `the test:\n\`\`\`js\n${t}\`\`\`\n`, provider: 'claude', providerUsed: 'claude', elapsedMs: 3 };
    }
    const file = (String(a.message).match(/^Write ONE file: (\S+)/m) || [])[1];
    sent.push({ file, message: String(a.message) });
    const code = "'use strict';\nconst _n = [];\nfunction add(args) { _n.push(args.text); return { ok: true }; }\nfunction list() { return { ok: true, notes: _n.slice() }; }\nmodule.exports = { add, list };\n";
    const text = `\`\`\`js ${file}\n${code}\`\`\`\n`;
    return { ok: true, text, injects: await RI.fromReply({ layer: a.layer, repo: a.repo, hat: null, text, repoDir: a.repoDir }), provider: 'ollama', providerUsed: 'ollama', elapsedMs: 5 };
  };
  const db = await import(path.join(ROOT, 'idearium/lib/db.js'));
  const runRows = (runId) => db.loadTable('idearium_phase_runs').filter(r => r.runId === runId || r.buildRunId === runId);
  const settle = async (runId) => { for (let i = 0; i < 160; i++) { const rs = runRows(runId); if (rs.some(r => /^contract-(complete|incomplete)$/.test(r.state)) || rs.some(r => ['failed', 'plan-failed'].includes(r.state) && !r.chunk)) return rs; await wait(150); } return runRows(runId); };
  const build = async (extra = {}) => { const b = await R('POST', `/api/repos/${repoUuid}/phases/build`, { map, phase: ph.key, backend: 'ollama', ...extra }); assert.strictEqual(b.status, 200, JSON.stringify(b.json).slice(0, 400)); return settle((b.json.data || b.json).runId); };
  const states = (rs) => rs.map(r => `${r.state}${r.step ? `:${r.step}` : ''}${r.error ? `(${String(r.error).slice(0, 140)})` : ''}`).join(', ');

  await test('TF-03', 'end to end: written first by the planner, seen failing, proposed; the plan shaped; the coder held to it; proven by it', async () => {
    assert.ok(map && ph && ph.files.length === 2, 'the expansion wrote a two-file phase');
    const testPath = ph.files[1];
    const rs = await build();
    const shaped = rs.find(r => r.state === 'test-first' && r.step === 'shaped');
    assert.ok(shaped, states(rs));
    assert.strictEqual(shaped.file, testPath, 'the plan\'s own test file is the one written first');
    assert.ok(/seen failing: (the planned module is not written yet|TypeError: notes\.(add|list) is not a function)/.test(shaped.note), shaped.note);   // the expansion leaves a stub notes.js: either is the missing behaviour
    assert.deepStrictEqual(shaped.testFirst.added, [{ file: ph.files[0], name: 'list' }], 'the test asked for list(); the plan only had add');
    assert.ok(asked.length === 1 && /WRITE THE TEST FIRST/.test(asked[0]), 'the planner wrote it — one request');
    const prop = RI.list(repoUuid, { limit: 200 }).find(n => n.path === testPath && n.source && n.source.role === 'test-writer');
    assert.ok(prop && /notes keep order/.test(prop.content), 'the test lands as a proposal, like any agent\'s file');
    assert.ok(!sent.some(s => s.file === testPath), `the coder was not asked to write the test: ${sent.map(s => s.file).join(', ')}`);
    const notesBriefs = sent.filter(s => s.file === ph.files[0]);
    assert.ok(notesBriefs.length >= 1 && notesBriefs.every(s => /THE TEST THIS PHASE MUST PASS[\s\S]*notes keep order/.test(s.message)), 'every code brief carries the test');
    assert.ok(notesBriefs.every(s => /\blist\b/.test(s.message)), 'and asks for list(), which the test added');
    const proof = rs.find(r => ['proven', 'unproven', 'no-proof'].includes(r.state));
    assert.ok(proof && proof.state === 'proven', `${states(rs)} ${JSON.stringify(proof && (proof.results || proof.conditions || proof)).slice(0, 600)}`);
    const end = rs.find(r => /^contract-/.test(r.state));
    assert.strictEqual(end && end.state, 'contract-complete', states(rs));
    assert.ok(rs.findIndex(r => r.state === 'test-first') < rs.findIndex(r => r.state === 'contract'), 'the test came before the contract');
    // the Plan shows it: the test is the first piece of the phase's bar (build-plan.js piecesOf)
    const pv = await R('GET', `/api/repos/${repoUuid}/plan?map=${encodeURIComponent(map)}`);
    const st = ((pv.json.data || pv.json).steps || []).find(x => x.key === ph.key);
    assert.ok(st && st.pieces && st.pieces[0].path === testPath, JSON.stringify(st && st.pieces));
    assert.ok(['proven', 'done', 'written'].includes(st.pieces[0].state) && st.pieces[0].agent === 'claude', JSON.stringify(st.pieces[0]));
  });

  await test('TF-04', 'require: a writer that gives no usable test in two tries stops the build, and says why', async () => {
    testMode = 'empty'; asked.length = 0; sent.length = 0;
    const rs = await build({ replan: true });
    assert.strictEqual(asked.length, 2, 'asked twice, the second time with what was wrong');
    assert.ok(/YOUR LAST TEST WAS NOT USABLE: passes-already/.test(asked[1]), asked[1].slice(-300));
    const refused = rs.find(r => r.state === 'test-first' && r.step === 'refused');
    assert.ok(refused && /no usable test was written first/.test(refused.error), states(rs));
    assert.ok(rs.some(r => r.state === 'failed' && /routing\.test_first is require/.test(r.error || '')), states(rs));
    assert.strictEqual(sent.length, 0, 'no code was written without its test');
  });

  await test('TF-05', 'a person and an agent reach the same switch: Settings → Routing, and `system routing test_first <require|prefer|off>`', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'idearium/ui/settings.html'), 'utf8');
    assert.ok(/routing\.test_first[\s\S]{0,800}\['require', 'prefer', 'off'\][\s\S]{0,200}data-rt-tf/.test(html) && /data-rt-tf[\s\S]{0,120}rtSet\('test_first'/.test(html));
    const { pathToFileURL } = require('url');
    const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = RC.SPEC.find(r => r.key === 'system.routing');
    assert.deepStrictEqual(row.req({ args: ['test_first', 'prefer'], flags: {} }).body, { key: 'routing.test_first', value: 'prefer', actor: 'command' });
    const set = await R('POST', '/api/config', row.req({ args: ['test_first', 'prefer'], flags: {} }).body);
    assert.strictEqual(set.status, 200);
    const got = await R('GET', '/api/routing');
    assert.strictEqual((got.json.data || got.json).policy.testFirst, 'prefer', 'the policy reads it back');
    await R('POST', '/api/config', { key: 'routing.test_first', value: 'require' });
  });

  vers.close();
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
