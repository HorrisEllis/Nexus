'use strict';
/**
 * lib/phase-close.js — SL1: a proven, landed phase closes itself; undoing its change reopens it.
 * comp_id: nexus.lib.phase-close
 * Spec: docs/self-building-loop.spec MOD-SL-CLOSE (SL2's byEvidence joins it later, MOD-SL-EVIDENCE-CLOSE).
 * Map: docs/2026-10-23-self-building-loop-phasemap.spec SL1.
 *
 * James, 2026-10-23: "whats the most important? can you help me build, invent, innovate, ways for idearium to build phases, all of
 * them, we need this to work so it can start building itself." · "contiue getting idearium building phases"
 * Found: nothing marked a phase done. The only status writes were 'active' when a build starts and the manual POST …/phases/status,
 * so a proven run left its phase open and DG1 refused every phase that depends on it until he marked it by hand.
 *
 * Stands on (§8.6): the one status writer (idearium/api _phaseSetStatus → idearium/repo/roadmap.js setPhaseStatus, which proves loom
 * reads the edit back), the run rows (idearium_phase_runs: a proof row says 'proven'), and the changes (lib/repo-inject.js: each
 * change names its run, lib/change-entry.js runOf). Nothing here writes a file: the caller passes the writer and keeps the records.
 *
 *   landed(run, { injects })                                       → { landed, proven, waiting[], why }
 *   closeIfLanded({ repo, run, injects, setStatus, version, closes }) → { closed, record?, why }
 *   reopenIfUndone({ repo, inject, setStatus, closes })            → { reopened, record?, why }
 *
 * A proof met only by proposals (any change of the run not yet applied) never closes: the proof ran against overlays, so "proven" can
 * be true with nothing on disk. A rejected or reverted change means part of the run did not land: not closed, said.
 */
const VERSION = '1.1.0';   // 1.1.0 SL2 byEvidence

function baseRun(id) { return String(id || '').replace(/-(review|proof)$/, ''); }
function runOfInject(n) { const s = (n && n.source) || {}; return baseRun(s.runId || s.run || (n && n.task && n.task.runId) || ''); }

/** the changes of one run (any of its -review / -proof ids) */
function injectsOf(runId, injects = []) { const b = baseRun(runId); return injects.filter(n => runOfInject(n) === b); }

/**
 * run = { runId, map, phase, proven: bool }   proven: some row of the run (its -proof row) says 'proven'
 */
function landed(run, { injects = [] } = {}) {
  if (!run || !run.runId) return { landed: false, proven: false, waiting: [], why: 'no run' };
  if (!run.proven) return { landed: false, proven: false, waiting: [], why: `run ${run.runId} is not proven (${run.state || 'no proof row'})` };
  // 0.60.226 — the looking-glass SP5 case: proven on file checks alone (no test, command or page ran). Not closed, said.
  if (run.strength && run.strength.filesOnly) return { landed: false, proven: true, filesOnly: true, waiting: [], why: `proven on file checks only: nothing ran${run.strength.untested && run.strength.untested.length ? ` (promised a test, checked a file: ${run.strength.untested[0]})` : ''} — it shows the files are there, not that they work` };
  const mine = injectsOf(run.runId, injects);
  const waiting = mine.filter(n => n.status === 'proposed' || n.status === 'staged').map(n => n.path);
  const refused = mine.filter(n => n.status === 'rejected' || n.status === 'reverted');
  if (refused.length) return { landed: false, proven: true, waiting, why: `part of the run did not land: ${refused.map(n => `${n.path} ${n.status}`).join(', ')}` };
  if (waiting.length) return { landed: false, proven: true, waiting, why: `proven against proposals: ${waiting.length} change(s) not applied yet (${waiting.slice(0, 5).join(', ')})` };
  const applied = mine.filter(n => n.status === 'applied');
  return { landed: true, proven: true, waiting: [], applied: applied.map(n => n.uuid),
    why: applied.length ? `proven, and its ${applied.length} change(s) are applied` : 'proven, and the run changed nothing (its phase was already true on disk)' };
}

/** the live close of a run: its newest record (the table is append-only: a reopen is a newer row), unless that one reopened it */
function _openClose(closes, runId) {
  const b = baseRun(runId);
  const last = [...(closes || [])].filter(c => c && baseRun(c.runId) === b).sort((x, y) => (x.reopenedAt || x.at || 0) - (y.reopenedAt || y.at || 0)).pop();
  return last && !last.reopenedAt ? last : null;
}

