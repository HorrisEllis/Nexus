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

const { unifiedDispatch }      = require('../../lib/warp/dispatch/index');
const { runCascade }           = require('../../lib/warp/dispatch/cascade');
const { FlatFileCrystallizer } = require('../../lib/warp/plugins/crystallizer-flatfile');
const { PopulationStore }      = require('../../lib/warp/dispatch/population');

const crystallizer = new FlatFileCrystallizer({ path: path.join(config.DATA_DIR, 'warp-crystals.json') });
const population    = new PopulationStore({ maxPerClass: 8 });

const MAX_CONCURRENT = config.MAX_CONCURRENT;
const CX_URL         = config.CX_URL;

// §0.39.356 LS1 — James: "ollama or cpilot stream live into the worksurface panel and code tab". What the model has
// written so far, kept on the job while it runs, so GET /api/jobs/:id answers it (copilot's poll sends it on). Capped.
const PARTIAL_MAX = 200000;
function _grow(job, d, kind) {
  const k = kind === 'thinking' ? 'partialThinking' : 'partial';
  job[k] = (job[k] || '') + d;
  if (job[k].length > PARTIAL_MAX) { job[`${k}Dropped`] = (job[`${k}Dropped`] || 0) + job[k].length - PARTIAL_MAX; job[k] = job[k].slice(-PARTIAL_MAX); }
  job.partialAt = Date.now();
}

// §0.39.364 — background intents give way to foreground work: one Ollama, one model in memory at a time. A probe that
// lands while a repo agent's tool loop runs swaps the agent's model out and back (James's log: a 3b probe at 23 s in
// the middle of a phase build). Deferred, not queued: the probe's own schedule tries again.
// RC6 (0.60.187): 'diagnose' — the diagnostic service's gap escalations — is background work too
const BACKGROUND_INTENTS = new Set(['adversarial-probe', 'diagnose']);

