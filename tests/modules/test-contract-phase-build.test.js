'use strict';
/**
 * tests/modules/test-contract-phase-build.test.js — 0.60.18 EX0e — Idearium's Build action through the contract scheduler,
 * end to end on the real route (POST /api/repos/:uuid/phases/build), the real skeleton repo, the real inject path and the
 * real proof run. Only the model is stubbed (the harness of test-chunked-phase-build). James: "make the first real phase
 * build produce an auditable record of every brick, dependency, checkpoint and gate."
 *   CP-01  a planned build runs as a .contract: a brick per planned file, the plan's import edge, a checkpoint per pass
 *   CP-02  the phase passes only through its integration (the proof run): proven → contract-complete
 *   CP-03  building again resumes from the checkpoints: no file is re-sent, only the integration re-checked
 *   CP-04  a changed plan rejects the old checkpoint (archived); a deliberately failed brick recovers on retry
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const http = require('http');
const fs = require('fs');
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
// a front for the in-process API, so the agent's tool reaches it over HTTP as it does in production
const listen0 = (fn) => new Promise((res) => { const sv = http.createServer((q, r) => { let b = ''; q.on('data', d => { b += d; }); q.on('end', async () => {
  let body = {}; try { body = b ? JSON.parse(b) : {}; } catch (_) {}
  const o = await quiet(() => fn(q, body)); r.statusCode = o.status || 200; r.setHeader('content-type', 'application/json'); r.end(JSON.stringify(o.json || {})); }); });
  sv.listen(0, '127.0.0.1', () => res(sv)); });
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // ── the real pipeline ──
  const { treeHashOf } = await import(path.join(ROOT, 'idearium/repo/snapshot-files.js'));
  const commits = [];
  const vers = await listen((q, body) => {
    if (q.url.startsWith('/api/versionium/commit')) { const id = `vtm-${commits.length + 1}`; commits.push(body); return { body: { commit: { commitId: id, branch: body.branch || 'x', wall: Date.now() } } }; }
    if (q.url.startsWith('/api/versionium/files/limits')) return { body: { maxRequestBytes: 50e6, maxFileBytes: 20e6, maxFiles: 100000 } };
    if (q.url.startsWith('/api/versionium/files/plan')) return { body: { ok: true, need: [], have: (body.tree || []).map(t => t.path) } };
    if (q.url.startsWith('/api/versionium/files/record')) return { body: { ok: true, recorded: true, treeHash: treeHashOf(body.tree || []) } };
    if (q.url.startsWith('/api/versionium/history')) return { body: { commits: [] } };
    return { status: 404, body: { error: 'stub' } };
  }, require(path.join(ROOT, 'lib/nexus-client.js')).resolve('versionium').port);
  const api = await import(path.join(ROOT, 'idearium/api/index.js'));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));

  let made = null;
  for (let i = 0; i < 20; i++) { made = await R('POST', '/api/spec-engine/specs', { name: `chunk-probe-${Date.now()}`, type: 'system', description: 'a probe system' }); if (made.status !== 503) break; await wait(250); }
  const repoUuid = (made.json.data || made.json).repoUuid;
  await R('POST', `/api/repos/${repoUuid}/chunk`, {});
  const ex = await R('POST', `/api/repos/${repoUuid}/expand`, { feature: 'note taking', components: [
    { component: 'notes', path: 'lib/notes.js', purpose: 'keeps notes', capability: 'keep notes', commands: ['add', 'list'] },
  ] });
  const exd = ex.json.data || ex.json;
  const map = exd.phasemap && exd.phasemap.path;
  const ph0 = exd.phasemap && exd.phasemap.phases && exd.phasemap.phases[0];
  // the phase as the Phases tab and the build know it (its full phase key), from the Plan
  const plan = await R('GET', `/api/repos/${repoUuid}/plan?map=${encodeURIComponent(map || '')}`);
  const step = ((plan.json.data || plan.json).steps || []).find(s => s.map === map && ph0 && (s.key === ph0.key || String(s.key).startsWith(`${ph0.key}_`)));
  const ph = ph0 && step ? { ...ph0, key: step.key } : null;
  if (!ph) console.log("  (setup: the expanded phase was not found on the Plan — plan", plan.status, JSON.stringify(plan.json).slice(0, 600), JSON.stringify(ex.json).slice(0, 300));


  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  const CG = require(path.join(ROOT, 'cortex/core/raid/contract-gates.js'));
  const realDispatch = RA.dispatch;
  await R('POST', '/api/config', { key: 'routing.planner', value: 'claude' });
  const sent = []; let failNotes = 0, variant = '';
  const planOf = () => JSON.stringify({ system: null, read: ['the phase'], intent: 'notes', spec: [],
    files: [
      { path: ph.files[0], new: true, layer: 'engine', purpose: 'keeps notes', exports: [{ name: 'add' }, { name: 'list' }], imports: [], steps: [`keep notes in memory${variant}`] },
      { path: ph.files[1], new: true, layer: 'test', purpose: 'tests notes', exports: [], imports: [`../${ph.files[0]}`], steps: ['require notes and check add'] },
    ], order: ph.files, conditions: [] });
  let dispatchedTotal = 0;   // CP-06: every call the agent saw, never reset
  RA.dispatch = async (a) => {
    dispatchedTotal++;
    if (/-plan\d+$/.test(a.session || '')) return { ok: true, text: '```json\n' + planOf() + '\n```', provider: 'claude', providerUsed: 'claude', elapsedMs: 3 };
    const file = (String(a.message).match(/^Write ONE file: (\S+)/m) || [])[1];
    sent.push({ file, session: a.session });
    if (file === ph.files[0] && failNotes > 0) { failNotes--; return { ok: false, error: 'deliberate failure — the model fell over' }; }
    const code = /test/.test(file) ? "'use strict';\nconst notes = require('../lib/notes.js');\nif (typeof notes.add !== 'function') throw new Error('add');\n"
      : "'use strict';\nconst _n = [];\nfunction add(args) { _n.push(args.text); return { ok: true }; }\nfunction list() { return { ok: true, notes: _n.slice() }; }\nmodule.exports = { add, list };\n";
    const text = `\`\`\`js ${file}\n${code}\`\`\`\n`;
    const injects = await RI.fromReply({ layer: a.layer, repo: a.repo, hat: null, text, repoDir: a.repoDir });
    return { ok: true, text, injects, provider: 'ollama', providerUsed: 'ollama', elapsedMs: 5 };
  };
  const db = await import(path.join(ROOT, 'idearium/lib/db.js'));
  const runRows = (runId) => db.loadTable('idearium_phase_runs').filter(r => r.runId === runId || r.buildRunId === runId);
  const settle = async (runId) => { for (let i = 0; i < 120; i++) { const rs = runRows(runId); if (rs.some(r => /^contract-(complete|incomplete)$/.test(r.state)) || rs.some(r => ['failed', 'plan-failed'].includes(r.state) && !r.chunk)) return rs; await wait(150); } return runRows(runId); };
  const build = async () => { const b = await R('POST', `/api/repos/${repoUuid}/phases/build`, { map, phase: ph.key, backend: 'ollama' }); assert.strictEqual(b.status, 200, JSON.stringify(b.json).slice(0, 400)); return settle((b.json.data || b.json).runId); };
  const states = (rs) => rs.map(r => `${r.state}${r.error ? `(${String(r.error).slice(0, 120)})` : ''}`).join(', ');

  let rows = [];
  await test('CP-01', 'a planned build runs as a .contract: a brick per planned file, the import edge, a checkpoint per pass', async () => {
    assert.ok(map && ph && ph.files.length === 2, 'the expansion wrote a two-file phase');
    rows = await build();
    const c = rows.find(r => r.state === 'contract');
    assert.ok(c, states(rows));
    assert.strictEqual(c.contractInfo.bricks, 2); assert.strictEqual(c.contractInfo.resumed, false);
    const end = rows.find(r => /^contract-/.test(r.state));
    assert.ok(end, states(rows));
    const au = end.audit;
    assert.deepStrictEqual(au.bricks.map(b => b.file), ph.files);
    assert.ok(au.bricks.every(b => b.status === 'PASSED' && b.agent && /^ok/.test(b.verified)), JSON.stringify(au.bricks));
    assert.ok(au.dependencies.some(e => e.from === au.bricks[0].id && e.to === au.bricks[1].id), 'the test brick waits on the notes brick');
    assert.ok(au.checkpoints >= 3 && au.gates.length === 3, JSON.stringify({ cp: au.checkpoints, gates: au.gates }));
    assert.ok(fs.existsSync(end.contract) && CG.load(end.contract).payload.state.checkpoints.length >= 3, 'the contract and its checkpoints are saved');
  });
  await test('CP-02', 'the phase passes only through its integration — the proof run — and then the contract is complete', () => {
    const proof = rows.find(r => ['proven', 'unproven', 'no-proof'].includes(r.state));
    const end = rows.find(r => /^contract-/.test(r.state));
    assert.ok(proof && proof.state === 'proven', states(rows));
    assert.strictEqual(end.state, 'contract-complete', states(rows));
    assert.ok(end.audit.gates.find(g => g.id === 'phase').status === 'PASSED');
    assert.ok(rows.filter(r => ['proven', 'unproven', 'no-proof'].includes(r.state)).length === 1, 'proved once, by the integration gate — not again after');
  });
  await test('CP-03', 'building again resumes from the checkpoints: no file is re-sent; only the integration is re-checked', async () => {
    sent.length = 0;
    const rs = await build();
    const c = rs.find(r => r.state === 'contract');
    assert.ok(c && c.contractInfo.resumed && c.contractInfo.kept.length === 3 && !c.contractInfo.stale.length, JSON.stringify(c && c.contractInfo));
    assert.strictEqual(sent.length, 0, `files re-sent: ${sent.map(s => s.file).join(', ')}`);
    assert.ok(rs.some(r => r.state === 'contract-complete'), states(rs));
  });
  await test('CP-04', 'a changed plan rejects the old checkpoint (archived, not deleted); a deliberately failed brick is retried and recovers', async () => {
    sent.length = 0; variant = ' (a changed step)'; failNotes = 1;
    const rs = await build();
    const c = rs.find(r => r.state === 'contract');
    assert.ok(c && !c.contractInfo.resumed && /rejected: the plan changed/.test(c.error || ''), JSON.stringify(c));
    const arch = (c.error.match(/archived at (\S+)\)/) || [])[1];
    assert.ok(arch && fs.existsSync(arch), `archived: ${arch}`);
    assert.ok(sent.filter(s => s.file === ph.files[0]).length >= 2, `notes sent ${sent.filter(s => s.file === ph.files[0]).length} times`);
    const end = rs.find(r => /^contract-/.test(r.state));
    assert.strictEqual(end && end.state, 'contract-complete', states(rs) + JSON.stringify(end && end.audit));
    assert.ok(end.audit.bricks[0].attempts >= 2 || rs.some(r => r.state === 'failed' && r.chunk), 'the failure is on the record');
  });

  await test('CP-05', 'the route serves the audit (GET /phases/contract), the command row and the Plan panel show it', async () => {
    const g = await R('GET', `/api/repos/${repoUuid}/phases/contract?phase=${encodeURIComponent(ph.key)}&map=${encodeURIComponent(map)}`, {});
    assert.strictEqual(g.status, 200, JSON.stringify(g.json).slice(0, 300));
    const au = (g.json.data || g.json).audit;
    assert.ok(au && au.bricks.length === 2 && au.complete, JSON.stringify(au).slice(0, 400));
    assert.ok(fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8').includes("key: 'repo.contract'"));
    assert.ok(/contract audit —/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8')));
  });

  // 0.60.27 AG1a — James: "as little as possible." The builds above, counted: each call's own row, tokens estimated at
  // the source, the same count on the route, the Plan and the command
  await test('CP-06', 'AG1a: the phase\'s agent calls and tokens are counted from the real build rows: route, Plan and command agree', async () => {
    const g = await R('GET', `/api/repos/${repoUuid}/phases/cost?phase=${encodeURIComponent(ph.key)}&map=${encodeURIComponent(map)}`, {});
    assert.strictEqual(g.status, 200, JSON.stringify(g.json).slice(0, 300));
    const d = g.json.data || g.json, c = d.cost;
    assert.ok(c.byRole.plan >= 1 && c.byRole.code >= 2 && c.calls === c.byRole.plan + c.byRole.code + c.byRole.review, JSON.stringify(c).slice(0, 500));
    assert.ok(c.tokensIn > 0 && c.tokensOut > 0 && /estimate-v1/.test(c.method), `tokens estimated at the source: ${JSON.stringify({ i: c.tokensIn, o: c.tokensOut, m: c.method })}`);
    assert.ok(c.runs.length >= 2 && c.runs.every(r => r.calls >= 1), 'each build run has its own count');
    assert.ok(/calls? \(plan \d+ · code \d+/.test(d.line), d.line);
    const all = await R('GET', `/api/repos/${repoUuid}/phases/cost`, {});
    assert.ok(((all.json.data || all.json).phases || []).some(x => x.phase === ph.key && x.calls === c.calls), 'the all-phases view has the same count');
    const plan = await R('GET', `/api/repos/${repoUuid}/plan?map=${encodeURIComponent(map)}`);
    const st = ((plan.json.data || plan.json).steps || []).find(x => x.key === ph.key);
    assert.ok(st && st.cost && st.cost.calls === c.calls, `the Plan shows the same count: ${JSON.stringify(st && st.cost)}`);
    assert.ok(fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8').includes("key: 'repo.cost'") && /agents: \$\{escapeHtml\(s\.cost\.line\)\}/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8')));
    assert.strictEqual(c.calls, dispatchedTotal, `every dispatch the agent saw is counted once, no more: counted ${c.calls}, dispatched ${dispatchedTotal}`);
    // the failed attempt says who failed (0.60.27: with no ladder it was recorded with no provider)
    assert.ok(db.loadTable('idearium_phase_runs').filter(r => r.phase === ph.key && r.state === 'failed' && r.rung == null && /-c\d+-failed$/.test(r.uuid)).every(r => r.provider), 'every failed coder call names its agent');
  });

  RA.dispatch = realDispatch;
  await new Promise(x => vers.close(x));
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300);
})().catch(e => { console.error(e); process.exit(1); });
