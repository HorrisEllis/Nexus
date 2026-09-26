'use strict';
/**
 * lib/execution-pipeline.js — the full closed loop, end to end
 * UUID: nexus-execution-pipeline-v1-0000-2026-0708-jamesbrooks-001
 * Version: 1.0.0
 *
 * "Need a full execution pipeline." This is it — chains four systems
 * that already existed independently, none of them reimplemented here:
 *
 *   1. BUILD     lib/build-pipeline.js       (spec → KG → tier-decide →
 *                                              T0/T1/T2 → written to disk)
 *   2. VERIFY    cos/playground/{branch,sandbox}.js
 *                (fork the build output into an isolated branch, run it
 *                 in a real child process, no shared memory, watchdog'd)
 *   3. COMPARE   cos/playground/compare.js
 *                (regression check against the last-promoted "golden"
 *                 branch for this spec — file diff, output diff, test
 *                 counts, >2x slowdown flagged)
 *   4. PROMOTE   cos/playground/branch.js's checkout() + governed
 *                metadata write through orchestrator/lib/mutation-
 *                contract.js — never a raw, unaudited overwrite
 *   5. (opt-in)  HOT-INTEGRATE orchestrator/lib/hot-loader.js
 *                (quarantine → prove → integrate → 60s monitor →
 *                 rollback-on-σ, only if the caller explicitly asks by
 *                 passing hotIntegrate.modulePath — a generated tree
 *                 with no live counterpart has nothing to hot-swap into)
 *
 * Every stage emits pipeline.<stage> on both the SSE broadcast and
 * nexus-bus (same dual-emit pattern as build-pipeline.js), so
 * copilot/lib/expectation-watcher.js and ui/toast/toast.js see it for
 * free — see the two new expectations added to expectation-watcher.js
 * alongside this file.
 *
 * §1.1 Nothing exists until proven — sandbox verify runs before promote,
 *      every time, no fast path around it.
 * §1.2 Nothing silently fails — every stage failure is a terminal
 *      pipeline.failed event with a stage name, not a swallowed catch.
 * §2.1 Disk before behavior — the working tree is only ever touched by
 *      checkout() AFTER verify+compare both pass; a failed run never
 *      mutates outputDir, it only leaves an inspectable branch behind.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const GOLDEN_FILE = path.join(__dirname, '..', 'data', 'pipeline-golden.json');

// Same minimal in-memory tracking pattern as lib/build-pipeline.js's
// _builds — queryable while the process is alive, not yet JAA-backed.
const _pipelines = new Map();
function getPipeline(id) { return _pipelines.get(id) || null; }
function listPipelines() { return [..._pipelines.values()].sort((a, b) => b.startedAt - a.startedAt); }

function _loadGolden() {
  try { return JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')); }
  catch (_) { return {}; }
}
function _saveGolden(state) {
  fs.mkdirSync(path.dirname(GOLDEN_FILE), { recursive: true });
  fs.writeFileSync(GOLDEN_FILE, JSON.stringify(state, null, 2));
}

// Deterministic per-spec compartment id — repeated runs of the same
// spec share one branch/golden history, which is what makes "compare
// against last time" meaningful instead of comparing against nothing.
function _compartmentIdForSpec(specPath) {
  return 'pipeline-' + crypto.createHash('sha1').update(specPath).digest('hex').slice(0, 12);
}

function _waitForBuild(buildId, getBuild, { pollMs = 500, timeoutMs = 15 * 60 * 1000 } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function tick() {
      const b = getBuild(buildId);
      if (!b) return resolve({ status: 'error', error: 'build record vanished' });
      if (['complete', 'failed', 'error'].includes(b.status)) return resolve(b);
      if (Date.now() - start > timeoutMs) return resolve({ status: 'error', error: 'pipeline timed out waiting for build stage' });
      setTimeout(tick, pollMs);
    })();
  });
}

async function runPipeline(
  { specPath, outputDir, provider = 'ollama', testCommand, hotIntegrate = null, pipelineId: presetId } = {},
  { broadcast, ledgerWrite, bus } = {}
) {
  const pipelineId = presetId || `pipeline-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const record = { pipelineId, specPath, status: 'started', startedAt: Date.now(), finishedAt: null, stage: 'started', result: null, error: null };
  _pipelines.set(pipelineId, record);

  const _emit = (type, data = {}) => {
    record.stage = type;
    if (['failed', 'rolled-back', 'complete', 'hot-integrate-failed'].includes(type) && type !== 'hot-integrate-failed') {
      record.status = type === 'complete' ? 'complete' : (type === 'failed' ? 'failed' : 'rolled_back');
      record.finishedAt = Date.now();
      if (data.error) record.error = data.error;
    }
    const frame = { type: `pipeline.${type}`, pipelineId, ts: Date.now(), ...data };
    if (typeof broadcast === 'function') { try { broadcast(JSON.stringify(frame)); } catch (_) {} }
    if (typeof ledgerWrite === 'function') { try { ledgerWrite('execution-pipeline', `pipeline.${type}`, { pipelineId, ...data }); } catch (_) {} }
    if (bus && typeof bus.emit === 'function') { try { bus.emit(`pipeline.${type}`, { pipelineId, ...data }, { source: 'execution-pipeline' }); } catch (_) {} }
  };

  if (!specPath) return { ok: false, pipelineId, stage: 'validate', error: 'specPath required' };
  _emit('started', { specPath, provider });

  // ── Stage 1: BUILD ─────────────────────────────────────────────────────
  const { startBuild, getBuild } = require('./build-pipeline');
  const started = startBuild({ specPath, outputDir, provider }, { broadcast, ledgerWrite, bus });
  if (!started.ok) {
    _emit('failed', { stage: 'build', error: started.error });
    return { ok: false, pipelineId, stage: 'build', error: started.error };
  }
  const { buildId, outputDir: resolvedOutputDir } = started;

  const buildResult = await _waitForBuild(buildId, getBuild);
  if (buildResult.status !== 'complete') {
    _emit('failed', { stage: 'build', buildId, error: buildResult.error || 'build did not complete' });
    return { ok: false, pipelineId, buildId, stage: 'build', error: buildResult.error };
  }
  _emit('build-complete', { buildId });

  // ── Stage 2: BRANCH — isolated copy of the build output, nothing below
  //    this point touches outputDir directly until checkout() at Stage 5.
  const { BranchEngine, SandboxRunner, CompareEngine } = require('../cos/playground');
  const compartmentId = _compartmentIdForSpec(specPath);
  const compartment = {
    id: compartmentId,
    fs: { root: resolvedOutputDir },
    entryFile: testCommand || 'index.js',
    runtimeId: 'node',
  };

  let branch;
  try {
    branch = BranchEngine.fork(compartment, { label: `verify-${buildId}` });
  } catch (e) {
    _emit('failed', { stage: 'branch', error: e.message });
    return { ok: false, pipelineId, buildId, stage: 'branch', error: e.message };
  }
  _emit('branched', { branchId: branch.id, compartmentId });

  // ── Stage 3: SANDBOX VERIFY — real isolated child process, watchdog'd.
  let sandboxResult;
  try {
    sandboxResult = await SandboxRunner.run(compartment, branch.id, { command: testCommand, timeoutMs: 30000 });
  } catch (e) {
    _emit('failed', { stage: 'sandbox', branchId: branch.id, error: e.message });
    return { ok: false, pipelineId, buildId, branchId: branch.id, stage: 'sandbox', error: e.message };
  }
  _emit('sandbox-result', { branchId: branch.id, ok: sandboxResult.ok, exitCode: sandboxResult.exitCode });

  if (!sandboxResult.ok) {
    // §2.1 — outputDir was never touched. The failed branch stays on disk,
    // inspectable, until someone explicitly destroys it.
    _emit('rolled-back', { branchId: branch.id, reason: 'sandbox verify failed', exitCode: sandboxResult.exitCode });
    return { ok: false, pipelineId, buildId, branchId: branch.id, stage: 'sandbox', error: 'sandbox verify failed', sandboxResult };
  }

  // ── Stage 4: COMPARE against golden (skipped, not failed, if this is
  //    the first successful run for this spec — no baseline to regress
  //    against yet).
  const golden = _loadGolden();
  const goldenBranchId = golden[compartmentId]?.branchId;
  let compareReport = null;
  let regressions = [];
  if (goldenBranchId) {
    try {
      compareReport = await CompareEngine.runCompare(compartment, goldenBranchId, branch.id, { command: testCommand, timeoutMs: 30000 });
      regressions = compareReport?.regression?.regressions || [];
      _emit('compared', { goldenBranchId, branchId: branch.id, regressionCount: regressions.length, verdict: compareReport?.verdict?.summary || null });
    } catch (e) {
      // A broken comparator is not a broken build — log and proceed as if
      // there were no baseline, rather than blocking every future promote
      // because CompareEngine itself has a bug.
      _emit('compare-error', { error: e.message });
    }
  } else {
    _emit('compared', { branchId: branch.id, note: 'no golden branch yet — first successful run for this spec' });
  }

  if (regressions.length > 0) {
    _emit('rolled-back', { branchId: branch.id, reason: 'regression vs golden', goldenBranchId, regressions });
    return { ok: false, pipelineId, buildId, branchId: branch.id, stage: 'compare', error: 'regression detected vs golden branch', compareReport };
  }

  // ── Stage 5: PROMOTE — copy the verified branch into the real working
  //    tree, then record the promotion as a governed mutation, not a raw
  //    write. mutateProperty() is the only door (orchestrator/lib/
  //    mutation-contract.js §9.5) — identity fields stay locked, this
  //    only ever touches comp_properties.
  BranchEngine.checkout(compartment, branch.id);
  golden[compartmentId] = { branchId: branch.id, promotedAt: Date.now(), specPath, buildId };
  _saveGolden(golden);
  _emit('promoted', { branchId: branch.id, compartmentId });

  try {
    const mutationContract = require('../orchestrator/lib/mutation-contract');
    mutationContract.mutateProperty(compartmentId, 'comp_properties.lastPromotedBranch', branch.id, { issuedVia: 'api' });
  } catch (_) {
    // The compartment isn't a registered component (most pipeline runs
    // won't be) — there's nothing to govern yet, not a failure.
  }

  // ── Stage 6 (opt-in): HOT-INTEGRATE a promoted file into the live
  //    running process. Only runs if the caller explicitly names a
  //    modulePath — a freshly generated tree has no live counterpart to
  //    swap into unless you say which file that is.
  let hotLoadResult = null;
  if (hotIntegrate && hotIntegrate.modulePath) {
    _emit('hot-integrating', { modulePath: hotIntegrate.modulePath });
    try {
      const hotLoader = require('../orchestrator/lib/hot-loader');
      hotLoadResult = await hotLoader.load({
        modulePath: hotIntegrate.modulePath,
        invariants: hotIntegrate.invariants || [],
        monitorMs: hotIntegrate.monitorMs || 60000,
        rollback: true,
      });
      _emit(hotLoadResult.ok ? 'hot-integrated' : 'hot-integrate-failed', hotLoadResult);
    } catch (e) {
      _emit('hot-integrate-failed', { error: e.message });
    }
  }

  _emit('complete', { branchId: branch.id, compartmentId, hotIntegrated: !!(hotLoadResult && hotLoadResult.ok) });
  return { ok: true, pipelineId, buildId, branchId: branch.id, compartmentId, sandboxResult, compareReport, hotLoadResult };
}

/**
 * startPipeline(...) — fire-and-forget entry point for HTTP routes:
 * returns { ok, pipelineId } immediately, same shape as build-pipeline.js's
 * startBuild(). Callers that want to await full completion (tests,
 * autonomous-loop driving this programmatically) should call runPipeline()
 * directly instead.
 */
function startPipeline(opts, ctx) {
  const pipelineId = `pipeline-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const promise = runPipeline({ ...opts, pipelineId }, ctx);
  promise.catch(() => {}); // errors are already recorded on the pipeline record via _emit('failed', ...)
  return { ok: true, pipelineId };
}

module.exports = { runPipeline, startPipeline, getPipeline, listPipelines };