async function closeIfLanded({ repo, run, injects = [], setStatus, version = null, closes = [] } = {}) {
  const l = landed(run, { injects });
  if (!l.landed) return { closed: false, why: l.why, waiting: l.waiting };
  const had = _openClose(closes, run.runId);
  if (had) return { closed: false, already: true, record: had, why: `already closed by run ${run.runId} (${new Date(had.at).toISOString().slice(0, 10)})` };
  if (typeof setStatus !== 'function') return { closed: false, why: 'no status writer given' };
  const note = `${version ? `${version} — ` : ''}proven by run ${baseRun(run.runId)}${run.snapshot ? `, on snapshot ${String(run.snapshot).slice(0, 12)}` : ''}`;
  const w = await setStatus(repo, { map: run.map, phase: run.phase, status: 'complete', note, reason: `SL1: ${l.why}` });
  if (!w || !w.ok) return { closed: false, why: `the status writer refused: ${(w && w.error) || 'no answer'}`, refused: w && w.extra || null };
  const record = { kind: 'run', runId: baseRun(run.runId), repoUuid: repo && repo.uuid || null, map: run.map, phase: run.phase, at: Date.now(),
    version, note, why: l.why, injects: l.applied || [], via: w.data && w.data.change && w.data.change.via || null, before: w.data && w.data.change && w.data.change.before || null };
  return { closed: true, record, why: l.why };
}

/** inject = a change just reverted (or rejected after apply); closes = the close records */
async function reopenIfUndone({ repo, inject, setStatus, closes = [] } = {}) {
  if (!inject || inject.status !== 'reverted') return { reopened: false, why: 'not a revert' };
  const runId = runOfInject(inject);
  if (!runId) return { reopened: false, why: 'the change names no run' };
  const c = _openClose(closes, runId);
  if (!c) return { reopened: false, why: `run ${runId} closed no phase` };
  if (typeof setStatus !== 'function') return { reopened: false, why: 'no status writer given' };
  const note = `reopened: ${inject.path} of run ${runId} was undone`;
  const w = await setStatus(repo, { map: c.map, phase: c.phase, status: 'active', note, reason: `SL1: ${note}` });
  if (!w || !w.ok) return { reopened: false, why: `the status writer refused: ${(w && w.error) || 'no answer'}` };
  return { reopened: true, record: { ...c, reopenedAt: Date.now(), reopenedBy: inject.uuid, reopenNote: note }, why: note };
}

// ── SL2 (0.60.224): done by evidence ─────────────────────────────────────────────────────────────────────────────────────────
// James, 2026-10-23: "next" (after SL1 merged). The backlog's "pending" is often stale (GA1 shipped 0.60.161 and still said pending);
// SL0 found phases whose every file exists. This closes those whose OWN tests pass, and only those. Decided by the axioms
// (TRUTH_OVER_COHERENCE, §0.1 evidence over memory): a test that merely requires a hot shared file (idearium/api/index.js is in dozens
// of open phases) proves nothing about any one phase, so evidence counts only from
//   'own'    a test file the phase names in its own files:
//   'linked' a test tied to one of its files by require or path (lib/test-map.js, never by name alone), where that file is named by at
//            most SHARED_MAX open phases, and the test is specific to it: named for it, or one of at most SPECIFIC_MAX tests reaching it
// No such test → open, said ("no test can check it"). A test that fails or times out → open, naming it. A missing file → open.
// dryRun is the default: it runs the tests and lists what would close, and writes nothing.
const SHARED_MAX = 3;
const SPECIFIC_MAX = 3;   // a file reached by more tests than this is judged only by a test named for it
const TEST_RX = /(^|\/)(tests?|__tests__)\/|\.test\.[cm]?js$|\.spec\.[cm]?js$/;

/** phases [{ key, map, id, files }] (open ones) → each with the tests that may judge it, or why none */
function evidenceTests(phases, { root, exists, testsFor, sharedMax = SHARED_MAX } = {}) {
  const fs = require('fs'), path = require('path');
  const has = exists || ((f) => { try { return fs.statSync(path.join(root, f)).isFile(); } catch (_) { return false; } });
  const tf = testsFor || ((f) => require('./test-map.js').testsFor(f, { root }));
  const uses = new Map(); for (const p of phases) for (const f of new Set(p.files || [])) uses.set(f, (uses.get(f) || 0) + 1);
  return phases.map((p) => {
    const files = [...new Set(p.files || [])];
    const missing = files.filter(f => !has(f));
    if (!files.length) return { ...p, tests: [], missing: [], why: 'it names no files' };
    if (missing.length) return { ...p, tests: [], missing, why: `${missing.length} of its files do not exist: ${missing.slice(0, 3).join(', ')}` };
    const tests = new Map();
    for (const f of files) if (TEST_RX.test(f) && /\.[cm]?js$/.test(f)) tests.set(f, 'own');
    for (const f of files) {
      if (TEST_RX.test(f) || (uses.get(f) || 0) > sharedMax) continue;
      // specific to the file: the test's own name carries the file's name, or few tests reach the file at all (a store every test
      // requires is not evidence for the phase that owns it)
      const reach = tf(f).filter(t => t.how === 'requires' || t.how === 'path');
      const stem = path.posix.basename(f).replace(/\.[cm]?js$/, '').toLowerCase();
      for (const t of reach) {
        const named = stem.length >= 4 && path.posix.basename(t.file).toLowerCase().includes(stem);
        if ((named || reach.length <= SPECIFIC_MAX) && !tests.has(t.file)) tests.set(t.file, `linked:${f}`);
      }
    }
    const list = [...tests].map(([file, how]) => ({ file, how })).slice(0, 6);
    return { ...p, tests: list, missing: [], why: list.length ? null : `no test can check it (its files are shared by more than ${sharedMax} open phases, or no test reaches them)` };
  });
}

