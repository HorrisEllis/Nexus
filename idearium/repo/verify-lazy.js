/**
 * idearium/repo/verify-lazy.js — MCO2, verification tiers L6-L8.
 * (nexus-repository-system-build-phasemap.spec, MCO2_verification_deepening)
 *
 * L4-L5 run synchronously inside import-pipeline.js's own DEEPENING step
 * (cheap: pure re-reads of data already in memory/on disk from
 * PARSE/INDEX/GRAPH — see that file's own §MCO2 DEEPENING note). L6-L8
 * do not belong on that path: L6 spawns a process per test file, L7
 * walks the whole affected cone, L8 reads arbitrary repo source looking
 * for route strings — none of that is cheap. §37's own note already
 * says expensive tiers SHOULD run lazily against the affected cone, not
 * eagerly on every import. This module is that lazy path.
 *
 * §NON-BLOCKING BY DESIGN — scheduleLazyVerification() never awaits its
 * own job; it enqueues and returns. import-pipeline.js never awaits it
 * either. A create-project response ships L0-L5 real and complete;
 * L6-L8 land in verification.lazy.json moments later — 'pending' until
 * they do, same non-fatal discipline GRAPHING itself already follows. A
 * slow or failed deep pass costs queryability of L6-L8 only, never the
 * import, never L0-L5.
 *
 * §SHARED QUEUE — lib/work-queue.js's named singleton, concurrency 1.
 * Every repo's lazy pass shares one slot on purpose: N simultaneous
 * project creations must not each spawn their own concurrent
 * test-runner processes and reproduce the exact OOM pattern that
 * module's own header describes.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { affected } from './graph.js';

// lib/work-queue.js is CJS; idearium is type:module. Same bridge pattern
// idearium/api/index.js already uses for every CJS lib/ module.
const _require = createRequire(import.meta.url);
const workQueue = _require('../../lib/work-queue.js');

const MODULE_ID = 'idearium/repo/verify-lazy';
const QUEUE_NAME = 'mco2-deep-verify';
// §EXECUTION GRAPH 0.39.246 — its own queue: runtime proof runs every
// runnable test under coverage (15 s each), which can outlast the 60 s
// ceiling the L6-L8 pass is held to. Same one-at-a-time rule.
const PROOF_QUEUE = 'idearium-runtime-proof';
const PROOF_TIMEOUT_MS = 10 * 60 * 1000;

function loadJsonSafe(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

// ── L6 — targeted runtime/test, basis: MCO1 affected cone, lazy ──────────
// §HONEST SCOPE — test files are found by naming convention across every
// language (the same convention this system's own suites already use:
// tests/modules/test-*.js, *.test.js, *.spec.js, a tests/ or
// __tests__/ directory). Only ones this process can run with ZERO
// framework assumptions — a standalone `node <file>` — are EXECUTED.
// Every other language/framework combination is still FOUND and
// reported 'skipped', with why, never silently dropped, never faked as
// passed (§1.2).
const TEST_FILE_RE = /(?:(?:^|\/)(?:tests?|__tests__)\/.*\.[a-z0-9]+$)|(?:\.(?:test|spec)\.[cm]?[jt]sx?$)/i;

function isTestPath(p) { return TEST_FILE_RE.test(p); }
export { isTestPath }; // §runtime-proof 2026-09-21 — one definition of "a test file", shared with idearium/repo/runtime-proof.js

// §0.39.261 — was execFileSync per test file, INSIDE idearium's process: a
// repo whose affected cone held many tests froze the event loop for up to
// 15 s per file (measured: 126 s for Nexus's own core slice), which is the
// same OFFLINE/phase-gate failure 0.39.260 fixed for materialize. Each test
// now runs as an awaited child process; the loop keeps serving meanwhile.
function _runTestFile(abs, cwd, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let stderr = '', done = false;
    const child = spawn(process.execPath, [abs], { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    const timer = setTimeout(() => { if (!done) { done = true; child.kill('SIGKILL'); resolve({ ok: false, error: `timed out after ${timeoutMs}ms` }); } }, timeoutMs);
    child.stderr.on('data', (c) => { if (stderr.length < 4000) stderr += c; });
    child.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, error: e.message }); } });
    child.on('close', (code) => { if (!done) { done = true; clearTimeout(timer); resolve(code === 0 ? { ok: true } : { ok: false, error: (stderr || `exit ${code}`).slice(0, 2000) }); } });
  });
}

async function runL6(repoDir, coneFiles, { runTests = true } = {}) {
  if (!runTests) {
    return { level: 'L6', name: 'targeted runtime/test', status: 'not_applicable', passed: true,
             reason: 'tests are not run for this repo at import (its tests need files outside it — run them from the COS run menu)', testsFound: 0, testsRun: 0, testsSkipped: 0, results: [] };
  }
  const candidates = coneFiles.filter(f => f.file && isTestPath(f.file));
  const results = [];
  for (const f of candidates) {
    const abs = path.join(repoDir, f.file);
    if (f.language !== 'javascript' || !fs.existsSync(abs)) {
      results.push({
        file: f.file, status: 'skipped',
        reason: f.language ? `no standalone runner for ${f.language}` : 'unknown language',
      });
      continue;
    }
    const r = await _runTestFile(abs, repoDir);
    results.push(r.ok ? { file: f.file, status: 'passed' } : { file: f.file, status: 'failed', error: r.error });
  }
  const ran = results.filter(r => r.status !== 'skipped');
  return {
    level: 'L6', name: 'targeted runtime/test',
    passed: ran.every(r => r.status === 'passed'),
    testsFound: results.length, testsRun: ran.length, testsSkipped: results.length - ran.length,
    results,
  };
}

// ── L7 — integration, lazy cone-scoped ──────────────────────────────────
// §HONEST SCOPE — the graph's 'imports' edges resolve a specifier to a
// FILE (§24-26 RX table); they do not extract which named binding was
// imported — that is a second, deeper parse this module does not own
// (graph.js is the one owner of reference extraction, §17.1). So
// "integration" here is what the data on hand actually supports: a
// resolved import target that does not itself parse cleanly IS a real
// integration break, one L5's plain existence check cannot see (L5 only
// asks whether the target file exists at all, not whether it is usable).
function runL7(graph, filesByPath, coneFileIds) {
  const failures = [];
  for (const e of graph.edges) {
    if (e.relation !== 'imports' || e.resolution !== 'resolved') continue;
    if (!coneFileIds.has(e.from)) continue;
    const targetFile = e.target && filesByPath.get(e.target);
    if (targetFile && targetFile.status === 'failed') {
      failures.push({ from: e.from.replace(/^file:/, ''), to: e.target });
    }
  }
  return { level: 'L7', name: 'integration', passed: failures.length === 0, scope: coneFileIds.size, failures };
}

// ── L8 — system contract ─────────────────────────────────────────────────
// §HONEST SCOPE — the same reconciliation this system's own components
// (cortex, guardian, idearium, ...) already had done to them by hand
// (see each one's interaction-contract.json '_reconciled_*' note),
// automated: a declared route only PASSES if its literal path string is
// found somewhere in the imported repo's own real source. A repo with
// no interaction-contract.json at its root is not a NEXUS-style
// service — this tier is 'not_applicable', not failed. An absent
// contract is not a broken one.
function runL8(repoDir, allFiles) {
  const contractPath = path.join(repoDir, 'interaction-contract.json');
  if (!fs.existsSync(contractPath)) {
    return { level: 'L8', name: 'system contract', passed: true, status: 'not_applicable', reason: 'no interaction-contract.json at repo root' };
  }
  const contract = loadJsonSafe(contractPath);
  if (!contract || !Array.isArray(contract.routes)) {
    return { level: 'L8', name: 'system contract', passed: false, status: 'invalid', reason: 'interaction-contract.json present but has no routes[] array' };
  }
  const SOURCE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rb']);
  let haystack = '';
  for (const f of allFiles) {
    if (!SOURCE_EXT.has(path.extname(f.path || ''))) continue;
    try { haystack += '\n' + fs.readFileSync(path.join(repoDir, f.path), 'utf8'); }
    catch { /* file removed since index was written — skip, don't fault the tier */ }
  }
  const missing = contract.routes.filter(r => r.path && !haystack.includes(r.path));
  return {
    level: 'L8', name: 'system contract', status: 'checked',
    passed: missing.length === 0,
    routeCount: contract.routes.length,
    missing: missing.map(r => ({ method: r.method, path: r.path })),
  };
}

