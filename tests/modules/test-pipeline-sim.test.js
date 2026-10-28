'use strict';
/**
 * tests/modules/test-pipeline-sim.test.js — SL10 (0.60.230): the phase build pipeline run through every failure mode it can meet.
 * James, 2026-10-23: "in the idearium pipeline, building phases, extending, building from scratch. run deep and recursive simulations,
 * of every possible failure mode, loop until we get a solid pipeline."
 *
 * The real route (POST /api/repos/:uuid/phases/build), the real repo layer, the real inject path (lib/repo-inject.js fromReply), the
 * real contract scheduler and proof run; only the model is scripted (lib/repo-agent.js dispatch, idearium _setAgentAsk) and Versionium
 * is a stub on its configured port (the harness of test-contract-phase-build). Every scenario names what the agent does and what the
 * pipeline must do; the suite asserts it on the run's rows, the proposals and the disk.
 *
 *   SIM-A*  a phase built from scratch (a new system: spec-engine + expand): the agent's behaviours
 *   SIM-E*  extending: a second phase whose file requires the first one's
 *   SIM-U01 the Plan panel shows why a brick did not pass
 *   SIM-G*  the gates, in an imported project: finding, decision, cycle, dangling, no graph (agent maps it / cannot), complete with and
 *           without rebuild, an open dependency
 * Recursive: a scenario found failing is fixed at its root and the whole matrix runs again (the CHANGELOG lists each root cause).
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
const results = [];
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; results.push({ id, ok: true }); }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; results.push({ id, ok: false, why: e.message }); }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, er = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = er; } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const listen = (fn, port = 0) => new Promise((res, rej) => {
  const s = http.createServer((q, r) => { let b = ''; q.on('data', d => { b += d; }); q.on('end', () => { r.setHeader('content-type', 'application/json'); const o = fn(q, b ? JSON.parse(b) : {}); r.statusCode = o.status || 200; r.end(JSON.stringify(o.body || {})); }); });
  s.on('error', rej); s.listen(port, '127.0.0.1', () => res(s));
});

// what the scripted agent answers for a file, per behaviour
const GOOD_NOTES = "'use strict';\nconst _n = [];\nfunction add(args) { _n.push(args.text); return { ok: true }; }\nfunction list() { return { ok: true, notes: _n.slice() }; }\nmodule.exports = { add, list };\n";
let ENGINE = 'lib/notes.js';   // the file the current scenario's phase builds; its test requires it
const goodTest = () => `'use strict';\nconst notes = require('../${ENGINE}');\nif (typeof notes.add !== 'function') throw new Error('add');\n`;
const fence = (file, code) => `\`\`\`js ${file}\n${code}\`\`\`\n`;
const BEHAVIOURS = {
  good:        (f, isTest) => ({ text: fence(f, isTest ? goodTest() : GOOD_NOTES) }),
  noReply:     () => ({ error: 'no answer — the tab closed' }),
  timeout:     () => ({ error: 'timed out after 300000 ms' }),
  prose:       () => ({ text: 'I would add a notes module with add and list functions that keep notes in memory.' }),
  refusal:     () => ({ text: "I'm sorry, but I can't help with writing that file." }),
  specNotCode: (f) => ({ text: "```yaml\nspec:\n  meta:\n    name: notes\n  modules:\n    - id: notes\n      path: " + f + "\n```\n" }),
  wrongPath:   (f, isTest) => ({ text: fence('lib/other-place.js', isTest ? goodTest() : GOOD_NOTES) }),
  outside:     (f, isTest) => ({ text: fence('../../outside-the-repo.js', isTest ? goodTest() : GOOD_NOTES) }),
  syntaxError: (f, isTest) => ({ text: fence(f, isTest ? goodTest() : "'use strict';\nfunction add(args) { return { ok: true };\nmodule.exports = { add };\n") }),
  partial:     (f, isTest) => ({ text: fence(f, isTest ? goodTest() : "'use strict';\nfunction add(args) { return { ok: true }; }\nmodule.exports = { add };\n") }),
  unclosed:    (f) => ({ text: "```js " + f + "\n'use strict';\nmodule.exports = { add() {}, list() {} };\n" }),
  otherFile:   (f, isTest) => ({ text: fence(f, isTest ? GOOD_NOTES : goodTest()) }),
  flakyOnce:   null,   // the first call fails, then good (set per scenario)
};

(async () => {
  // ── the real pipeline, as test-contract-phase-build sets it up ──
  const { treeHashOf } = await import(path.join(ROOT, 'idearium/repo/snapshot-files.js'));
  const vers = await listen((q, body) => {
    if (q.url.startsWith('/api/versionium/commit')) return { body: { commit: { commitId: `vsim-${Date.now()}`, branch: body.branch || 'x', wall: Date.now() } } };
    if (q.url.startsWith('/api/versionium/files/limits')) return { body: { maxRequestBytes: 50e6, maxFileBytes: 20e6, maxFiles: 100000 } };
    if (q.url.startsWith('/api/versionium/files/plan')) return { body: { ok: true, need: [], have: (body.tree || []).map(t => t.path) } };
    if (q.url.startsWith('/api/versionium/files/record')) return { body: { ok: true, recorded: true, treeHash: treeHashOf(body.tree || []) } };
    if (q.url.startsWith('/api/versionium/history')) return { body: { commits: [] } };
    return { status: 404, body: { error: 'stub' } };
  }, require(path.join(ROOT, 'lib/nexus-client.js')).resolve('versionium').port);
  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  const db = await import(path.join(ROOT, 'idearium/lib/db.js'));
  const runRows = (runId) => db.loadTable('idearium_phase_runs').filter(r => r.runId === runId || r.buildRunId === runId || String(r.runId || '').startsWith(`${runId}-`));
  const END = (rs) => rs.some(r => /^contract-(complete|incomplete)$/.test(r.state)) || rs.some(r => ['failed', 'plan-failed', 'stopped', 'held'].includes(r.state) && !r.chunk);
  const settle = async (runId, ms = 45000) => { const t = Date.now(); while (Date.now() - t < ms) { const rs = runRows(runId); if (END(rs)) { await wait(300); return runRows(runId); } await wait(150); } return runRows(runId); };
  const states = (rs) => rs.map(r => `${r.state}${r.error ? `(${String(r.error).slice(0, 90)})` : ''}`).join(', ');
  const endOf = (rs) => (rs.find(r => /^contract-(complete|incomplete)$/.test(r.state)) || [...rs].reverse().find(r => ['failed', 'plan-failed', 'stopped', 'held'].includes(r.state)) || {}).state || null;

  await R('POST', '/api/config', { key: 'routing.planner', value: 'claude' });
  await R('POST', '/api/config', { key: 'routing.test_first', value: 'off' });

  // the scripted agent
  let behaviour = 'good', calls = [], flaky = 0;
  const planFor = (ph) => JSON.stringify({ system: null, read: ['the phase'], intent: 'notes', spec: [],
    files: [
      { path: ph.files[0], new: true, layer: 'engine', purpose: 'keeps notes', exports: [{ name: 'add' }, { name: 'list' }], imports: [], steps: ['keep notes in memory'] },
      { path: ph.files[1], new: true, layer: 'test', purpose: 'tests notes', exports: [], imports: [`../${ph.files[0]}`], steps: ['require notes and check add'] },
    ], order: ph.files, conditions: [] });
  let cur = null;   // the phase being built
  RA.dispatch = async (a) => {
    if (/-plan\d+$/.test(a.session || '')) return { ok: true, text: '```json\n' + planFor(cur) + '\n```', provider: 'claude', providerUsed: 'claude', elapsedMs: 3 };
    const file = (String(a.message).match(/^Write ONE file: (\S+)/m) || [])[1] || null;
    calls.push({ file, behaviour });
    const isTest = /test/.test(file || '');
    let out;
    if (behaviour === 'flakyOnce') { out = flaky++ === 0 ? { error: 'deliberate: the model fell over once' } : BEHAVIOURS.good(file, isTest); }
    else out = BEHAVIOURS[behaviour](file, isTest);
    if (out.error) return { ok: false, error: out.error, provider: 'ollama', providerUsed: 'ollama' };
    const injects = await RI.fromReply({ layer: a.layer, repo: a.repo, hat: null, text: out.text, repoDir: a.repoDir });
    return { ok: true, text: out.text, injects, provider: 'ollama', providerUsed: 'ollama', elapsedMs: 4 };
  };

  // ── from scratch: a new system, one expanded phase ──
  let made = null;
  for (let i = 0; i < 20; i++) { made = await R('POST', '/api/spec-engine/specs', { name: `sim-${Date.now()}`, type: 'system', description: 'a simulated system' }); if (made.status !== 503) break; await wait(250); }
  const repoUuid = (made.json.data || made.json).repoUuid;
  await R('POST', `/api/repos/${repoUuid}/chunk`, {});
  // a fresh phase per scenario (a new component): nothing to resume from an earlier scenario's checkpoints
  let map = null, nComp = 0;
  const freshPhase = async () => {
    nComp++;
    const name = `notes${nComp}`; ENGINE = `lib/${name}.js`;
    const ex = await R('POST', `/api/repos/${repoUuid}/expand`, { feature: `note taking ${nComp}`, components: [
      { component: name, path: ENGINE, purpose: 'keeps notes', capability: 'keep notes', commands: ['add', 'list'] },
    ] });
    const exd = ex.json.data || ex.json;
    map = exd.phasemap && exd.phasemap.path;
    const plan = await R('GET', `/api/repos/${repoUuid}/plan?map=${encodeURIComponent(map || '')}`);
    const ph0 = exd.phasemap.phases.find(p => (p.files || []).includes(ENGINE)) || exd.phasemap.phases[exd.phasemap.phases.length - 1];
    const step = ((plan.json.data || plan.json).steps || []).find(s => s.map === map && (s.key === ph0.key || String(s.key).startsWith(`${ph0.key}_`)));
    assert.ok(step, `the expanded phase is on the Plan: ${JSON.stringify(exd).slice(0, 300)}`);
    cur = { ...ph0, key: step.key };
    assert.strictEqual(cur.files[0], ENGINE, JSON.stringify(cur.files));
  };
  const repo = api.getRepoLayer().get(repoUuid);
  const proposals = () => RI.list(repoUuid, {}).filter(x => x && x.status === 'proposed');
  const build = async (extra = {}) => {
    calls = [];
    const b = await R('POST', `/api/repos/${repoUuid}/phases/build`, { map, phase: cur.key, backend: 'ollama', rebuild: true, ...extra });
    if (b.status !== 200) return { refused: b, rows: [] };
    const runId = (b.json.data || b.json).runId;
    return { runId, rows: await settle(runId) };
  };
  const onDiskOutside = () => fs.existsSync(path.join(path.dirname(path.dirname(api._repoDiskDirForTest ? api._repoDiskDirForTest(repoUuid) : ROOT)), 'outside-the-repo.js'));

  // each agent behaviour → what the pipeline must do
  const SCN = [
    { id: 'SIM-A01', b: 'good',        desc: 'a good agent: every brick passes, the proof runs, contract-complete', end: 'contract-complete' },
    { id: 'SIM-A02', b: 'noReply',     desc: 'no reply at all: the run ends (no hang), contract-incomplete, nothing proposed', end: 'contract-incomplete', none: true },
    { id: 'SIM-A03', b: 'timeout',     desc: 'every call times out: the run ends, incomplete, nothing proposed', end: 'contract-incomplete', none: true },
    { id: 'SIM-A04', b: 'prose',       desc: 'prose with no code: nothing written, incomplete', end: 'contract-incomplete', none: true },
    { id: 'SIM-A05', b: 'refusal',     desc: '"I can\'t help": the reply gate blocks it, incomplete', end: 'contract-incomplete', none: true },
    { id: 'SIM-A06', b: 'specNotCode', desc: 'a spec instead of code (the RF2 run): never counted as the file, incomplete', end: 'contract-incomplete', noFileAt: true },
    { id: 'SIM-A07', b: 'wrongPath',   desc: 'the right code under the wrong path: not the expected file, incomplete; the stray proposal is rejected, not left for him', end: 'contract-incomplete', noFileAt: true, noStray: true },
    { id: 'SIM-A08', b: 'outside',     desc: 'a path outside the repo: refused, nothing written outside, incomplete', end: 'contract-incomplete', noFileAt: true, outside: true },
    { id: 'SIM-A09', b: 'syntaxError', desc: 'a syntax error: the brick fails its check, incomplete', end: 'contract-incomplete' },
    { id: 'SIM-A10', b: 'partial',     desc: 'a partial file (an export the plan names is missing): the brick fails, incomplete', end: 'contract-incomplete' },
    { id: 'SIM-A11', b: 'unclosed',    desc: 'an unclosed fence (a cut-off reply): nothing injected, incomplete', end: 'contract-incomplete', noFileAt: true },
    { id: 'SIM-A12', b: 'otherFile',   desc: 'the code of the other file: the brick fails, incomplete', end: 'contract-incomplete' },
    { id: 'SIM-A13', b: 'flakyOnce',   desc: 'falls over once, then good: retried, contract-complete', end: 'contract-complete' },
  ];
  for (const sc of SCN) {
    await test(sc.id, sc.desc, async () => {
      behaviour = sc.b; flaky = 0;
      await freshPhase();
      const before = proposals().length; const beforeIds = new Set(proposals().map(p => p.id || p.uuid));
      const fresh = () => proposals().filter(p => !beforeIds.has(p.id || p.uuid));
      const r = await quiet(() => build());
      assert.ok(!r.refused, `refused: ${r.refused && JSON.stringify(r.refused.json).slice(0, 300)}`);
      const end = endOf(r.rows);
      assert.strictEqual(end, sc.end, states(r.rows));
      if (sc.none) assert.strictEqual(proposals().length, before, 'nothing proposed');
      if (sc.noFileAt) assert.ok(!fresh().some(p => p.path === cur.files[0] && /module\.exports = \{ add, list \}/.test(p.content || p.code || p.after || '')), 'the expected file was not proposed from that reply');
      if (sc.noStray) assert.deepStrictEqual(fresh().map(p => p.path), [], 'a file the brick did not ask for, from a failed reply, is not left in the review queue');
      if (sc.outside) assert.ok(!fresh().some(p => /outside-the-repo/.test(p.path || '')), 'nothing outside the repo');
      assert.ok(calls.length < 40, `bounded: ${calls.length} calls`);
      const endRow = r.rows.find(x => /^contract-/.test(x.state));
      const bricks = (endRow && endRow.audit && endRow.audit.bricks) || [];
      sc.seen = { calls: calls.length, bricks: bricks.map(b => `${b.file}:${b.status}${b.verified ? ` [${String(b.verified).slice(0, 110)}]` : ''}${b.failure ? ` (${String(b.failure).slice(0, 160)})` : ''}`) };
      sc.seen.left = fresh().map(p => `${p.path}:${p.status}`);
      if (process.env.SIM_TRACE) console.log(`      ${sc.id} ${JSON.stringify(sc.seen)}`);
      if (sc.why) assert.ok(bricks.some(b => sc.why.test(`${b.verified || ''} ${b.failure || ''}`)), `the failing brick says why (${sc.why}): ${JSON.stringify(sc.seen)}`);
    });
  }

  // ── the gates, in an imported project ──
  const GMAP = `phases:
  P0_base:
    status: DONE 0.1.0
    depends_on: []
    files: [lib/base.js]
  P1_open:
    status: OPEN
    depends_on: []
    files: [lib/one.js]
  P2_waits:
    status: OPEN
    depends_on: [P1_open]
    files: [lib/two.js]
  P3_cycle_a:
    status: OPEN
    depends_on: [P4_cycle_b]
    files: [lib/three.js]
  P4_cycle_b:
    status: OPEN
    depends_on: [P3_cycle_a]
    files: [lib/four.js]
  P5_dangling:
    status: OPEN
    depends_on: [ZZ9_nowhere]
    files: [lib/five.js]
  P6_vague:
    status: OPEN
    depends_on: []
    does: something nothing can place
  P7_done:
    status: DONE 0.1.0 built
    depends_on: []
    files: [lib/base.js]
  E1_extend_base:
    status: OPEN
    depends_on: []
    files: [lib/base.js, tests/base.test.js]
    does: extends lib/base.js with add and list, keeping value (lib/user.js uses it)
  E2_extend_base_again:
    status: OPEN
    depends_on: []
    files: [lib/base.js, tests/base2.test.js]
    does: extends lib/base.js again
root_findings:
  RF1_a_fact:
    evidence: a fact, not work
decisions_needed:
  D1_which:
    status: OPEN
`;
  let g = null;
  for (let i = 0; i < 20; i++) { g = await quiet(async () => api.getRepoLayer().ingest({ name: `simg-${Date.now()}`, source: 'test', compartmentId: 'c-simg', files: [{ path: 'docs/g-phasemap.spec', content: GMAP }, { path: 'lib/base.js', content: "'use strict';\nmodule.exports = { value: 1 };\n" }, { path: 'lib/user.js', content: "'use strict';\nconst b = require('./base.js');\nmodule.exports = () => b.value + 1;\n" }] })); if (!(g && g.error && /no spec-engine/.test(g.error))) break; await wait(250); }
  const gu = g.repo.uuid;
  const gb = (phase, extra = {}) => R('POST', `/api/repos/${gu}/phases/build`, { map: 'docs/g-phasemap.spec', phase, ...extra });
  const code = (r) => r.json && r.json.detail && r.json.detail.code;
  await test('SIM-G01', 'a root finding sent to build: 409 NOT_A_PHASE, no run', async () => { const r = await gb('RF1_a_fact'); assert.deepStrictEqual([r.status, code(r)], [409, 'NOT_A_PHASE'], JSON.stringify(r.json).slice(0, 200)); });
  await test('SIM-G02', 'a decision sent to build: 409 NOT_A_PHASE, even with anyway', async () => { const r = await gb('D1_which', { anyway: true }); assert.deepStrictEqual([r.status, code(r)], [409, 'NOT_A_PHASE'], JSON.stringify(r.json).slice(0, 200)); });
  await test('SIM-G03', 'an open depends_on: 409 DEPS_OPEN naming it', async () => { const r = await gb('P2_waits'); assert.deepStrictEqual([r.status, code(r)], [409, 'DEPS_OPEN']); assert.ok(/P1_open/.test(r.json.error)); });
  await test('SIM-G04', 'a cycle: refused; anyway passes it and every run row says what was overridden', async () => {
    const r = await gb('P3_cycle_a'); assert.strictEqual(r.status, 409); assert.ok(['DEPS_OPEN', 'DAG_INVALID'].includes(code(r)), code(r));
    // DG3 (his, 2026-10-19): anyway overrides DAG_INVALID, said on the run — the run's rows name what was overridden
    const a = await gb('P3_cycle_a', { anyway: true });
    if (a.status === 200) { const rs = runRows((a.json.data || a.json).runId); assert.ok(rs.length && rs.every(r => Array.isArray(r.dagOverride) && /cycle/.test(r.dagOverride.join(' '))), `said on every row: ${JSON.stringify(rs.map(r => r.dagOverride)).slice(0, 200)}`); }
    else assert.notStrictEqual(code(a), 'DAG_INVALID', 'anyway passes DAG_INVALID');
  });
  await test('SIM-G05', 'a dangling depends_on: 409 DAG_INVALID naming it', async () => { const r = await gb('P5_dangling'); assert.deepStrictEqual([r.status, code(r)], [409, 'DAG_INVALID'], JSON.stringify(r.json).slice(0, 200)); assert.ok(/ZZ9_nowhere/.test(r.json.error)); });
  await test('SIM-G06', 'no graph, and the agent cannot map it: 409 NO_GRAPH naming the agent\'s answer', async () => {
    api._setAgentAsk(async () => ({ ok: true, by: 'scripted', text: 'no idea' }));
    try { const r = await gb('P6_vague'); assert.deepStrictEqual([r.status, code(r)], [409, 'NO_GRAPH']); assert.ok(/the agent could not map it/.test(r.json.error), r.json.error); } finally { api._setAgentAsk(null); }
  });
  await test('SIM-G07', 'no graph, and the agent maps it: past DG2 (the run starts or stops later, never NO_GRAPH)', async () => {
    api._setAgentAsk(async () => ({ ok: true, by: 'scripted', text: JSON.stringify({ phases: [{ id: 'P6_vague', files: [{ path: 'lib/six.js', new: true }], depends_on: ['P0_base'] }] }) }));
    try { const r = await gb('P6_vague'); assert.notStrictEqual(code(r), 'NO_GRAPH', JSON.stringify(r.json).slice(0, 300)); } finally { api._setAgentAsk(null); }
  });
  await test('SIM-G08', 'a complete phase: 409 ALREADY_COMPLETE naming rebuild; with rebuild it is past that gate', async () => {
    const r = await gb('P7_done'); assert.deepStrictEqual([r.status, code(r)], [409, 'ALREADY_COMPLETE']); assert.ok(/rebuild/.test(r.json.error));
    const a = await gb('P7_done', { rebuild: true }); assert.notStrictEqual(code(a), 'ALREADY_COMPLETE');
  });
  // ── extending: a phase that changes a file other code already requires ──
  const KEEP = "'use strict';\nconst _n = [];\nfunction add(args) { _n.push(args.text); return { ok: true }; }\nfunction list() { return { ok: true, notes: _n.slice() }; }\nmodule.exports = { value: 1, add, list };\n";
  const extend = async (phase, files, engineCode) => {
    cur = { key: phase, files }; ENGINE = files[0];
    const saved = BEHAVIOURS.good;
    BEHAVIOURS.good = (f, isTest) => ({ text: fence(f, isTest ? goodTest() : engineCode) });
    behaviour = 'good'; calls = [];
    try {
      const b = await R('POST', `/api/repos/${gu}/phases/build`, { map: 'docs/g-phasemap.spec', phase, backend: 'ollama' });
      if (b.status !== 200) return { refused: b, rows: [] };
      const runId = (b.json.data || b.json).runId;
      return { runId, rows: await settle(runId) };
    } finally { BEHAVIOURS.good = saved; }
  };
  const gProposals = () => RI.list(gu, {}).filter(x => x && x.status === 'proposed');
  await test('SIM-E01', 'extending existing code: the change keeps what its consumers use; contract-complete; the file is proposed as a change, the disk untouched (review)', async () => {
    const r = await quiet(() => extend('E1_extend_base', ['lib/base.js', 'tests/base.test.js'], KEEP));
    assert.ok(!r.refused, r.refused && JSON.stringify(r.refused.json).slice(0, 300));
    assert.strictEqual(endOf(r.rows), 'contract-complete', states(r.rows));
    const pr = gProposals().find(p => p.path === 'lib/base.js');
    assert.ok(pr, 'base.js proposed'); assert.notStrictEqual(pr.op, 'create', `a change to an existing file, not a new one: ${pr.op}`);
  });
  await test('SIM-E02', 'extending that drops an export a consumer uses (lib/user.js needs value): never contract-complete, said', async () => {
    const r = await quiet(() => extend('E2_extend_base_again', ['lib/base.js', 'tests/base2.test.js'], GOOD_NOTES));
    assert.ok(!r.refused, r.refused && JSON.stringify(r.refused.json).slice(0, 300));
    const end = r.rows.find(x => /^contract-/.test(x.state));
    if (process.env.SIM_TRACE) console.log(`      SIM-E02 calls ${calls.length} · ${states(r.rows).slice(0, 900)}`);
    assert.notStrictEqual(endOf(r.rows), 'contract-complete', `a change that breaks lib/user.js passed: ${states(r.rows)}`);
    assert.ok(/value|user\.js|consumer|break|regress/i.test(JSON.stringify(end && end.audit && end.audit.bricks)), `the failure names the break: ${JSON.stringify(end && end.audit && end.audit.bricks).slice(0, 400)}`);
  });

  await test('SIM-U01', 'the Plan panel shows why a brick did not pass (the audit\'s failure), and the run row lists the strays it undid', async () => {
    const pp = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8');
    assert.ok(/b\.failure \? `  · \$\{b\.failure\}`/.test(pp));
    const CA = require(path.join(ROOT, 'cortex/core/raid/contract-adapters.js'));
    assert.ok(/failure: _failureOf\(evd, g\.id\)/.test(fs.readFileSync(path.join(ROOT, 'cortex/core/raid/contract-adapters.js'), 'utf8')) && typeof CA.audit === 'function');
  });

  await test('SIM-G09', 'a phase that does not exist: 404, said', async () => { const r = await gb('ZZ1_nope'); assert.strictEqual(r.status, 404); });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  vers.close();
  process.exit(failed ? 1 : 0);
})();
