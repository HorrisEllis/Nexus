'use strict';
/**
 * tests/modules/test-gate-tracking.test.js — GT2 (docs/2026-10-15-automatic-tracking-phasemap.spec): each gate tags and
 * reports its progress. contract-intake runContract's tracker · contract-gates' richer moves · idearium's wiring.
 * James (2026-10-15): "then each gate tags and tracks progress through the system."
 *
 *   GT2-01  a run that passes: each pass is tagged gate/<contract>/<gate>@1 on the commit it passed at; the tag is the
 *           gate's evidence and in the audit; progress (n/m, moves, last) is on RAID's row; a bus event per settled move;
 *           an activity row per move in the compartment
 *   GT2-02  a brick that fails: its moves carry the failure class and the rewind; no tag; progress counts it failed
 *   GT2-03  tracking never fails a brick: a tag that cannot be written is said once and the run still passes
 *   GT2-04  wired: Idearium hands RAID the tag (Versionium /tags on the repo) and the compartment; the Plan draws a move
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const CI = require(path.join(ROOT, 'cortex/core/raid/contract-intake.js'));
const CG = require(path.join(ROOT, 'cortex/core/raid/contract-gates.js'));
const CA = require(path.join(ROOT, 'cortex/core/raid/contract-adapters.js'));
const AL = require(path.join(ROOT, 'lib/activity-log/compartment.js'));
const bus = require(path.join(ROOT, 'nexus/nexus-bus.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 8).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const w = console.warn, l = console.log; const said = []; console.warn = (...a) => said.push(a.join(' ')); console.log = () => {}; try { return await fn(said); } finally { console.warn = w; console.log = l; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-gt2-'));
fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'docs/x-phasemap.spec'), 'phases:\n  P1: { files: [lib/a.js, lib/b.js] }\n');
const plan = { intent: 'two files', conditions: [], order: ['lib/a.js', 'lib/b.js'], files: [
  { path: 'lib/a.js', new: true, layer: 'kernel', exports: [{ name: 'x' }], imports: [], steps: ['export x'] },
  { path: 'lib/b.js', new: true, layer: 'engine', exports: [{ name: 'y' }], imports: ['./a.js: x'], steps: ['use x'] }] };
const contract = (name) => { const L = CA.fromPhasePlan(plan, { phaseKey: 'P1', title: name, inputs: [{ id: 'map', path: 'docs/x-phasemap.spec' }], root: tmp }); const f = path.join(tmp, `${name}.contract`); CG.save(f, L); return f; };
const executors = ({ fail = null } = {}) => ({
  agent: CA.agentExecutor({ route: () => [{ provider: 'ollama:qwen' }], boundaries: { budget: () => null },
    dispatch: async (hops, { gate }) => (fail && gate.file === fail ? { ok: false, provider: hops[0].provider, error: 'the export y is missing' } : { ok: true, provider: hops[0].provider, evidence: { [`${gate.id}.verified`]: 'ok' } }) }),
  integrate: async () => ({ ok: true, evidence: { 'phase.integrated': 'met 1/1' } }),
});
const moves = []; bus.on('RAID_GATE_MOVED', (e) => moves.push(e && (e.payload || e.data || e)));

(async () => {
  console.log('\ntest-gate-tracking — each gate tags and reports its progress (GT2)');

  await test('GT2-01', 'a passing run: a tag per pass on its commit, progress on RAID\'s row, a bus event and an activity row per move', () => quiet(async () => {
    const tags = []; let n = 0; moves.length = 0;
    const versioning = { commit: async () => `vtm-${++n}`, tag: async (t) => { tags.push(t); return { ok: true }; } };
    const seen = [];
    const r = await CI.runContract(contract('ok'), { source: 'idearium', title: 'phase P1', executors: executors(), root: tmp, versioning, compartment: 'repo-gt2', onEvent: (e) => seen.push(e) });
    assert.strictEqual(r.status, 'pass', JSON.stringify(r.result && r.result.why));
    const id = r.audit.bricks.map(b => b.id);
    assert.deepStrictEqual(tags.map(t => t.name.replace(/^gate\/[^/]+\//, '')).sort(), [...id, 'phase'].map(g => `${g}@1`).sort(), JSON.stringify(tags));
    for (const t of tags) assert.match(t.commitId, /^vtm-\d+$/);
    for (const b of r.audit.bricks) assert.match(b.tag || '', new RegExp(`^gate/.+/${b.id.replace(/\./g, '\\.')}@1$`), 'the tag is in the audit');
    const pr = CI.progress(r.queueId);
    assert.ok(pr && pr.passed === pr.total && pr.total === 2 && pr.moves >= 3, JSON.stringify(pr));
    assert.ok(seen.some(e => e.status === 'PASSED' && e.commit && e.progress && e.file), 'the caller sees the commit, the file and the progress');
    const mine = moves.filter(m => m.queueId === r.queueId);
    assert.ok(mine.length === pr.moves && mine.every(m => m.progress), `${mine.length} events for ${pr.moves} moves`);
    const rows = AL.list('repo-gt2', { kind: 'gate' }).rows;
    assert.ok(rows.length >= pr.moves && rows.some(x => /passed — 2\/2/.test(x.title)), JSON.stringify(rows.map(x => x.title)));
  }));

  await test('GT2-02', 'a failing brick: its class and rewind are moves; no tag; progress counts it', () => quiet(async () => {
    const tags = []; let n = 0; const seen = [];
    const versioning = { commit: async () => `vtm-f${++n}`, tag: async (t) => { tags.push(t); }, rewind: async () => ({ ok: true, files: ['lib/b.js'] }) };
    const r = await CI.runContract(contract('fails'), { source: 'idearium', title: 'phase P1 (b fails)', executors: executors({ fail: 'lib/b.js' }), root: tmp, versioning, onEvent: (e) => seen.push(e) });
    assert.strictEqual(r.status, 'fail');
    const b = r.audit.bricks.find(x => x.file === 'lib/b.js');
    assert.ok(seen.some(e => e.gate === b.id && e.status === 'FAILED' && e.class === 'capability'), JSON.stringify(seen.filter(e => e.gate === b.id)));
    assert.ok(seen.some(e => e.gate === b.id && e.status === 'REWOUND' && e.files[0] === 'lib/b.js'), 'the rewind is a move');
    assert.ok(!tags.some(t => t.gate === b.id), 'a brick that never passed is not tagged');
    assert.ok(!b.tag);
    const pr = CI.progress(r.queueId);
    assert.ok(pr.failed === 1 && pr.passed === 1, JSON.stringify(pr));
  }));

  await test('GT2-03', 'tracking never fails a brick: a tag that cannot be written is said once', () => quiet(async (said) => {
    let n = 0;
    const versioning = { commit: async () => `vtm-t${++n}`, tag: async () => { throw new Error('versionium is down'); } };
    const r = await CI.runContract(contract('tagdown'), { source: 'idearium', title: 'tags down', executors: executors(), root: tmp, versioning });
    assert.strictEqual(r.status, 'pass');
    assert.strictEqual(said.filter(x => /gate tags not written in Versionium/.test(x)).length, 1, JSON.stringify(said));
  }));

  await test('GT2-04', 'wired: Idearium hands RAID the tag and the compartment; the Plan draws a move', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(api.includes("tag: ({ name, commitId: c }) => _vcall('POST', '/api/versionium/tags', { repository: target.uuid"), 'tags go to Versionium on the repo');
    assert.ok(/depth: policy\.contractDepth, compartment: target\.uuid/.test(api), 'the compartment is the repo');
    assert.ok(api.includes("state: st, brick: e.gate, file: e.file || null, commit: e.commit || null"), 'each settled move is a row on the Plan\'s ledger');
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8');
    assert.ok(ui.includes('if (l.brick && l.progress)'), 'the Plan draws it');
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50).unref();
})();
