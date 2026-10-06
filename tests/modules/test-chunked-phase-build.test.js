'use strict';
/**
 * tests/modules/test-chunked-phase-build.test.js — §0.39.361 SB51: a phase built one file at a time, end to end.
 * James: "phases need chunked i feel like. at least for small ollama models." · "I want to get that pipeline working."
 *
 * The real pipeline, not its wiring: a real skeleton repo, expanded from its spec (a real phasemap in docs/), a
 * Versionium stub on its configured port, and POST /api/repos/:uuid/phases/build through the real route. Only the
 * model is stubbed — RA.dispatch answers as a small model would, with one fenced file, and that reply goes through the
 * real lib/repo-inject fromReply (gates, proposals). What each request held is recorded and checked.
 *   CB-01  routing: auto chunks a build that starts on Ollama, not one that starts on a large agent; always / never
 *   CB-02  a two-file phase on Ollama is sent as two requests, each naming one file, each under 2400 chars, own session
 *   CB-03  the second request sees the first's file as written, with its exports
 *   CB-04  every row of the run says chunk i of n and its file; the building row says why it was chunked
 *   CB-05  each file comes back as a proposal; the proof runs once, after the last chunk, on the whole phase
 *   CB-06  a first chunk that does not land stops the run, naming the chunk; the second is never sent; it is a fault
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const http = require('http');
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

(async () => {
  const PR = require(path.join(ROOT, 'lib/pipeline-routing.js'));
  await test('CB-01', 'routing: auto chunks a build that starts on Ollama, not one on a large agent; always / never', () => {
    const files = ['lib/a.js', 'lib/b.js'];
    assert.strictEqual(PR.shouldChunk(PR.policyFrom({}), { rungs: [{ base: 'ollama', provider: 'ollama:q:3b' }, { base: 'claude', provider: 'claude' }], files }).chunk, true);
    assert.strictEqual(PR.shouldChunk(PR.policyFrom({}), { rungs: [{ base: 'claude', provider: 'claude' }], files }).chunk, false);
    assert.strictEqual(PR.shouldChunk(PR.policyFrom({}), { rungs: [], files, backend: 'ollama' }).chunk, true, 'the call\'s own backend');
    assert.strictEqual(PR.shouldChunk(PR.policyFrom({ chunk_phases: 'always' }), { rungs: [{ base: 'claude', provider: 'claude' }], files }).chunk, true);
    assert.strictEqual(PR.shouldChunk(PR.policyFrom({ chunk_phases: 'never' }), { rungs: [{ base: 'ollama', provider: 'ollama:q:3b' }], files }).chunk, false);
    assert.strictEqual(PR.shouldChunk(PR.policyFrom({}), { rungs: [{ base: 'ollama', provider: 'ollama:q' }], files: [] }).chunk, false, 'no files, nothing to chunk');
  });

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

  // the model: answers each request with the one file it names, as a small model would; the reply goes through the
  // real inject path. failFirst: the first request fails (provider down) to prove a chunk that does not land stops it
  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  const realDispatch = RA.dispatch;
  const sent = []; let failFirst = false, brokenTest = false;
  RA.dispatch = async (a) => {
    sent.push({ message: a.message, session: a.session, backend: a.backend });
    if (failFirst && sent.length === 1) return { ok: false, error: 'ECONNREFUSED — provider down' };
    const file = (String(a.message).match(/^Build ONE file: (\S+)/m) || [])[1] || (ph && ph.files[1]);
    const code = /test/.test(file)
      ? (brokenTest ? "'use strict';\nthrow new Error('the notes test fails');\n" : "'use strict';\nconst notes = require('../lib/notes.js');\nif (typeof notes.add !== 'function') throw new Error('add');\n")
      : "'use strict';\nconst _n = [];\nfunction add(args) { _n.push(args.text); return { ok: true }; }\nfunction list() { return { ok: true, notes: _n.slice() }; }\nmodule.exports = { add, list };\n";
    const text = `Here it is.\n\n\`\`\`js ${file}\n${code}\`\`\`\n`;
    const injects = await RI.fromReply({ layer: a.layer, repo: a.repo, hat: null, text, repoDir: a.repoDir });
    return { ok: true, text, injects, provider: 'ollama', providerUsed: 'ollama', elapsedMs: 5 };
  };

  const db = await import(path.join(ROOT, 'idearium/lib/db.js'));
  const runRows = (runId) => db.loadTable('idearium_phase_runs').filter(r => r.runId === runId || r.buildRunId === runId);
  const settle = async (runId, done) => { for (let i = 0; i < 80; i++) { const rs = runRows(runId); if (done(rs)) return rs; await wait(150); } return runRows(runId); };

  let run = null, rows = [];
  await test('CB-02', 'a two-file phase on Ollama is two requests, each naming one file, each under 2400 chars, each its own session', async () => {
    assert.ok(map && ph && ph.files.length === 2, `the expansion wrote a two-file phase: ${JSON.stringify(exd.phasemap && exd.phasemap.phases).slice(0, 300)}`);
    const b = await R('POST', `/api/repos/${repoUuid}/phases/build`, { map, phase: ph.key, backend: 'ollama' });
    assert.strictEqual(b.status, 200, JSON.stringify(b.json).slice(0, 400));
    run = b.json.data || b.json;
    assert.strictEqual(run.chunking.chunk, true, JSON.stringify(run.chunking));
    rows = await settle(run.runId, rs => rs.some(r => ['proven', 'unproven', 'no-proof'].includes(r.state)) || rs.some(r => r.chunkStopped));
    assert.strictEqual(sent.length, 2, `requests sent: ${sent.length}`);
    sent.forEach((s, i) => {
      assert.match(s.message, new RegExp(`^Build ONE file: ${ph.files[i].replace(/[.]/g, '\\.')} — chunk ${i + 1} of 2`, 'm'));
      assert.ok(s.message.length <= 2400 + 700, `request ${i + 1} is ${s.message.length} chars`);   // + at most the precedent note
      assert.strictEqual(s.backend, 'ollama');
    });
    assert.notStrictEqual(sent[0].session, sent[1].session, 'a fresh session per chunk');
  });

  await test('CB-03', 'the second request sees the first\'s file as written, with its exports', () => {
    assert.match(sent[1].message, new RegExp(`- ${ph.files[0].replace(/[.]/g, '\\.')} — written, exports add, list`));
    assert.match(sent[0].message, new RegExp(`- ${ph.files[1].replace(/[.]/g, '\\.')} — a later chunk; do not write it`));
  });

  await test('CB-04', 'every row of the run says chunk i of n and its file; the building row says why it was chunked', () => {
    const replied = rows.filter(r => r.state === 'replied');
    assert.deepStrictEqual(replied.map(r => [r.chunk, r.chunks, r.file]), [[1, 2, ph.files[0]], [2, 2, ph.files[1]]], JSON.stringify(rows.map(r => r.state)));
    const b = rows.find(r => r.state === 'building');
    assert.ok(b.chunking && b.chunking.chunk && /local model/.test(b.chunking.why), JSON.stringify(b.chunking));
    assert.ok(replied.every(r => r.promptChars && r.promptChars < 3200), 'each attempt records the size it was sent');
  });

  await test('CB-05', 'each file came back as a proposal; the proof ran once, after the last chunk, on the whole phase', () => {
    const props = RI.list(repoUuid, { limit: 50 }).filter(n => ph.files.includes(n.path));
    assert.deepStrictEqual([...new Set(props.map(n => n.path))].sort(), [...ph.files].sort());
    const proofs = rows.filter(r => ['proven', 'unproven', 'no-proof'].includes(r.state));
    assert.strictEqual(proofs.length, 1, `proof rows: ${rows.map(r => r.state).join(',')}`);
    assert.ok(proofs[0].ts >= Math.max(...rows.filter(r => r.state === 'replied').map(r => r.ts)), 'after the last chunk');
  });

  await test('CB-07', 'the proof ran on the proposed code, and the person\'s files were not touched', () => {
    const p = rows.find(r => r.state === 'proven');
    assert.ok(p, `proven expected: ${rows.map(r => `${r.state}${r.error ? `(${r.error})` : ''}`).join(', ')}`);
    assert.strictEqual(p.against, 'proposed');
    assert.deepStrictEqual([...p.overlaid].sort(), [...ph.files].sort());
    const L = api.getRepoLayer();
    for (const f of ph.files) { const t = L.readTextFile ? L.readTextFile(repoUuid, f) : L.readFile(repoUuid, f); assert.ok(!/notes/.test(String((t && t.content) || '')), `${f} on disk is unchanged until Apply`); }
  });

  await test('CB-08', 'a proposal whose test fails is unproven — an empty placeholder no longer passes for it', async () => {
    sent.length = 0; brokenTest = true;
    const b = await R('POST', `/api/repos/${repoUuid}/phases/build`, { map, phase: ph.key, backend: 'ollama' });
    const id = (b.json.data || b.json).runId;
    const rs = await settle(id, x => x.some(r => ['proven', 'unproven', 'no-proof'].includes(r.state)));
    const end = rs.find(r => ['proven', 'unproven', 'no-proof'].includes(r.state));
    brokenTest = false;
    assert.ok(end && end.state === 'unproven', `got ${end && end.state}: ${end && end.error}`);
    assert.strictEqual(end.against, 'proposed');
  });

  await test('CB-06', 'a first chunk that does not land stops the run, naming it; the second is never sent; it is a fault', async () => {
    sent.length = 0; failFirst = true;
    const b = await R('POST', `/api/repos/${repoUuid}/phases/build`, { map, phase: ph.key, backend: 'ollama' });
    assert.strictEqual(b.status, 200, JSON.stringify(b.json).slice(0, 300));
    const id = (b.json.data || b.json).runId;
    const rs = await settle(id, x => x.some(r => r.chunkStopped));
    const stop = rs.find(r => r.chunkStopped);
    assert.ok(stop, rs.map(r => r.state).join(','));
    assert.match(stop.error, new RegExp(`chunk 1 of 2 \\(${ph.files[0].replace(/[.]/g, '\\.')}\\) did not land — the run stops here`));
    assert.strictEqual(sent.length, 1, 'the second chunk was never sent');
    assert.ok(!rs.some(r => ['proven', 'unproven', 'no-proof'].includes(r.state)), 'no proof of a stopped run');
    const PF = require(path.join(ROOT, 'lib/phase-faults.js'));
    assert.ok(PF.list({ phase: ph.key }).some(f => f.mode === 'chunk-stopped'), 'logged as a chunk-stopped fault');
  });

  // ── §0.39.362 CH1–CH5 — the compartment's charter: axioms, conditions, end state ──
  await test('CB-10', 'a charter that does not parse, or a condition with no check, is refused with why — nothing written', async () => {
    const bad = await R('PUT', `/api/repos/${repoUuid}/charter`, { text: 'charter:\n  conditions:\n    - "the notes work"\n' });
    assert.strictEqual(bad.status, 422, JSON.stringify(bad.json).slice(0, 300));
    assert.match(bad.json.error, /has no check/);
    const g = await R('GET', `/api/repos/${repoUuid}/charter`);
    assert.strictEqual((g.json.data || g.json).exists, false);
    assert.match((g.json.data || g.json).template, /least amount of code with the highest leverage/, 'a new charter starts from the least-code axiom');
  });

  let charterRun = null;
  await test('CB-11', 'with a charter: its axiom is in every request, its condition in the proof, the leverage measured, the end state checked', async () => {
    failFirst = false; brokenTest = false; sent.length = 0;
    const text = [
      'charter:',
      '  axioms:',
      '    - "use the least amount of code with the highest leverage that achieves the end state"',
      '  conditions:',
      `    - { says: "the notes test passes", check: { kind: tests, run: "node ${ph.files[1]}" } }`,
      '  end_state:',
      `    - { says: "a note can be added", check: { kind: command, run: "node -e \\"const n=require('./${ph.files[0]}'); if(!n.add({text:'x'}).ok) process.exit(1)\\"" } }`,
      '    - { says: "notes can be exported", check: { kind: file, path: "lib/export.js" } }',
      '',
    ].join('\n');
    const put = await R('PUT', `/api/repos/${repoUuid}/charter`, { text });
    assert.strictEqual(put.status, 200, JSON.stringify(put.json).slice(0, 400));
    const b = await R('POST', `/api/repos/${repoUuid}/phases/build`, { map, phase: ph.key, backend: 'ollama' });
    const id = (b.json.data || b.json).runId;
    const rs = await settle(id, x => x.some(r => ['proven', 'unproven', 'no-proof'].includes(r.state)));
    assert.ok(sent.length === 2 && sent.every(m => /axiom: use the least amount of code/.test(m.message)), 'the axiom is in every chunk\'s request');
    const p = rs.find(r => r.state === 'proven');
    assert.ok(p, rs.map(r => `${r.state}${r.error ? `(${r.error})` : ''}`).join(', '));
    assert.ok(p.proof.total >= 2, `the charter's condition is checked with the phase's own: ${p.proof.total}`);
    assert.ok(p.leverage && p.leverage.added > 0 && p.leverage.linesPerCheck > 0 && /lines per check/.test(p.leverage.says), JSON.stringify(p.leverage));
    for (let i = 0; i < 60 && !charterRun; i++) { const g = await R('GET', `/api/repos/${repoUuid}/charter`); charterRun = (g.json.data || g.json).endState; if (!charterRun || charterRun.cause !== id) charterRun = null; if (!charterRun) await wait(150); }
    assert.ok(charterRun, 'a proven phase checks the end state again');
  });

  await test('CB-12', 'the end state is the compartment\'s progress: checked with what is proposed, each check said, the Plan carries it', async () => {
    assert.strictEqual(charterRun.total, 2);
    assert.strictEqual(charterRun.met, 1, JSON.stringify(charterRun.results));
    assert.deepStrictEqual(charterRun.results.map(r => r.met), [true, false]);
    assert.strictEqual(charterRun.against, 'proposed');
    const pl = await R('GET', `/api/repos/${repoUuid}/plan`);
    const c = (pl.json.data || pl.json).charter;
    assert.ok(c && c.exists && c.latest && c.latest.met === 1 && c.endState.length === 2, JSON.stringify(c).slice(0, 300));
    const byHand = await R('POST', `/api/repos/${repoUuid}/charter/check`, { withProposals: false });
    assert.strictEqual((byHand.json.data || byHand.json).met, 0, 'on the files alone (nothing applied) nothing is met yet');
  });

  RA.dispatch = realDispatch;
  await new Promise(x => vers.close(x));
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300);
})().catch(e => { console.error(e); process.exit(1); });
