'use strict';
/**
 * tests/modules/test-plan-conflict.test.js — AQ1-AQ3 (0.60.169): a plan that contradicts a test ASKS him.
 * Map: docs/2026-10-19-plan-vs-test-ask-phasemap.spec
 * James, 2026-10-19 (SP5_title stuck for hours; the plan said title() -> string, the frozen test calls title(' Looking Glass ')
 * and title(123)): "that needs to ask me, like proposals'"
 *
 *   AQ-01  lib/plan-conflict.js, pure: SP5's exact case is found (plan takes 0, the test passes 1); a call with no more
 *          arguments than the signature, a spread, a string/comment, another module's name and a test that never calls it are
 *          NOT conflicts; namespace and aliased calls count; nested commas and a trailing comma are counted right
 *   AQ-02  the ask and its answer: three ways out; a signature that still takes too few is refused; an answer closes its ask;
 *          his answers are laid over the plan, and the newest wins
 *   AQ-03  the helper the build uses reads only tests that name a planned file
 *   AQ-04  end to end on the real build route (Versionium and the model stubbed): the build STOPS before any brick, writes the
 *          question and a 'needs-you' row; building again does not ask twice; the question is on GET …/asks and on …/phases
 *   AQ-05  "I'll fix the test myself" builds nothing; the question comes back when the build is started again
 *   AQ-06  a signature answer (bad one refused) lays his signature on the plan and the build RESUMES with it in the brief
 *   AQ-07  a waiting build is never closed as stalled; the phase shows the question and the three answers; the faults list
 *          does not count it as a failure
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

const SP5 = { files: [{ path: 'lib/title.js', layer: 'engine', exports: [{ name: 'title', signature: 'title() -> string' }] }] };
const FROZEN = "'use strict';\nconst assert = require('assert');\nconst { title } = require('../lib/title.js');\nassert.strictEqual(title(' Looking Glass '), 'Looking Glass');\nassert.throws(() => title(123), /Input must be a string/);\n";

(async () => {
  const PC = require(path.join(ROOT, 'lib/plan-conflict.js'));

  await test('AQ-01', 'pure: SP5\'s case is found; what is not a conflict is not reported', async () => {
    const c = PC.findConflicts({ plan: SP5, tests: [{ path: 'tests/sp5-title.test.js', code: FROZEN }] });
    assert.strictEqual(c.length, 1);
    assert.deepStrictEqual([c[0].file, c[0].name, c[0].signature, c[0].maxArgs, c[0].usedArgs], ['lib/title.js', 'title', 'title() -> string', 0, 1]);
    assert.deepStrictEqual(c[0].tests[0].calls.map(x => [x.line, x.text]), [[4, "title(' Looking Glass ')"], [5, 'title(123)']]);
    const none = (code, plan = SP5, p = 'tests/x.test.js') => PC.findConflicts({ plan, tests: [{ path: p, code }] }).length === 0;
    const req = "const { title } = require('../lib/title.js');\n";
    assert.ok(none(`${req}title();`), 'no more arguments than the signature');
    assert.ok(none(`${req}title(...args);`), 'a spread cannot be counted: skipped, not guessed');
    assert.ok(none(`${req}// title('a')\nconst z = 'title(1, 2)';`), 'a comment and a string are not calls');
    assert.ok(none("const { title } = require('../lib/other.js'); title('a');"), 'another module\'s title is not this one');
    assert.ok(none("const x = 1;"), 'a test that never calls it');
    assert.ok(none("const { title } = require('../lib/title.js'); title('a');", { files: [{ path: 'lib/title.js', exports: [{ name: 'title', signature: 'title(...args)' }] }] }), 'a rest parameter takes any number');
    assert.ok(none("const { title } = require('../lib/title.js'); title('a');", { files: [{ path: 'lib/title.js', exports: [{ name: 'title' }] }] }), 'no signature, nothing to contradict');
    const n = (code) => PC.findConflicts({ plan: SP5, tests: [{ path: 'tests/x.test.js', code }] })[0].usedArgs;
    assert.strictEqual(n("const T = require('../lib/title.js'); T.title('a', 'b');"), 2, 'namespace');
    assert.strictEqual(n("const { title: t } = require('../lib/title.js'); t('a');"), 1, 'alias');
    assert.strictEqual(n(`${req}title(f(1, 2, 3), [4, 5], { a: 1, b: 2 });`), 3, 'nested commas are one argument each');
    assert.strictEqual(n(`${req}title('a',);`), 1, 'a trailing comma is not an argument');
    assert.strictEqual(n("import { title } from '../lib/title.js';\ntitle('a');"), 1, 'an ES import');
  });

  await test('AQ-02', 'the ask, the answer, and his answers laid over the plan', async () => {
    const c = PC.findConflicts({ plan: SP5, tests: [{ path: 'tests/sp5-title.test.js', code: FROZEN }] })[0];
    const ask = PC.askRow(c, { repoUuid: 'r1', map: 'SPEC.spec', phase: 'SP5_title', runId: 'run1', ts: 1 });
    assert.deepStrictEqual(ask.options.map(o => o.id), ['signature', 'skip', 'test']);
    assert.strictEqual(ask.suggestion, 'title(input) -> string');
    assert.ok(/The plan says title\(\) -> string \(at most 0 arguments\), but tests\/sp5-title\.test\.js calls title with 1 \(line 4: title\(' Looking Glass '\)\)/.test(ask.says), ask.says);
    assert.strictEqual(PC.suggestSignature('title(a) -> string', 'title', 3), 'title(a, options, extra) -> string');
    // refused answers
    assert.ok(/at most 0 arguments; the test passes 1/.test(PC.answerRow(ask, { choice: 'signature', signature: 'title() -> string' }).error));
    assert.ok(/must read like title/.test(PC.answerRow(ask, { choice: 'signature', signature: 'nonsense' }).error));
    assert.ok(/choice must be one of/.test(PC.answerRow(ask, { choice: 'yes' }).error));
    // an answer closes its ask
    assert.strictEqual(PC.openAsks([ask], { repoUuid: 'r1' }).length, 1);
    const a1 = PC.answerRow(ask, { choice: 'signature', ts: 2 }); assert.ok(a1.ok); assert.strictEqual(a1.row.signature, 'title(input) -> string', 'the suggestion when none is typed');
    assert.strictEqual(PC.openAsks([ask, a1.row], { repoUuid: 'r1' }).length, 0);
    // laid over the plan: decide() applies it, then no conflict is left
    const tests = [{ path: 'tests/sp5-title.test.js', code: FROZEN }];
    const d = PC.decide({ plan: SP5, tests, rows: [ask, a1.row], repoUuid: 'r1', phase: 'SP5_title' });
    assert.strictEqual(d.plan.files[0].exports[0].signature, 'title(input) -> string');
    assert.strictEqual(d.conflicts.length, 0);
    assert.strictEqual(SP5.files[0].exports[0].signature, 'title() -> string', 'the plan it was given is not touched');
    // skip: no signature at all, and the newest answer wins
    const a2 = PC.answerRow(ask, { choice: 'skip', ts: 3 });
    const d2 = PC.decide({ plan: SP5, tests, rows: [ask, a1.row, a2.row], repoUuid: 'r1', phase: 'SP5_title' });
    assert.strictEqual(d2.plan.files[0].exports[0].signature, null);
    assert.strictEqual(d2.conflicts.length, 0);
    // 'test' is not an override: the conflict is still there, and asking again is a NEW row (never the same id twice)
    const a3 = PC.answerRow(ask, { choice: 'test', ts: 4 });
    const d3 = PC.decide({ plan: SP5, tests, rows: [ask, a3.row], repoUuid: 'r1', phase: 'SP5_title' });
    assert.strictEqual(d3.conflicts.length, 1); assert.strictEqual(d3.fresh[0].n, 1);
    assert.notStrictEqual(PC.askRow(d3.fresh[0].conflict, { repoUuid: 'r1', n: d3.fresh[0].n }).uuid, ask.uuid);
    // an open ask is reused, not written twice
    const d4 = PC.decide({ plan: SP5, tests, rows: [ask], repoUuid: 'r1', phase: 'SP5_title' });
    assert.deepStrictEqual([d4.asked.length, d4.fresh.length], [1, 0]);
    // another phase's answer does not leak
    assert.strictEqual(PC.decide({ plan: SP5, tests, rows: [ask, a1.row], repoUuid: 'r1', phase: 'OTHER' }).conflicts.length, 1);
  });

  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));

  await test('AQ-03', 'the build\'s helper reads only the tests that name a planned file (and the test written first)', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aq3-'));
    fs.mkdirSync(path.join(root, 'tests/deep/er/est/x'), { recursive: true }); fs.mkdirSync(path.join(root, 'node_modules/m'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tests/a.test.js'), FROZEN);
    fs.writeFileSync(path.join(root, 'tests/unrelated.test.js'), "require('assert').ok(true);\n");
    fs.writeFileSync(path.join(root, 'tests/not-a-test.js'), FROZEN);
    fs.writeFileSync(path.join(root, 'tests/deep/er/est/x/too-deep.test.js'), FROZEN);
    fs.writeFileSync(path.join(root, 'node_modules/m/t.test.js'), FROZEN);
    const got = api._testSourcesOfForTest(root, { ...SP5, testFirst: { path: 'tests/first.test.js', code: 'const t = require("../lib/title.js");' } });
    assert.deepStrictEqual(got.map(x => x.path).sort(), ['tests/a.test.js', 'tests/first.test.js']);
    assert.deepStrictEqual(api._testSourcesOfForTest(null, SP5), []);
  });

  // ── AQ-04..06: the real build route (only Versionium and the model stubbed — the harness of test-test-first) ──
  const { treeHashOf } = await import(path.join(ROOT, 'idearium/repo/snapshot-files.js'));
  const vers = await listen((q, body) => {
    if (q.url.startsWith('/api/versionium/commit')) return { body: { commit: { commitId: `vaq-${Date.now()}`, branch: body.branch || 'x', wall: Date.now() } } };
    if (q.url.startsWith('/api/versionium/files/limits')) return { body: { maxRequestBytes: 50e6, maxFileBytes: 20e6, maxFiles: 100000 } };
    if (q.url.startsWith('/api/versionium/files/plan')) return { body: { ok: true, need: [], have: (body.tree || []).map(t => t.path) } };
    if (q.url.startsWith('/api/versionium/files/record')) return { body: { ok: true, recorded: true, treeHash: treeHashOf(body.tree || []) } };
    if (q.url.startsWith('/api/versionium/history')) return { body: { commits: [] } };
    return { status: 404, body: { error: 'stub' } };
  }, require(path.join(ROOT, 'lib/nexus-client.js')).resolve('versionium').port);
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  let made = null;
  for (let i = 0; i < 20; i++) { made = await R('POST', '/api/spec-engine/specs', { name: `aq-probe-${Date.now()}`, type: 'system', description: 'a probe system' }); if (made.status !== 503) break; await wait(250); }
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
  await R('POST', '/api/config', { key: 'routing.test_first', value: 'off' });
  const sent = [];
  // the planner's plan: add takes NO arguments (like SP5's title() -> string)
  const planOf = () => JSON.stringify({ system: null, read: ['the phase'], intent: 'notes', spec: [],
    files: [{ path: ph.files[0], new: true, layer: 'engine', purpose: 'keeps notes', exports: [{ name: 'add', signature: 'add() -> { ok: boolean }' }], imports: [], steps: ['keep notes in memory'] },
      ...ph.files.slice(1).map(f => ({ path: f, new: true, layer: 'test', purpose: 'tests notes', exports: [], imports: [`../${ph.files[0]}`], steps: ['require notes and check add'] }))],
    order: ph.files, conditions: [] });
  RA.dispatch = async (a) => {
    if (/-plan\d+$/.test(a.session || '')) return { ok: true, text: '```json\n' + planOf() + '\n```', provider: 'claude', providerUsed: 'claude', elapsedMs: 3 };
    const file = (String(a.message).match(/^Write ONE file: (\S+)/m) || [])[1];
    sent.push({ file, message: String(a.message) });
    const code = "'use strict';\nconst _n = [];\nfunction add(input) { _n.push(input); return { ok: true }; }\nmodule.exports = { add };\n";
    const text = `\`\`\`js ${file}\n${code}\`\`\`\n`;
    return { ok: true, text, injects: await RI.fromReply({ layer: a.layer, repo: a.repo, hat: null, text, repoDir: a.repoDir }), provider: 'ollama', providerUsed: 'ollama', elapsedMs: 5 };
  };
  // the frozen test: calls add with one argument
  api.getRepoLayer().writeFile(repoUuid, 'tests/frozen-aq.test.js', `const notes = require('../${ph ? ph.files[0] : 'lib/notes.js'}');\nrequire('assert').ok(notes.add({ text: 'a' }).ok);\n`, { preserveWhitespace: true });
  const db = await import(path.join(ROOT, 'idearium/lib/db.js'));
  const runRows = (runId) => db.loadTable('idearium_phase_runs').filter(r => r.runId === runId || r.buildRunId === runId);
  const settle = async (runId) => { for (let i = 0; i < 200; i++) { const rs = runRows(runId); if (rs.some(r => /^contract-(complete|incomplete)$/.test(r.state) || r.state === 'needs-you') || rs.some(r => ['failed', 'plan-failed'].includes(r.state) && !r.chunk)) return rs; await wait(150); } return runRows(runId); };
  const build = async (extra = {}) => { const b = await R('POST', `/api/repos/${repoUuid}/phases/build`, { map, phase: ph.key, backend: 'ollama', replan: true, ...extra }); assert.strictEqual(b.status, 200, JSON.stringify(b.json).slice(0, 400)); return settle((b.json.data || b.json).runId); };
  const states = (rs) => rs.map(r => `${r.state}${r.step ? `:${r.step}` : ''}${r.error ? `(${String(r.error).slice(0, 120)})` : ''}`).join(', ');
  const asks = () => db.loadTable('idearium_asks').filter(r => r.repoUuid === repoUuid);

  await test('AQ-04', 'end to end: the build stops before any brick and ASKS; once, not twice; the question is on the routes', async () => {
    assert.ok(map && ph && ph.files.length >= 1, 'the expansion wrote a phase');
    const rs = await build();
    const hold = rs.find(r => r.state === 'needs-you');
    assert.ok(hold, states(rs));
    assert.ok(/waiting for you, nothing was built/.test(hold.error) && new RegExp(`${ph.files[0].replace(/[.\/]/g, '\\$&')} add — the plan says add\\(\\) -> \\{ ok: boolean \\}, a test passes 1`).test(hold.error), hold.error);
    assert.ok(!rs.some(r => r.state === 'contract'), 'no contract was opened: no brick was built');
    assert.strictEqual(sent.length, 0, 'no coder was asked');
    const open = asks().filter(r => r.kind === 'ask');
    assert.strictEqual(open.length, 1); assert.strictEqual(open[0].phase, ph.key);
    assert.deepStrictEqual(open[0].options.map(o => o.id), ['signature', 'skip', 'test']);
    // asked again with nothing answered: the same question, not a second one
    const rs2 = await build();
    assert.ok(rs2.some(r => r.state === 'needs-you'), states(rs2));
    assert.strictEqual(asks().filter(r => r.kind === 'ask').length, 1, 'one open question, not two');
    // the routes
    const l = await R('GET', `/api/repos/${repoUuid}/asks`);
    assert.strictEqual(l.status, 200); assert.strictEqual((l.json.data || l.json).open.length, 1);
    const pv = await R('GET', `/api/repos/${repoUuid}/phases`);
    const asksOnPhases = (pv.json.data || pv.json).asks;
    assert.ok(Array.isArray(asksOnPhases) && asksOnPhases.length === 1 && asksOnPhases[0].phase === ph.key && /at most 0 arguments/.test(asksOnPhases[0].says), JSON.stringify(asksOnPhases).slice(0, 300));
    const none = await R('POST', `/api/repos/${repoUuid}/asks/ask-nope-1/answer`, { choice: 'skip' });
    assert.strictEqual(none.status, 404);
  });

  await test('AQ-05', '"I\'ll fix the test myself" builds nothing; the question returns when it is built again', async () => {
    const q = asks().find(r => r.kind === 'ask');
    const a = await R('POST', `/api/repos/${repoUuid}/asks/${q.uuid}/answer`, { choice: 'test' });
    assert.strictEqual(a.status, 200, JSON.stringify(a.json).slice(0, 300));
    const d = a.json.data || a.json; assert.deepStrictEqual([d.choice, d.built], ['test', false]);
    assert.strictEqual(sent.length, 0, 'nothing was built');
    assert.strictEqual(((await R('GET', `/api/repos/${repoUuid}/asks`)).json.data || {}).open && ((await R('GET', `/api/repos/${repoUuid}/asks`)).json.data).open.length, 0, 'answered: not open');
    const rs = await build();
    assert.ok(rs.some(r => r.state === 'needs-you'), states(rs));
    const all = asks().filter(r => r.kind === 'ask');
    assert.strictEqual(all.length, 2, 'asked again, as a new row'); assert.notStrictEqual(all[0].uuid, all[1].uuid);
    const again = await R('POST', `/api/repos/${repoUuid}/asks/${q.uuid}/answer`, { choice: 'skip' });
    assert.strictEqual(again.status, 404, 'an answered question cannot be answered twice');
  });

  await test('AQ-06', 'a signature answer (a bad one refused) lays his signature on the plan and the build RESUMES with it', async () => {
    const q = asks().filter(r => r.kind === 'ask').sort((a, b) => b.ts - a.ts)[0];
    const bad = await R('POST', `/api/repos/${repoUuid}/asks/${q.uuid}/answer`, { choice: 'signature', signature: 'add() -> { ok: boolean }' });
    assert.strictEqual(bad.status, 400); assert.ok(/at most 0 arguments; the test passes 1/.test(bad.json.error), bad.json.error);
    assert.strictEqual(db.loadTable('idearium_asks').filter(r => r.kind === 'ask-answer' && r.askUuid === q.uuid).length, 0, 'a refused answer is not recorded');
    const ok = await R('POST', `/api/repos/${repoUuid}/asks/${q.uuid}/answer`, { choice: 'signature', signature: 'add(input: string) -> { ok: boolean }' });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.json).slice(0, 300));
    const d = ok.json.data || ok.json; assert.strictEqual(d.built, true, JSON.stringify(d)); assert.ok(d.runId);
    const rs = await settle(d.runId);
    assert.ok(rs.some(r => r.state === 'routed' && /his answer applied to the plan: .*add\(\) -> \{ ok: boolean \} → add\(input: string\) -> \{ ok: boolean \}/.test(r.note || '')), states(rs));
    assert.ok(!rs.some(r => r.state === 'needs-you'), 'nothing left to ask');
    assert.ok(sent.length >= 1, `the coder was asked: ${states(rs)}`);
    assert.ok(sent.every(s => /add\(input: string\)/.test(s.message) && !/add\(\) ->/.test(s.message)), 'the brief carries HIS signature');
    const end = rs.find(r => /^contract-/.test(r.state));
    assert.strictEqual(end && end.state, 'contract-complete', states(rs));
  });

  await test('AQ-07', 'a waiting build is not a stall or a failure; the phase shows the question; the switch is a person\'s', async () => {
    const RW = require(path.join(ROOT, 'lib/run-watch.js'));
    const old = [{ runId: 'r1', state: 'needs-you', phase: 'SP5_title', ts: Date.now() - 3 * 3600 * 1000 }];
    assert.deepStrictEqual(RW.stalled(old), [], 'three hours waiting on him is not a stall');
    assert.deepStrictEqual(RW.economyHeld(old), [], 'and not a hold to retry');
    assert.deepStrictEqual(require(path.join(ROOT, 'lib/phase-faults.js')).faultsOf({ state: 'needs-you', phase: 'SP5_title', runId: 'r1' }), [], 'not a fault');
    assert.strictEqual(require(path.join(ROOT, 'lib/failure-post.js')).phaseRunFailed({ state: 'needs-you' }), false, 'not a failure mode');
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/phases.js'), 'utf8');
    assert.ok(/function _phAskHtml[\s\S]{0,1800}phasesAsk\('[^']*','signature'\)[\s\S]{0,900}phasesAsk\('[^']*','skip'\)[\s\S]{0,700}phasesAsk\('[^']*','test'\)/.test(ui), 'the three answers are on the phase');
    assert.ok(/\$\{_phAsksOf\(p\)\.map\(_phAskHtml\)\.join\(''\)\}/.test(ui) && /⚑ needs you/.test(ui), 'the card flags it and the detail pane asks');
    assert.ok(/asks\/\$\{encodeURIComponent\(askUuid\)\}\/answer/.test(ui) && /'needs-you': 'var\(--amber\)'/.test(ui));
    assert.strictEqual((ui.match(/phaseBuildPost\(/g) || []).length, 2, 'no new build door (DG1)');
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/_cfg\('routing\.plan_test_conflict', 'ask'\) !== 'off'/.test(src), 'routing.plan_test_conflict: ask (default) · off');
  });

  vers.close();
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
