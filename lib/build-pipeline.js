'use strict';
/**
 * lib/build-pipeline.js — HTTP/SSE front door for the closed build loop
 * UUID: nexus-build-pipeline-v1-0000-2026-0707-jamesbrooks-001
 * Version: 1.0.0
 *
 * §GAP CLOSED 2026-07-07 — the closed loop this wraps already exists and
 * already works: emerge/compiler/pipeline.js's compile() builds a real
 * KnowledgeGraph (kg-builder), computes gap-field + tier decisions
 * (tier-contract, gap-field-engine), produces an executionPlan
 * (reply-engine), and emerge/compiler/t2-gate.js's run() drives T0→T1
 * emission then dispatches every T2 node to Guardian's SEAMQueue →
 * Ollama, writes the result to disk, registers it with Cortex. Checked
 * before writing this: t2-gate.run(specPath, outputDir, opts) IS "build
 * this spec, no exceptions" — one call, already real.
 *
 * What did NOT exist: any way to reach it except a CLI/direct require.
 * No orchestrator route, no SSE stream, no browser UI. This file is
 * that front door — it does not reimplement any compiler/dispatch
 * logic, it only tracks a buildId per run and re-emits t2-gate's own
 * onProgress callback as bus events, the same broadcast() path every
 * other system's live events already use.
 *
 * §1.2  Every build failure is caught, tagged with buildId, never silent.
 * §2.1  Build state written to _builds before any broadcast fires.
 */

const crypto = require('crypto');
const path   = require('path');

// One in-memory registry of builds this orchestrator process has seen.
// Not JAA-backed yet (§FUTURE — should move to the same ledger pattern
// as bridge/ledger.js once orchestrator adopts push()/recall()) — this
// is intentionally the minimal real thing, not a stub: state is fully
// queryable via getBuild()/listBuilds() while the process is alive.
const _builds = new Map();

function _newBuildId() {
  return `build-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * startBuild({ specPath, outputDir, provider, dryRun }, { broadcast, ledgerWrite })
 *
 * broadcast(json)      — same function orchestrator.js already exposes;
 *                        every stage emits one broadcast frame.
 * ledgerWrite(sys,type,payload) — optional; same signature as
 *                        orchestrator.js's existing ledgerWrite().
 *
 * Returns immediately with { ok, buildId }. The actual compile+dispatch
 * runs async; callers subscribe to the SSE stream (or poll getBuild)
 * for progress, exactly like every other long-running job in NEXUS
 * (Guardian's job queue works the same way — this doesn't invent a
 * second pattern for "long thing, poll or stream it").
 */
function startBuild({ specPath, outputDir, provider = 'ollama', dryRun = false } = {}, { broadcast, ledgerWrite, bus } = {}) {
  if (!specPath) return { ok: false, error: 'specPath required' };
  const buildId = _newBuildId();
  const resolvedOutput = outputDir || path.join(path.dirname(specPath), `${path.basename(specPath, '.spec')}-build`);

  const record = {
    buildId,
    specPath,
    outputDir: resolvedOutput,
    provider,
    status: 'started',
    startedAt: Date.now(),
    finishedAt: null,
    nodes: {},       // nodeName -> { status, detail, ts }
    error: null,
    result: null,
  };
  _builds.set(buildId, record);

  const _emit = (type, data = {}) => {
    const frame = { type: `build.${type}`, buildId, ts: Date.now(), ...data };
    if (typeof broadcast === 'function') {
      try { broadcast(JSON.stringify(frame)); } catch (_) {}
    }
    if (typeof ledgerWrite === 'function') {
      try { ledgerWrite('build-pipeline', `build.${type}`, { buildId, ...data }); } catch (_) {}
    }
    // expectation-watcher listens on nexusBus, not on the SSE broadcast
    // string channel — without this, "build started but never finished"
    // could never be detected, since the watcher would never see it fire.
    if (bus && typeof bus.emit === 'function') {
      try { bus.emit(`build.${type}`, { buildId, ...data }, { source: 'build-pipeline' }); } catch (_) {}
    }
  };

  _emit('started', { specPath, outputDir: resolvedOutput, provider });

  // EAS4f 2026-11-05 — t2-gate's closed loop (compile → KG → tier decide → T0/T1 emit → T2 dispatch/verify/write) is Emerge's: asked
  // through its door (POST /compiler/run), never its files (§5.15). His EAS_D9: "Emerge calls back by route" — Cortex's build-host
  // routes and Guardian's own ask route (RAID, the economy) are named to Emerge. This module adds tracking and broadcast, nothing else.
  // Named differences: the per-node progress arrives after the run, from Emerge's list (it was live); an unconnected provider fails fast
  // with its reason (the SEAM queue waited). The files come back as text and are written to the output folder, as before.
  const fs = require('fs');
  const nx = require('./nexus-client.js');
  const onProgress = (node, status, detail) => {
    if (node) {
      record.nodes[node] = { status, detail: detail || null, ts: Date.now() };
      _emit('node', { node, status, detail: detail || null });
    } else {
      _emit('stage', { status, detail: detail || null });
    }
  };
  Promise.resolve().then(() => fs.readFileSync(specPath, 'utf8')).then((spec) => nx.post('emerge', '/compiler/run', {
    spec, name: path.basename(specPath), dryRun: !!dryRun,
    host:  { name: 'nexus-cortex', ping: nx.urlOf('cortex', '/api/emerge-host/ping'), preflight: nx.urlOf('cortex', '/api/emerge-host/preflight'), writeback: nx.urlOf('cortex', '/api/emerge-host/writeback') },
    model: { api: 'route', name: 'guardian', url: nx.urlOf('guardian', '/api/copilot/prompt'), extra: { provider, timeoutMs: 600000 } },
  }, { timeout: 1800000 })).then((r) => {
    for (const g of r.progress || []) onProgress(g.node, g.status, g.detail);
    for (const [rel, text] of Object.entries(r.files || {})) { const f = path.join(resolvedOutput, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
    return { ok: !!r.ok, stage: r.stage, summary: r.summary || null, message: r.summary || null, error: r.error || null, t2Result: r.t2 ? { ...r.t2 } : null };
  }).then((result) => {
    record.status = result.ok ? 'complete' : 'failed';
    record.finishedAt = Date.now();
    record.result = result;
    if (!result.ok) record.error = result.error || result.t2Result?.results?.filter(r => r.status !== 'complete');
    _emit(result.ok ? 'complete' : 'failed', {
      stage: result.stage,
      summary: result.summary || result.message || null,
      error: result.ok ? null : (result.error || 'one or more T2 nodes failed'),
    });
  }).catch((e) => {
    record.status = 'error';
    record.finishedAt = Date.now();
    record.error = e.message;
    _emit('error', { error: e.message });
  });

  return { ok: true, buildId, outputDir: resolvedOutput };
}

function getBuild(buildId) {
  return _builds.get(buildId) || null;
}

function listBuilds() {
  return [..._builds.values()].sort((a, b) => b.startedAt - a.startedAt);
}

module.exports = { startBuild, getBuild, listBuilds };