/**
 * scheduleLazyVerification({ repoDir, repository, graph, changedFiles })
 * — enqueues the L6-L8 pass and returns immediately (never awaited by
 * the caller). Writes verification.lazy.json with status:'pending'
 * synchronously before returning, so a reader can never mistake a stale
 * prior result for the current one while this run is in flight.
 */
export function scheduleLazyVerification({ repoDir, repository, graph, changedFiles = [], runtimeProof = true, runTests = true }) {
  const outPath = path.join(repoDir, 'verification.lazy.json');
  const scope = affected(graph, changedFiles);
  const scopedTo = scope.files.map(f => f.file).filter(Boolean);

  try {
    fs.writeFileSync(outPath, JSON.stringify(
      { repository, status: 'pending', scopedTo, scheduledAt: Date.now() }, null, 2), 'utf8');
  } catch (e) {
    console.error(`[${MODULE_ID}] could not write pending state: ${e.message}`);
  }

  const queue = workQueue.get(QUEUE_NAME, { concurrency: 1, maxDepth: 50, timeoutMs: 60000 });

  const job = queue.push(async () => {
    const filesIdx = loadJsonSafe(path.join(repoDir, 'indexes', 'files.json'), []);
    const filesByPath = new Map(filesIdx.map(f => [f.path, f]));
    const coneFileIds = new Set(scope.files.map(f => f.id));

    const tiers = [
      await runL6(repoDir, scope.files, { runTests }),
      runL7(graph, filesByPath, coneFileIds),
      runL8(repoDir, filesIdx),
    ];
    // L4 lives in the synchronous pass — repeating it here would be a
    // second answer to the same question (§10.3). A caller wanting the
    // full L0-L8 picture merges this file with verification.json (see
    // repo.verification, idearium/api/index.js).
    const relevant = tiers.filter(t => t.status !== 'not_applicable');
    const result = {
      repository, status: relevant.every(t => t.passed) ? 'passed' : 'partial',
      scopedTo, tiers, finishedAt: Date.now(),
    };
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
    return result;
  }, `mco2-deep-verify:${repository}`);

  job.catch(e => {
    console.error(`[${MODULE_ID}] lazy verification FAULT for ${repository}: ${e.message}`);
    try {
      fs.writeFileSync(outPath, JSON.stringify(
        { repository, status: 'error', error: e.message, finishedAt: Date.now() }, null, 2), 'utf8');
    } catch (_) { /* best effort — the pending file simply stays as last written */ }
  });

  // §EXECUTION GRAPH 0.39.246 — the second of the three graphs (code ·
  // execution · spec), hooked into every import instead of only running
  // when someone POSTs /api/repos/:uuid/proof. Queued AFTER the L6-L8 job
  // for this repo, so proof.json always reflects the chunks this import
  // just wrote. Its state lands in verification.lazy.json under
  // `runtimeProof` — pending, then the summary, or the real error.
  if (!runtimeProof) return { scheduled: true, scopedTo, runtimeProof: 'off' };
  const proofQueue = workQueue.get(PROOF_QUEUE, { concurrency: 1, maxDepth: 50, timeoutMs: PROOF_TIMEOUT_MS });
  const _mark = (runtimeProof) => {
    try {
      const cur = loadJsonSafe(outPath, {}) || {};
      fs.writeFileSync(outPath, JSON.stringify({ ...cur, runtimeProof }, null, 2), 'utf8');
    } catch (e) { console.error(`[${MODULE_ID}] could not record runtime proof state: ${e.message}`); }
  };
  const proofJob = job.catch(() => {}).then(() => { _mark({ status: 'pending', scheduledAt: Date.now() });
    return proofQueue.push(async () => {
      const { computeRuntimeProof } = await import('./runtime-proof.js');
      const r = computeRuntimeProof({ repoDir, repository });
      _mark(r.ok ? { status: 'built', summary: r.proof.summary, generatedAt: r.proof.generatedAt }
                 : { status: 'failed', error: r.error });
      return r;
    }, `runtime-proof:${repository}`);
  });
  proofJob.catch(e => _mark({ status: 'failed', error: e.message }));

  return { scheduled: true, scopedTo, runtimeProof: 'queued' };
}

/** readLazyVerification(repoDir) — the current L6-L8 state, whatever it
 *  is (pending/passed/partial/error), or null if never scheduled. */
export function readLazyVerification(repoDir) {
  return loadJsonSafe(path.join(repoDir, 'verification.lazy.json'), null);
}

export { MODULE_ID, QUEUE_NAME, PROOF_QUEUE };