// each test in its own throwaway data root and its own process group, killed with it — what tests/modules/run-all.js does (§8.6):
// without it a test that touches a store wrote into the live tree (found 2026-10-23: the first Nexus dry run left ledgers in data/)
function _runNode(root, timeoutMs) {
  const { spawn } = require('child_process');
  return (file) => new Promise((resolve) => {
    const t0 = Date.now();
    const sb = require('./test-sandbox.js').childEnv();
    const group = process.platform !== 'win32';
    const c = spawn(process.execPath, [file], { cwd: root, env: sb.env, stdio: ['ignore', 'pipe', 'pipe'], detached: group });
    const kill = () => { try { if (group) process.kill(-c.pid, 'SIGKILL'); else c.kill('SIGKILL'); } catch (_) {} };
    let out = '', timedOut = false; const keep = (d) => { out = (out + d).slice(-4000); };
    c.stdout.on('data', keep); c.stderr.on('data', keep);
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    c.on('close', (code) => { clearTimeout(timer); kill(); sb.cleanup(); resolve({ file, passed: code === 0 && !timedOut, code, timedOut, ms: Date.now() - t0, tail: out.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 300) }); });
    c.on('error', (e) => { clearTimeout(timer); sb.cleanup(); resolve({ file, passed: false, code: null, error: e.message, ms: Date.now() - t0 }); });
  });
}

/**
 * byEvidence({ phases, root, dryRun = true, setStatus, repo, runTest, concurrency, limit, date })
 *   → { closed: CloseRecord[], wouldClose: [...], open: [{ key, map, id, missing, why, failed }], ran: [{ file, passed, ... }], dryRun }
 * runTest(file) → { passed, ... } (default: node <file> in root, 180 s)
 */
async function byEvidence({ phases = [], root, dryRun = true, setStatus = null, repo = null, runTest = null, concurrency = 2, limit = Infinity, date = new Date().toISOString().slice(0, 10), exists, testsFor } = {}) {
  const judged = evidenceTests(phases, { root, exists, testsFor });
  const checkable = judged.filter(p => p.tests.length).slice(0, limit);
  const open = judged.filter(p => !p.tests.length).map(p => ({ key: p.key, map: p.map, id: p.id, missing: p.missing, why: p.why }));
  const run = runTest || _runNode(root, 180000);
  const results = new Map();
  const queue = [...new Set(checkable.flatMap(p => p.tests.map(t => t.file)))];
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => { while (queue.length) { const f = queue.shift(); results.set(f, await run(f)); } }));
  const closed = [], wouldClose = [];
  for (const p of checkable) {
    const rs = p.tests.map(t => ({ ...t, ...(results.get(t.file) || { passed: false, error: 'not run' }) }));
    const failed = rs.filter(r => !r.passed);
    if (failed.length) { open.push({ key: p.key, map: p.map, id: p.id, missing: [], why: `${failed.length} of its ${rs.length} test(s) failed${failed.some(f => f.timedOut) ? ' (a timeout counts as failed)' : ''}: ${failed.map(f => f.file).join(', ')}`, failed: failed.map(f => f.file) }); continue; }
    const note = `by evidence — ${rs.map(r => `${r.file.split('/').pop()} (${r.how === 'own' ? 'its own' : 'linked'})`).join(', ')}`;
    const record = { kind: 'evidence', runId: `evidence-${date}-${p.id}`, repoUuid: repo && repo.uuid || null, map: p.map, phase: p.id, at: Date.now(), note, why: `every file exists and ${rs.length} test(s) passed`, tests: rs.map(r => ({ file: r.file, how: r.how, ms: r.ms })) };
    if (dryRun || typeof setStatus !== 'function') { wouldClose.push(record); continue; }
    const w = await setStatus(repo, { map: p.map, phase: p.id, status: 'complete', note, reason: `SL2: ${record.why}` });
    if (w && w.ok) closed.push(record); else open.push({ key: p.key, map: p.map, id: p.id, missing: [], why: `the status writer refused: ${(w && w.error) || 'no answer'}` });
  }
  return { version: VERSION, dryRun: !!dryRun || typeof setStatus !== 'function', checked: checkable.length, closed, wouldClose, open, ran: [...results.values()] };
}

module.exports = { VERSION, SHARED_MAX, baseRun, runOfInject, injectsOf, landed, closeIfLanded, reopenIfUndone, evidenceTests, byEvidence };
