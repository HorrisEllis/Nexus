'use strict';
/**
 * tests/modules/test-qa2-real-run.test.js — QA2 (docs/2026-10-15-automatic-tracking-phasemap.spec): one phase build end
 * to end, with the REAL Versionium (its own routes and store, in a sandbox), the real Idearium route, the real repo, the
 * real inject path, RAID and the proof run. Only the model is stubbed: this container has no Ollama. What this does NOT
 * prove is said in the report: a real model's output, timing under a 4 GB GPU, the Plan drawn in Clear Glass.
 * James: "Is this going in a good direction." · "Yes like gates can asses if dependacies are being met or if context is
 * needed."
 *
 * Until now every phase (GS1 rewind, GT2 tags, RN1 releases) was proven with Versionium stubbed. Together, here:
 *   QA-01  the build passes through RAID; the first notes reply is missing an export → FAILED (capability) → REWOUND to
 *          the build's snapshot (the half-write removed, on disk) → retried → PASSED
 *   QA-02  every pass is tagged in the real Versionium on a real commit of the repo's branch; the tags never move
 *   QA-03  progress: RAID's row says 2/2, the Plan's ledger holds each settled move in order, the activity log has them
 *   QA-04  a release cut after the build lists exactly the build's commits; a second cut with nothing new is refused
 *   QA-05  the numbers, printed: agent calls, gate moves, tags, commits, rows, time
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
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 6).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\ntest-qa2-real-run — one phase build, end to end, with the real Versionium (QA2)');
  const t0 = Date.now();
  // ── the real Versionium: its own route handlers on its own port, its own store (sandboxed) ──
  const routes = ['versionium.js', 'files.js', 'system.js'].map(f => require(path.join(ROOT, 'versionium/routes', f)));
  const port = require(path.join(ROOT, 'lib/nexus-client.js')).resolve('versionium').port;
  const vsrv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try { for (const r of routes) if (await r.handle(req, res, { method: req.method, pathname: url.pathname, url })) return; res.writeHead(404); res.end('{"ok":false,"error":"no route"}'); }
    catch (e) { if (!res.headersSent) res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })); }
  });
  await new Promise((res, rej) => { vsrv.on('error', rej); vsrv.listen(port, '127.0.0.1', res); });
  const REL = require(path.join(ROOT, 'versionium/lib/releases.js'));
  const { jaaDB: vdb } = require(path.join(ROOT, 'versionium/lib/store.js'));

  const api = await import(path.join(ROOT, 'idearium/api/index.js'));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  let made = null;
  for (let i = 0; i < 20; i++) { made = await R('POST', '/api/spec-engine/specs', { name: `qa2-${Date.now()}`, type: 'system', description: 'a QA2 probe system' }); if (made.status !== 503) break; await wait(250); }
  const repoUuid = (made.json.data || made.json).repoUuid;
  await R('POST', `/api/repos/${repoUuid}/chunk`, {});
  const ex = await R('POST', `/api/repos/${repoUuid}/expand`, { feature: 'note taking', components: [
    { component: 'notes', path: 'lib/notes.js', purpose: 'keeps notes', capability: 'keep notes', commands: ['add', 'list'] }] });
  const exd = ex.json.data || ex.json;
  const map = exd.phasemap && exd.phasemap.path;
  const ph0 = exd.phasemap && exd.phasemap.phases && exd.phasemap.phases[0];
  const plan = await R('GET', `/api/repos/${repoUuid}/plan?map=${encodeURIComponent(map || '')}`);
  const step = ((plan.json.data || plan.json).steps || []).find(s => s.map === map && ph0 && (s.key === ph0.key || String(s.key).startsWith(`${ph0.key}_`)));
  const ph = ph0 && step ? { ...ph0, key: step.key } : null;

  // ── only the model is stubbed ──
  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  await R('POST', '/api/config', { key: 'routing.planner', value: 'claude' });
  let calls = 0, halfWrites = 1;
  RA.dispatch = async (a) => {
    calls++;
    if (/-plan\d+$/.test(a.session || '')) return { ok: true, provider: 'claude', providerUsed: 'claude', elapsedMs: 3, text: '```json\n' + JSON.stringify({ system: null, read: ['the phase'], intent: 'notes', spec: [], conditions: [], order: ph.files,
      files: [{ path: ph.files[0], new: true, layer: 'engine', purpose: 'keeps notes', exports: [{ name: 'add' }, { name: 'list' }], imports: [], steps: ['keep notes in memory'] },
        { path: ph.files[1], new: true, layer: 'test', purpose: 'tests notes', exports: [], imports: [`../${ph.files[0]}`], steps: ['require notes and check add'] }] }) + '\n```' };
    const file = (String(a.message).match(/^Write ONE file: (\S+)/m) || [])[1];
    let code = /test/.test(file) ? "'use strict';\nconst notes = require('../lib/notes.js');\nif (typeof notes.add !== 'function') throw new Error('add');\n"
      : "'use strict';\nconst _n = [];\nfunction add(args) { _n.push(args.text); return { ok: true }; }\nfunction list() { return { ok: true, notes: _n.slice() }; }\nmodule.exports = { add, list };\n";
    // the first notes reply lands but is missing an export: a half-write the gate must reject and rewind
    if (file === ph.files[0] && halfWrites > 0) { halfWrites--; code = "'use strict';\nfunction add() { return { ok: true }; }\nmodule.exports = { add };\n"; }
    const text = `\`\`\`js ${file}\n${code}\`\`\`\n`;
    const injects = await RI.fromReply({ layer: a.layer, repo: a.repo, hat: null, text, repoDir: a.repoDir });
    return { ok: true, text, injects, provider: 'ollama', providerUsed: 'ollama', elapsedMs: 5 };
  };
  const db = await import(path.join(ROOT, 'idearium/lib/db.js'));
  const runRows = (runId) => db.loadTable('idearium_phase_runs').filter(r => r.runId === runId || r.buildRunId === runId);
  const settle = async (runId) => { for (let i = 0; i < 240; i++) { const rs = runRows(runId); if (rs.some(r => /^contract-(complete|incomplete|blocked)$/.test(r.state))) return rs; await wait(150); } return runRows(runId); };

  let rows = [], end = null, target = repoUuid;
  await test('QA-01', 'through RAID: a half-write fails (capability), is rewound to the snapshot, retried and passes', async () => {
    assert.ok(map && ph && ph.files.length === 2, 'setup: the expansion wrote a two-file phase');
    const b = await R('POST', `/api/repos/${repoUuid}/phases/build`, { map, phase: ph.key, backend: 'ollama' });
    assert.strictEqual(b.status, 200, JSON.stringify(b.json).slice(0, 300));
    rows = await settle((b.json.data || b.json).runId);
    end = rows.find(r => /^contract-/.test(r.state));
    assert.ok(end && end.state === 'contract-complete', rows.map(r => `${r.state}${r.error ? `(${String(r.error).slice(0, 100)})` : ''}`).join(', '));
    target = end.targetRepo || repoUuid;
    const notes = end.audit.bricks.find(x => x.file === ph.files[0]);
    const moves = rows.filter(r => r.brick === notes.id && /^brick-/.test(r.state)).map(r => `${r.state}${r.failureClass ? `:${r.failureClass}` : ''}`);
    assert.deepStrictEqual(moves.slice(0, 3), ['brick-failed:capability', 'brick-rewound', 'brick-passed'], moves.join(' → '));
    assert.ok(notes.rewound && notes.rewound.ok, JSON.stringify(notes.rewound));
  });

  await test('QA-02', 'every pass tagged in the real Versionium, on a real commit of the repo\'s branch', () => {
    const tags = REL.tags({ repository: target });
    const commits = vdb.query('versionium_commits', r => r.branch === `repo-${target}`, 1e6).map(c => c.commitId);
    const passes = rows.filter(r => r.state === 'brick-passed');
    assert.strictEqual(tags.length, passes.length, JSON.stringify(tags.map(t => t.name)));
    for (const t of tags) assert.ok(commits.includes(t.commitId), `${t.name} → ${t.commitId} is a commit on repo-${target}`);
    for (const b of end.audit.bricks) assert.ok(b.tag && tags.some(t => t.name === b.tag), `${b.id} carries its tag`);
    assert.throws(() => REL.tag({ repository: target, name: tags[0].name, commitId: 'vtm-elsewhere' }), /never moves/);
  });

  await test('QA-03', 'progress: RAID 2/2, each settled move on the Plan\'s ledger in order, and in the activity log', () => {
    const CI = require(path.join(ROOT, 'cortex/core/raid/contract-intake.js'));
    const pr = CI.progress(end.raidQueueId);
    assert.ok(pr && pr.passed === 2 && pr.total === 2 && pr.failed === 0, JSON.stringify(pr));
    const ledger = rows.filter(r => r.brick && r.progress).map(r => r.progress.moves);
    assert.deepStrictEqual(ledger, [...ledger].sort((a, b) => a - b), 'in the order they happened');
    assert.strictEqual(ledger.length, pr.moves, 'none lost');
    const AL = require(path.join(ROOT, 'lib/activity-log/compartment.js'));
    assert.ok(AL.list(target, { kind: 'gate' }).rows.length >= pr.moves);
  });

  let release = null;
  await test('QA-04', 'a release after the build lists the build\'s commits; nothing new → refused', async () => {
    const r = await R('POST', `/api/repos/${target}/releases`, { quote: 'QA2' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    release = (r.json.data || r.json).release;
    const head = vdb.query('versionium_branches', x => x.branch === `repo-${target}`, 1)[0].headCommitId;
    assert.ok(release.version === '0.1.0' && release.commitId === head && release.commits.length >= 2, JSON.stringify({ v: release.version, n: release.commits.length }));
    const again = await R('POST', `/api/repos/${target}/releases`, {});
    assert.strictEqual(again.status, 409);
  });

  await test('QA-05', 'the numbers', () => {
    const CI = require(path.join(ROOT, 'cortex/core/raid/contract-intake.js'));
    const pr = CI.progress(end.raidQueueId);
    const n = {
      ms: Date.now() - t0, agentCalls: calls, gateMoves: pr.moves, tags: REL.tags({ repository: target }).length,
      commits: vdb.count('versionium_commits', { branch: `repo-${target}` }), ledgerRows: rows.length, releaseCommits: release ? release.commits.length : null,
    };
    console.log(`    ${JSON.stringify(n)}`);
    console.log('    not proven here: a real model\'s output, timing on a 4 GB GPU, the Plan drawn in Clear Glass (no Ollama in this container)');
    assert.ok(n.agentCalls <= 5, `agent calls ${n.agentCalls}: plan 1 + notes 2 + test 1 (+1 slack)`);
  });

  vsrv.close();
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300);
})().catch(e => { console.error(e); process.exit(1); });