async function dispatchJob(job) {
  if (BACKGROUND_INTENTS.has(job.intent)) {
    const busy = [...state.running.values()].filter(j => j && j.uuid !== job.uuid && !BACKGROUND_INTENTS.has(j.intent));
    if (busy.length) {
      job.status = 'failed';
      job.deferred = true;
      job.error = `deferred — background work gives way to ${busy.length} running job(s) (${busy.map(j => j.intent || 'job').join(', ')})`;
      broadcast('ollama.job.failed', { uuid: job.uuid, error: job.error, deferred: true });
      finishJob(job);
      return job;
    }
  }
  job.partial = ''; job.partialThinking = '';
  state.running.set(job.uuid, job);
  job.status = 'running';
  job.startedAt = Date.now();
  broadcast('ollama.job.started', { uuid: job.uuid, model: job.model });

  // §seam-integration 2026-07-02 — SEAM Detector lives in lib/seam/, shared
  // across any provider, not just guardian/NCP paths.
  let detector = null;
  try { detector = require('../../lib/seam/detector.js').Detector; } catch (_) {}

  // §0.39.364 — a name without its tag ("deepseek-coder-v2") is resolved to the one installed tag it means
  let model = job.model || state.defaultModel;
  try { const MI = require('./model-inventory.js'); const m = await MI.resolve(model); if (m && m !== model) { job.modelAsked = model; model = m; job.model = m; } } catch (_) {}
  const { Axiom } = require('../../lib/warp/core/Axiom');
  const axioms = (job.axioms || []).map(a =>
    a instanceof Axiom ? a : new Axiom(a.id || `job.axiom.${Math.random()}`, { severity: a.severity || 'soft', check: a.check || (() => true) }));

  const cascade = ({ event }) => runCascade({
    providers: ['ollama'],
    maxAttempts: 1,
    // OL5b, 2026-11-18 — James: "okay. do it.": the call waits its turn in the Ollama system's one line (ollama/lib/model-turns.js)
    generate: () => require('./model-turns.js').shared().run(model, { caller: `job ${String(job.uuid).slice(0, 8)}${job.owner ? ` for ${job.owner}` : ''}`, door: 'jobs' }, () => callOllamaRaw(model, event.data.prompt, job.maxTokens, job.timeoutMs, `bridge job ${String(job.uuid).slice(0, 8)}${job.intent ? ` (${job.intent})` : ''}${job.owner ? ` for ${job.owner}` : job.sessionId ? ` for ${job.sessionId}` : ''}`,   // §0.39.266 — whose job it is, in the activity log
      { onDelta: (d, kind) => _grow(job, d, kind), ...(job.temperature != null ? { temperature: job.temperature } : {}) })),
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
      job.error = result.source === 'generation-failed' ? `the model did not generate: ${result.error || 'no reason given'}` : 'axiom rejection: ' + JSON.stringify(result.failures || []);   // 0.60.623
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
    _remember(job, model);
  } catch (e) {
    job.status = 'failed';
    job.error = e.message;
    state.statsToday.failed++;
    broadcast('ollama.job.failed', { uuid: job.uuid, error: e.message });
  }
  finishJob(job);
  return job;
}

// §0.39.269 — James: "ollama is supposed to have persistent memory ... using the download manager." Every completed
// bridge job is recorded there (lib/agent-memory.js → the same response-sink + chat index Guardian uses), under the
// agent that asked — whoever the caller was. Not awaited: memory never delays an answer. The self-test is not memory.
function _remember(job, model) {
  if (!job || job.record === false || job.intent === 'adversarial-probe' || job.intent === 'tool-loop' || !job.result) return;   // a tool-loop round is not an exchange; its caller records the final answer
  try {
    require('../../lib/agent-memory.js').record({
      agentId: job.agentId || (job.sessionId ? `copilot-${job.sessionId}` : (job.componentId || 'ollama')),
      provider: 'ollama', model, prompt: job.prompt, response: job.result, jobId: job.uuid,
      compartmentId: job.compartmentId || null, repoUuid: job.repoUuid || null, intent: job.intent, source: 'ollama-bridge',
    }).catch(e => console.warn(`[ollama] memory record failed for job ${String(job.uuid).slice(0, 8)}: ${e.message}`));
  } catch (e) { console.warn(`[ollama] memory unavailable: ${e.message}`); }
}

function finishJob(job) {
  state.running.delete(job.uuid);
  state.complete.unshift(job);
  if (state.complete.length > 100) state.complete.pop();
  pump();
}

// 2026-11-27 — James: "hook it into resource manager, load balancer, the models. we have the tools. fix it. have a physical queue. like it needs
// to wait and retry". The queue is physical (ollama/data/queue.json, read back at start); while the model host does not answer, jobs wait and
// the bridge asks COS (RAID, with what it measured) to start the model the next job needs, at most once a minute per model; the health check
// pumps again the moment the host answers.
const _qfile = require('path').join(__dirname, '..', 'data', 'queue.json'), _woke = {};
function saveQueue() { try { require('fs').mkdirSync(require('path').dirname(_qfile), { recursive: true }); require('fs').writeFileSync(_qfile, JSON.stringify(state.queue.map((j) => ({ ...j, _timer: undefined })))); } catch (_) {} }
function loadQueue() { try { const q = JSON.parse(require('fs').readFileSync(_qfile, 'utf8')); if (Array.isArray(q)) for (const j of q) if (j && j.uuid && !state.queue.some((x) => x.uuid === j.uuid)) { j.status = 'queued'; state.queue.push(j); } } catch (_) {} }
function wakeFor(model) {
  const sys = 'model-' + String(model || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); if (!model || Date.now() - (_woke[sys] || 0) < 60000) return; _woke[sys] = Date.now();
  const proof = { kind: 'measured', decidedBy: 'ollama/lib/dispatch.js', health: 'the model host did not answer the bridge', waiting: state.queue.length + ' job(s) queued', model, at: Date.now() };
  const body = JSON.stringify({ by: 'rule:model-queue', reason: `${state.queue.length} job(s) wait for ${model}`, proof });
  try { const rq = require('http').request({ host: '127.0.0.1', port: 7799, path: `/api/cos/systems/${encodeURIComponent(sys)}/start`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 15000 }, (r) => r.resume()); rq.on('error', () => {}); rq.on('timeout', () => rq.destroy()); rq.end(body); } catch (_) {}
}
function pump() {
  if (!state.ollamaOnline) { if (state.queue.length) { for (const j of state.queue) j.waitingFor = 'the model host to answer'; wakeFor(state.queue[0].model); } saveQueue(); broadcast('ollama.queue.depth', { depth: state.queue.length, running: state.running.size, waiting: !!state.queue.length }); return; }
  while (state.running.size < MAX_CONCURRENT && state.queue.length > 0) {
    const j = state.queue.shift(); delete j.waitingFor; dispatchJob(j);
  }
  saveQueue();
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

module.exports = { dispatchJob, pump, loadQueue, writeToCortex, _remember, _grow };
