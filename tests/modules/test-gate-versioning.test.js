'use strict';
/**
 * tests/modules/test-gate-versioning.test.js — GS1 (docs/2026-10-15-one-contract-raid-releases-phasemap.spec): a
 * snapshot per gate, rewind, compare. contract-gates schedule({ versioning }) / compare · contract-intake runContract
 * (replay engine) · contract-adapters audit · Idearium's wiring.
 * James: "rewind engine and snapshots for each gate, comparing using the contract, for the gating what ever is needed".
 *
 *   GV-01  a brick that passes records the commit it passed at — on its checkpoint, its evidence and the audit
 *   GV-02  a brick that fails is put back to its last good state before its retry: the planted half-write is gone when
 *          the retry starts, the rewind is recorded (to what, which files), and the log says REWOUND
 *   GV-03  a transient failure (the agent never answered) is not rewound — nothing was written
 *   GV-04  compare: a gate whose input changed reads STALE with the evaluator's reason, names the commit it passed at,
 *          and the caller's diff is asked for exactly its files since that commit
 *   GV-05  each brick's outcome is a decision on the replay engine's log under the run's RAID queue id
 *   GV-06  wired: Idearium's build gives RAID the versioning (Versionium commit, restore-file, proposals set aside), the
 *          route compares (?gate=), the command (--gate), the Plan shows commit / class / rewind
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const CG = require(path.join(ROOT, 'cortex/core/raid/contract-gates.js'));
const CA = require(path.join(ROOT, 'cortex/core/raid/contract-adapters.js'));
const CI = require(path.join(ROOT, 'cortex/core/raid/contract-intake.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-gs1-'));
const write = (rel, t) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), t); };
write('docs/x-phasemap.spec', 'phases:\n  P1: { files: [lib/a.js, lib/b.js] }\n');
const plan = { intent: 'two files', conditions: [], order: ['lib/a.js', 'lib/b.js'], files: [
  { path: 'lib/a.js', new: true, layer: 'kernel', exports: [{ name: 'x' }], imports: [], steps: ['export x'] },
  { path: 'lib/b.js', new: true, layer: 'engine', exports: [{ name: 'y' }], imports: ['./a.js: x'], steps: ['use x'] }] };
const built = () => CA.fromPhasePlan(plan, { phaseKey: 'P1', title: 'two', inputs: [{ id: 'map', path: 'docs/x-phasemap.spec' }], root: tmp });

// a tiny Versionium: commits are snapshots of a Map of files
function fakeVersions() {
  const files = new Map(); const commits = []; const rewinds = [];
  const commit = () => { commits.push(new Map(files)); return `c${commits.length}`; };
  const base = commit();
  return { files, commits, rewinds, base,
    versioning: {
      commit: async () => commit(),
      rewind: async ({ gate, toCommit }) => {
        const snap = commits[Number(String(toCommit || base).slice(1)) - 1] || new Map();
        const f = gate.file; rewinds.push({ gate: gate.id, toCommit });
        if (snap.has(f)) files.set(f, snap.get(f)); else files.delete(f);
        return { ok: true, files: [f] };
      },
    } };
}

(async () => {
  console.log('\ntest-gate-versioning — a snapshot per gate, rewind, compare (GS1)');

  await test('GV-01', 'a passing brick records the commit it passed at (checkpoint, evidence, audit)', () => quiet(async () => {
    const V = fakeVersions(); const L = built(); L.payload.state.baseCommit = V.base;
    const agent = CA.agentExecutor({ route: () => [{ provider: 'ollama' }], boundaries: { budget: () => null },
      dispatch: async (hops, { gate }) => { V.files.set(gate.file, `// ${gate.file} ok`); return { ok: true, provider: 'ollama', evidence: { [`${gate.id}.verified`]: 'ok' } }; } });
    const r = await CG.schedule(L.payload, { root: tmp, executors: { agent, integrate: async () => ({ ok: true, evidence: { 'phase.integrated': 'met 1/1' } }) }, versioning: V.versioning });
    assert.ok(r.complete, JSON.stringify(r.why));
    const cps = L.payload.state.checkpoints.filter(c => c.gate !== 'phase');
    assert.ok(cps.length === 2 && cps.every(c => /^c\d+$/.test(c.commit)), JSON.stringify(cps));
    const au = CA.audit(L.payload, { root: tmp });
    assert.ok(au.bricks.every(b => /^c\d+$/.test(b.commit)), JSON.stringify(au.bricks));
  }));

  await test('GV-02', 'a failed brick is put back to its last good state before its retry (the half-write is gone)', () => quiet(async () => {
    const V = fakeVersions(); const L = built(); L.payload.state.baseCommit = V.base; L.payload.failure = { retry_limit: 3 };
    let tries = 0; const sawAtStart = [];
    const agent = CA.agentExecutor({ route: () => [{ provider: 'ollama' }, { provider: 'claude' }], boundaries: { budget: () => null },
      dispatch: async (hops, { gate }) => {
        if (gate.file !== 'lib/b.js') { V.files.set(gate.file, 'ok'); return { ok: true, provider: hops[0].provider, evidence: { [`${gate.id}.verified`]: 'ok' } }; }
        sawAtStart.push(V.files.get('lib/b.js') || null);
        tries++;
        if (tries === 1) { V.files.set('lib/b.js', 'HALF-WRITTEN by a failed attempt'); return { ok: false, provider: hops[0].provider, error: 'the export y is missing' }; }
        V.files.set('lib/b.js', 'module.exports = { y: 1 }'); return { ok: true, provider: hops[0].provider, evidence: { [`${gate.id}.verified`]: 'ok' } };
      } });
    const r = await CG.schedule(L.payload, { root: tmp, executors: { agent, integrate: async () => ({ ok: true, evidence: { 'phase.integrated': 'met 1/1' } }) }, versioning: V.versioning });
    assert.ok(r.complete, JSON.stringify(r.why));
    assert.deepStrictEqual(sawAtStart, [null, null], 'the retry started from known-good — the half-write was rewound away');
    const gb = L.payload.gates.find(g => g.file === 'lib/b.js' && !g.parent).id;
    assert.ok(V.rewinds.some(x => x.gate === gb && x.toCommit === V.base));
    assert.ok(r.log.some(l => l.gate === gb && l.status === 'REWOUND'));
    const rw = JSON.parse(L.payload.state.evidence[`${gb}.rewound`]); assert.ok(rw.ok && rw.to === V.base && rw.files[0] === 'lib/b.js');
    assert.ok(CA.audit(L.payload, { root: tmp }).bricks.find(b => b.id === gb).rewound, 'the audit shows the rewind');
  }));

  await test('GV-03', 'a transient failure (never answered) is not rewound', () => quiet(async () => {
    const V = fakeVersions(); const L = built(); L.payload.state.baseCommit = V.base;
    let n = 0;
    const agent = CA.agentExecutor({ route: () => [{ provider: 'ollama' }], boundaries: { budget: () => null },
      dispatch: async (hops, { gate }) => { if (gate.file === 'lib/a.js' && n++ === 0) return { ok: false, provider: 'ollama', transient: true, error: 'timed out' }; V.files.set(gate.file, 'ok'); return { ok: true, provider: 'ollama', evidence: { [`${gate.id}.verified`]: 'ok' } }; } });
    await CG.schedule(L.payload, { root: tmp, executors: { agent, integrate: async () => ({ ok: true, evidence: { 'phase.integrated': 'met 1/1' } }) }, versioning: V.versioning });
    assert.strictEqual(V.rewinds.length, 0);
  }));

  await test('GV-04', 'compare: STALE with the reason, the commit it passed at, the diff of its files since', () => quiet(async () => {
    const V = fakeVersions(); const L = built();
    const agent = CA.agentExecutor({ route: () => [{ provider: 'ollama' }], boundaries: { budget: () => null },
      dispatch: async (hops, { gate }) => ({ ok: true, provider: 'ollama', evidence: { [`${gate.id}.verified`]: 'ok' } }) });
    await CG.schedule(L.payload, { root: tmp, executors: { agent, integrate: async () => ({ ok: true, evidence: { 'phase.integrated': 'met 1/1' } }) }, versioning: V.versioning });
    const ga = L.payload.gates.find(g => g.file === 'lib/a.js' && !g.parent).id;
    write('docs/x-phasemap.spec', 'phases:\n  P1: { files: [lib/a.js, lib/b.js], changed: yes }\n');
    const asked = [];
    const c = await CG.compare(L.payload, ga, { root: tmp, diff: async ({ from, files }) => { asked.push({ from, files }); return { 'lib/a.js': { files: [{ path: 'lib/a.js', patch: '+x' }] } }; } });
    assert.ok(c.stale && c.reasons.some(r => /changed|STALE|input/i.test(r)), JSON.stringify(c));
    assert.ok(/^c\d+$/.test(c.commit));
    assert.deepStrictEqual(asked[0], { from: c.commit, files: ['lib/a.js', 'docs/x-phasemap.spec'] });
    write('docs/x-phasemap.spec', 'phases:\n  P1: { files: [lib/a.js, lib/b.js] }\n');
  }));

  await test('GV-05', "each brick's outcome is a decision on the replay engine's log under the run's queue id", () => quiet(async () => {
    const V = fakeVersions(); const L = built(); const f = path.join(tmp, 'gv5.contract'); CG.save(f, L);
    const agent = CA.agentExecutor({ route: () => [{ provider: 'ollama' }, { provider: 'claude' }], boundaries: { budget: () => null },
      dispatch: async (hops, { gate }) => ({ ok: true, provider: hops[0].provider, evidence: { [`${gate.id}.verified`]: 'ok' } }) });
    const r = await CI.runContract(f, { source: 'idearium', title: 'gv5', root: tmp, versioning: V.versioning, executors: { agent, integrate: async () => ({ ok: true, evidence: { 'phase.integrated': 'met 1/1' } }) } });
    assert.strictEqual(r.status, 'pass');
    const RE = require(path.join(ROOT, 'lib/replay-engine.js'));
    const ds = RE.listDecisions(r.queueId, 50);
    const rows = (Array.isArray(ds) ? ds : (ds.decisions || [])).filter(d => d.snapshotId === r.queueId);
    assert.ok(rows.length === 2 && rows.every(d => d.outcome === 'success' && d.chosen === 'ollama'), JSON.stringify(ds).slice(0, 400));
  }));

  await test('GV-06', 'wired: Idearium gives RAID the versioning; route, command and Plan show it', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/p\.state\.baseCommit = p\.state\.baseCommit \|\| commitId/.test(api) && /RHx\.restoreFile\(_vcall, target\.uuid, toCommit/.test(api) && /RIx\.reject\(/.test(api) && /causedBy: runId, versioning,/.test(api));
    assert.ok(/if \(query\.gate\)/.test(api) && /CG\.compare\(L\.payload/.test(api));
    assert.ok(fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8').includes('[--gate id]'));
    assert.ok(/passed at \$\{String\(b\.commit\)/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8')));
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50).unref();
})();
