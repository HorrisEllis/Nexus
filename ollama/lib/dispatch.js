'use strict';
/**
 * ollama/lib/dispatch.js
 * Owns the job lifecycle: pulling from the queue, running each job through
 * WARP's unifiedDispatch (crystallized cache + axiom scoring + cascade),
 * SEAM quality-checking the result, and writing the outcome to Cortex.
 *
 * §GAP CLOSED 2026-07-05: WARP (warp/dispatch/) had zero production
 * callers anywhere in this codebase before this file's predecessor code
 * in server.js. NEXUS importing WARP is the allowed direction per WARP's
 * own spec ("NEXUS imports WARP, WARP never imports NEXUS") — nothing in
 * warp/ changes or knows about ollama; this module adapts ollama's job
 * shape to WARP's five-primitive interface.
 */

const crypto = require('crypto');
const http   = require('http');
const path   = require('path');
const config = require('../config.js');
const { state, broadcast } = require('./state.js');
const { callOllamaRaw } = require('./ollama-client.js');

const { unifiedDispatch }      = require('../../warp/dispatch/index');
const { runCascade }           = require('../../warp/dispatch/cascade');
const { FlatFileCrystallizer } = require('../../warp/plugins/crystallizer-flatfile');
const { PopulationStore }      = require('../../warp/dispatch/population');

const crystallizer = new FlatFileCrystallizer({ path: path.join(config.DATA_DIR, 'warp-crystals.json') });
const population    = new PopulationStore({ maxPerClass: 8 });

const MAX_CONCURRENT = config.MAX_CONCURRENT;
const CX_URL         = config.CX_URL;

async function dispatchJob(job) {
  state.running.set(job.uuid, job);
  job.status = 'running';
  job.startedAt = Date.now();
  broadcast('ollama.job.started', { uuid: job.uuid, model: job.model });

  // §seam-integration 2026-07-02 — SEAM Detector lives in lib/seam/, shared
  // across any provider, not just guardian/NCP paths.
  let detector = null;
  try { detector = require('../../lib/seam/detector.js').Detector; } catch (_) {}

  const model = job.model || state.defaultModel;
  const { Axiom } = require('../../warp/core/Axiom');
  const axioms = (job.axioms || []).map(a =>
    a instanceof Axiom ? a : new Axiom(a.id || `job.axiom.${Math.random()}`, { severity: a.severity || 'soft', check: a.check || (() => true) }));

  const cascade = ({ event }) => runCascade({
    providers: ['ollama'],
    maxAttempts: 1,
    generate: () => callOllamaRaw(model, event.data.prompt, job.maxTokens, job.timeoutMs),
    validate: (output) => ({ ok: true, output }), // hard-axiom filtering happens in unifiedDispatch itself
  }).then(r => ({ ok: r.ok, output: r.output, attempts: r.attempts }));

  try {
    const result = await unifiedDispatch({
      gateSignature: `ollama.${model}`,
      gateClass:     `ollama.${model}`,
      event:         { data: { prompt: job.prompt } },
      axioms, cascade,
      crystallizer,
      population,
      scorer: ({ axiomFailures }) => 1 - axiomFailures.length * 0.1,
      log: null,
    });

    if (!result.ok) {
      job.status = 'failed';
      job.error = 'axiom rejection: ' + JSON.stringify(result.failures || []);
      state.statsToday.failed++;
      broadcast('ollama.job.failed', { uuid: job.uuid, error: job.error });
      finishJob(job);
      return job;
    }

    job.result      = result.output || '';
    job.warpSource  = result.source; // 'crystal' (cache hit) | 'generated' | 'pre-generation-reuse'
    job.status      = 'complete';
    job.completedAt = Date.now();
    job.durationMs  = job.completedAt - job.startedAt;

    // SEAM quality check — same Detector used by guardian for NCP responses.
    // Orthogonal to the WARP wiring above: WARP decides whether to
    // regenerate; Detector decides whether what came back, cached or
    // fresh, is actually good.
    if (detector && job.result) {
      const profile    = detector.profile(job.result);
      const truncation = detector.truncation(job.result, profile);
      const sigma       = detector.sigma(job.result, profile);
      job.seamScore = { truncated: truncation.truncated, composite: sigma.composite, passed: !truncation.truncated && sigma.composite < 0.35 };
      if (!job.seamScore.passed) broadcast('ollama.seam.quality_low', { uuid: job.uuid, score: job.seamScore });
    }

    state.statsToday.completed++;
    broadcast('ollama.job.complete', {
      uuid: job.uuid, durationMs: job.durationMs, model,
      componentId: job.componentId, hookId: job.hookId,
      requestId: job.requestId, intent: job.intent, warpSource: job.warpSource,
    });
    writeToCortex(job);
  } catch (e) {
    job.status = 'failed';
    job.error = e.message;
    state.statsToday.failed++;
    broadcast('ollama.job.failed', { uuid: job.uuid, error: e.message });
  }
  finishJob(job);
  return job;
}

function finishJob(job) {
  state.running.delete(job.uuid);
  state.complete.unshift(job);
  if (state.complete.length > 100) state.complete.pop();
  pump();
}

function pump() {
  while (state.running.size < MAX_CONCURRENT && state.queue.length > 0) {
    dispatchJob(state.queue.shift());
  }
  broadcast('ollama.queue.depth', { depth: state.queue.length, running: state.running.size });
}

function writeToCortex(job) {
  const row = {
    uuid:        crypto.randomUUID(),
    jobId:       job.uuid,
    componentId: job.componentId || 'ollama.jobs.dispatch',
    hookId:      job.hookId      || 'ollama.jobs.dispatch.complete',
    contractId:  job.contractId  || 'nexus-interaction-contract-v1::ollama',
    requestId:   job.requestId,
    sessionId:   job.sessionId,
    intent:      job.intent,
    agent:       'ollama',
    model:       job.model || state.defaultModel,
    prompt:      (job.prompt || '').slice(0, 500),
    response:    (job.result || '').slice(0, 2000),
    status:      job.status,
    durationMs:  job.durationMs,
    progress:    job.status === 'complete' ? 'complete' : 'failed',
    ts:          Date.now(),
    source:      'ollama',
  };
  const body = JSON.stringify({ table: 'chat_log', row });
  try {
    const u = new URL(`${CX_URL}/api/memory/insert`);
    const r = http.request({
      hostname: u.hostname, port: u.port || 3748, path: u.pathname,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 3000,
    });
    r.on('error', () => {});
    r.write(body); r.end();
  } catch (_) {}
}

module.exports = { dispatchJob, pump, writeToCortex };
