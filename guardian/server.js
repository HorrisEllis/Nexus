'use strict';

// §CONFIG 2026-08-23 — real, centralized config, not scattered inline
// constants. See guardian/config.js's own header for the full real
// scope and reasoning, matching the established ollama/config.js and
// intelligence/config.js pattern from earlier this session.
const config = require('./config.js');

// §BUILD 2026-08-30 — ET2_guardian_event_taxonomy. Same real, fail-open
// boot-time self-check already wired for clear-glass — a real shape
// violation gets a loud console warning, never blocks guardian from
// starting.
try {
  const taxonomy = require('./event-taxonomy');
  const { validateTaxonomy } = require('../lib/event-taxonomy-pattern.js');
  const result = validateTaxonomy(taxonomy, { systemName: 'guardian' });
  if (!result.ok) {
    console.warn(`[Guardian/EventTaxonomy] ${result.errors.length} real shape violation(s) in event-taxonomy.js:`);
    result.errors.forEach(e => console.warn(`  - ${e}`));
  }
} catch (err) {
  console.warn(`[Guardian/EventTaxonomy] validation itself failed (non-fatal): ${err.message}`);
}

const http       = require('http');
// NCP — NEXUS Channel Protocol (replaces WebSocket entirely)
// Zero external dependencies. SSE server→browser, fetch() browser→server.
// See lib/ncp.js for protocol spec.
const { createNCPServer }    = require('../guardian/lib/ncp');
const { createCFRLedger } = require('../intelligence/cfr/ledger');
const { Detector }          = require('../lib/seam/detector.js');
const GapHunter             = require('../intelligence/gap/hunter');
const { SEAMQueue, STATE }  = require('../lib/seam/queue.js');
const { parseSpec, parseSpecFile, extractPrerequisite } = require('../lib/seam/spec-parser.js');
const { createQueue }       = require('../lib/queue');
const { createBaseline }    = require('../intelligence/baseline');
// §PHASE-15-CLOSE: /cli/exec previously only matched its own static switch
// table — any command for a component registered after this file was last
// edited had no path in. This wires guardian's dispatch into the same
// grammar-engine + component-registry the CLI and request-handler already
// read, via the shared lib/grammar-fallback.js resolver — not duplicated
// inline (§5.7 low coupling, high cohesion).
const grammarFallback = require('../guardian/lib/grammar-fallback');
// §ACK-INJECTION-FIX 2026-09-02 — James, live: "ack is injecting way to much
// into chatgpt, the tools are for that exact reason. need the intent map and
// hats." Real, checked root cause: createJob() below has never carried any
// hat/persona information — every browser-dispatched job (chatgpt, gemini,
// perplexity, claude) got a generic, always-on context blob
// (pullIntelligenceContext + pullCortexContext, guardian/userscript-*.js)
// stacked in front of the actual prompt, regardless of what the prompt
// needed, because there was no cheaper, more targeted alternative wired in.
// There already IS one: lib/intent-hat-router.js's suggestHat() (built
// 2026-08-17) classifies the prompt's real verb and returns a real hat with
// a short personaPrompt and a real toolScope — built for copilot's own
// internal dispatch, never reached the browser-agent path until now. Wired
// in here (read-only — suggestHat() never mutates copilot's current-agent
// state, safe to call per-job) so a job can carry { name, personaPrompt,
// toolScope } instead of nothing, and each userscript's own handleJob (see
// that file's own §ACK-INJECTION-FIX comment) can use the short persona
// instead of the generic blob, and narrow its tools list to the hat's real
// scope instead of the county-wide list every job got before.
// §DECOMPILED 2026-09-02 — intent-hat-router/hat-forge were only used by
// _suggestJobHat/createJob, both now in guardian/lib/jobs.js (which requires
// them itself). Removed here rather than left as unused dead requires.
const { wireGuardianCore } = require('./lib');

// Per-kernel baseline monitor — establishes runtime baseline from first 20 events
// Sigma deviations → gap.found in JAA
const _baseline = createBaseline({
  name:           'guardian',
  ledgerDir:      require('path').join((process.env.NEXUS_DATA_ROOT || require('path').join(__dirname, '..', 'data')), 'guardian', 'ledger'),
  failuresDir:    require('path').join(__dirname, '../data/guardian/failures'),
  invariantDir:   require('path').join(__dirname, '../data/guardian/invariant'),
  baselineN:      20,
  sigmaThreshold: 0.3,
  onGap: (gap) => {
    // Surface as JAA gap
    try {
      jaa.insert('gaps', {
        uuid: gap.uuid, type: 'baseline_deviation', path: 'guardian/baseline',
        body: `Guardian baseline deviation: sigma=${gap.sigma} frictions=${JSON.stringify(gap.frictions)}`,
        severity: gap.sigma > 0.7 ? 'high' : 'medium',
        status: 'open', source: 'guardian-baseline',
        causedBy: null, createdAt: Date.now(), attempts: 0, ts: Date.now(),
      });
    } catch(_) {}
    bus.emit('guardian.baseline.deviation', gap);
  },
});

// Guardian's physical queue — survives restarts
const _physQueue = createQueue({
  inputDir:    require('path').join(__dirname, '../data/guardian/input'),
  outputDir:   require('path').join(__dirname, '../data/guardian/output'),
  failuresDir: require('path').join(__dirname, '../data/guardian/failures'),
  logsDir:     require('path').join(__dirname, '../data/guardian/conversations'),
  queueDir:    require('path').join(__dirname, '../data/guardian/queue'),
});

// Replay any pending items from before restart (§LAW II physical redundancy)
const _replayed = _physQueue.replay();
if (_replayed.length) {
  console.log('[guardian] replayed', _replayed.length, 'interrupted queue items');
}

// ── Shared SEAM queue builder ────────────────────────────────────────────────
// Both the file-drop watcher below (.spec files landing in data/guardian/input/)
// and POST /command build a SEAMQueue from spec text. These were two separate
// call sites that drifted apart — the file-watcher one rotted into a
// constructor call that always threw (3 positional args against a constructor
// that destructures a single object) while nothing ever exercised that path to
// catch it. One function now. Both callers use it — that class of drift can't
// recur because there's only one place left for it to recur in.
// §BUILT 2026-07-14 — the real enforcement decision, kept pure and
// separately testable on purpose: no I/O, no RAID call, no queue
// construction — just "given this provider and this size, should this
// go through the real chunker instead of a single raw dispatch."
// Threshold matches spec-parser's own real maxChunkSize default (3000) —
// content already past one real chunk's worth is exactly the case this
// exists to catch, not just multi-chunk-sized content.
const CHUNK_ENFORCED_PROVIDERS = Object.freeze(['ollama', 'chatgpt']);
const CHUNK_ENFORCE_THRESHOLD  = config.CHUNK_ENFORCE_THRESHOLD;

function _shouldEnforceChunking(provider, combinedSize) {
  return CHUNK_ENFORCED_PROVIDERS.includes(provider) && combinedSize > CHUNK_ENFORCE_THRESHOLD;
}

function _buildSeamQueue(specText, opts = {}) {
  const {
    provider     = 'chatgpt',
    title        = null,
    splitOn      = 'heading',
    maxChunkSize = 3000,
  } = opts;

  const plan = parseSpec(specText, { splitOn, maxChunkSize });

  // §LAW II — SEAMQueue constructor writes seam_session to JAA before this returns
  const queue = new SEAMQueue({
    title: title || plan.meta.name || 'Untitled Spec',
    provider,
    chunks: [
      // Chunk 0: prerequisite — INTAKE, no implementation yet
      { title: '§ Prerequisites', content: plan.prerequisiteBlock, builtPrompt: plan.prerequisiteBlock, axioms: [] },
      // Chunks 1..N: actual spec content with SEAM contracts
      ...plan.chunks.map(c => ({ title: c.title, content: c.content, builtPrompt: c.builtPrompt, axioms: plan.axioms })),
    ],
    jaa,
    // bus.emit is wrapped (below, once bus exists) to write every event to the
    // CFR ledger first — no separate _evLedger.record() call needed here. The
    // old /command path called both, which double-logged every SEAM event.
    busEmit: (type, data) => bus.emit(type, data),
    ncpPush: (prov, data) => ncp.push(prov, data),
    onComplete: (stats) => {
      _activeQueues.delete(queue.uuid);
      bus.emit('guardian.seam.queue.complete', { queueId: queue.uuid, ...stats });
    },
  });

  _activeQueues.set(queue.uuid, queue);
  return { queue, plan };
}

// ── Watch input/ folder — process .pending files as they arrive ───────────
// .spec files  → SEAMQueue dispatch
// .md/.txt     → simple job dispatch
// .json        → structured dispatch (prompt or spec field)
// File must exist before processing (§LAW II) — queue.watchInput atomically
// renames .pending → .processing before running
_physQueue.watchInput(async (data, filename) => {
  const parts    = filename.split('.');
  const ext      = parts[parts.length - 1];
  const queueUid = parts[0];

  // Spec files → SEAMQueue
  if (ext === 'spec') {
    const specText = typeof data === 'string' ? data :
      (data._raw || data.content || JSON.stringify(data));
    const provider = data._meta?.provider || data.provider || 'claude';
    const title    = data._meta?.title    || data.title    || null;
    console.log('[guardian queue] spec arrived:', filename.slice(0, 40));
    try {
      const { queue } = _buildSeamQueue(specText, { provider, title });
      if (ncp.isConnected(provider)) queue.start();
      else bus.emit('guardian.tab.needed', { provider, jobId: queueUid });
    } catch(e) {
      console.error('[guardian queue] spec dispatch failed:', e.message);
    }

  // Text/markdown → simple job
  } else if (ext === 'md' || ext === 'txt') {
    const raw     = typeof data === 'string' ? data : (data._raw || data.content || '');
    const prompt  = raw.replace(/^---[^]*?---\n/, '').trim();
    if (!prompt) return;
    const provider = 'claude';
    console.log('[guardian queue] text job arrived:', filename.slice(0, 40));
    const job = createJob(provider, 'queue', prompt);
    jobs.set(job.id, job);
    bus.emit('guardian.job.queued', { jobId: job.id, provider, filename });
    if (ncp.isConnected(provider)) dispatchJob(job);
    else bus.emit('guardian.tab.needed', { provider, url: null, jobId: job.id });

  // JSON → route by content
  } else if (ext === 'json') {
    const body     = typeof data === 'object' ? (data.data || data) : {};
    const provider = body.provider || 'claude';
    if (body.spec) {
      _physQueue.enqueue({ content: body.spec, ext: 'spec', provider,
        uuid: queueUid + '-s', source: 'queue-json' });
    } else if (body.prompt) {
      const chosen = body.provider ? body.provider : await chooseProvider(body.prompt, 'claude', body.preferred || '');
      const job = createJob({ command: body.command || 'queue', provider: chosen, prompt: body.prompt });
      jobs.set(job.id, job);
      dispatchJob(job);
    }
  }
});

// Active SEAM queues — keyed by queueId
// §LAW II — queue state persisted to JAA, this is a performance index only
const _activeQueues = new Map();

// §FIXED 2026-08-17 — James: "debug the bottom of each system." Checked:
// _activeQueues.delete() only ever fires from a queue's own real
// onComplete callback — confirmed reachable, but if a queue's real
// processing stalls or the pipeline crashes before reaching completion,
// nothing else ever removes it. Same real class as the _sessions fix
// (copilot/server.js) and the NCP isConnected() fix (guardian/lib/ncp.js)
// already built and verified this session — real staleness check plus a
// periodic sweep, using the queue's own real updatedAt (kept fresh by
// SEAMQueue itself, lib/seam/queue.js:141). Lower real-world frequency
// than the sessions bug (queues are per-build, not per-message), but the
// same real risk shape and the fix is cheap given the pattern's already
// proven — worth closing while already auditing this file.
const QUEUE_STALE_MS = config.QUEUE_STALE_MS; // builds can legitimately run long; 1 hour of no update is a real, generous bar before calling it stalled — see guardian/config.js
const _queueSweep = setInterval(() => {
  const now = Date.now();
  let evicted = 0;
  for (const [id, q] of _activeQueues) {
    if (now - (q.updatedAt || q.createdAt || 0) > QUEUE_STALE_MS) { _activeQueues.delete(id); evicted++; }
  }
  if (evicted) console.log(`[guardian] queue sweep: evicted ${evicted} stalled queue(s), ${_activeQueues.size} remain`);
}, 10 * 60 * 1000);
if (_queueSweep.unref) _queueSweep.unref();

// Find the queue whose currently-dispatched compartment owns this jobId.
// Used by NCP_COMPLETE/NCP_ERROR below to close the loop SEAM dispatch opens
// in seam-queue.js's _dispatch() — a SEAM chunk's jobId is never registered
// in the `jobs` Map (that's for raw jobs only), so without this, a completed
// or errored SEAM chunk's result had nowhere to go. The watchdog forcing a
// retry was the only thing that ever moved a compartment past GENERATING —
// even a fully successful response was silently dropped. This is what
// actually closes that loop; the watchdog stays as the safety net for when
// no response ever arrives at all.
// §WIRED 2026-08-14 — the missing half of P4 (guardian/tool-runtime.js).
// That module's resolveJob already READS job.tool_calls; nothing anywhere
// WROTE it (checked: grepped guardian/ for any assignment, zero — the
// loop's plumbing was real, this one piece wasn't). A browser-tab reply
// is plain DOM text, not a native tool-calling response, so the model is
// told (see tool-runtime.js's run() systemPrompt) to emit a fenced
// ```tool_call block. This parses that convention back into the same
// {name, arguments} shape _extractToolCalls() already expects from a
// native provider, so both paths converge on one contract, not two.
function _extractToolCallsFromDOM(text) {
  if (!text) return null;
  const calls = [];
  const re = /```tool_call\s*\n([\s\S]*?)\n```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed && parsed.name) {
        calls.push({ name: parsed.name, arguments: parsed.arguments || {} });
      }
    } catch (_) {
      // malformed block — skip it rather than fail the whole response;
      // the loop just sees no tool call and treats the text as final.
    }
  }
  return calls.length ? calls : null;
}

function _findActiveSeamCompartment(jobId) {
  if (!jobId) return null;
  for (const queue of _activeQueues.values()) {
    if (queue._active && queue._active.jobId === jobId) return queue;
  }
  return null;
}

const { randomUUID } = require('crypto');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const { execSync } = require('child_process');

// §0.39.261 — express and multer were loaded here "optionally" and never used
// (uploads go through guardian/artifact-upload.js, routing through node:http);
// removed with them from package.json.

// ── SISOStream — hoisted here so bus is available before any module code runs ─
// §5.7 single event bus. Must be declared before NCP callbacks, gate registrations,
// and any bus.on() / bus.emit() calls lower in the file.
// §2.3 StreamLog: all state observable
const _sisoLog = [];
let _streamSeq = 0;
const _LOG_MAX  = config.SISO_LOG_MAX;

// §FEED 0.39.244 — /events carried only {seq,type,ts,claimed}: no payload at all. So
// idearium/lib/guardian-stream.cjs's "live guardian.job.complete/.error subscription"
// read ev.data.jobId, got undefined, and never resolved anything (only its boot sweep
// ever did). And nothing downstream could tell whose job an event was. A guardian.job.*
// frame now carries a compact payload, with the job's agentId looked up here once (most
// emit sites know only the jobId). Compact on purpose: a chunk frame carries the delta and
// the running length, never `full` — the whole reply again on every chunk.
const _FEED_KEYS = ['jobId', 'provider', 'agentId', 'stage', 'how', 'reason', 'error', 'gate', 'status', 'chars',
  'transport', 'chatUrl', 'anchor', 'mutations', 'generating', 'waitedMs', 'retry', 'needsUser',
  'reset', 'source', 'state', 'label', 'detail', 'fix'];   // 0.39.256 — chunk reset/source; guardian.job.gate frames (lib/gate-trail.js)
function _feedFrame(frame, type, data) {
  if (!type || !type.startsWith('guardian.job.') || !data || typeof data !== 'object') return frame;
  try {
    const d = {};
    for (const k of _FEED_KEYS) if (data[k] !== undefined && data[k] !== null) d[k] = data[k];
    // A reset chunk is the whole reply so far (0.39.256): keep its live end, which is what the Agent tab shows.
    if (typeof data.text === 'string' && type === 'guardian.job.chunk') d.text = data.reset ? data.text.slice(-8000) : data.text.slice(0, 2000);
    if (typeof data.full === 'string') d.fullLen = data.full.length;
    if (!d.agentId && d.jobId) { try { const j = jobs.get(d.jobId); if (j && j.agentId) d.agentId = j.agentId; } catch (_) { /* jobs not initialised yet during early boot */ } }
    return { ...frame, data: d };
  } catch (_) { return frame; }
}

class SISOStream {
  constructor() {
    this.gates     = new Map();
    this._listeners = new Map();
    this.logLevel  = 'EVENTS';
  }
  register(gate) {
    if (this.gates.has(gate.signature))
      throw new Error(`[§1.2 SISOStream] Signature collision: '${gate.signature}'`);
    this.gates.set(gate.signature, gate);
  }
  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }
  off(type, fn) {
    this._listeners.get(type)?.delete(fn);
  }
  emit(type, data = {}) {
    const seq     = _streamSeq++;
    const ts      = Date.now();
    const gate    = this.gates.get(type);
    const claimed = gate ? gate.signature : null;
    if (this.logLevel !== 'OFF') {
      const entry = { seq, ts, type, claimed };
      if (this.logLevel === 'DATA') entry.data = data;
      _sisoLog.push(entry);
      if (_sisoLog.length > _LOG_MAX) _sisoLog.shift();
    }
    if (gate) gate.transform({ type, data }, this);
    const dynListeners = this._listeners.get(type);
    if (dynListeners?.size) {
      for (const fn of dynListeners) {
        try { fn({ type, data }); } catch(e) {
          console.error(`[§1.2 siso.listener.${type}] ${e.message}`);
        }
      }
    }
    cockpitBroadcast(_feedFrame({ seq, type, ts, claimed }, type, data));
    if (!type.startsWith('dom.') && !type.startsWith('guardian.heartbeat')) {
      _kernelEmit(type, data, ts);
    }
    // §BUGFIX-BEFORE-SHIP 2026-08-30 — caught before ever running this:
    // the first version called this.emit('gate.checked'/'gate.failed', ...)
    // unconditionally, from inside emit() itself. Since those two types
    // are (correctly) not in guardian's own taxonomy, checking THEM would
    // itself report unexpected and emit another gate.failed, which would
    // check itself and emit again — real, unbounded recursion that would
    // crash the process on the very first event guardian ever emits.
    // Explicit self-referential guard breaks it: gate.checked/gate.failed
    // never get checked against themselves.
    if (type !== 'gate.checked' && type !== 'gate.failed') {
      try {
        const { checkEvent, recordOccurrence } = require('../lib/sigma-gate.js');
        const taxonomyKey = type.toUpperCase().replace(/\./g, '_');
        const result = checkEvent({ type: taxonomyKey, system: 'guardian', payload: data });
        // §VOLUME — only the real failure signal gets emitted, not a
        // second event for every single real success too. ET6's own
        // phasemap entry only ever asks for "toast per gate FAILURE" —
        // emitting gate.checked on every pass would double guardian's
        // entire real event volume for a signal nothing asked for,
        // echoing the exact diagnostic console-spam lesson this same
        // session already found and fixed once (service/nexus-
        // diagnostic.js's own registry-fallback warning).
        if (!result.expected) {
          recordOccurrence(taxonomyKey, 'guardian');
          this.emit('gate.failed', { type, taxonomyKey, ...result });
        }
      } catch (_) { /* §1.2 — a gate-check failure must never affect the real event it's checking */ }
    }
    return { seq, ts, claimed };
  }
  sample(n = 100) {
    return { logLevel: this.logLevel, count: _sisoLog.length, entries: _sisoLog.slice(-n) };
  }
}

const bus = new SISOStream();

// ── Jaa pure-JS store (zero native deps) ────────────────────────────────────────────
const { JaaStore } = require('./jaa-store.js');

// ── config ────────────────────────────────────────────────────────────────────

const HTTP_PORT     = config.HTTP_PORT;
const ORCH_PORT     = config.ORCH_PORT;

// nexus-connect: unified cross-system I/O with §1.2 gating
const nc = (() => { try { return require('../nexus/nexus-connect'); } catch(_) { return null; } })();
function _postLedger(system, type, payload) {
  if (nc) nc.postLedger(system, type, payload).catch(() => {});
}
function _postEvent(type, payload, opts) {
  if (nc) nc.postEvent(type, payload, opts).catch(() => {});
}
const DROPZONE_PORT = config.DROPZONE_PORT;
const NEXUS_URL     = config.NEXUS_URL;

// ── RAID routing seam ─────────────────────────────────────────────────────────
// §DECOMPILED 2026-09-02 — chooseProvider() and _RAID_AGENT_TO_PROVIDER moved
// verbatim to guardian/lib/provider-routing.js (createProviderRouter). Bound
// below via wireGuardianCore() once ncp/cockpitBroadcast/pendingQueue exist.

const DB_FILE   = path.join(__dirname, 'guardian.db');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

// §GAP CLOSED 2026-07-05: this section (~30 lines) generated self-signed
// TLS certs for a WSS server that no longer exists — NCP replaced it
// (see the NCP server comment below). generateCertWithNode() also
// referenced KEY_FILE/CERT_FILE, which were never defined anywhere in
// this file — it would have thrown ReferenceError the one time anything
// tried to call it, except nothing ever did: ensureCert(), which the old
// comment here said called it, was never defined either. Fully dead,
// removed rather than left as a landmine for the next person who adds
// a WSS boot phase back and assumes this already works.


// ── provider registry ─────────────────────────────────────────────────────────


// §DECOMPILED 2026-09-02 — PROVIDER_ALIASES, _dispatchToDeepseek, and
// _dispatchToMistral moved verbatim to guardian/lib/provider-routing.js
// (createProviderRouter), reconciled to keep deepseek routing intact.
// Bound below via wireGuardianCore().

// ── job store ─────────────────────────────────────────────────────────────────
// §DECOMPILED 2026-09-02 — the `jobs` Map, createJob, updateJob,
// _suggestJobHat, _findActiveJobForProvider moved verbatim to
// guardian/lib/jobs.js (createJobStore). Bound below via wireGuardianCore().

const responseLog = [];
const LOG_MAX = config.RESPONSE_LOG_MAX;

function logResponse(entry) {
  responseLog.push({ ...entry, ts: Date.now() });
  if (responseLog.length > LOG_MAX) responseLog.shift();
}

// ── helpers ───────────────────────────────────────────────────────────────────

// send() — kept for any remaining legacy code; routes through NCP if provider present
function _legacySend(ws, obj) {  // legacy WebSocket send — not used by NCP path
  if (obj?.type && obj?.provider && ncp.isConnected(obj.provider)) {
    ncp.push(obj.provider, obj);
  }
  // If ws is a real ws socket (shouldn't happen now) try direct send
  try { if (ws?.readyState === 1) ws.send(JSON.stringify(obj)); } catch(_) {}
}

const _economyGuard = require('./lib/economy-guard.js').createEconomyGuard();   // §0.39.281 EC6 — the provider economy at dispatch
const _providerLogin = { set: (k, v) => require('./lib/provider-login.js').set(v) };   // §0.39.280 BS16 — guardian/lib/provider-login.js
function broadcast(obj) {
  ncp.broadcast(obj);
}

// §DECOMPILED 2026-09-02 — normaliseProvider() and parseCommand() moved to
// guardian/lib/provider-routing.js, with the real PROVIDERS-Proxy bug fixed
// there (see that file's header). Bound below via wireGuardianCore().

// ── NEXUS write ───────────────────────────────────────────────────────────────

async function writeToNexus(job) {
  // §1.2: gated — failure is logged, never silent
  if (!nc) {
    console.warn('[guardian] nexus-connect not available — cortex write skipped');
    return;
  }
  const payload = {
    jobId: job.id, command: job.command, provider: job.provider,
    promptLen: (job.prompt||'').length, chars: (job.response||'').length,
    durationMs: Date.now() - job.ts, complete: true,
  };
  // §LAW II — event-ledger writes first (already done via bus.emit intercept)
  await nc.postEvent('guardian.response.received', payload, { causedBy: job.id, source: 'guardian' });
  await nc.postBridge('guardian.job.complete', payload);
  await nc.postLedger('guardian', 'guardian.job.complete', payload);
  // Write completed response to cortex_memory so Cortex recall can find it
  try {
    nc._req('cortex', 'POST', '/api/event', {
      type:    'guardian.job.complete',
      payload: { jobId: job.id, provider: job.provider,
        chars: (job.response||'').length,
        promptLen: (job.prompt||'').length,
        completedAt: Date.now(),
        // Store first 2000 chars of response for recall context
        responsePreview: (job.response||'').slice(0, 2000),
      },
      source:  'guardian',
      causedBy: job.id,
    }, 3000).catch(() => {});
  } catch(_) {}
}

// §DECOMPILED 2026-09-02 — _suggestJobHat, createJob, updateJob,
// _findActiveJobForProvider moved to guardian/lib/jobs.js. dispatchJob and
// _doDispatch (and the dispatch-pool require + pendingQueue Map they used)
// moved to guardian/lib/dispatcher.js, reconciled to keep deepseek routing
// intact — see that file's header. All bound below via wireGuardianCore().

// §DECOMPILED 2026-09-02 — _handleNCPMessage moved verbatim to
// guardian/lib/ncp-handler.js (createNCPMessageHandler). Wired further
// down, right after `jaa` exists — see that call site's comment for why.

function flushQueuedJobs(provider) {
  const queued = pendingQueue.get(provider) || [];
  if (!queued.length) return;
  pendingQueue.delete(provider);
  // Start any pending SEAM queues for this provider
  const seamItems = queued.filter(j => j._seamQueue);
  const jobItems  = queued.filter(j => !j._seamQueue);
  for (const item of seamItems) {
    _activeQueues.set(item._seamQueue.uuid, item._seamQueue);
    item._seamQueue.start();
  }
  // Re-add regular jobs
  if (jobItems.length) pendingQueue.set(provider, jobItems);
  const remaining = jobItems;
  console.log(`[guardian] flushing ${queued.length} queued jobs → ${provider}`);
  // §SD3 0.56.0 — a job someone is waiting on (priority high, askSync) goes before background work
  const _pri = { high: 0, normal: 1, low: 2 };
  queued.sort((a, b) => (_pri[(jobs.get(a.id) || a).priority] ?? 1) - (_pri[(jobs.get(b.id) || b).priority] ?? 1));
  for (const job of queued) {
    const fresh = jobs.get(job.id);
    if (fresh && fresh.status === 'queued') dispatchJob(fresh);
  }
}

// ── artifact helpers ──────────────────────────────────────────────────────────

const LANG_EXT = {
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
  python: 'py', py: 'py', html: 'html', css: 'css', json: 'json',
  markdown: 'md', md: 'md', bash: 'sh', shell: 'sh', sh: 'sh',
  rust: 'rs', go: 'go', cpp: 'cpp', c: 'c', java: 'java',
  yaml: 'yaml', toml: 'toml', sql: 'sql', graphql: 'graphql',
  jsx: 'jsx', tsx: 'tsx', svelte: 'svelte', vue: 'vue',
};

function extractCodeBlocks(text, provider = 'ai') {
  const blocks = [];
  const re = /```(\w+)?\n([\s\S]*?)```/g;
  let m, n = 0;
  while ((m = re.exec(text)) !== null) {
    const lang    = (m[1] || '').toLowerCase();
    const content = m[2].trimEnd();
    if (!content.trim()) continue;
    const ext      = LANG_EXT[lang] || lang || 'txt';
    const ts       = Date.now();
    const filename = `${provider}-${ts}-${++n}.${ext}`;
    blocks.push({ filename, content, lang, ext });
  }
  return blocks;
}

function autoUploadBlocks(text, provider, jobId) {
  if (!dropzone?.autoUpload) return [];
  const blocks  = extractCodeBlocks(text, provider);
  const results = [];
  for (const b of blocks) {
    // v9: pass lang + jobId so spec-namer gets full context
    const r = dropzone.autoUpload(b.filename, b.content, {
      lang: b.lang, jobId, provider, source: 'auto-block',
    });
    if (r) results.push({ ...r, lang: b.lang, jobId });
  }
  if (results.length) {
    console.log(`[guardian] auto-uploaded ${results.length} code block(s) from job ${jobId}`);
  }
  return results;
}

// ── WSS server (userscripts) ──────────────────────────────────────────────────

// ── NCP server — replaces httpsServer + wss entirely ────────────────────────
// Providers (browser tabs with userscripts) connect via SSE GET /channel
// and send results via fetch() POST /result. No ws package. No TLS required.
const ncp = createNCPServer({
  onMessage: (msg) => _handleNCPMessage(msg),
  onConnect: ({ provider, tabId }) => {
    // Rate-limit: log only first connect or after 30s gap per provider
    const _now = Date.now();
    if (!global._ncpLastLog) global._ncpLastLog = {};
    const _key = provider + ':' + tabId;
    const _last = global._ncpLastLog[_key] || 0;
    if (_now - _last > 30000) {
      console.log(`[guardian] NCP connected: provider=${provider} tab=${tabId}`);
      global._ncpLastLog[_key] = _now;
    }
    bus.emit('guardian.provider.connected', { provider, tabId });
    // 0.39.249 — the tab learns the current selector map before any job arrives.
    try { require('./lib/selector-map').pushToTab(ncp, _agentRegistry, provider, tabId); } catch (e) { console.warn(`[guardian] selector map not pushed to ${provider}/${tabId}: ${e.message}`); }
    flushQueuedJobs(provider);
  },
  onDisconnect: ({ provider, tabId }) => {
    console.log(`[guardian] NCP disconnected: provider=${provider} tab=${tabId}`);
    bus.emit('guardian.provider.disconnected', { provider, tabId });
  },
  busEmit: (type, data) => bus.emit(type, data),
});

// §BUILT 2026-09-17 — James: "why can't we manipulate the entire dom...
// use that as a way to synchronize the chats." Only needs {bus, ncp},
// both already real above — no need to route this through
// wireGuardianCore() the way dispatcher.js's job-dispatch machinery does.
const { createChatSync } = require('./lib/chat-sync.js');
const { requestSync } = createChatSync({ bus, ncp });

// §DECOMPILED 2026-09-02 — guardian's job/provider/dispatch core, wired from
// guardian/lib/. pendingQueue stays a plain Map owned here (dispatcher.js,
// flushQueuedJobs, and the extended-routes handlers below all read/write it
// directly) — wireGuardianCore() does not create it, matching the original
// module-scope semantics. cockpitBroadcast is a hoisted function declaration
// (defined further down) so it's already a valid reference here.
const pendingQueue = new Map(); // provider → job[] (legacy fallback for non-pool paths)
let _chatTranscriptsRef = null;  // 0.39.259 — set once chat-transcripts is created (below); read by the dispatcher's chatFor
// §BUILT 2026-09-19 — guardian owns the agent registry and the mesh-first escalation ladder.
// Mesh -> archaeology/DOM-mapping repair -> userscript (NCP) -> user (picker). Default GUARDIAN_TRANSPORT=ncp-only.
// §2026-09-23 — Clear Glass owns accounts (James: "yes clearglass"); the registry asks it instead of its own list.
const _agentRegistry = require('./lib/agent-registry').createAgentRegistry({ accountAuthority: require('./lib/cg-account-authority').createClearGlassAccountAuthority() });
const _meshClient    = require('./lib/mesh-client').createMeshClient();
const _ladder = require('./lib/dispatch-ladder').createLadder({
  registry: _agentRegistry, mesh: _meshClient, wakeHint: require('./lib/wake-hint').createHintInjector(),
  picker: { request: async (a) => {
    bus.emit('guardian.picker.needed', { jobId: a.job && a.job.id, provider: a.provider, reason: a.reason, note: a.note || null });
    cockpitBroadcast({ type: 'GUARDIAN_PICKER_NEEDED', jobId: a.job && a.job.id, provider: a.provider, reason: a.reason, note: a.note || null });
  } },
  log: (m) => console.log(`[guardian/ladder] ${m}`),
  // long generations: surface progress on the job and the bus (drives dashboards; proves the job is alive)
  onProgress: (job, p) => { try { updateJob(job.id, { progress: p }); bus.emit('guardian.job.progress', { jobId: job.id, provider: job.provider, ...p }); } catch (_) {} },
  // v0.39.227 — James: "guardian's jobs generate physically to the jobs directory, then Clear Glass adds it to the
  // intake of the job queue." The .job records that Clear Glass owns it BEFORE the send; Clear Glass's intake
  // (clear-glass/src/jobs/intake.js) reads this back through GET /jobs?id= and refuses anything unclaimed.
  // If the mesh fails, the dispatcher's existing fallback write sets transport:'ncp' — the claim moves with it.
  claim: (job, { agentId, accountId }) => {
    const j = updateJob(job.id, { transport: 'mesh', claimedBy: 'clear-glass', claimedAt: Date.now(), status: 'dispatched', dispatchedAt: Date.now(), agentId, accountId }, { required: true });
    if (!j) throw new Error(`job ${job.id} not found — cannot claim it for Clear Glass`);
  },
});
// A mesh answer completes the job through the SAME handler an NCP GUARDIAN_COMPLETE goes through
// (chat_log, response sink, bus events): no second completion implementation. Lazy: _handleNCPMessage is
// defined further down and only referenced at call time.
// §0.39.265 — the job retry module and the Eros typist (created below), and one way to complete a job from an
// answer found on disk or in a transcript: the same handler a userscript's GUARDIAN_COMPLETE takes.
let _jobRetryRef = null;
const _erosTypist = require('./lib/eros-typist.js').createErosTypist({ selectorsFor: (p) => { try { const m = require('./lib/selector-map').mapFor(_agentRegistry, p); return m ? m.selectors : null; } catch (_) { return null; } } });
function _completeJobWith(job, text, chatUrl, source) {
  return _handleNCPMessage({ type: 'GUARDIAN_COMPLETE', jobId: job.id, provider: job.provider, text, chatUrl: chatUrl || undefined, source: source === 'transcript' ? 'transcript' : 'answer-first' });
}
const _completeFromMesh = (job, lr) => _handleNCPMessage({ type: 'GUARDIAN_COMPLETE', jobId: job.id, provider: job.provider,
  text: lr.text, chatUrl: lr.chatUrl, account: lr.accountId, agentId: lr.agentId });

const {
  jobs, createJob, updateJob, _suggestJobHat, _findActiveJobForProvider,
  chooseProvider, normaliseProvider, parseCommand, dispatchJob, cancelJob,
} = wireGuardianCore({
  bus, ncp, pendingQueue, cockpitBroadcast, NEXUS_URL, postEvent: _postEvent,
  ladder: _ladder, completeFromMesh: _completeFromMesh,
  // 0.39.259 — late-bound: _chatTranscripts is created below, after the job store exists; a job is only
  // dispatched once boot has finished, by which time it is set.
  chatFor: (job) => (_chatTranscriptsRef ? _chatTranscriptsRef.chatFor(job) : null),
  // 0.39.265 — late-bound like chatFor: the retry module and the Eros typist are created further down
  answerFirst: (job) => (_jobRetryRef ? _jobRetryRef.answerFirst(job) : null),
  erosType: (job) => _erosTypist.type(job),
  completeWith: (job, text, chatUrl, source) => _completeJobWith(job, text, chatUrl, source),
  economy: _economyGuard,   // §0.39.281 EC6
});
_economyGuard.attach(bus, (id) => jobs.get(id));

// §BUILT 2026-09-19 — agent-initiated wake for MESH-delivered jobs (the userscript path answers its own): when a mesh job's
// answer contains a line starting "hey nexus," ask the co-pilot and reply with a 'wake-reply' job in the same agent tab.
// See guardian/lib/wake-loop.js. Depth-capped; never resends the original prompt.
const _wakeLoopMod = require('./lib/wake-loop');
const _wakeLoop = _wakeLoopMod.createWakeLoop({
  askCopilot: _wakeLoopMod.createCopilotAsk(), createJob, dispatchJob, getJob: (id) => jobs.get(id), bus,
  log: (m) => console.log(`[guardian/wake] ${m}`),
});
bus.on('guardian.job.complete', (d) => { _wakeLoop.handleComplete({ jobId: d && (d.data ? d.data.jobId : d.jobId) }) /* 0.39.247 — SISOStream passes {type,data} */.catch((e) => console.warn(`[guardian/wake] ${e.message}`)); });
// §0.39.279 — a wake in a chat no job owns: answered from the settled transcript, as a wake-reply job into that chat
bus.on('guardian.ncp.transcript', (d) => { const p = (d && d.data) || d || {}; _wakeLoop.handleTranscript(p, { listJobs: () => [...jobs.values()] }).catch((e) => console.warn(`[guardian/wake] ${e.message}`)); });

// §BUILT 0.39.254 — every provider chat, logged into Clear Glass's downloads index as
// one versioned transcript per chat (guardian/lib/chat-transcripts.js). Userscripts
// push GUARDIAN_TRANSCRIPT when a chat settles; every /sync result is recorded too.
// Read side: GET /api/chats[?agentId&provider&q], /api/chats/versions?key=, /api/chats/item/:id.
// 0.39.255 — a job whose prompt is in a settled transcript, answered by the next turn, completes through the
// same handler a userscript's GUARDIAN_COMPLETE takes (lazy, like _completeFromMesh above).
// §BUILT 0.39.256 — every job's gate trail (lib/gate-trail.js): job.gates / job.gate from the bus, served on
// GET /status/:jobId, said in ask.js's failures, emitted as guardian.job.gate for the Agent tab's feed.
require('./lib/gate-trail.js').attach({ bus, jobs });
const _chatTranscripts = require('./lib/chat-transcripts.js').createChatTranscripts({ bus, jobs, ncp,
  complete: (job, text, chatUrl) => _handleNCPMessage({ type: 'GUARDIAN_COMPLETE', jobId: job.id, provider: job.provider, text, chatUrl, source: 'transcript' }) });
_chatTranscripts.attach();
_chatTranscriptsRef = _chatTranscripts;

// §0.39.265 — James: "Guardian needs better retry logic. It got stuck earlier when I ran two jobs … the .jobs file
// can link to the response. That way if it runs again can check for the response first." guardian/lib/job-retry.js:
// a tab error that is about timing (busy, no composer, send failed, no reply) is tried again after a backoff, and a
// re-send first looks for the job's answer (its .response node, then its chat transcript). The third attempt after
// input/send failures goes through ErosmancerOS (guardian/lib/eros-typist.js) when Clear Glass has it connected.
_jobRetryRef = require('./lib/job-retry.js').createJobRetry({
  jobs, updateJob, bus, pool: require('./lib/dispatch-pool').pool, dispatchJob,
  complete: (job, text, chatUrl, source) => _completeJobWith(job, text, chatUrl, source),
  readResponse: (jobId) => require('./lib/response-sink').readNode(jobId),
  replyFor: (job) => _chatTranscripts.replyFor(job),
  erosAvailable: () => _erosTypist.available(),
});

// §BUILT 2026-09-11 — James: "persistent and doesn't leave until it's
// delivered." createJobStore() (guardian/lib/jobs.js, this same pass)
// already recovers every real .job file from a prior process into this
// `jobs` Map — but recovery alone isn't redelivery. A job that was
// genuinely 'pending' (created, never dispatched) or 'dispatched'
// (sent, no response ever recorded) when the process died is real,
// recoverable work sitting in the Map right now with nobody driving it
// forward. This is that drive: once per real boot, after dispatchJob
// itself exists, walk the recovered jobs and re-dispatch exactly the
// ones a fresh dispatch would be correct for. 'complete'/'error' jobs
// are real history — read, never touched.
//
// A 'dispatched' job is requeued as 'pending' first, not re-dispatched
// as-is: the original NCP tab that had it is provably gone (this is a
// fresh guardian process), so its real status was already a lie the
// moment this process started — same honesty discipline the idearium
// chunk-recovery fix (this session, two turns earlier) already applied
// to BUILDING chunks, applied here to DISPATCHED jobs.
(function _redispatchRecoveredJobs() {
  let requeued = 0, dispatched = 0;
  for (const job of jobs.values()) {
    if (job.status === 'dispatched') { updateJob(job.id, { status: 'pending' }); requeued++; }
  }
  for (const job of jobs.values()) {
    if (job.status !== 'pending') continue;
    dispatched++;
    dispatchJob(job);
  }
  if (requeued || dispatched) {
    console.log(`[guardian] boot recovery: ${requeued} in-flight job(s) requeued, ${dispatched} pending job(s) re-dispatched`);
  }
})();

// ── Stream token accumulator ──────────────────────────────────────────────────
// Registered as a SISOGate after bus is declared (see below — search STREAM_GATE).
// NCP handleStream fires busEmit('ncp.stream.chunk', ...) on every token.

// Compatibility shims — code that used PROVIDERS[x] now uses ncp.isConnected(x)
const PROVIDERS = new Proxy({}, {
  get: (_, provider) => ncp.isConnected(provider) ? { _ncp: true } : null,
  set: () => true,  // ignore direct sets — NCP manages connections
});

// httpsServer + wss → null (no longer needed, kept for module.exports
// compatibility in case anything external still destructures them)
let httpsServer = null;
let wss         = null;

// ── Main HTTP server (:7820) ─────────────────────────────────────────────────

const _lip = (() => {
  try {
    const ifaces = require('os').networkInterfaces();
    for (const [,addrs] of Object.entries(ifaces)) {
      for (const a of addrs) { if (a.family==='IPv4' && !a.internal) return a.address; }
    }
  } catch(_) {}
  return null;
})();

function getLocalIPs() {
  try {
    const ifaces = require('os').networkInterfaces();
    const ips = [];
    for (const [,addrs] of Object.entries(ifaces)) {
      for (const a of addrs) {
        if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
      }
    }
    return ips.length ? ips : ['127.0.0.1'];
  } catch(_) { return ['127.0.0.1']; }
}

// ── _selfProbe — used by boot phases (module-level) ─────────────────────────
async function _selfProbe(path_) {
  return new Promise(resolve => {
    const req = require('http').get('http://127.0.0.1:' + HTTP_PORT + path_, { timeout:3000 }, res => {
      let b=''; res.on('data', d=>b+=d); res.on('end', ()=>{
        try { resolve({ ok:res.statusCode===200, data:JSON.parse(b) }); }
        catch { resolve({ ok:res.statusCode===200 }); }
      });
    });
    req.on('error',   () => resolve({ ok:false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok:false }); });
  });
}

// §REGRESSION FIXED 2026-07-07 — `const server = http.createServer(...)`
// was removed earlier this session while deleting dead TLS/cert and WSS
// stub code. The removal was clean enough that `node --check` still
// passed (the whole statement went, leaving no orphaned body), so nothing
// caught it — but `server.listen()` below and `server.listeners('request')`
// further down both referenced an undefined variable, meaning
// guardian/server.js could not boot AT ALL. Found by actually booting it,
// not by inspection. Real lesson, recorded rather than quietly patched:
// a syntax check is not a boot check.
//
// This base handler is the 404 fallback by design. All 41 real routes
// live in handleExtendedRoutes(), which the `server.on('request')` block
// further down consults FIRST; `_origListeners` captures this handler and
// invokes it only when no route matched. Restoring it as a 404 preserves
// the original fallback semantics exactly.
const server = http.createServer((req, res) => {
  res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ ok: false, error: `${req.method} ${req.url} not found` }));
});

server.listen(HTTP_PORT, '127.0.0.1', async () => {
  // §0.39.271 X2 — Guardian hosts the node types (NODE-TAXONOMY.md): its hats and agents
  // are regenerated from every forged hat, then its node registry (per-type folder watcher
  // + _ledger.jsonl + JAA index) starts over guardian/data/nodes. Before this the registry
  // was never booted and no .hat/.agent node existed. Off the request path; a failure is
  // logged, never fatal.
  setTimeout(() => {
    try { const r = require('../lib/system-nodes.js').sync({ only: ['guardian'] }); console.log(`[guardian] nodes: ${JSON.stringify(r.systems.guardian ? { written: r.systems.guardian.written, commands: r.systems.guardian.commands } : {})} · hats/agents ${r.guardian ? r.guardian.written + ' written, ' + r.guardian.unchanged + ' unchanged' : 'skipped'}${r.errors.length ? ' · ' + r.errors.join('; ') : ''}`); }
    catch (e) { console.warn(`[guardian] node sync failed (non-fatal): ${e.message}`); }
    try { require('./lib/node-registry.js').start({}); } catch (e) { console.warn(`[guardian] node registry did not start (non-fatal): ${e.message}`); }
  }, 3000);
  // Mesh subsystem relocated 2026-09-03 to clear-glass/src/network/
  // (James: "DNS/firewall/crypto/host-rotation/reverse-proxy maybe
  // recycle to clearglass" — moved as one whole unit, see that folder's
  // install.js header for the full rationale). See mesh/README.md for
  // the historical record of what used to live here.

  // §SR9-first-slice 2026-09-03 — James: "sr9". SR9 itself is the full
  // composite end-state and still depends on SR4/SR7/SR8/SR10 (all still
  // OPEN) — this installs only the narrow, dependency-free real piece:
  // automatic snapshot + map-drift detection on every real, governed
  // pipeline promote. See lib/self-build-loop.js's own header for the
  // full honest scope. nexus-bus.js is the real, already-shared singleton
  // every pipeline trigger path (run_pipeline/run_chain/run_closed_loop)
  // already emits to — not a second, guardian-local event path.
  try {
    require('../lib/self-build-loop.js').install(require('../nexus/nexus-bus.js'));
  } catch (err) {
    console.warn('[guardian] self-build-loop install failed:', err.message);
  }

  // §RAID-FIX 2026-09-16 — James: "raid also needs to stop failing, i
  // dont think its using... the job dispatcher." Confirmed: guardian
  // (the real job dispatcher — POST /command above, createJob/dispatchJob)
  // had never once announced itself to RAID's capability registry, so
  // every RAID envelope aimed at guardian resolved to NO_ROUTE, silently
  // — not a dispatch bug, guardian was simply invisible to the router.
  // See lib/self-register-remote.js's own header for the full cross-
  // process reasoning (guardian is its own OS process — this can't be
  // the in-process registerSelf() intelligence/index.js uses).
  try {
    const { registerSelfRemote } = require('../lib/self-register-remote.js');
    registerSelfRemote('guardian', [
      { name: 'dispatch', description: 'dispatch a prompt to an AI provider as a tracked, resumable job',
        route: { method: 'POST', path: '/command' } },
      { name: 'jobs',     description: 'list or filter real, tracked jobs — id, status, provider, hat, content',
        route: { method: 'GET', path: '/jobs' } },
      { name: 'job',      description: 'look up one real, tracked job by id — its current status and content',
        route: { method: 'GET', path: '/jobs?id={id}' } },
      { name: 'response', description: 'a completed job\'s real response/result, by job id — same record as .job, once status is done',
        route: { method: 'GET', path: '/jobs?id={id}' } },
      { name: 'intake',   description: 'real intake queue — proposed changes awaiting verdict, promote, or rollback',
        route: { method: 'GET', path: '/api/intake' } },
    ], { registeredBy: 'guardian/server.js' }).then((r) => {
      if (r.ok) console.log(`[guardian] registered ${r.registered} capabilit${r.registered === 1 ? 'y' : 'ies'} with RAID`);
      else console.warn(`[guardian] RAID self-registration incomplete: ${r.error || (r.failed + ' failed')}`);
    });
  } catch (err) {
    console.warn('[guardian] RAID self-registration failed:', err.message);
  }

  const { BootSequence } = require('../lib/boot-sequence');
  const nc2 = require('../nexus/nexus-connect');

  // §BUGFIX 2026-07-04: was a hardcoded '3.6.1' here, independent of
  // lib/version.js's registry — sourcing from it directly now.
  const { services: _svc } = require('../lib/version');
  const seq = new BootSequence({
    systemId: 'guardian', port: HTTP_PORT, version: _svc.guardian,
    label: 'Nexus Guardian', maxRetries: 1,
  });


  // ── PHASE 1: No external npm deps ──────────────────────────────────────────
  seq.phase({ name:'packages.required', type:'HARD',
    label:'Zero external dependencies (NCP/SSE — no npm packages needed)',
    fn: async () => {
      try { require('http'); require('fs'); require('path'); require('crypto'); } catch(e) { return { ok:false, msg:e.message }; }
      console.log('[guardian NCP] userscript: new EventSource("http://127.0.0.1:' + HTTP_PORT + '/channel?provider=claude&tabId=X")');
      return { ok: true };
    }
  });

  // ── PHASE 2: HTTP server bound ────────────────────────────────────────────
  seq.phase({ name:'http.bound', type:'HARD',
    label:'HTTP :' + HTTP_PORT + ' bound and /health responds',
    fn: async () => {
      const r = await _selfProbe('/health');
      if (!r.ok) return { ok:false, msg:'HTTP :' + HTTP_PORT + ' not responding' };
      return { ok: true };
    }
  });

  // ── PHASE 3: Interaction contract ────────────────────────────────────────
  seq.phase({ name:'contract.present', type:'HARD',
    label:'interaction-contract.json present',
    fn: async () => {
      const cp = require('path').join(__dirname, 'interaction-contract.json');
      if (!require('fs').existsSync(cp)) return { ok:false, msg:'interaction-contract.json missing' };
      try { JSON.parse(require('fs').readFileSync(cp,'utf8')); } catch(e) { return { ok:false, msg:'contract invalid: '+e.message }; }
      return { ok: true };
    }
  });

  // ── PHASE 4: JAA memory store writable ───────────────────────────────────
  seq.phase({ name:'jaa.writable', type:'HARD',
    label:'JAA memory store open + writable (§LAW II)',
    fn: async () => {
      try {
        const testKey = '_boot_' + Date.now();
        jaa.setSetting(testKey, '1');
        const v = jaa.getSetting(testKey);
        if (v === null || v === undefined) return { ok:false, msg:'JAA write/read failed' };
        return { ok: true };
      } catch(e) { return { ok:false, msg:'JAA: '+e.message }; }
    }
  });

  // ── PHASE 5: Physical queue writable ─────────────────────────────────────
  seq.phase({ name:'queue.writable', type:'HARD',
    label:'Physical queue dirs writable (data/guardian/)',
    fn: async () => {
      const fs   = require('fs');
      const rp   = require('path');
      const dirs = ['input','output','queue','failures','conversations']
        .map(d => rp.join(__dirname,'..','data','guardian',d));
      for (const d of dirs) {
        try { fs.mkdirSync(d,{recursive:true}); } catch(e) { return { ok:false, msg:d.split('/').pop()+' not writable: '+e.message }; }
      }
      const t = rp.join(dirs[0],'_boot_test.tmp');
      try { fs.writeFileSync(t,'ok'); fs.unlinkSync(t); } catch(e) { return { ok:false, msg:'input dir not writable: '+e.message }; }
      return { ok: true };
    }
  });

  // ── PHASE 6: Core modules load ───────────────────────────────────────────
  seq.phase({ name:'modules.load', type:'HARD',
    label:'Core modules load (seam-queue, spec-parser, detector)',
    fn: async () => {
      const errors = [];
      for (const m of ['./lib/seam-queue','./lib/spec-parser','./lib/detector']) {
        try { require(m); } catch(e) { errors.push(m.split('/').pop()+': '+e.message); }
      }
      if (errors.length) return { ok:false, msg: errors.join(' | ') };
      return { ok: true };
    }
  });

  // ── PHASE 7: NCP channel ─────────────────────────────────────────────────
  seq.phase({ name:'ncp.ready', type:'SOFT',
    label:'NCP channel :' + HTTP_PORT + '/channel (no TLS needed)',
    fn: async () => {
      const r = await _selfProbe('/providers');
      if (!r.ok) return { ok:false, msg:'/providers not responding' };
      return { ok: true };
    }
  });

  // ── PHASE 8: Artifact output writable ────────────────────────────────────
  seq.phase({ name:'artifacts.writable', type:'SOFT',
    label:'Artifact output path writable',
    fn: async () => {
      const fs  = require('fs');
      const rp  = require('path');
      const dir = rp.join(__dirname,'..','data','guardian','output');
      try { fs.mkdirSync(dir,{recursive:true}); const t=rp.join(dir,'_boot.tmp'); fs.writeFileSync(t,'ok'); fs.unlinkSync(t); }
      catch(e) { return { ok:false, msg:'output dir: '+e.message }; }
      return { ok: true };
    }
  });

  // ── PHASE 9: Userscript version check ────────────────────────────────────
  seq.phase({ name:'userscript.versions', type:'SOFT',
    label:'Userscript versions present',
    fn: async () => {
      const fs  = require('fs');
      const rp  = require('path');
      const readVer = f => { try { const c=fs.readFileSync(rp.join(__dirname,f),'utf8'); const m=c.match(/@version\s+([\d.]+)/); return m?m[1]:null; } catch { return null; } };
      const cv  = readVer('userscript-claude.js');
      const gv  = readVer('userscript-chatgpt.js');
      const gmv = readVer('userscript-gemini.js');
      const ppv = readVer('userscript-perplexity.js');
      const dsv = readVer('userscript-deepseek.js');
      if (!cv) return { ok:false, msg:'userscript-claude.js: @version missing' };
      if (!gv) return { ok:false, msg:'userscript-chatgpt.js: @version missing' };
      console.log('[guardian versions] claude=' + cv + ' chatgpt=' + gv +
        (gmv ? ' gemini=' + gmv : ' gemini=NOT_INSTALLED') +
        (ppv ? ' perplexity=' + ppv : ' perplexity=NOT_INSTALLED') +
        (dsv ? ' deepseek=' + dsv : ' deepseek=NOT_INSTALLED'));
      return { ok: true, versions: { claude:cv, chatgpt:gv, gemini:gmv||null, perplexity:ppv||null, deepseek:dsv||null } };
    }
  });

  // ── PHASE 9.5: Ollama agent — local model, optional, never blocks boot ───
  // Moved from cortex/boot.js: Ollama is a local HTTP service Guardian talks
  // to directly (see ollama-runtime.js), not part of Cortex's intelligence
  // stack. This phase is SOFT and explicitly not "baked in" — it pings
  // Ollama first and only starts the agent_calls poller if something is
  // actually listening. No Ollama running → this is a no-op, Guardian boots
  // exactly the same either way.
  // [DISABLED] ollama.agent — Ollama not used outside Nexus; removing prevents
  // the ollama-ncp SSE crash loop that spams "NCP connected / §FLAPPING" on boot.
  // seq.phase({ name:'ollama.agent', ... });

  // [DISABLED] copilot.agent — Co-pilot removed; was broken (_ensureProfile not defined)
  // and unused outside Nexus. HTTP routes at /copilot/* remain so the API surface
  // doesn't break anything that pokes those endpoints directly.
  // seq.phase({ name:'copilot.agent', ... });

  // [DISABLED] §23.7 Reflection contracts — depends on Ollama (dispatches to provider:'ollama').
  // Removed along with the Ollama agent; nothing to dispatch to.
  // seq.phase({ name:'reflection-contracts.poll', ... });

  // ── ChatGPT mode — stateless, no listener needed (request/response only) ──
  seq.phase({ name:'chatgpt-mode.ready', type:'SOFT',
    label:'ChatGPT mode (Nexus-authority + ChatGPT-reasoning, epistemic tagging)',
    fn: async () => {
      let chatgptMode;
      try { chatgptMode = require('./agents/chatgpt-mode'); }
      catch (e) { return { ok:true, msg:'guardian/agents/chatgpt-mode not found — skipping' }; }

      const hasKey = !!process.env.OPENAI_API_KEY;
      // §1.1 — don't claim "ready" if the one thing that makes this work
      // (an API key for the actual ChatGPT call) isn't present. The route
      // still registers either way — this just reports honestly so it
      // shows up in the boot log instead of failing silently on first use.
      if (!hasKey) {
        console.log('[guardian] ⬡ CHATGPT-MODE: route active, but OPENAI_API_KEY not set — queries will fail at dispatch time');
        return { ok:true, msg:'chatgpt-mode loaded — OPENAI_API_KEY missing, dispatch will fail until set' };
      }
      console.log('[guardian] ⬡ CHATGPT-MODE: ready — ' + Object.values(chatgptMode.MODE).join('/'));
      return { ok:true, msg:'chatgpt-mode ready' };
    }
  });

  // ── PHASE 10: Register with orchestrator ─────────────────────────────────
  seq.phase({ name:'orchestrator.register', type:'SOFT',
    label:'Register with orchestrator (§AXIOM)',
    fn: async () => {
      let _rc=[]; try{_rc=require('./registry-components');}catch(_){}
      const r = await nc2.registerWithOrchestrator('guardian', HTTP_PORT, {}, _rc);
      // §FIX 2026-08-29 — real, serious gap found while continuing this
      // session's createPulse migration: registerWithOrchestrator (read
      // directly, confirmed) does a real, one-time register + ledger
      // post + retry-with-backoff-if-offline — it does NOT start an
      // ongoing heartbeat. guardian never called startHeartbeat anywhere
      // (confirmed by grep — zero matches in this entire file), meaning
      // the most central, load-bearing real system in this architecture
      // registered once at boot and then went silent forever. Exactly
      // the "invisible-but-working" failure class this same file's own
      // §FIX 2026-07-30 comment (three lines above this one, same real
      // registerWithOrchestrator function) already warns about for a
      // different reason — orchestrator's own SYSTEM_REGISTRY.lastSeen
      // would go stale after the TTL and guardian would eventually show
      // offline in real health tracking while running perfectly fine.
      // startHeartbeat() (nc2, already required at module scope) now
      // uses real createPulse() internally as of this session's own
      // earlier migration — guardian gets that for free, not a second
      // hand-rolled copy.
      nc2.startHeartbeat('guardian', HTTP_PORT);
      if (!r || !r.ok) return { ok:true, msg:'standalone — orchestrator offline' };
      return { ok: true };
    }
  });

  // ── PHASE 11: Write boot record to ledger ────────────────────────────────
  seq.phase({ name:'ledger.announce', type:'SOFT',
    label:'Write boot record to ledger (§LAW II)',
    fn: async () => {
      try {
        const fs  = require('fs'), rp = require('path');
        const dir = rp.join(process.env.NEXUS_DATA_ROOT || rp.join(__dirname,'..','data'),'guardian','ledger','boot');
        fs.mkdirSync(dir,{recursive:true});
        fs.appendFileSync(rp.join(dir,'events.ndjson'),
          JSON.stringify({type:'guardian.boot',version:'3.6.1',pid:process.pid,ts:Date.now()})+'\n');
        await nc2.postLedger('guardian', 'guardian.boot', { version:'3.6.1', pid:process.pid });
        return { ok: true };
      } catch(e) { return { ok:false, msg:e.message }; }
    }
  });

  const result = await seq.run();
  if (!result.ok) {
    console.error('[guardian §1.2] Boot sequence failed — check phases above');
  }
});

// ── Auto-upload for generated code blocks — real dropzone HTTP server is
// guardian/dropzone.js, run separately. This just needs somewhere for a
// generated code block to land and a link to hand back. See
// guardian/artifact-upload.js header for what this replaced and why.
const { createAutoUploader } = require('./artifact-upload');
const dropzone = createAutoUploader({
  uploadDir: require('path').join(__dirname, '..', 'data', 'guardian', 'input'),
});

// ══════════════════════════════════════════════════════════════════════════════
//  SISO EVENT BUS — §8.3 canonical SISO as foundation
//  Every emit() gates through: local JAA → cortex → orchestrator
//  §5.7 all inter-module communication via event bus only
//  §2.3 all state observable — every event logged to StreamLog
// ══════════════════════════════════════════════════════════════════════════════

// §8.3 — canonical SISO loaded from foundation
// CJS-compatible wrapper around siso/core/index.js primitives
class SISOGate {
  constructor(sig, fn) {
    if (!sig) throw new Error('[§1.2 SISOGate] signature required');
    this.signature = sig;
    this._fn = fn;
  }
  transform(event, stream) {
    try { this._fn(event.data, stream); }
    catch(e) {
      // §1.2 — nothing silently fails
      console.error(`[§1.2 siso.gate.${this.signature}] ${e.message}`);
      _postEvent(`guardian.gate.error`, { gate: this.signature, error: e.message });
    }
  }
}

// §5.1 — kernel emit: every bus event reported to all connected systems
// Fires-and-forgets — §1.2 errors are logged, never swallowed
function _kernelEmit(type, data, ts) {
  // 1. Orchestrator ledger (§2.2 persisted)
  _postLedger('guardian', type, { ...data, _busSeq: _streamSeq });
  // 2. Cortex event_log (source of truth, §2.2)
  // Only for significant events to avoid flooding cortex
  const CORTEX_EVENTS = new Set([
    'guardian.job.complete', 'guardian.artifact', 'guardian.gaps',
    'guardian.job.queued', 'guardian.job.dispatched', 'guardian.ledger',
    'guardian.session.named', 'guardian.gate.error', 'guardian.setting.update',
  ]);
  if (CORTEX_EVENTS.has(type)) {
    _postEvent(type, data, { source: 'guardian.bus', causedBy: data.jobId || null });
  }
  // 3. Bridge SSE broadcast (§5.2 — everything on the bus)
  const BRIDGE_EVENTS = new Set([
    'guardian.job.complete', 'guardian.artifact', 'guardian.gaps',
    'guardian.job.queued', 'guardian.job.dispatched',
  ]);
  if (BRIDGE_EVENTS.has(type)) {
    }
}


// Event ledger — §LAW II: every bus emit written to ledger first
// ── CFR-Ω Ledger — every bus.emit written with sigma + delta + CFR snapshot ──
// §CONSOLIDATION 2026-07-24 — James: data is "stored in cortex" (his
// 2026-07-18 directive, "migrate all of the data nexus uses to cortex",
// reconfirmed today over the mind map's P0.1 out-migration, which is now
// dead). This ledger was the flagged straggler: the 2026-07-18 migration
// comment below says cfr_state.json/event_stats.json's "actual writer
// wasn't found in this file to migrate safely" — the writer was THIS LINE,
// ~60 lines above that comment, the whole time. ledgerDir pointed at
// guardian/memory_store/ — the legacy SOURCE-TREE folder, holding an
// 8.7MB live event_log.jsonl entirely outside the data/ root. Moved to
// data/guardian/ledger/cfr — the exact pattern bridge already uses
// (data/bridge/ledger/cfr, bridge/index.js:73). CFR stream/state files
// are append-only jsonl + single-object JSON snapshots, NOT row-based
// tables, so they belong under the cortex-governed data root as files —
// not inside the shared JaaStore (the 07-18 comment's reasoning on that
// point was correct and stands). Existing memory_store files migrated
// once by copy; originals left untouched (§7.4 archived, not discarded).
const _evLedger = createCFRLedger({
  ledgerDir: require('path').join((process.env.NEXUS_DATA_ROOT || require('path').join(__dirname, '..', 'data')), 'guardian', 'ledger', 'cfr'),
  systemId:  'guardian',
  onEvent:   null, // downstream consumers can add onEvent hooks here
  onGap: (gap) => {
    // Gap emission from CFR threshold crossing → JAA gaps table
    try {
      jaa.insert('gaps', {
        uuid:     require('crypto').randomUUID(),
        type:     gap.type,
        body:     gap.message,
        severity: gap.severity > 0.8 ? 'high' : gap.severity > 0.5 ? 'medium' : 'low',
        status:   'open',
        source:   'cfr-ledger',
        causedBy: gap.entry?.uuid || null,
        createdAt: Date.now(),
        ts:       Date.now(),
      });
    } catch(e) { console.error(`[guardian] failed to insert CFR-detected gap into JAA (gap lost): ${e.message}`); }
    // Surface on bus so diagnostic tool sees it
    try { _origEmit('guardian.cfr.gap', gap); } catch(e) { console.error(`[guardian] failed to broadcast CFR gap on bus: ${e.message}`); }
  },
});
_evLedger.open();
_evLedger.startAutoSave(60000);

// §UPGRADE 2026-08-25 — guardian's own real state provider, the first
// real, live registration of the .nex system-state mechanism (built
// this session, cortex/snapshot/index.js). guardian's own real, live
// data already goes two real ways: jaaDB rows (guardian_*-prefixed,
// already covered automatically by cortex's existing whole-store table
// snapshot — nothing new needed there) and these two real CFR ledger
// files (cfr_state.json, event_stats.json — deliberately kept as real
// files, not jaaDB rows, per this same file's own real comment a few
// lines above: "NOT row-based tables... belong under the cortex-
// governed data root as files"). The files are what a table snapshot
// can't see — that's the real gap this closes. Both are tiny (under
// 100 bytes each, confirmed directly), safe to embed inline rather
// than needing a separate archive/reference scheme.
try {
  const snap = require('../cortex/snapshot/index.js');
  const _ledgerCfrDir = require('path').join((process.env.NEXUS_DATA_ROOT || require('path').join(__dirname, '..', 'data')), 'guardian', 'ledger', 'cfr');
  snap.registerStateProvider('guardian', {
    capture: () => {
      const read = (f) => { try { return JSON.parse(fs.readFileSync(require('path').join(_ledgerCfrDir, f), 'utf8')); } catch (_) { return null; } };
      return { cfr_state: read('cfr_state.json'), event_stats: read('event_stats.json') };
    },
    restore: (state) => {
      const written = [];
      const write = (f, data) => { if (data == null) return; fs.writeFileSync(require('path').join(_ledgerCfrDir, f), JSON.stringify(data, null, 2)); written.push(f); };
      write('cfr_state.json', state.cfr_state);
      write('event_stats.json', state.event_stats);
      return { restoredFiles: written };
    },
  });
} catch (e) {
  // §1.2 — loud, not silent, but never fatal to guardian's own real boot
  console.warn(`[guardian] could not register .nex state provider (backup/restore for this system will be unavailable): ${e.message}`);
}

// Intercept every bus emit — write to CFR ledger before routing
// §LAW II: ledger write happens BEFORE any subscriber processes the event
const _origEmit = bus.emit.bind(bus);
bus.emit = function(type, data) {
  // §fix 2026-07-02 — guard non-string types before they reach CFR sigma.
  // The coercion warning in sigma.js fires 400+ times at boot because some
  // callers pass bus.emit({type:'x',...}) instead of bus.emit('x', {...}).
  // Normalize here at the intercept point so sigma never sees an object type.
  const safeType = typeof type === 'string' ? type
    : (type?.type && typeof type.type === 'string' ? type.type : String(type || ''));
  const safeData = typeof type === 'string' ? (data || {}) : (type?.payload || type?.data || data || {});
  _evLedger.record(safeType, safeData, {
    source:    'guardian.bus',
    causedBy:  safeData?.jobId || safeData?.causedBy || null,
    sessionId: safeData?.sessionId || null,
  });
  return _origEmit(safeType, safeData);
};

// ══════════════════════════════════════════════════════════════════════════════
//  SQLITE / JAA PERSISTENCE
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
//  JAA STORE — Pure-JS relational store, zero native deps
//  §MIGRATED 2026-07-18 — "migrate all of the data nexus uses to cortex."
//  Was its own separate store at guardian/memory_store/, now shares
//  cortex's directory (data/cortex/memory/) with a guardian_ table prefix
//  — same seam idearium's own DB migration used earlier, pushed down into
//  JaaStore itself this time (see jaa-store.js's constructor comment) so
//  guardian didn't need its own copy of that logic.
//  Existing data (195 artifacts, 168 chat_log entries, 3227 events, 207
//  gaps, 85 jobs, 196 ledger entries, 52 queue_compartments, 9
//  seam_sessions, 123 settings) migrated once via a standalone script —
//  verified via fresh reload + byte-exact spot checks on real rows before
//  this line was ever changed. Old guardian/memory_store/*.json files are
//  left on disk untouched, not deleted (§7.4 archived, not discarded).
//  cfr_state.json and event_stats.json were NOT part of this migration —
//  they're single-object state snapshots, not row-based JaaStore tables
//  (not in the _ensureTable list below), and their actual writer wasn't
//  found in this file to migrate safely. Flagged, not silently skipped.
// ══════════════════════════════════════════════════════════════════════════════

// §FIX 2026-09-06 — DF1. STORE_DIR now points at guardian's own real,
// sovereign folder (config.GUARDIAN_DATA_DIR), not CORTEX_STORE_DIR —
// see config.js's own header for the full real migration record
// (60 real ledger rows, 19 real settings rows, copied and verified
// row-for-row before this line changed). tablePrefix removed: no
// collision risk in an exclusive directory guardian alone owns.
// §CORRECTED — my own first draft of this comment claimed guardian
// "still legitimately reads cross-system memory from cortex elsewhere
// in this file." Checked before leaving that claim in: zero real
// matches for cortex/memory/jaa-db anywhere in server.js. Wrong,
// removed rather than left standing — CORTEX_STORE_DIR is genuinely
// unused now, deleted along with the claim.
const STORE_DIR = config.GUARDIAN_DATA_DIR;
const jaa = new JaaStore(STORE_DIR, {});
// Ensure guardian-specific tables exist on first run
['seam_sessions','queue_compartments','pa_sessions','jobs','artifacts',
 'gaps','failures','ledger','downloads','sessions','timeline_events',
 'ledger_entries','lab_sessions','lab_results'].forEach(t => {
  try { jaa._ensureTable?.(t); } catch(e) {
    console.error(`[guardian] failed to provision table '${t}' at boot — inserts to it will likely fail later: ${e.message}`);
  }
});

// §DECOMPILED 2026-09-02 — the real NCP protocol handler (_handleNCPMessage),
// moved to guardian/lib/ncp-handler.js. Wired here, not earlier, because
// this is the first point in server.js's boot sequence where every real
// dependency it touches (jaa, above) actually exists — ncp's own
// `onMessage: (msg) => _handleNCPMessage(msg)` config (defined earlier)
// only references this by closure and doesn't invoke it until a real
// message arrives, well after this line has run. See that file's header
// for the full dependency list and what's still intentionally inline
// (SEAM/artifact-extraction — separate, larger, not-yet-done work).
const { createNCPMessageHandler } = require('./lib/ncp-handler');
const _handleNCPMessage = createNCPMessageHandler({
  nc, ncp, bus, jaa, jobs, updateJob, cockpitBroadcast,
  physQueue: _physQueue, baseline: _baseline, evLedger: _evLedger,
  activeQueues: _activeQueues, extractCodeBlocks,
  extractToolCallsFromDOM: _extractToolCallsFromDOM,
  findActiveSeamCompartment: _findActiveSeamCompartment,
  retry: () => _jobRetryRef,   // 0.39.265 — guardian/lib/job-retry.js (late-bound)
});

// §BUILT 2026-09-08 — James: "the listener for the tools... from the
// sse?" Real, live: subscribes to guardian.tool.called, the event
// _handleNCPMessage above now emits the moment a tool call is actually
// detected in an agent's response. Persists to JAA (cortex's real
// memory store — real vector embedding already happens for free on
// insert via jaaDB's own _observeForEmbedding, nothing new needed for
// that part) and makes real output reuse lookups possible.
try {
  require('../lib/agent-tools/tool-call-listener.js').install(bus, jaa);
} catch (e) {
  console.warn(`[guardian] tool-call-listener failed to install (tool calls still work, just not persisted/cached): ${e.message}`);
}

// ── Lab Manager — §LAB-01 every experiment has a UUID and a hypothesis ────
let _lab = null;
try {
  const { LabManager } = require('../cos/playground/llm-lab');
  _lab = new LabManager({
    jaa,
    guardianDispatch: async (provider, prompt, meta = {}) => {
      // Dispatch via guardian job system — same path as regular jobs
      const jobId = meta.jobId || require('crypto').randomUUID();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('lab dispatch timeout')), 120000);
        const job = { id:jobId, provider, command:'code', prompt, status:'queued',
          createdAt:Date.now(), _labSession:meta.sessionId, _source:'lab' };
        jobs.set(jobId, job);
        jaa.insert('jobs', job);
        // Listen for completion — one-shot: auto-removes after firing
        const _onComplete = (ev) => {
          bus.off(`guardian.job.${jobId}.complete`, _onComplete);
          clearTimeout(timeout);
          resolve({ text: ev.data?.text || ev.data?.response || '', ms: ev.data?.ms || 0, jobId });
        };
        bus.on(`guardian.job.${jobId}.complete`, _onComplete);
        dispatchJob(job);
      });
    },
    busEmit: (type, payload) => {
      bus.emit(type, payload);
      _toCortex(type, { ...payload, _source:'lab' });
    },
  });
  console.log('[guardian] Lab Manager ready');
} catch(e) {
  console.warn('[guardian] Lab Manager degraded:', e.message);
}


// Shutdown hook — flush all dirty tables before exit
process.on('exit', () => jaa.flushAll());
process.on('SIGINT', () => { jaa.close(); process.exit(0); });
process.on('SIGTERM', () => { jaa.close(); process.exit(0); });

// ── Compatibility shims (same call shape as before, now pure-JS) ──────────────

function dbRun(sql, params = []) {
  // This is a no-op shim — all persistence goes through gate handlers directly.
  // Legacy callers that still use SQL strings are silently ignored; gates handle writes.
  return { changes: 0, lastInsertRowid: null };
}
function dbGet(sql, params = []) { return null; }  // shim — gates handle reads via jaa.*
function dbAll(sql, params = []) { return []; }      // shim — routes use jaa.all() directly
function getSetting(key, fallback = null) { return jaa.getSetting(key, fallback); }
function setSetting(key, value) { jaa.setSetting(key, value); bus.emit('guardian.setting.update', { key, value }); }
function getAllSettings() { return jaa.getAllSettings(); }

// ══════════════════════════════════════════════════════════════════════════════
//  GAPHUNTER v3 — INLINE TAXONOMY DETECTION
// ══════════════════════════════════════════════════════════════════════════════

const GAP_TYPE = { LOGICAL:'logical', EVIDENTIAL:'evidential', TEMPORAL:'temporal', OBLIGATION:'obligation', ASSUMPTION:'assumption', CONTRADICTION:'contradiction' };
const GAP_REASON = { COMPRESSION:'compression', AVOIDANCE:'avoidance', ATTENTION:'attention', STRUCTURAL_LIMIT:'structural_limit', DEFERRED_VARIABLE:'deferred_variable', IDENTITY_REFLECTION:'identity_reflection' };
const DOMAIN = { CODE:'code', AI_ML:'ai_ml', COMMUNICATION:'communication', EPISTEMOLOGICAL:'epistemological', LOGIC:'logic' };

function gaphunterAnalyze(text, opts = {}) {
  const gaps = []; if (!text || text.length < 50) return gaps;
  const lines = text.split('\n'), words = text.toLowerCase().match(/\b\w+\b/g)||[], wc = words.length;
  const bd = lines.filter(l=>/^\s*[-*•]|\d+\./.test(l)).length / Math.max(1,lines.length);
  const ld = wc > 5 ? (new Set(words).size / wc) : 1;
  const freq = {}; for (const ch of text) freq[ch]=(freq[ch]||0)+1;
  let H=0; for (const f of Object.values(freq)) { const p=f/text.length; H -= p*Math.log2(p); }
  H = parseFloat(H.toFixed(3));
  const hedges = (text.match(/\b(might|may|could|perhaps|possibly|seems|appears|likely|probably|generally|often)\b/gi)||[]).length;
  const hedgeRate = wc > 0 ? hedges/wc : 0;
  const min = opts.minScore ?? 0.25;
  const lastLine = lines[lines.length-1]?.trim()||'';

  if (bd > 0.75 && Math.min(0.95,bd) >= min) gaps.push({ type:GAP_TYPE.ASSUMPTION, domain:DOMAIN.COMMUNICATION, reason:GAP_REASON.COMPRESSION, description:`High bullet density (${(bd*100).toFixed(0)}%) — reasoning compressed, load-bearing assumptions hidden`, score:Math.min(0.95,bd), evidence:{metric:bd,pattern:'bullet_density'} });
  if (ld < 0.35 && Math.min(0.9,1-ld) >= min) gaps.push({ type:GAP_TYPE.OBLIGATION, domain:DOMAIN.COMMUNICATION, reason:GAP_REASON.STRUCTURAL_LIMIT, description:`Low lexical diversity (${ld}) — formulaic or repetitive phrasing`, score:Math.min(0.9,1-ld), evidence:{metric:ld,pattern:'lexical_diversity'} });
  if (H < 3.2 && wc > 80) { const sc=parseFloat(((4-H)/4).toFixed(3)); if (sc>=min) gaps.push({ type:GAP_TYPE.TEMPORAL, domain:DOMAIN.AI_ML, reason:GAP_REASON.COMPRESSION, description:`Low entropy H=${H} — pre-planned or template content`, score:sc, evidence:{metric:H,pattern:'entropy'} }); }
  if (hedgeRate > 0.04 && Math.min(0.85,hedgeRate*10) >= min) gaps.push({ type:GAP_TYPE.ASSUMPTION, domain:DOMAIN.EPISTEMOLOGICAL, reason:GAP_REASON.AVOIDANCE, description:`High hedge density (${(hedgeRate*100).toFixed(1)}%) — epistemic evasion`, score:Math.min(0.85,hedgeRate*10), evidence:{metric:hedgeRate,pattern:'hedge_rate'} });
  if (wc > 200 && (lastLine.endsWith('...')||lastLine.endsWith('etc.')||lastLine.length < 12)) gaps.push({ type:GAP_TYPE.OBLIGATION, domain:DOMAIN.COMMUNICATION, reason:GAP_REASON.STRUCTURAL_LIMIT, description:'Possible truncation — context window pressure', score:0.75, evidence:{pattern:'truncation'} });
  const asserts = (text.match(/\b(always|never|all|every|definitely|certainly|obviously|clearly)\b/gi)||[]).length;
  const assertRate = wc>0?asserts/wc:0;
  if (assertRate > 0.02 && hedgeRate < 0.01 && wc > 100 && Math.min(0.8,assertRate*20) >= min) gaps.push({ type:GAP_TYPE.EVIDENTIAL, domain:DOMAIN.EPISTEMOLOGICAL, reason:GAP_REASON.IDENTITY_REFLECTION, description:'High assertion density without evidence markers', score:Math.min(0.8,assertRate*20), evidence:{metric:assertRate,pattern:'assertion_without_evidence'} });
  if ((text.includes('```')||text.includes('function ')||text.includes('const '))) {
    const todos = (text.match(/\bTODO\b|\bFIXME\b|\bHACK\b/g)||[]).length;
    if (todos > 0) gaps.push({ type:GAP_TYPE.OBLIGATION, domain:DOMAIN.CODE, reason:GAP_REASON.DEFERRED_VARIABLE, description:`${todos} deferred variable(s) — §1.3 violation`, score:Math.min(0.9,0.3+todos*0.15), evidence:{metric:todos,pattern:'todo_markers'} });
    const stubs = (text.match(/\/\/ stub|pass\s*$|throw new Error\(['"]not implemented/gim)||[]).length;
    if (stubs > 0) gaps.push({ type:GAP_TYPE.OBLIGATION, domain:DOMAIN.CODE, reason:GAP_REASON.DEFERRED_VARIABLE, description:`${stubs} stub/unimplemented — §1.3 violation`, score:0.85, evidence:{metric:stubs,pattern:'stubs'} });
  }
  return gaps;
}

// ══════════════════════════════════════════════════════════════════════════════
//  COCKPIT SSE
// ══════════════════════════════════════════════════════════════════════════════

const cockpitClients = new Set();
function cockpitBroadcast(data) {
  if (!cockpitClients.size) return;
  let msg;
  try {
    msg = `data: ${JSON.stringify(data)}\n\n`;
  } catch (e) {
    console.error(`[guardian] cockpitBroadcast: payload failed to serialize (${e.message}) — dropped, not crashing the process. type=${data?.type || "unknown"}`);
    return;
  }
  for (const r of cockpitClients) { try { r.write(msg); } catch(_) { cockpitClients.delete(r); } }
}

// ── SEAM watchdog — detects stalled GENERATING chunks / dead provider ──────
// connections and force-retries through the same lever as the manual
// POST /seam/retry endpoint. See guardian/lib/seam-watchdog.js for the gap
// this closes. bus.emit is already wired to write every event to the CFR
// ledger (above) — no separate ledger call needed here.
// NOTE: must start after cockpitClients/cockpitBroadcast above — .start()
// fires a synchronous bus.emit(), and every bus.emit() unconditionally calls
// cockpitBroadcast() (see SISOStream.emit), which referenced cockpitClients
// before it existed when this lived earlier in the file (TDZ ReferenceError
// on boot). Moved here instead of deferring the emit itself, since the next
// thing added between the old spot and here could hit the same landmine.
const { createSeamWatchdog } = require('../lib/seam/watchdog.js');
const _seamWatchdog = createSeamWatchdog({
  activeQueues:   _activeQueues,
  ncpIsConnected: (provider) => ncp.isConnected(provider),
  busEmit:        (type, data) => bus.emit(type, data),
});
_seamWatchdog.start();

// ══════════════════════════════════════════════════════════════════════════════
//  SISO GATE REGISTRATIONS
// ══════════════════════════════════════════════════════════════════════════════

// ── STREAM_GATE: stream token accumulator ────────────────────────────────────
// NCP handleStream fires busEmit('ncp.stream.chunk', ...) on every token.
// Registered here (after bus declaration) as a proper SISOGate — §5.1/§5.7.
bus.register(new SISOGate('ncp.stream.chunk', (chunk) => {
  const { jobId, token, done, seq, provider } = chunk;
  const job = jobs.get(jobId);
  if (!job) return;
  if (!job._streamBuffer) job._streamBuffer = '';
  job._streamBuffer += token;
  job._streamSeq  = seq;
  job.status      = done ? 'complete' : 'responding';
  cockpitBroadcast({ type:'STREAM_TOKEN', jobId, token, done, seq, provider, ts: Date.now() });
  if (done) {
    job.result = job._streamBuffer;
    job.doneAt = Date.now();
    jaa.insert('artifacts', {
      uuid: require('crypto').randomUUID(), jobId, provider,
      content: job._streamBuffer, streamTokens: seq, ts: Date.now(),
    });
    _postEvent('guardian.job.complete', { jobId, provider, streaming:true, tokenCount:seq });
    try {
      const cl = require('../lib/chat-logger');
      cl.log({ role:'assistant', content:job._streamBuffer, provider, outcome:'complete',
        jobId, meta:{ streaming:true, tokens:seq } }).catch(()=>{});
    } catch(_) {}
  }
}));

bus.register(new SISOGate('guardian.artifact', (data) => {
  const ts = Date.now();
  const hash = data.hash || '';
  const existing = jaa.get('artifacts', { hash });
  if (existing) {
    jaa.update('artifacts', { hash }, { seen_count: (existing.seen_count||1)+1, last_seen: ts });
  } else {
    jaa.insert('artifacts', {
      id: randomUUID(), hash, name: data.name||'artifact', type: data.type||'code_block',
      lang: data.lang||null, content: (data.content||'').slice(0,8000),
      context: (data.context||'').slice(0,400), chat_url: data.chatUrl||'',
      chat_id: data.chatId||'', account: data.account||'', job_id: data.jobId||null,
      session_id: data.sessionId||null, direction: data.direction||'output',
      provider: data.provider||'claude', ts, last_seen: ts, seen_count: 1, tags: '[]',
    });
  }
  // Auto-upload content to dropzone file server
  const autoUp = getSetting('dropzone_auto_upload','true')==='true';
  if (autoUp && dropzone?.autoUpload && data.content && data.name) {
    const ext = {typescript:'ts',javascript:'js',python:'py',html:'html',css:'css',json:'json',bash:'sh',rust:'rs',go:'go'}[data.lang]||'txt';
    dropzone.autoUpload(`${(data.name).replace(/[^\w.-]/g,'_')}.${ext}`, data.content);
  }
  // Also push to memory server ingest (keeps memory server dashboard current)
  memoryServer?.ingest({ type:'ARTIFACT', payload:data, source:'siso-gate' });
}));

bus.register(new SISOGate('guardian.gaps', (data) => {
  const ts = Date.now();
  for (const gap of (data.gaps||[])) {
    jaa.insert('gaps', {
      id: randomUUID(), type: gap.type||'assumption', domain: gap.domain||null,
      reason: gap.reason||null, description: gap.description||'', score: gap.score||0.5,
      status: 'open', job_id: data.jobId||null, chat_id: data.chatId||null,
      session_id: data.sessionId||null, account: data.account||null,
      provider: data.provider||null, evidence: JSON.stringify(gap.evidence||{}),
      opened_ts: ts,
    });
  }
}));

// §FIX 2026-06-20 (James — "raid needs to be explicit ... using the
// intelligence system and guardian"): every SEAM job Guardian runs is real
// dispatch traffic, but it never touched RAID's agent_calls-driven weight
// table — RAID's learning stayed permanently cold despite constant real
// usage. Fire outcomes at cortex's admin server (:3748), which already has
// RAID registered for the existing /api/raid/decide + /status routes.
// Fire-and-forget on purpose: a feedback hiccup must never affect or delay
// the job itself — this is pure learning signal, not part of the job path.
// 2026-09-19: body + POST live in guardian/lib/raid-feedback.js. The old inline version sent {provider,ok,ms,cluster}
// while cortex read {agent,outcome}, so RAID never received a single outcome. Now carries transport/tier/account too.
const { buildFeedback: _buildRaidFeedback, postFeedback: _postRaidFeedback } = require('./lib/raid-feedback');
function _feedRaid(provider, ok, ms, extra = {}) {
  _postRaidFeedback(_buildRaidFeedback({ provider, ok, ms, ...extra }));
}

bus.register(new SISOGate('guardian.job.complete', (data) => {
  const ts = Date.now();
  const jobId = data.jobId || randomUUID();
  const existing = jaa.get('jobs', { id: jobId });
  if (existing) {
    // §FIXED 2026-09-22 — James: "maybe also log the chaturls to make them
    // consistent." Only the INSERT branch below recorded chat_url; a normal
    // dispatched job takes this UPDATE branch, so the URL the userscript
    // already sends was dropped every time — jobs.chat_url was populated only
    // for jobs guardian never dispatched. Same fields, same source, both paths.
    jaa.update('jobs', { id: jobId }, { status:'complete', response:(data.text||'').slice(0,5000), chars:(data.text||'').length, completed_ts:ts,
      ...(data.chatUrl ? { chat_url: data.chatUrl } : {}), ...(data.chatId ? { chat_id: data.chatId } : {}), ...(data.account ? { account: data.account } : {}) });
  } else {
    jaa.insert('jobs', {
      id: jobId, provider: data.provider||'claude', command: data.command||'',
      prompt: (data.prompt||'').slice(0,500), response: (data.text||'').slice(0,5000),
      status: 'complete', chat_url: data.chatUrl||'', chat_id: data.chatId||'',
      account: data.account||'', session_id: null, chars: (data.text||'').length,
      source: 'guardian-ws', started_ts: data.startedTs||ts, completed_ts: ts,
    });
  }
  const startedTs = existing?.started_ts || data.startedTs || ts;
  // One consistent completion line, with the chat the answer actually came
  // from — so a job can be traced back to the real conversation.
  console.log(`[guardian] job complete: ${String(jobId).slice(0,8)} · ${data.provider || existing?.provider || '?'} · ${(data.text||'').length}ch · ${Math.round((ts - startedTs)/1000)}s · chat=${data.chatUrl || existing?.chat_url || '(none reported)'}`);
  _feedRaid(data.provider || existing?.provider || 'claude', true, ts - startedTs, { job: (typeof jobs !== 'undefined' && jobs.get) ? jobs.get(jobId) : null });
}));

// §SUBMIT-EVIDENCE 2026-09-23 — one line per job stage, so a run's log shows
// WHERE a job stopped (typed but never sent / sent and waiting / replying)
// instead of only "dispatched" then silence.
bus.register(new SISOGate('guardian.job.progress', (data) => {
  console.log(`[guardian] job ${String(data.jobId || '').slice(0,8)} — ${data.stage}${data.how ? ` (${data.how})` : ''}${data.chatUrl ? ` · chat=${data.chatUrl}` : ''}`);
}));

bus.register(new SISOGate('guardian.job.error', (data) => {
  _feedRaid(data.provider || 'claude', false, 0, { job: (typeof jobs !== 'undefined' && jobs.get && data.jobId) ? jobs.get(data.jobId) : null, error: data.error, needsUser: !!data.needsUser });
}));

bus.register(new SISOGate('guardian.pa.session', (data) => {
  const ent = Array.isArray(data.entropy) ? (data.entropy.reduce((a,b)=>a+b,0)/Math.max(1,data.entropy.length)) : (data.entropy||0);
  jaa.insert('pa_sessions', {
    id: randomUUID(), job_id: data.jobId||null, chat_id: data.chatId||null,
    session_id: data.sessionId||null, account: data.account||null, provider: data.provider||null,
    total_tokens: data.tokens||0, tps_avg: parseFloat(data.tps)||0, pause_count: data.pauses||0,
    entropy_avg: parseFloat(ent)||0, burst_count: 0,
    hypotheses: JSON.stringify(data.hypotheses||[]), structure_events: '[]', ts: Date.now(),
  });
}));

bus.register(new SISOGate('guardian.ledger', (data) => {
  jaa.insert('ledger_entries', {
    id: randomUUID(), ledger_type: data.ledgerType||'event', category: data.category||'EVENT',
    msg: data.msg||'', chat_url: data.chatUrl||'', chat_id: data.chatId||'',
    account: data.account||'', provider: data.provider||null, job_id: data.jobId||null,
    session_id: data.sessionId||null, source: data.source||'guardian',
    meta: JSON.stringify(data.meta||{}), ts: Date.now(),
  });
  // Mirror to memory server so its dashboard stays current
  memoryServer?.ingest({ type:'LEDGER', payload:{ category:data.category||'EVENT', msg:data.msg||'', meta:data.meta||{} }, source:'siso-gate', chatUrl:data.chatUrl, account:data.account });
}));

bus.register(new SISOGate('guardian.download', (data) => {
  jaa.insert('downloads', {
    id: randomUUID(), filename: data.filename||'download', href: data.href||'',
    chat_url: data.chatUrl||'', chat_id: data.chatId||'', account: data.account||'',
    job_id: data.jobId||null, session_id: data.sessionId||null,
    provider: data.provider||null, ts: Date.now(),
  });
}));

bus.register(new SISOGate('guardian.session.named', (data) => {
  const ts = Date.now();
  const existing = jaa.get('sessions', { chat_id: data.chatId||'' });
  if (existing) {
    jaa.update('sessions', { chat_id: data.chatId||'' }, { name: data.name, updated_ts: ts });
  } else {
    jaa.insert('sessions', {
      id: randomUUID(), chat_id: data.chatId||'', chat_url: data.chatUrl||'',
      provider: data.provider||'claude', account: data.account||'', name: data.name||'',
      token_total: 0, started_ts: ts, updated_ts: ts,
    });
  }
  const ws = PROVIDERS[data.provider||'claude'];
  // Push session name to all connected providers via NCP
  ncp.broadcast({ type:'GUARDIAN_SESSION_NAMED', ...data });
}));

bus.register(new SISOGate('guardian.timeline', (data) => {
  jaa.insert('timeline_events', {
    id: randomUUID(), channel: data.channel||'unknown', person_id: data.personId||null,
    pair_id: null, chat_id: data.chatId||null, session_id: data.sessionId||null,
    payload: JSON.stringify(data.payload||{}), ts: data.ts||Date.now(),
  });
}));

// ══════════════════════════════════════════════════════════════════════════════
//  EXTENDED HTTP ROUTES
// ══════════════════════════════════════════════════════════════════════════════

function pRes(res, status, data) { res.writeHead(status, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify(data)); }
// §FOUND & FIXED 2026-09-06 — adversarial audit, James: "find every
// problem you can... hostile attacked and verified. okay now fix it."
// Real, unbounded memory-exhaustion DoS: bodyJ() (30 real call sites
// across this file) accumulated an incoming request body into a single
// string with zero size limit — a request that never stops sending data
// would grow that string forever, exactly the kind of pressure this
// same session already traced a real, live OOM crisis to
// (memory_pressure hitting FAILURE_MODE, refused 49 times over 5 real
// hours). MAX_BODY_BYTES is a real, generous bound (10MB — comfortably
// larger than any real spec/prompt/contract this codebase actually
// sends; checked, not guessed, against the largest real body this
// session ever built: a full 10-chunk spec manifest, nowhere close),
// not a guess at what's "too much." Rejects with a real, honest error
// the moment the limit is crossed — same reject() shape every one of
// bodyJ's 30 real callers already handles for a JSON.parse failure, so
// this needed zero changes anywhere else.
const MAX_BODY_BYTES = 10 * 1024 * 1024;
// §0.39.282 — the one JSON responder. 21 routes (provider/login from 0.39.280, economy from 0.39.281) called json(res, …)
// and guardian never defined it: POST /api/provider/login (sent by every provider tab) threw "json is not defined" and
// took guardian down (James's live log, 2026-09-29: crash-restart on every sign-in report).
function json(res, status, body) {
  // returns true: handleExtendedRoutes() must answer true for a route it handled, or the 404 fallback writes a second
  // response and guardian dies on ERR_HTTP_HEADERS_SENT (routes here do `return json(...)`).
  if (res.headersSent) return true;
  const s = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
  return true;
}

function bodyJ(req) {
  return new Promise((resolve, reject) => {
    let b = ''; let bytes = 0; let rejected = false;
    req.on('data', c => {
      if (rejected) return;
      bytes += Buffer.byteLength(c);
      if (bytes > MAX_BODY_BYTES) {
        rejected = true;
        req.destroy(); // stop the real socket from feeding more data in
        reject(new Error(`request body exceeded ${MAX_BODY_BYTES} bytes — refused, not silently buffered forever`));
        return;
      }
      b += c;
    });
    req.on('end', () => { if (!rejected) { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } } });
    req.on('error', reject);
  });
}

function handleExtendedRoutes(req, res, url, method) {
  const parts = url.pathname.split('/').filter(Boolean);

  // ── Forge health ──────────────────────────────────────────────────────────
  if (url.pathname === '/forge/health' && method === 'GET') {
    const forge = require('../cockpit/forge');
    forge.healthCheck()
      .then(h => pRes(res, 200, { ok: true, forge: h }))
      .catch(e => pRes(res, 200, { ok: false, error: e.message }));
    return;
  }

  // ── Core API routes ────────────────────────────────────────────────────────
  // ── Auto-update: /version returns component versions ─────────────────────
  // ── GET /open/:provider — redirect to provider URL (opens tab) ──────────────
  if (method==='GET' && url.pathname.startsWith('/open/')) {
    const prov = url.pathname.split('/')[2];
    const provUrls = { claude:'https://claude.ai/new', chatgpt:'https://chatgpt.com/', gemini:'https://gemini.google.com/', perplexity:'https://www.perplexity.ai/' };
    const target = provUrls[prov];
    if (!target) { pRes(res, 404, { ok:false, error:'unknown provider' }); return true; }
    res.writeHead(302, { Location: target }); res.end();
    return true;
  }

  // ── GET /queue — physical file queue state ─────────────────────────────────
  if (method==='GET' && url.pathname==='/queue') {
    const qDir = require('path').join(__dirname, '..', 'data', 'guardian');
    const fs2  = require('fs');
    function listDir(sub) {
      try {
        return fs2.readdirSync(require('path').join(qDir, sub))
          .filter(f => !f.startsWith('.') && !f.endsWith('.gitkeep'))
          .map(f => {
            const fp   = require('path').join(qDir, sub, f);
            const stat = fs2.statSync(fp);
            const meta = { name: f, sizeBytes: stat.size, mtime: stat.mtimeMs };
            // Read state JSON if it exists
            const stateFile = require('path').join(qDir, 'queue', f.split('.')[0] + '.json');
            if (fs2.existsSync(stateFile)) {
              try { Object.assign(meta, JSON.parse(fs2.readFileSync(stateFile, 'utf8'))); }
              catch(_) {}
            }
            return meta;
          });
      } catch { return []; }
    }
    const pending    = listDir('input').filter(f => f.name.includes('.pending.'));
    const processing = listDir('input').filter(f => f.name.includes('.processing.'));
    const done       = listDir('input').filter(f => f.name.includes('.done.'));
    const failed     = listDir('input').filter(f => f.name.includes('.failed.'));
    pRes(res, 200, {
      ok:       true,
      counts:   { pending:pending.length, processing:processing.length, done:done.length, failed:failed.length },
      pending, processing, failed,
      done:     done.slice(-20),  // last 20 done items
    });
    return true;
  }

  // ── POST /queue/enqueue — add item to physical queue ────────────────────────
  // §SELECTOR-MAP 0.39.249 — one map per provider of where input/send/reply live.
  // GET reads it (each key marked verified or not); POST assigns — from the Clear
  // Glass element picker or archaeology (both must carry live-check evidence) —
  // and pushes it to every open tab of that provider at once.
  {
    const m = url.pathname.match(/^\/api\/agents\/([a-z0-9-]+)\/selectors$/);
    if (m && method === 'GET') {
      const map = require('./lib/selector-map').mapFor(_agentRegistry, m[1]);
      pRes(res, map ? 200 : 404, map ? { ok: true, ...map } : { ok: false, error: `unknown provider: ${m[1]}` });
      return true;
    }
    if (m && method === 'POST') {
      bodyJ(req).then(body => {
        const r = require('./lib/selector-map').assign(_agentRegistry, ncp, m[1], body.selectors, { source: body.source, evidence: body.evidence });
        if (r.ok) { bus.emit('guardian.selectors.assigned', { provider: m[1], source: body.source, keys: Object.keys(body.selectors || {}), pushedToTabs: r.pushedToTabs }); console.log(`[guardian] selector map for ${m[1]} ${r.changed ? 'updated' : 'unchanged'} by ${body.source} — pushed to ${r.pushedToTabs} tab(s)`); }
        pRes(res, r.ok ? 200 : 400, r);
      }).catch(e => pRes(res, 400, { ok: false, error: e.message }));
      return true;
    }
  }

  if (method==='POST' && url.pathname==='/queue/enqueue') {
    bodyJ(req).then(body => {
      const { content, ext, provider, priority, tags, source } = body;
      if (!content) { pRes(res, 400, { ok:false, error:'content required' }); return; }
      const item = _physQueue.enqueue({
        content, ext: ext||'md',
        tags:     tags || [provider||'claude'],
        priority: priority || 'normal',
        source:   source   || 'api',
        meta:     { provider },
      });
      bus.emit('guardian.queue.enqueued', { uuid: item.uuid, ext: item.ext });
      pRes(res, 200, { ok:true, uuid: item.uuid, filepath: item.filepath });
    }).catch(e => pRes(res, 400, { ok:false, error:e.message }));
    return true;
  }

  // ── POST /queue/retry/:uuid — re-enqueue a failed item ───────────────────
  if (method==='POST' && /^\/queue\/retry\//.test(url.pathname)) {
    const uuid = url.pathname.split('/').pop();
    const state = _physQueue._readState(uuid);
    if (!state) { pRes(res, 404, { ok:false, error:'item not found' }); return; }
    // Find failed file and rename back to pending
    const inputDir = require('path').join(__dirname, '..', 'data', 'guardian', 'input');
    const files    = require('fs').readdirSync(inputDir).filter(f => f.startsWith(uuid) && f.includes('.failed.'));
    if (files.length) {
      const fp = require('path').join(inputDir, files[0]);
      const ext = files[0].split('.').pop();
      require('fs').renameSync(fp, require('path').join(inputDir, uuid + '.pending.' + ext));
      _physQueue._updateState(uuid, { status: 'pending', retriedAt: Date.now() });
      bus.emit('guardian.queue.retry', { uuid });
    }
    pRes(res, 200, { ok:true, uuid });
    return true;
  }

  // ── POST /queue/cancel/:uuid — mark processing item as failed ────────────
  if (method==='POST' && /^\/queue\/cancel\//.test(url.pathname)) {
    const uuid = url.pathname.split('/').pop();
    _physQueue.fail(uuid, 'cancelled by user', 0.3);
    pRes(res, 200, { ok:true, uuid });
    return true;
  }

  // ── GET /queue/conversation/:uuid — conversation log for completed item ──
  if (method==='GET' && /^\/queue\/conversation\//.test(url.pathname)) {
    const uuid  = url.pathname.split('/').pop();
    const convDir = require('path').join(__dirname,'..','data','guardian','conversations',uuid.slice(0,40));
    const convFile = require('path').join(convDir,'conversation.jsonl');
    if (!require('fs').existsSync(convFile)) { pRes(res, 200, { ok:true, messages:[] }); return true; }
    const messages = require('fs').readFileSync(convFile,'utf8').trim().split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    pRes(res, 200, { ok:true, uuid, messages });
    return true;
  }

  // ── GET /baseline — current baseline stats + open deviations ──────────────
  if (method==='GET' && url.pathname==='/baseline') {
    pRes(res, 200, {
      ok: true,
      stats:    _baseline.stats(),
      baseline: _baseline.baseline(),
      gaps:     _baseline.gaps(),
      friction: _baseline.friction(),
    });
    return true;
  }

  // §BUILT 2026-09-17 — James: "the chat index for clear-glass." Real
  // wiring, not a new mechanism: lib/chat-index.js already reads
  // chat_log (this same process's own real jaa store) and groups
  // provider -> agentId -> url, sorted by original ts — this route is
  // the one HTTP door ClearGlass's download-manager UI needs to reach
  // it, since chat_log lives in guardian's process, not clear-glass's.
  if (method==='GET' && url.pathname==='/api/chat-index') {
    try {
      const { buildChatIndex } = require('../lib/chat-index');
      const limit = parseInt(new URL(req.url, 'http://x').searchParams.get('limit') || '5000', 10);
      pRes(res, 200, { ok: true, index: buildChatIndex({ jaa, limit }) });
    } catch (e) {
      pRes(res, 500, { ok: false, error: e.message });
    }
    return true;
  }

  if (method==='GET' && url.pathname==='/version') {
    const fs2 = require('fs');
    const path2 = require('path');
    const readVersion = (file) => {
      try {
        const content = fs2.readFileSync(path2.join(__dirname, '..', file), 'utf8');
        const m = content.match(/version['":\s]+['"v]?(\d+\.\d+\.\d+)/i);
        return m ? m[1] : null;
      } catch(_) { return null; }
    };
    const userscriptVersion = (file) => {
      try {
        const content = fs2.readFileSync(path2.join(__dirname, file), 'utf8');
        const m = content.match(/@version\s+([\d.]+)/);
        return m ? m[1] : null;
      } catch(_) { return null; }
    };
    pRes(res, 200, {
      ok: true,
      guardian:        '3.6.1',
      userscript_claude:  userscriptVersion('userscript-claude.js'),
      userscript_chatgpt: userscriptVersion('userscript-chatgpt.js'),
      spec_parser:     '1.0.0',
      seam_queue:      '1.0.0',
      detector:        '1.0.0',
      nexus_chat:      '4.0.0',
      ts: Date.now(),
    });
    return true;
  }

  // §BUILT 2026-08-17 — GA3. "The 63 real tools co-pilot has are invisible
  // to the browser-tab side." Checked first: guardian and clear-glass have
  // ZERO references to tool-index anywhere, confirmed by grep. This is the
  // real bridge — reuses lib/agent-tools/index.js's exact same TOOLS map
  // and executeTool(), the identical engine co-pilot already calls, not a
  // second implementation a userscript would need to trust separately.
  if (method==='GET' && url.pathname==='/api/tools') {
    try {
      const agentTools = require('../lib/agent-tools/index.js');
      const list = [...agentTools.TOOLS.entries()].map(([name, t]) => ({ name, description: t.description || null }));
      pRes(res, 200, { ok: true, tools: list, count: list.length });
    } catch (e) { pRes(res, 500, { ok: false, error: e.message }); }
    return true;
  }

  if (method==='POST' && /^\/api\/tools\/[\w-]+$/.test(url.pathname)) {
    const toolName = url.pathname.split('/').pop();
    bodyJ(req).then(async (body) => {
      try {
        const agentTools = require('../lib/agent-tools/index.js');
        if (!agentTools.TOOLS.has(toolName)) { pRes(res, 404, { ok: false, error: `unknown tool "${toolName}"` }); return; }
        const result = await agentTools.executeTool(toolName, body || {}, { source: 'guardian', agent: body?.agent || null });
        pRes(res, 200, { ok: true, result });
      } catch (e) { pRes(res, 500, { ok: false, error: e.message }); }
    }).catch(e => pRes(res, 400, { ok: false, error: e.message }));
    return true;
  }

  // §PHASE 3 2026-09-03 — docs/command-index-per-system.spec's own
  // "real proof case." Placed here, right before /health, matching the
  // position a real meta-endpoint belongs at rather than buried deep
  // in the dispatch chain.
  if (method==='GET' && url.pathname==='/commands') {
    pRes(res, 200, require('./lib/command-index-extract.js').extractCommandIndex());
    return true;
  }

  if (method==='GET' && url.pathname==='/health') {
    const connectedProviders = {};
    for (const [k,v] of ncp._clients || new Map()) {
      connectedProviders[v.provider] = { tabId:v.tabId, connectedAt:v.connectedAt,
        lastHeartbeat:v.lastHeartbeat };
    }
    const pendingJobs   = [...jobs.values()].filter(j=>j.status==='pending');
    const activeQueues  = [..._activeQueues.values()].map(q=>q.toJSON());
    const baselineStats = _baseline ? _baseline.stats() : null;
    const queueStats    = (() => {
      try {
        const qDir = require('path').join(__dirname,'..','data','guardian','input');
        const files = require('fs').readdirSync(qDir);
        return {
          pending:    files.filter(f=>f.includes('.pending.')).length,
          processing: files.filter(f=>f.includes('.processing.')).length,
          done:       files.filter(f=>f.includes('.done.')).length,
          failed:     files.filter(f=>f.includes('.failed.')).length,
        };
      } catch { return null; }
    })();
    pRes(res, 200, {
      ok:              true,
      version:         '3.6.1',
      uptime:          process.uptime(),
      pid:             process.pid,
      // Jobs
      jobs:            jobs.size,
      pendingJobs:     pendingJobs.length,
      // NCP providers
      providers:       connectedProviders,
      providerCount:   Object.keys(connectedProviders).length,
      // SEAM
      activeQueues:    activeQueues.length,
      seamSessions:    activeQueues,
      // Physical queue
      physicalQueue:   queueStats,
      // Baseline health
      baseline:        baselineStats,
      friction:        baselineStats?.friction ?? 0,
      // Memory
      memory:          process.memoryUsage(),
      // Ports
      ports:           { http: HTTP_PORT, ncp: HTTP_PORT, memory: 7823, dropzone: 7822 },
    });
    return true;
  }
  if (method==='GET' && url.pathname==='/contract') {
    const cp = require('path').join(__dirname, 'interaction-contract.json');
    if (!require('fs').existsSync(cp)) { pRes(res,404,{ok:false,error:'contract not found'}); return true; }
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    res.end(require('fs').readFileSync(cp,'utf8')); return true;
  }
  // ── SEAM queue status ──────────────────────────────────────────────────────
  // ── LAB routes (/lab/*) ────────────────────────────────────────────────────
  if (url.pathname.startsWith('/lab')) {
    if (_lab) {
      // handleExtendedRoutes is sync — collect body then call lab handler
      if (method === 'POST' || method === 'PUT') {
        let raw = ''; let rawBytes = 0; let rawRejected = false;
        req.on('data', c => {
          if (rawRejected) return;
          rawBytes += Buffer.byteLength(c);
          if (rawBytes > MAX_BODY_BYTES) {
            rawRejected = true;
            req.destroy();
            pRes(res, 413, { ok: false, error: `request body exceeded ${MAX_BODY_BYTES} bytes` });
            return;
          }
          raw += c;
        });
        req.on('end', () => {
          if (rawRejected) return; // §FOUND & FIXED 2026-09-06 — same real fix as bodyJ() above
          let body = {};
          try { body = JSON.parse(raw); } catch(_) {}
          _lab.handleRequest(method, url.pathname, body, (status, data) => pRes(res, status, data))
            .then(handled => { if (!handled) pRes(res, 404, { ok:false, error:'lab route not found' }); })
            .catch(e => pRes(res, 500, { ok:false, error:e.message }));
        });
        return true;
      }
      _lab.handleRequest(method, url.pathname, {}, (status, data) => pRes(res, status, data))
        .then(handled => { if (!handled) pRes(res, 404, { ok:false, error:'lab route not found' }); })
        .catch(e => pRes(res, 500, { ok:false, error:e.message }));
      return true;
    }
    pRes(res, 404, { ok:false, error:'lab not available' });
    return true;
  }

  if (method==='GET' && url.pathname==='/alk/last') {
    // Resume — returns last user-initiated ALK decision
    try {
      const alk = require('../intelligence/alk');
      const decisions = alk.query({ actor: 'user', limit: 1 });
      const last = decisions[0] || null;
      pRes(res, 200, { ok:true, decision: last });
    } catch(_) { pRes(res, 200, { ok:true, decision: null }); }
    return;
  }

  if (method==='POST' && url.pathname==='/seam/retry') {
    // Manual SEAM watchdog trigger — same path the automatic watchdog uses
    // (guardian/lib/seam-watchdog.js), via SEAMQueue#forceRetryActive.
    bodyJ(req).then(body => {
      const { queueId, chunkUuid, reason } = body || {};
      const queue = _activeQueues.get(queueId);
      if (!queue) { pRes(res,404,{ok:false,error:'queue not found'}); return; }
      const active = queue._active;
      if (!active || (chunkUuid && active.uuid !== chunkUuid)) {
        pRes(res, 200, { ok:true, msg:'chunk no longer active or mismatch' });
        return;
      }
      const result = queue.forceRetryActive(reason || 'manual');
      console.log('[guardian] watchdog retry forced (manual):', result.chunkUuid, 'queue:', queueId, result.escalated ? '— escalated' : '');
      pRes(res, 200, { ok:true, retried: result.chunkUuid, escalated: result.escalated });
    }).catch(e => pRes(res,500,{ok:false,error:e.message}));
    return;
  }

  if (method==='GET' && url.pathname==='/seam/watchdog/status') {
    pRes(res, 200, { ok:true, status: _seamWatchdog.status() }); return true;
  }


  if (method==='GET' && url.pathname==='/seam/queues') {
    const queues = [..._activeQueues.values()].map(q => q.toJSON());
    pRes(res, 200, { ok:true, active: queues.length, queues }); return true;
  }
  // §BUILT 2026-07-13 — lib/seam/chunk-lifecycle.js's canonical vocabulary
  // existed with zero real cross-system callers; lib/seam/cross-system-
  // status.js is the report it was built for. Real state from both
  // idearium's spec manifests and this process's own queue_compartments
  // JAA table, normalized through the existing translation tables — no
  // third reimplementation of the state mapping.
  if (method==='GET' && url.pathname==='/seam/status/cross-system') {
    try {
      const { status } = require('../lib/seam/cross-system-status.js');
      const staleMs = url.searchParams.get('staleMs');
      const result = status(staleMs ? { staleMs: parseInt(staleMs) } : {});
      pRes(res, 200, { ok: true, ...result }); return true;
    } catch (e) {
      pRes(res, 500, { ok: false, error: e.message }); return true;
    }
  }
  if (method==='GET' && url.pathname.startsWith('/seam/queues/')) {
    const qid = url.pathname.split('/')[3];
    const q   = _activeQueues.get(qid);
    if (!q) { pRes(res, 404, { ok:false, error:'queue not found' }); return true; }
    pRes(res, 200, { ok:true, queue: q.toJSON() }); return true;
  }

  // ── /status/:jobId — Forge GuardianClient polls this ──────────────────────
  if (method==='GET' && url.pathname.startsWith('/status/')) {
    const jid = url.pathname.split('/')[2];
    const job = jobs.get(jid) || jaa.get('jobs', { id: jid });
    if (!job) { pRes(res, 404, { ok:false, error:'job not found' }); return true; }
    pRes(res, 200, {
      ok: true, jobId: jid,
      status: job.status,
      complete: job.status === 'complete' || job.status === 'done',
      provider: job.provider, command: job.command,
      ts: job.ts,
      // 0.39.256 — where the job is: the gate it is at or stopped at, and the whole trail (lib/gate-trail.js)
      gate: job.gate || null, gates: Array.isArray(job.gates) ? job.gates : [],
      error: job.error || job.failReason || null,
    });
    return true;
  }

  // ── POST /response/:jobId — the real fan-out route ──────────────────────────
  // §BUILT 2026-09-15 — James: "we need to create another api route to
  // stream to a .response node in the data folder, clearglass download
  // manager, the ledger, and the sse, to use as fallback, or synthesize
  // them, make sure they reach the return point."
  //
  // One delivery, four independent sinks (guardian/lib/response-sink.js):
  // the .response node under data/nodes/response/, the CFR ledger + JAA
  // artifacts row, Clear Glass's downloads manager, and the real bus
  // events GET /stream/:jobId already listens for. No sink depends on
  // another; each reports its own real outcome, and those outcomes are
  // recorded ON the node so a failure can't vanish into a log line.
  //
  // Body: { text, provider?, status?, done?, source?, prompt?, command?,
  //         chatUrl?, error? }
  //   done:false  — a real streaming increment. Emits a chunk event, does
  //                 NOT close the stream, records the node as 'partial'.
  //                 That status is honest: a stream that was never
  //                 terminated is partial, not complete.
  //   done:true   — terminal. Chunk + complete, node written 'complete'.
  //
  // Returns 200 when at least one DURABLE sink (node or ledger) accepted
  // it — the real condition for "this can still be found later" — and 502
  // when none did, because a delivery nothing kept is a failed delivery
  // however many events were emitted.
  if (method==='POST' && url.pathname.startsWith('/response/')) {
    const jid = url.pathname.split('/')[2];
    if (!jid) { pRes(res, 400, { ok:false, error:'jobId required in path' }); return true; }
    bodyJ(req).then(async body => {
      const b = body || {};
      const job = jobs.get(jid) || null;
      const sink = require('./lib/response-sink.js');
      const result = await sink.deliver({
        jobId:    jid,
        // Fall back to the live job's own real provider/command rather
        // than defaulting to a guess — an unattributable response is
        // worse than one honestly marked 'unknown'.
        provider: b.provider || (job && job.provider) || 'unknown',
        agentId:  b.agentId || (job && job.agentId) || null,
        status:   b.status || (b.done === false ? 'partial' : (b.error ? 'error' : 'complete')),
        text:     b.text || b.response || '',
        error:    b.error || null,
        done:     b.done !== false,
        source:   b.source || 'api',
        prompt:   b.prompt || (job && job.prompt) || null,
        command:  b.command || (job && job.command) || null,
        chatUrl:  b.chatUrl || null,
      }, { bus, jaa, evLedger: _evLedger, updateJob, jobs });
      pRes(res, result.ok ? 200 : 502, result);
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }

  // ── /response/:jobId — Forge GuardianClient reads completed response ────────
  // §FIXED 2026-09-15 — the return point used to answer
  // `{ok:true, status, response:''}` — HTTP 200, ok:true, empty string —
  // for every job whose response genuinely existed but wasn't in the two
  // places it looked. That is a silent lie a caller cannot distinguish
  // from a real empty answer, and it was reachable three real ways: the
  // jobs Map is in-memory and dies with the process; the artifacts row is
  // written late in ncp-handler's completion branch, after several things
  // that can throw; and a SEAM-routed jobId is never in the jobs Map at
  // all, by design.
  //
  // Now: the fast path is unchanged (live job first — same field order,
  // same shape, no behavior change for the case that already worked), and
  // when it comes up empty the request falls through to synthesize(),
  // which searches every durable sink in descending order of
  // trustworthiness and says which one answered. If nothing holds it, the
  // response is a real 404 with a real reason — never a 200 with an empty
  // string.
  if (method==='GET' && url.pathname.startsWith('/response/')) {
    const jid = url.pathname.split('/')[2];
    const job = jobs.get(jid) || jaa.get('jobs', { id: jid });
    const art = (jaa.all('artifacts') || []).find(a => a.jobId === jid);
    const fast = (job && (job.responseText || job.text)) || art?.content || '';

    if (job && fast) {
      pRes(res, 200, {
        ok:       true,
        jobId:    jid,
        status:   job.status,
        response: fast,
        provider: job.provider,
        ts:       job.ts,
        source:   'job',
      });
      return true;
    }

    const sink = require('./lib/response-sink.js');
    const found = sink.synthesize(jid, { jobs, jaa });
    if (!found.found) {
      // A job that exists but has no recorded response is a real, distinct
      // state from a job that never existed — 404 either way, but the
      // caller is told which.
      pRes(res, 404, {
        ok: false, jobId: jid,
        error: job ? `job ${jid} exists (status: ${job.status}) but no response was recorded in any sink`
                   : `job not found: ${jid}`,
        jobExists: !!job,
        status: job ? job.status : null,
        searched: ['job', 'node', 'artifacts', 'chat_log', 'intake'],
      });
      return true;
    }
    pRes(res, 200, {
      ok: true, jobId: jid,
      status: found.status,
      response: found.response,
      provider: found.provider,
      ts: job ? job.ts : null,
      // Which sink actually answered, and whether that copy is capped.
      // A caller comparing lengths against contentHash needs both.
      source: found.source,
      synthesized: true,
      truncated: !!found.truncated,
      ...(found.note ? { note: found.note } : {}),
      ...(found.dropId ? { dropId: found.dropId } : {}),
    });
    return true;
  }

  // §GA1 2026-10-02 — the agent facts, from Guardian's provider nodes (guardian/lib/agent-facts.js), stamped with their
  // hash: what Clear Glass caches (map invariant E13 — Guardian is the source of truth for the Clear Glass agents).
  if (method==='GET' && url.pathname==='/api/providers') {
    try { pRes(res, 200, { ok:true, ...require('./lib/agent-facts.js').facts() }); }
    catch (e) { pRes(res, 500, { ok:false, error: e.message }); }
    return true;
  }

  if (method==='GET' && url.pathname==='/providers') {
    const connected = ncp.getProviders();
    // §GA1 — the browser agents are Guardian's provider nodes (this list was hard-coded and had no deepseek); ollama is local
    const out = {}; let ids = [];
    try { ids = require('./lib/agent-facts.js').list().map(p => p.id); } catch (_) {}
    for (const id of (ids.length ? ids : ['claude', 'chatgpt', 'gemini', 'perplexity'])) out[id] = 'null';
    out.ollama = 'null';
    for (const [p] of Object.entries(out)) {
      if (ncp.isConnected(p)) out[p] = 'connected';
    }
    pRes(res, 200, { ok:true, providers:out, channels: connected }); return true;
  }

  // §BUILT 2026-09-03 — James: "adding agent on canvas opens tab in clear
  // glass... Guardian is the source of truth, control layer for
  // clearglass agents." Real capability already existed on Clear Glass's
  // own side (POST 127.0.0.1:7702/providers/:id/start, checked directly
  // in clear-glass/src/ipc/bridge.js) but nothing in guardian could reach
  // it — guardian and clear-glass only ever talked one direction before
  // this (clear-glass's userscripts opening an EventSource INTO guardian,
  // per clear-glass-bridge.js's own header). This is the missing link:
  // a real guardian route that proxies to the real clear-glass call,
  // using spawnProviderTab() (same file, same auto-spawn-via-autopilot
  // gate every other real Guardian->Clear Glass call already goes
  // through — not a second, parallel mechanism).
  if (method==='POST' && url.pathname.startsWith('/providers/') && url.pathname.endsWith('/spawn')) {
    const providerId = url.pathname.slice('/providers/'.length, -'/spawn'.length);
    const { spawnProviderTab } = require('./clear-glass-bridge.js');
    // §BUG CAUGHT BEFORE COMMIT — bodyJ is a function (bodyJ(req) => Promise),
    // not pre-parsed data. Every other route in this file calls it that way;
    // first draft here didn't. Matching the real convention (line 2972's
    // exact shape) rather than inventing a different one.
    bodyJ(req).then(body => spawnProviderTab(providerId, body || {}))
      .then(result => pRes(res, result.ok ? 200 : 502, result))
      .catch(e => pRes(res, 400, { ok:false, error: e.message }));
    return true;
  }

  // ── NCP channel endpoints (replace WSS) ─────────────────────────────────
  // ── CFR-Ω routes — kernel field debugger ──────────────────────────────
  if (url.pathname.startsWith('/cfr')) {
    if (_evLedger.handleCFRRoute(req, res, url)) return true;
  }

  if (method==='GET' && url.pathname==='/channel') {
    ncp.handleChannel(req, res, url); return true;
  }
  if (method==='POST' && url.pathname==='/result') {
    ncp.handleResult(req, res, bodyJ); return true;
  }
  // §BUILT 2026-09-17 — the CLI-facing half of the DOM sync mechanism.
  // requestSync() (guardian/lib/chat-sync.js) does the real push/wait/
  // timeout round trip; this route is just the HTTP surface over it,
  // same shape as every other POST route here (bodyJ -> pRes).
  if (_chatTranscripts.route(method, url, res, pRes)) return true;
  if (method==='POST' && url.pathname==='/sync') {
    bodyJ(req).then(async body => {
      const provider = body.provider;
      if (!provider) { pRes(res, 400, { ok: false, error: 'provider required' }); return; }
      if (!ncp.isConnected(provider)) { pRes(res, 409, { ok: false, error: `provider "${provider}" not connected` }); return; }
      // §FIX 2026-09-22 — optional, additive: body.agentId targets a
      // specific repo's own tab (see chat-sync.js's own 2026-09-22 note)
      // instead of the broadcast every existing caller still gets when
      // it's omitted. isConnected() above only proves SOME tab for this
      // provider is live — a real, tab-specific miss (this agentId's tab
      // isn't one of them) is still reported honestly via requestSync's
      // own 0-sent path, not assumed connected here.
      const result = await requestSync(provider, body.timeoutMs || 15000, body.agentId || null);
      pRes(res, result.ok ? 200 : 502, result);
    }).catch(e => pRes(res, 400, { ok: false, error: e.message }));
    return true;
  }
  if (method==='POST' && url.pathname.startsWith('/stream/')) {
    const streamJobId = url.pathname.slice('/stream/'.length);
    ncp.handleStream(req, res, bodyJ, streamJobId); return true;
  }
  // §FIX 2026-09-03 — guardian/cli.js's watchJob() does `http.get(BASE +
  // '/stream/' + jobId)` — a GET. Only a POST route existed at this exact
  // path (above — the unrelated job, userscripts pushing tokens IN). GET
  // never matched anything, so the CLI's SSE watch silently fell through
  // to a 404 every single call. Confirmed, not assumed, before writing
  // this: grepped guardian/server.js for a second /stream/ handler —
  // none existed.
  //
  // Real event names used below, confirmed by reading their actual emit
  // call sites (not guessed from naming convention):
  //   ncp.stream.chunk    — guardian/lib/ncp.js's handleStream(), the
  //                         POST route directly above. {jobId,token,done,seq,provider,tabId,ts}
  //   guardian.job.chunk  — guardian/lib/ncp-handler.js's GUARDIAN_CHUNK/
  //                         NCP_CHUNK path. {jobId,text,full,provider}
  //   guardian.job.complete / guardian.job.error — real, unscoped,
  //                         jobId is a PAYLOAD field, not part of the
  //                         event name (unlike the Lab Manager's
  //                         `guardian.job.${jobId}.complete`, which is
  //                         NOT real — checked, nothing emits it; a
  //                         second, separate, already-broken instance of
  //                         this same bug class, not fixed here).
  if (method==='GET' && url.pathname.startsWith('/stream/')) {
    const streamJobId = url.pathname.slice('/stream/'.length);
    const existing = jobs.get(streamJobId);

    // §FIXED 2026-09-13 — James: "the inject dom observer/mutation
    // listener should stream live the response. jobid, jobstatus."
    // Every event on this stream now carries the real jobId (the
    // client already knows it from the URL, but a caller juggling more
    // than one stream — or logging these messages independently of the
    // connection they arrived on — had no way to tell them apart) and a
    // real, distinct `status` string instead of only a `done` boolean —
    // 'responding'/'complete'/'error' mirror the exact same real values
    // this job's own `status` field takes elsewhere (jobs.js's
    // createJob/updateJob), not a second, separate vocabulary invented
    // here.

    // Already finished before the client even connected — one message, done.
    if (existing && (existing.status === 'complete' || existing.status === 'error' || existing.status === 'delivered_confirmed')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      res.write(`data: ${JSON.stringify({ jobId: streamJobId, status: existing.status, text: existing.result || existing.response || '', done: true })}\n\n`);
      res.end();
      return true;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });

    const _onChunk = (ev) => {
      if (ev.data?.jobId !== streamJobId) return;
      const text = ev.data.token ?? ev.data.text ?? '';
      if (text) res.write(`data: ${JSON.stringify({ jobId: streamJobId, status: 'responding', text, done: false })}\n\n`);
      if (ev.data.done) _finish('');
    };
    const _onComplete = (ev) => {
      if (ev.data?.jobId !== streamJobId) return;
      _finish(ev.data.text ?? ev.data.response ?? '');
    };
    const _onError = (ev) => {
      if (ev.data?.jobId !== streamJobId) return;
      res.write(`data: ${JSON.stringify({ jobId: streamJobId, status: 'error', error: ev.data.error || 'job failed', done: true })}\n\n`);
      _cleanup(); try { res.end(); } catch(_) {}
    };
    let _finished = false;
    function _finish(finalText) {
      if (_finished) return; // both a chunk carrying done:true and a separate complete event can fire — one real end, not two
      _finished = true;
      if (finalText) res.write(`data: ${JSON.stringify({ jobId: streamJobId, status: 'complete', text: finalText, done: true })}\n\n`);
      else res.write(`data: ${JSON.stringify({ jobId: streamJobId, status: 'complete', done: true })}\n\n`);
      _cleanup();
      try { res.end(); } catch(_) {}
    }
    function _cleanup() {
      bus.off('ncp.stream.chunk', _onChunk);
      bus.off('guardian.job.chunk', _onChunk);
      bus.off('guardian.job.complete', _onComplete);
      bus.off('guardian.job.error', _onError);
    }

    bus.on('ncp.stream.chunk', _onChunk);
    bus.on('guardian.job.chunk', _onChunk);
    bus.on('guardian.job.complete', _onComplete);
    bus.on('guardian.job.error', _onError);
    req.on('close', _cleanup); // client disconnected before the job finished — stop listening, don't leak

    return true;
  }
  if (method==='POST' && url.pathname==='/heartbeat') {
    ncp.handleHeartbeat(req, res, bodyJ); return true;
  }
  // ── SEAM session endpoints ─────────────────────────────────────────────────
  if (method==='GET' && url.pathname==='/seam/sessions') {
    const sessions = jaa.all('seam_sessions') || [];
    pRes(res, 200, { ok:true, sessions }); return true;
  }
  if (method==='POST' && url.pathname==='/seam/sessions') {
    bodyJ(req).then(body => {
      const session = jaa.insert('seam_sessions', {
        uuid: require('crypto').randomUUID(),
        title: body.title || 'Untitled', specTitle: body.specTitle || '',
        chunks: body.chunks || [], activeChunk: 0,
        provider: body.provider || 'claude',
        status: 'active', createdAt: Date.now(),
      });
      pRes(res, 200, { ok:true, session });
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }
  if (method==='PUT' && url.pathname.startsWith('/seam/sessions/')) {
    const sid = url.pathname.split('/')[3];
    bodyJ(req).then(body => {
      const existing = jaa.get('seam_sessions', { uuid: sid });
      if (!existing) { pRes(res, 404, { ok:false, error:'session not found' }); return; }
      const updated = jaa.update('seam_sessions', { uuid: sid }, { ...body, updatedAt: Date.now() });
      bus.emit('guardian.seam.updated', { sessionId: sid, ...body });
      pRes(res, 200, { ok:true, session: updated });
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }

  // ── Queue state endpoints ────────────────────────────────────────────────────
  if (method==='GET' && url.pathname==='/queue/compartments') {
    const queueId = url.searchParams.get('queueId');
    const comps = (jaa.all('queue_compartments') || []).filter(c => !queueId || c.queueId === queueId).slice(0,100);
    pRes(res, 200, { ok:true, compartments: comps }); return true;
  }
  if (method==='POST' && url.pathname==='/queue/compartments') {
    bodyJ(req).then(body => {
      const comp = jaa.insert('queue_compartments', {
        uuid: body.id || require('crypto').randomUUID(),
        queueId: body.queueId, chunkIdx: body.chunkIdx,
        chunkTitle: body.chunkTitle, state: body.state || 'QUEUED',
        provider: body.provider, retries: body.retries || 0,
        detection: body.detection || null, ts: Date.now(),
      });
      bus.emit('guardian.queue.compartment', { ...comp });
      pRes(res, 200, { ok:true, compartment: comp });
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }
  if (method==='PUT' && url.pathname.startsWith('/queue/compartments/')) {
    const cid = url.pathname.split('/')[3];
    bodyJ(req).then(body => {
      const updated = jaa.update('queue_compartments', { uuid: cid }, { ...body, updatedAt: Date.now() });
      if (updated) {
        bus.emit('guardian.queue.compartment.updated', { uuid: cid, ...body });
        pRes(res, 200, { ok:true, compartment: updated });
      } else {
        // Not found — insert new
        const comp = jaa.insert('queue_compartments', { uuid: cid, ...body, ts: Date.now() });
        pRes(res, 200, { ok:true, compartment: comp });
      }
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }

  // ── Settings ────────────────────────────────────────────────────────────────
  // §DECOMPOSED 2026-08-29 — the 3 real /settings routes moved to
  // routes/settings.js verbatim (Phase 116's first real slice for
  // guardian). jaa/pRes/bodyJ injected via ctx since jaa is a real,
  // stateful class instance, not a shared-singleton lib module.
  if (require('./routes/settings.js').handle(req, res, { method, url, jaa, pRes, bodyJ })) return true;

  // ── Autonomous loop trigger ───────────────────────────────────────────────
  // First real caller of lib/autonomous-loop.js's run() (Phase 13 was
  // complete and callerless — confirmed by grep before writing this).
  if (require('./routes/autonomous-loop.js').handle(req, res, { method, url, jaa, pRes, bodyJ, jobs, createJob, dispatchJob, ncp, nc, bus })) return true;

  // Mesh route relocated 2026-09-03 to clear-glass/src/network/routes.js
  // (see guardian/server.js's boot-sequence comment above and
  // mesh/README.md for the historical record).
  // ── Artifacts (paginated) ────────────────────────────────────────────────────
  if (method==='GET' && url.pathname==='/artifacts') {
    const limit = parseInt(url.searchParams.get('limit')||'100');
    const artifacts = jaa.all('artifacts') || [];
    pRes(res, 200, { ok:true, artifacts }); return true;
  }

  // ── Gaps ────────────────────────────────────────────────────────────────────
  if (method==='GET' && url.pathname==='/gaps') {
    const limit = parseInt(url.searchParams.get('limit')||'200');
    const status = url.searchParams.get('status');
    let gaps = (jaa.all('gaps') || []).slice(0, limit);
    if (status) gaps = gaps.filter(g => g.status === status);
    pRes(res, 200, { ok:true, gaps }); return true;
  }
  if (method==='GET' && url.pathname==='/gaps/summary') {
    const gaps = jaa.query('gaps', () => true, 1000);
    const byType = {};
    for (const g of gaps) byType[g.type] = (byType[g.type] || 0) + 1;
    const drift = gaps.length > 0
      ? gaps.reduce((s,g) => s + (g.score||0), 0) / gaps.length : 0;
    pRes(res, 200, { ok:true, total: gaps.length, byType,
      drift: parseFloat(drift.toFixed(3)) }); return true;
  }

  // ── Sessions (chat sessions) ────────────────────────────────────────────────
  if (method==='GET' && url.pathname==='/sessions') {
    const limit = parseInt(url.searchParams.get('limit')||'50');
    const sessions = jaa.query('sessions', () => true, limit);
    pRes(res, 200, { ok:true, sessions }); return true;
  }
  if (method==='POST' && /^\/sessions\/[^/]+\/name$/.test(url.pathname)) {
    const chatId = url.pathname.split('/')[2];
    bodyJ(req).then(body => {
      const { name, account, provider, chatUrl } = body;
      // §FIXED 2026-09-11 — this used to insert/update its own row here
      // (uuid/chatId/updatedAt/createdAt — three-way field-shape drift
      // against the other two real session-write sites, confirmed while
      // building guardian/schemas/session.js), then ALSO emit
      // guardian.session.named right below, which did a SECOND, correctly
      // -shaped write to the same row. Every call to this route wrote the
      // session twice, once malformed. Real fix: this route owns no write
      // logic of its own — it's the one, canonical guardian.session.named
      // gate's job (see the gate below), same as every other caller.
      bus.emit('guardian.session.named', { chatId, name, account, provider, chatUrl });
      // Also broadcast via NCP so Forge Brain updates
      ncp.broadcast({ type:'GUARDIAN_SESSION_NAMED', chatId, sessionName: name });
      pRes(res, 200, { ok:true, chatId, name });
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }

  // ── Queue progress (from userscript QueueCompartment) ───────────────────────
  if (method==='POST' && /^\/api\/queue\/[^/]+\/progress$/.test(url.pathname)) {
    const queueId = url.pathname.split('/')[3];
    bodyJ(req).then(body => {
      // Upsert queue compartment state
      if (body.compartment) {
        const comp = body.compartment;
        const existing = jaa.query('queue_compartments', c =>
          c.queueId === queueId && c.chunkIdx === comp.chunkIdx, 1);
        if (existing.length) {
          jaa.update('queue_compartments', existing[0].uuid, {
            state: comp.state, retries: comp.retries,
            composite: comp.composite, failureCount: comp.failureCount,
            updatedAt: Date.now(),
          });
        } else {
          jaa.insert('queue_compartments', {
            uuid: comp.id || require('crypto').randomUUID(),
            queueId, chunkIdx: comp.chunkIdx,
            chunkTitle: comp.chunkTitle, state: comp.state,
            retries: comp.retries || 0, composite: comp.composite,
            failureCount: comp.failureCount || 0, ts: Date.now(),
          });
        }
      }
      bus.emit('guardian.queue.progress', { queueId, ...body });
      pRes(res, 200, { ok:true });
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }

  // ── POST /cli/exec — unified CLI execution endpoint ───────────────────────
  // Both terminal REPL and UI cockpit call this.
  // Every command is executed here, ledger-written (§LAW II), then broadcast
  // via SSE /events so both terminal and UI see output in real-time.
  //
  // Supported commands (mirrors nexus-repl.js dispatch table):
  //   jobs [--status pending|complete] [--limit N]
  //   artifacts [--lang ts] [--limit N]
  //   gaps [--status open] [--limit N]
  //   sessions [--limit N]
  //   providers
  //   health
  //   stats
  //   ledger [--limit N]
  //   settings
  //   set <key> <value>
  //   send <provider> <prompt...>
  //   seam queues
  //   seam sessions
  //   version
  //   bus [--limit N]

  if (method === 'POST' && url.pathname === '/cli/exec') {
    bodyJ(req).then(async body => {
      const raw  = (body.command || '').trim();
      const ts   = Date.now();
      if (!raw) { pRes(res, 400, { ok:false, error:'command required' }); return; }

      // §LAW II — write to ledger BEFORE executing
      const ledgerEntry = {
        uuid:     require('crypto').randomUUID(),
        category: 'INPUT',
        msg:      'cli: ' + raw.slice(0, 120),
        meta:     JSON.stringify({ command: raw, source: body.source || 'cli', ts }),
        ts,
      };
      try { jaa.insert('ledger', ledgerEntry); } catch(e) { console.error(`[guardian §LAW II] failed to write CLI input to ledger before execution: ${e.message}`); }
      bus.emit('guardian.cli.exec', { command: raw, ts });

      // Execute the command
      let result = null;
      let error  = null;
      const parts = raw.split(/\s+/);
      const cmd   = parts[0].toLowerCase();
      const flags = {};
      for (let i = 1; i < parts.length; i++) {
        if (parts[i].startsWith('--') && parts[i+1] && !parts[i+1].startsWith('--')) {
          flags[parts[i].slice(2)] = parts[i+1]; i++;
        } else if (parts[i].startsWith('--')) {
          flags[parts[i].slice(2)] = true;
        }
      }

      try {
        switch (cmd) {
          case 'jobs': {
            const limit = parseInt(flags.limit || '20');
            const all   = jaa.all('jobs') || [];
            const filtered = flags.status ? all.filter(j => j.status === flags.status) : all;
            result = { jobs: filtered.slice(0, limit) };
            break;
          }
          case 'artifacts': {
            const limit = parseInt(flags.limit || '20');
            const all   = jaa.all('artifacts') || [];
            const filtered = flags.lang ? all.filter(a => a.lang === flags.lang) : all;
            result = { artifacts: filtered.slice(0, limit) };
            break;
          }
          case 'gaps': {
            const limit = parseInt(flags.limit || '50');
            let all     = jaa.all('gaps') || [];
            if (flags.status) all = all.filter(g => g.status === flags.status);
            if (flags.type)   all = all.filter(g => g.type === flags.type);
            result = { gaps: all.slice(0, limit) };
            break;
          }
          case 'sessions': {
            const limit = parseInt(flags.limit || '30');
            const all   = jaa.all('sessions') || [];
            result = { sessions: all.slice(0, limit) };
            break;
          }
          case 'providers': {
            const connected = {};
            for (const [k, c] of ncp._clients || new Map()) {
              connected[c.provider] = { tabId: c.tabId, connectedAt: c.connectedAt };
            }
            result = { providers: connected };
            break;
          }
          case 'health': {
            result = { ok: true, uptime: process.uptime(), jobs: jobs.size,
              providers: ncp.connectedProviders?.() || {}, ts: Date.now() };
            break;
          }
          case 'stats': {
            const all = jaa.all;
            result = {
              artifacts: (jaa.all('artifacts') || []).length,
              gaps:       (jaa.all('gaps')      || []).length,
              sessions:   (jaa.all('sessions')  || []).length,
              ledger:     (jaa.all('ledger')    || []).length,
              jobs:       jobs.size,
            };
            break;
          }
          case 'ledger': {
            const limit = parseInt(flags.limit || '20');
            const all   = jaa.all('ledger') || [];
            result = { ledger: all.slice(-limit).reverse() };
            break;
          }
          case 'settings': {
            result = { settings: jaa.getAllSettings ? jaa.getAllSettings() : {} };
            break;
          }
          case 'set': {
            const key = parts[1], val = parts.slice(2).join(' ');
            if (!key || !val) { error = 'usage: set <key> <value>'; break; }
            if (jaa.setSetting) jaa.setSetting(key, val);
            result = { ok: true, key, value: val };
            break;
          }
          case 'send': {
            // send <provider> <prompt...>
            const provider = parts[1];
            const prompt   = parts.slice(2).join(' ');
            if (!provider || !prompt) { error = 'usage: send <provider> <prompt>'; break; }
            const job = createJob({ command:'code', provider, prompt });
            dispatchJob(job);
            result = { ok:true, jobId: job.id, provider, status: job.status };
            break;
          }
          case 'seam': {
            const sub = parts[1];
            if (sub === 'queues') {
              result = { queues: [..._activeQueues.values()].map(q => q.toJSON()) };
            } else if (sub === 'sessions') {
              result = { sessions: jaa.all('seam_sessions') || [] };
            } else {
              error = 'usage: seam queues | seam sessions';
            }
            break;
          }
          case 'version': {
            const readVer = (f) => {
              try {
                const c = require('fs').readFileSync(require('path').join(__dirname, '..', f),'utf8');
                const m = c.match(/@version\s+([\d.]+)/);
                return m ? m[1] : null;
              } catch { return null; }
            };
            result = {
              guardian: '3.6.1',
              userscript_claude:  readVer('guardian/userscript-claude.js'),
              userscript_chatgpt: readVer('guardian/userscript-chatgpt.js'),
            };
            break;
          }
          case 'bus': {
            const limit = parseInt(flags.limit || '20');
            result = { events: (_evLedger?.recent?.(limit) || []) };
            break;
          }
          default: {
            // §PHASE-15-CLOSE: single shared resolver (lib/grammar-fallback.js)
            // instead of inline duplicate logic — see that file for the full
            // rationale and the explicit non-invocation boundary.
            const resolution = await grammarFallback.resolveCommand(raw);
            if (resolution.resolved) {
              result = {
                grammarResolved: true,
                componentId: resolution.componentId,
                matched: resolution.matched,
                remainder: resolution.remainder,
                route: resolution.route,
                note: resolution.note,
              };
            } else {
              error = 'Unknown command: ' + cmd + '. Try: jobs, artifacts, gaps, sessions, providers, health, stats, ledger, settings, set, send, seam, version, bus';
            }
          }
        }
      } catch(e) {
        error = e.message;
      }

      // §LAW II — write result to ledger
      const resultEntry = {
        uuid:     require('crypto').randomUUID(),
        category: error ? 'GAP' : 'EVENT',
        msg:      'cli result: ' + cmd + (error ? ' ERROR: ' + error.slice(0,80) : ' OK'),
        meta:     JSON.stringify({ command: raw, ok: !error, ts: Date.now() }),
        ts:       Date.now(),
      };
      try { jaa.insert('ledger', resultEntry); } catch(e) { console.error(`[guardian §LAW II] failed to write CLI result to ledger: ${e.message}`); }

      // Broadcast to all SSE clients so UI + terminal see the same output
      cockpitBroadcast({
        type:    'CLI_RESULT',
        command: raw,
        result:  result || null,
        error:   error  || null,
        ts:      Date.now(),
      });

      pRes(res, 200, { ok: !error, command: raw, result, error, ts });
    }).catch(e => pRes(res, 400, { ok:false, error: e.message }));
    return true;
  }

  // /copilot/prompt and /copilot/channel removed — sovereign copilot service at :3750 handles these.

  // hot-load routes removed — use GET/POST /api/system/hot-load on orchestrator


  // ── Organism delivery queue — ERAVOS polls this to get newly-built organisms ──
  // NEXUS builds an organism zip via /build, puts it here.
  // ERAVOS polls /api/guardian/organism-queue every 5s.
  // On pickup, ERAVOS fetches the zip and installs it live.
  const _organismQueue = new Map(); // id → { id, zip, manifest, builtAt }

  // §dead-link fix 2026-06-29 — tv-ui's spotlight.js has been calling these
  // two routes since before this session; neither existed anywhere on
  // guardian. pollCFR() swallowed the failure silently (.catch(()=>null)),
  // so the tension field has been running on stale defaults, not live CFR
  // sigma. Plain proxy to the ORCHESTRATOR (the CFR field's authority; 2026-09-19 it used to go via cortex's relay), same flat shape —
  // checked directly, GET /cfr/field returns {ok, sigma, coherence,
  // friction, entropy, regime, ts}, exactly what pollCFR expects.
  if (method === 'GET' && url.pathname === '/api/guardian/cfr/state') {
    const req2 = http.request({ hostname: '127.0.0.1', port: parseInt(process.env.ORCHESTRATOR_PORT || '9000', 10), path: '/cfr/field', method: 'GET', timeout: 3000 }, r => {
      let buf = ''; r.on('data', c => buf += c);
      r.on('end', () => { res.writeHead(r.statusCode || 200, { 'Content-Type': 'application/json' }); res.end(buf); });
    });
    req2.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'orchestrator unreachable' })); });
    req2.on('timeout', () => req2.destroy());
    req2.end();
    return;
  }

  // §pressure-system fix 2026-06-30 — proxy for the hooks/wires relational
  // pressure feed, same shape as cfr/state above. This is what
  // wireRelationalTension() in spotlight.js has been calling with no real
  // endpoint behind it. Cortex now serves the real data (hooks/index.js,
  // 80 hooks/10 systems); this just makes it reachable from the browser
  // the same way cfr/state is.
  if (method === 'GET' && url.pathname === '/api/guardian/hooks/summary') {
    const req2 = http.request({ hostname: '127.0.0.1', port: 3748, path: '/hooks/summary', method: 'GET', timeout: 3000 }, r => {
      let buf = ''; r.on('data', c => buf += c);
      r.on('end', () => { res.writeHead(r.statusCode || 200, { 'Content-Type': 'application/json' }); res.end(buf); });
    });
    req2.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'cortex unreachable' })); });
    req2.on('timeout', () => req2.destroy());
    req2.end();
    return;
  }

  // §5.7 sovereign consumer — nerve/snapshot proxied same way as cfr/state.
  // Clear Glass fetches /api/guardian/nerve/snapshot; guardian proxies to
  // cortex; cortex calls lib/nerve/index.js. No sibling imports anywhere.
  if (method === 'GET' && url.pathname === '/api/guardian/nerve/snapshot') {
    const req2 = http.request({ hostname: '127.0.0.1', port: 3748, path: '/nerve/snapshot', method: 'GET', timeout: 3000 }, r => {
      let buf = ''; r.on('data', c => buf += c);
      r.on('end', () => { res.writeHead(r.statusCode || 200, { 'Content-Type': 'application/json' }); res.end(buf); });
    });
    req2.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'cortex unreachable' })); });
    req2.on('timeout', () => req2.destroy());
    req2.end();
    return;
  }

  if (method === 'POST' && url.pathname === '/api/guardian/cfr/event') {
    bodyJ(req).then(body => {
      const payload = JSON.stringify(body);
      const req2 = http.request({ hostname: '127.0.0.1', port: 3748, path: '/api/event', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 3000 }, r => {
        let buf = ''; r.on('data', c => buf += c);
        r.on('end', () => { res.writeHead(r.statusCode || 200, { 'Content-Type': 'application/json' }); res.end(buf); });
      });
      req2.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'cortex unreachable' })); });
      req2.on('timeout', () => req2.destroy());
      req2.write(payload); req2.end();
    }).catch(() => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'invalid JSON body' })); });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/guardian/organism-queue') {
    const items = [..._organismQueue.values()].map(o => ({ id: o.id, label: o.label, builtAt: o.builtAt }));
    pRes(res, 200, { ok: true, organisms: items });
    return true;
  }

  if (method === 'GET' && url.pathname.startsWith('/api/guardian/organism-queue/') && url.pathname.endsWith('/zip')) {
    const id = url.pathname.split('/')[4];
    const item = _organismQueue.get(id);
    if (!item) { pRes(res, 404, { ok: false, error: 'not found' }); return true; }
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': item.zip.length });
    res.end(item.zip);
    return true;
  }

  if (method === 'POST' && url.pathname.startsWith('/api/guardian/organism-queue/') && url.pathname.endsWith('/ack')) {
    const id = url.pathname.split('/')[4];
    _organismQueue.delete(id);
    pRes(res, 200, { ok: true });
    return true;
  }

  // ── POST /build — THE BUILD ROUTE ──────────────────────────────────────────
  // The loop closes here. spec → T0 scaffold → T1 wiring → T2 Ollama → files.
  // This is what NEXUS was always supposed to do.
  //
  // Body: { specPath, outputDir, provider='ollama', dryRun=false }
  // Or:   { specText, name, outputDir, provider='ollama' }
  if (method === 'POST' && url.pathname === '/build') {
    bodyJ(req).then(async body => {
      const { specPath, specText, name, outputDir, provider='ollama', dryRun=false, verbose=false } = body || {};

      if (!specPath && !specText) {
        pRes(res, 400, { ok:false, error:'specPath or specText required' });
        return;
      }

      // RAID gate — building touches the filesystem
      const approval = raid._approveTool('guardian.build', 'emerge-compiler',
        { action:'build', proof:body.proof });
      if (!approval.approved) {
        pRes(res, 403, { ok:false, denied:true, reason:approval.reason });
        return;
      }

      try {
        const t2 = require('../emerge/compiler/t2-gate');
        const outDir = outputDir || require('path').join(require('path').dirname(require.main?.filename || __dirname), 'output', name || 'build-' + Date.now());

        // If specText provided, write to temp file
        let resolvedSpecPath = specPath;
        if (specText && !specPath) {
          const tmpPath = require('path').join(require('os').tmpdir(), `nexus-spec-${Date.now()}.spec`);
          require('fs').writeFileSync(tmpPath, specText, 'utf8');
          resolvedSpecPath = tmpPath;
        }

        const onProgress = (node, status, detail) => {
          bus.emit('guardian.build.progress', { node: node?.name, status, detail, ts: Date.now() });
        };

        const result = await t2.run(resolvedSpecPath, outDir, { provider, dryRun, verbose, onProgress });
        pRes(res, result.ok ? 200 : 500, {
          ok:      result.ok,
          stage:   result.stage,
          summary: result.summary,
          t2:      result.t2Result,
          outputDir: outDir,
        });
      } catch(e) {
        pRes(res, 500, { ok:false, error:e.message });
      }
    }).catch(e => pRes(res, 500, { ok:false, error:e.message }));
    return true;
  }

  // blueprint routes removed — use /api/guardian/blueprint on orchestrator (already proxied)

  // autonomous routes removed — use /api/system/autonomous on orchestrator

  // mcp routes removed — use /api/system/mcp on orchestrator

  // /copilot/observe removed — sovereign copilot service at :3750 handles this.

  // ── POST /chatgpt-mode/query — two-layer Nexus(authority)/ChatGPT(reasoning) ──
  // Same shape as /copilot/prompt above, deliberately — different agent
  // (guardian/agents/chatgpt-mode.js), same request/response/error pattern.
  // §GAP CLOSED 2026-07-07 — /api/copilot/prompt is called by
  // copilot/lifeline.js's escalation path (with a RAID-selected provider,
  // wired and tested earlier this session) and did not exist anywhere in
  // this file. Guardian had ZERO working synchronous ask endpoints: this
  // one was absent, and /chatgpt-mode/query below 503s because
  // guardian/agents/chatgpt-mode.js does not exist. Rather than build a
  // second, parallel browser-tab agent, this wraps the REAL job machinery
  // (createJob -> dispatchJob -> NCP -> poll) that /command already uses,
  // via guardian/ask.js. Honest facade: it cannot make an async job
  // synchronous, only wait for it — and it fails fast when no provider is
  // connected rather than polling into a vague timeout.
  // ── §BUILT 2026-08-18 — intake: guardian listens for downloads ───────────
  // James: "guardian to listen for the downloads from your chat and move them
  // to the compartment with the contract or repo/spec."
  //
  // That "or" is a pipeline here, not a choice. Staging is never optional;
  // promotion into the tree is a separate, gated step. Guardian STAGES and
  // never applies — arrival is not acceptance (§IP-5). All the real work is
  // lib/intake.js; these routes are the surface, not a second copy (§10.3).
  // §0.39.280 BS16 — a provider tab's login state, reported by the chat-stream prelude (guardian/userscript-chat-stream.js
  // watchLogin). 'wall' = that provider cannot answer until the person signs in: said on the bus and to every NCP client,
  // and kept so a job waiting for that provider can say why. A dismissed nag ('modal') is recorded, not alarmed.
  // §0.39.281 EC6/EC3/EC4 — the provider economy: its policy (the one writer: lib/economy/store.js), usage against each
  // limit, the token limits learned from the ledger, and the learning router's scores — all read on request, nothing cached.
  if (url.pathname === '/api/economy' && method === 'GET') {
    const E = require('../lib/economy/store.js');
    return json(res, 200, { ok: true, policy: E.load(), tiers: require('../lib/economy/policy.js').TIERS, jobTypes: require('../lib/economy/policy.js').JOB_TYPES, limits: require('../lib/economy/policy.js').LIMITS });
  }
  if (url.pathname === '/api/economy' && method === 'POST') {
    bodyJ(req).then(body => {
      const r = require('../lib/economy/store.js').save((body && body.policy) || body || {}, null, { by: (body && body.by) || 'api' });
      _economyGuard.invalidate();
      bus.emit('guardian.economy.policy', { by: r.policy.updatedBy, dropped: r.dropped });
      return json(res, 200, { ok: true, policy: r.policy, dropped: r.dropped });
    }).catch(e => json(res, 400, { ok: false, error: e.message }));
    return true;   // §0.39.282 handled (async): a bare return fell through to the 404 fallback
  }
  if (url.pathname === '/api/economy/usage' && method === 'GET') {
    const L = require('../lib/economy/ledger.js');
    const pol = require('../lib/economy/store.js').load();
    const now = Date.now(); const rows = L.records({ since: now - 86400000 });
    const usage = {};
    for (const [p, v] of Object.entries(pol.providers || {})) usage[p] = { ...L.usage(p, now, rows), tier: v.tier, limits: v.limits, enabled: v.enabled, gate: require('../lib/economy/gate.js').decide({ provider: p, jobType: 'chat' }, { policy: pol, usage: L.usage(p, now, rows), now }) };
    return json(res, 200, { ok: true, usage, at: now });
  }
  if (url.pathname === '/api/economy/limits' && method === 'GET') {
    const L = require('../lib/economy/ledger.js'); const T = require('../lib/economy/tokens.js');
    const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days'), 10) || 30));
    const rows = L.records({ since: Date.now() - days * 86400000 });
    return json(res, 200, { ok: true, days, method: T.METHOD, limits: T.learn(rows), series: T.series(rows) });
  }
  if (url.pathname === '/api/economy/routing' && method === 'GET') {
    const L = require('../lib/economy/ledger.js'); const R = require('../lib/economy/router.js');
    const pol = require('../lib/economy/store.js').load();
    const rows = L.records({ since: Date.now() - 30 * 86400000 });
    const jobType = url.searchParams.get('jobType') || 'build';
    const cands = Object.keys(pol.providers || {}).filter(p => p !== 'ollama' || true);
    return json(res, 200, { ok: true, scores: R.scores(rows, pol), example: R.choose(jobType, cands, { policy: pol, records: rows, allowed: (p) => require('../lib/economy/gate.js').decide({ provider: p, jobType }, { policy: pol, usage: L.usage(p, Date.now(), rows) }).verdict === 'allow' }) });
  }

  if (method === 'POST' && url.pathname === '/api/provider/login') {
    bodyJ(req).then(body => {
      const provider = String((body && body.provider) || '').toLowerCase();
      const state = String((body && body.state) || '');
      if (!provider || !['ok', 'modal', 'wall', 'signed-out', 'unknown'].includes(state)) return json(res, 400, { ok: false, error: 'provider and state (ok | modal | wall | signed-out | unknown) are required' });
      const rec = { provider, state, dismissed: !!body.dismissed, text: body.text ? String(body.text).slice(0, 200) : null, url: body.url || null, at: Date.now() };
      _providerLogin.set(provider, rec);
      if (state === 'wall') { bus.emit('guardian.provider.login_required', rec); broadcast({ type: 'provider.login_required', ...rec }); console.warn(`[guardian] ${provider} needs a sign-in in its Clear Glass tab — its jobs wait (${rec.text || rec.url || ''})`); }
      else bus.emit('guardian.provider.login_state', rec);
      return json(res, 200, { ok: true, ...rec });
    }).catch(e => json(res, 400, { ok: false, error: e.message }));
    return true;   // §0.39.282 handled (async): a bare return fell through to the 404 fallback
  }
  if (method === 'GET' && url.pathname === '/api/provider/login') {
    return json(res, 200, { ok: true, providers: require('./lib/provider-login.js').all() });
  }

  if (method === 'POST' && url.pathname === '/api/intake') {
    bodyJ(req).then(body => {
      const intake = require('../lib/intake.js');
      // §AGENT-MESH-ARTIFACTS 2026-09-02 — real correlation, not fabricated:
      // if the caller (clear-glass's download-capture.js) didn't supply a
      // jobId, best-effort resolve one from guardian's own live job state
      // (see _findActiveJobForProvider's own comment for the honest limit
      // of this). If that job was itself dispatched by RAID's real
      // contract-intake (cortex/core/raid/contract-intake.js's
      // _realAgentExecutor now records dispatchedJobId on its queue row),
      // the queueId is looked up too — real, tree-wide search over a real
      // table, not assumed present.
      const jobId = body.jobId || _findActiveJobForProvider(body.provider) || null;
      let raidQueueId = null;
      if (jobId) {
        try {
          const raid = require('../cortex/core/raid/contract-intake.js');
          const match = raid.listQueue().find(r => r.dispatchedJobId === jobId);
          if (match) raidQueueId = match.uuid;
        } catch (_) { /* RAID module load failure is real and honest here — leave null */ }
      }
      const r = intake.stage({
        source: body.source,
        provenance: {
          provider:     body.provider || null,
          chatUrl:      body.chatUrl  || null,
          filename:     body.filename || null,
          downloadedAt: body.downloadedAt || Date.now(),
          jobId,
          raidQueueId,
          // §2026-09-03 — clear-glass/src/downloads/intake-bridge.js now
          // announces plain browsing-window downloads too (provider:
          // 'browsing', no chat behind them), and carries the real
          // window's agentId separately since it isn't a provider id and
          // shouldn't be conflated with one. Additive field only —
          // existing callers (download-capture.js) never send this and
          // are unaffected.
          agentId:      body.agentId || null,
        },
      });
      if (!r.ok) return json(res, 400, r);
      try { bus.emit('guardian.intake.staged', { dropId: r.dropId, provider: body.provider, summary: r.contract.summary, jobId, raidQueueId, ts: Date.now() }); } catch (_) {}
      json(res, 200, { ok: true, dropId: r.dropId, state: r.contract.state, summary: r.contract.summary, contract: r.contract });
    }).catch(e => json(res, 500, { ok: false, error: e.message }));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/intake') {
    const intake = require('../lib/intake.js');
    const id = url.searchParams.get('dropId');
    if (id) { const c = intake.read(id); return json(res, c ? 200 : 404, c || { ok: false, error: `no staged drop "${id}"` }); }
    return json(res, 200, { ok: true, drops: intake.list().map(c => ({ dropId: c.dropId, state: c.state, provider: c.provenance.provider, filename: c.provenance.filename, summary: c.summary, stagedAt: c.stagedAt })) });
  }

  if (method === 'POST' && url.pathname === '/api/intake/verdict') {
    bodyJ(req).then(body => {
      const intake = require('../lib/intake.js');
      json(res, 200, intake.recordVerdict(body.dropId, { by: body.by, approved: body.approved, reason: body.reason }));
    }).catch(e => json(res, 500, { ok: false, error: e.message }));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/intake/promote') {
    bodyJ(req).then(body => {
      const intake = require('../lib/intake.js');
      // `by` is taken from the body deliberately and checked in intake.js —
      // guardian does not get to vouch for who asked.
      json(res, 200, intake.promote(body.dropId, { by: body.by }));
    }).catch(e => json(res, 500, { ok: false, error: e.message }));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/intake/rollback') {
    bodyJ(req).then(body => {
      const intake = require('../lib/intake.js');
      json(res, 200, intake.rollback(body.dropId));
    }).catch(e => json(res, 500, { ok: false, error: e.message }));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/copilot/prompt') {
    bodyJ(req).then(async body => {
      const { askSync } = require('./ask.js');
      const result = await askSync(body.prompt, {
        provider:  body.provider || 'auto',
        content:   body.content,
        timeoutMs: body.timeoutMs,
        command:   'ask',
        tools:     Array.isArray(body.tools) ? body.tools : undefined,
        // §TR1 2026-09-22 — jobs.js's createJob() already accepts and
        // stores agentId (confirmed directly: `agentId: agentId || null`
        // in its real signature) — this handler just never read it from
        // the request body. Forwarded now; askSync itself still needs
        // its own patch to pass this through to createJob (see ask.js).
        agentId:   body.agentId || undefined,
        // 0.39.265 — the meaning, when `prompt` is copilot's reworded variant; and whether a finished twin may answer
        canonical: typeof body.canonical === 'string' ? body.canonical : undefined,
        reuse:     body.reuse === 'complete' ? 'complete' : undefined,
      }, {
        createJob,
        dispatchJob,
        getJob: (id) => jobs.get(id),
        // §HP16 0.55.2 — a job askSync stops waiting for, never typed, is cancelled (its retry timer too)
        cancelJob: (id, why) => { try { if (_jobRetryRef) _jobRetryRef.cancel(id); } catch (_) {} return cancelJob(id, why); },
        isProviderConnected: (p) => { try { return ncp.isConnected(p); } catch (_) { return false; } },
        // §SOVEREIGNTY 2026-07-09 — this required
        // '../cortex/core/raid/routing-ir.js' across a system boundary (I
        // wrote it). Cortex already exposes POST /api/raid/decide — a real,
        // working, orphaned route. It was orphaned precisely BECAUSE callers
        // reached around it with require(). Guardian now asks cortex, so
        // cortex's RAID can be replaced or moved without touching guardian.
        // Falls back to the unconditional reserve if cortex is unreachable:
        // routing must never be the reason an ask cannot be attempted.
        resolveProvider: async (p) => {
          try {
            const nx = require('../lib/nexus-client');
            const d = await nx.post('cortex', '/api/raid/decide', { prompt: p }, { timeout: 3000 });
            return d?.agent || null;
          } catch (e) {
            console.warn('[guardian] cortex /api/raid/decide unreachable, using reserve:', e.message);
            return 'claude'; // LAW_III unconditional reserve
          }
        },
      });
      pRes(res, result.ok ? 200 : 502, result);
    }).catch(e => pRes(res, 500, { ok: false, error: e.message }));
    return true;
  }

  if (method === 'POST' && url.pathname === '/chatgpt-mode/query') {
    bodyJ(req).then(async body => {
      const { prompt, mode, maxTokens, model, timeout } = body || {};
      if (!prompt) { pRes(res, 400, { ok:false, error:'prompt required' }); return; }
      let chatgptMode;
      try { chatgptMode = require('./agents/chatgpt-mode'); }
      catch (e) { pRes(res, 503, { ok:false, error:'chatgpt-mode agent not loaded: ' + e.message }); return; }
      const result = await chatgptMode.query(prompt, { mode, maxTokens, model, timeout });
      pRes(res, result.ok ? 200 : 400, result);
    }).catch(e => pRes(res, 500, { ok:false, error: e.message }));
    return true;
  }

  // ── POST /command — dispatch a job (raw) or SEAM queue (with spec) ──────────
  // ── §PHASEMAP P4: POST /command/tools — Guardian's agentic tool-loop ────────
  // The SAME sovereign loop copilot uses (lib/agent-tools), wired with Guardian's
  // OWN provider backend: createJob → dispatchJob (NCP → browser tab) → resolve
  // the job. Guardian gets the 10 tools talking to claude/chatgpt/gemini, with
  // zero dependency on copilot. Additive: /command is untouched.
  if (method === 'POST' && url.pathname === '/command/tools') {
    bodyJ(req).then(async body => {
      const prompt = body.prompt;
      if (!prompt) { pRes(res, 400, { ok: false, error: 'prompt required' }); return; }
      const provider = body.provider || 'claude';
      try {
        const toolRuntime = require('./tool-runtime');

        // Guardian's callModel backend: create a job, dispatch via NCP, resolve
        // it by polling the jobs Map until the provider tab answers.
        const createAndDispatch = async (p) => {
          const job = createJob({ command: 'tools', provider, prompt: p });
          if (ncp.isConnected(provider)) dispatchJob(job);
          else bus.emit('guardian.tab.needed', { provider, url: null, jobId: job.id });
          return job.id;
        };
        const resolveJob = async (jobId) => {
          const MAX = 90;
          for (let i = 0; i < MAX; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const job = jobs.get(jobId);
            if (!job) return { text: '', toolCalls: null };
            // §FIX 2026-08-14 — this read job.response, but nothing anywhere
            // in guardian ever assigned that field (checked: grepped for
            // '.response =' across guardian/, zero hits). The GUARDIAN_COMPLETE
            // handler only ever set job.responseText. As written, every
            // resolved job returned text:'' regardless of what the tab
            // actually replied — the tool loop was silently getting nothing.
            if (job.status === 'complete') return { text: job.responseText || '', toolCalls: job.tool_calls || job.toolCalls || null, provider };
            if (job.status === 'error') return { text: job.error || '', toolCalls: null };
          }
          return { text: '', toolCalls: null, timedOut: true };
        };

        const result = await toolRuntime.run({
          userPrompt: prompt, createAndDispatch, resolveJob, provider,
          maxIterations: body.maxIterations || 6,
          streamDigest: body.streamDigest || '',
        });
        pRes(res, 200, { ok: true, text: result.text, iterations: result.iterations,
          toolCallLog: result.toolCallLog, provider });
      } catch (e) {
        pRes(res, 500, { ok: false, error: e.message });
      }
    }).catch(e => pRes(res, 400, { ok: false, error: e.message }));
    return;
  }

  // §BUILT 2026-09-08 — James: "wake word relay needs to send the wake
  // word response as a guardian job ack just like any other input into
  // a tab for agents chat input." Real gap: askNexus() (guardian/
  // userscript-nexus-wake.js) calls copilot's /api/prompt/tools
  // directly, entirely bypassing guardian's real job registry — the
  // GUARDIAN_LEDGER_WRITE fix (earlier this session) recorded the
  // exchange, but no real job existed in `jobs`/jaa's 'jobs' table the
  // way a normal dispatched job does. Reuses the exact real pattern
  // already established elsewhere in this file (llm-lab's
  // guardianDispatch, above: "Dispatch via guardian job system — same
  // path as regular jobs") — jobs.set() + jaa.insert('jobs', ...),
  // status already 'complete' since the real answer already happened
  // by the time this is called (wake-word is synchronous from the
  // userscript's own perspective; this registers the completed
  // exchange as a real job, it doesn't dispatch a new one).
  if (method === 'POST' && url.pathname === '/wake-job-ack') {
    bodyJ(req).then(body => {
      const { jobId, provider, prompt, response, tabId, fileName, syntax } = body || {};
      if (!jobId || !provider) { pRes(res, 400, { ok: false, error: 'jobId and provider required' }); return; }
      const job = {
        id: jobId, provider, command: 'wake', prompt: prompt || '',
        status: 'complete', responseText: response || '',
        createdAt: Date.now(), completedAt: Date.now(),
        _source: 'nexus-wake', tabId: tabId || null,
        // §CODE-ARTIFACT 2026-09-20 — a wake exchange can declare a target
        // file too. Absent (the normal case) the listener below no-ops.
        fileName: fileName || null, syntax: syntax || null,
      };
      jobs.set(jobId, job);
      try { jaa.insert('jobs', job); } catch (e) { console.warn(`[guardian] wake-job-ack: jaa insert failed (job still registered in memory): ${e.message}`); }
      try {
        require('./lib/code-artifact.js').onJobComplete({ job, text: response || '', bus });
      } catch (e) { console.warn(`[guardian] code-artifact listener (wake-job-ack) failed: ${e.message}`); }
      bus.emit('guardian.wake.job.acked', { jobId, provider, tabId, ts: Date.now() });
      pRes(res, 200, { ok: true, jobId });
    }).catch(e => pRes(res, 400, { ok: false, error: e.message }));
    return true;
  }

  if (method==='POST' && url.pathname==='/command') {
    bodyJ(req).then(async body => {

      // ── SEAM queue via .spec ────────────────────────────────────────────────
      // §FOUND & FIXED 2026-09-06 — adversarial audit, James: "find
      // every problem you can... hostile attacked and verified." A
      // real, severe arbitrary-local-file-read: body.specFile went
      // straight into fs.readFileSync() with zero path validation,
      // BEFORE the RAID approval check below even ran — any caller
      // could set specFile to any real path on disk (/etc/passwd,
      // an SSH key, anything the guardian process could read) and
      // have its content read into memory. Confirmed hostilely, not
      // theorized: reproduced the exact real line, read a real test
      // file outside any intended directory.
      //
      // Checked whether this was genuinely needed before removing it,
      // not assumed: guardian/cli.js's own real sendSpec() — the one
      // real, legitimate caller that ever deals with a spec FILE at
      // all — already resolves and reads the file LOCALLY (a trusted,
      // local CLI process reading its own filesystem) and sends the
      // real CONTENT over HTTP via specText, never a raw path. Nothing
      // real in this whole codebase ever sent specFile to this
      // endpoint expecting the SERVER to read a path from HTTP input.
      // Removed entirely — specText and spec (both real, actual
      // content, never a path) remain exactly as they were.
      if (body.spec || body.specText) {
        try {
          const specText = body.specText || body.spec;
          if (!specText) throw new Error('spec content empty');

          const provider = body.provider || 'chatgpt';

          // §FIX 2026-06-21: SEAM queue creation had ZERO gate before this —
          // straight from HTTP body to queue, no constraint check at all,
          // unlike tool calls (which already go through RAID's
          // _approveTool). Provider here is explicitly chosen by the
          // caller, not RAID-picked — that's correct, the console/CLI
          // already decided who handles this. But the CONSTRAINT layer
          // (contract check, rate limit, fail-closed for unknown sources)
          // should apply regardless of how the target was chosen. Action
          // 'forge' is the right fit — already in every provider's
          // contract, no new vocabulary needed.
          try {
            const raid = require('../cortex/core/raid');
            const approval = raid._approveTool(body.source || 'unknown', specText.slice(0, 200), { action: 'forge', proof: body.proof });
            if (!approval.approved) {
              pRes(res, 403, { ok: false, error: `RAID denied SEAM queue creation: ${approval.reason}` });
              return;
            }
          } catch (e) {
            // RAID itself unreachable — fail closed, same posture as the
            // co-pilot's tool gate, not a silent bypass.
            pRes(res, 503, { ok: false, error: `RAID approval gate unavailable, refusing to create SEAM queue without it: ${e.message}` });
            return;
          }

          const { queue, plan } = _buildSeamQueue(specText, {
            provider, title: body.title,
            splitOn:      body.splitOn      || 'heading',
            maxChunkSize: body.maxChunkSize || 3000,
          });

          // §LAW II physical redundancy — write to disk queue before dispatch
          _physQueue.enqueue({
            uuid:     queue.uuid,
            content:  specText,
            ext:      'spec',
            tags:     ['seam', provider, plan.meta.name || 'unnamed'],
            priority: body.priority || 'normal',
            source:   body.source   || 'api',
            project:  body.project  || null,
            meta:     { queueId: queue.uuid, totalChunks: plan.totalChunks },
          });

          if (ncp.isConnected(provider)) {
            queue.start();
          } else {
            // Queue waits — will start when provider connects via NCP
            const pq = pendingQueue.get(provider) || [];
            pq.push({ _seamQueue: queue });
            pendingQueue.set(provider, pq);
          }

          pRes(res, 200, {
            ok: true, type: 'seam',
            queueId:  queue.uuid,
            title:    queue.title,
            provider,
            total:    plan.totalChunks + 1,
            meta:     plan.meta,
            status:   ncp.isConnected(provider) ? 'dispatching' : 'queued_waiting_for_provider',
          });
        } catch (e) {
          pRes(res, 400, { ok:false, error: 'spec parse failed: ' + e.message });
        }
        return;
      }

      // ── Raw job dispatch ────────────────────────────────────────────────────
      // §FIX 2026-09-22 — found while wiring a new structured caller (no
      // `raw`, real command/provider/prompt fields instead, the same
      // shape sendFile() in guardian/cli.js already uses for command:
      // 'spec' — but that one is intercepted by an EARLIER branch, so
      // this exact path was never actually exercised with body.raw
      // unset). parseCommand(undefined) returns null (str becomes '',
      // matches nothing) — every read below (`parsed.provider`, etc.)
      // then threw TypeError: Cannot read properties of null. Any
      // structured, non-raw /command call with command:'ask'/'code' and
      // no raw field would have crashed with a 500.
      const parsed = parseCommand(body.raw) || {};
      let _rawProvider = body.provider || parsed.provider || null;

      // §RAID + §P97: if no explicit provider, let RAID decide (LAW_I: Ollama first)
      // CFR sigma floor is consulted — chaotic regime deprioritises slower providers.
      if (!_rawProvider || _rawProvider === 'auto') {
        try {
          const _raid = require('../cortex/core/raid/index');
          const _prompt = body.prompt || parsed.prompt || '';
          // §P97: read CFR field state for sigma-aware routing
          let _cfrCtx = {};
          try {
            const _cfrInfl = require('../nexus/nexus-cfr-influence');
            _cfrCtx = { sigmaFloor: _cfrInfl.getSigmaFloor?.() || 0,
                        regime: _cfrInfl.getState?.()?.regime || 'stable' };
          } catch(_) {}
          // §BUG FIXED 2026-07-07 — this called `_raid.decide(...)`, which
          // does not exist: RAID exports `_decide`, and its signature is
          // _decide(call, health, weights) where call is
          // {prompt, context:{cfrRegime, cfrSigmaFloor}} — not
          // (prompt, {preferredAgent, cfrCtx}). Because the call sat inside
          // the try/catch below, it threw silently on EVERY raw dispatch and
          // fell through to the 'chatgpt' fallback. RAID has therefore never
          // actually routed a raw job in Guardian, and the
          // `[guardian] RAID → ...` log line below has never once printed.
          // Found while wiring /api/copilot/prompt, which reused this same
          // broken call.
          const _decision = _raid._decide({ prompt: _prompt, context: { cfrRegime: _cfrCtx.regime, cfrSigmaFloor: _cfrCtx.sigmaFloor } });
          _rawProvider = _decision.agent;
          console.log(`[guardian] RAID → ${_rawProvider} (${_decision.reason}) σfloor:${_cfrCtx.sigmaFloor}`);
        } catch(_) {
          _rawProvider = 'chatgpt'; // RAID not started — fallback
        }
      }

      const provider = _rawProvider;
      const command  = body.command  || parsed.command  || 'code';
      const prompt   = body.prompt   || parsed.prompt   || '';
      const content  = body.content  || '';

      if (!prompt && !content) {
        pRes(res, 400, { ok:false, error:'prompt required' }); return;
      }

      // §BUILT 2026-07-14 — "small llm models, and ChatGPT.com/c needs to
      // be able to generate the code from the endpoint. That's why
      // chunking needs to be reinforced, not just an option." Checked
      // the real gap first: chunking only ever ran through the explicit
      // .spec/.specText/.specFile branch above — a raw prompt of any
      // size, bound for any provider, skipped it entirely. Given LAW_I
      // tries Ollama first for every raw dispatch, and ChatGPT is the
      // fallback when RAID itself is unreachable, nearly every raw
      // dispatch in this system lands on exactly the two targets that
      // most need bounded input. This is the enforcement: large content
      // bound for a small/local model or ChatGPT is chunked automatically,
      // through the same real pipeline (_buildSeamQueue/parseSpec) the
      // explicit .spec path already uses — not a second implementation.
      if (_shouldEnforceChunking(provider, prompt.length + content.length)) {
        try {
          const raid = require('../cortex/core/raid');
          // Same RAID approval gate the explicit .spec path already
          // requires (§FIX 2026-06-21's own reasoning: the constraint
          // layer applies "regardless of how the target was chosen") —
          // this path chooses the target automatically by size, but the
          // same gate still has to hold.
          const approval = raid._approveTool(body.source || 'unknown', (prompt + content).slice(0, 200), { action: 'forge', proof: body.proof });
          if (!approval.approved) {
            pRes(res, 403, { ok: false, error: `RAID denied automatic chunking: ${approval.reason}` });
            return;
          }
        } catch (e) {
          pRes(res, 503, { ok: false, error: `RAID approval gate unavailable, refusing to auto-chunk without it: ${e.message}` });
          return;
        }

        const specText = [prompt, content].filter(Boolean).join('\n\n');
        try {
          const { queue, plan } = _buildSeamQueue(specText, {
            provider, title: body.title || `auto-chunked: ${command}`,
            splitOn: body.splitOn || 'heading', maxChunkSize: body.maxChunkSize || 3000,
          });
          _physQueue.enqueue({
            uuid: queue.uuid, content: specText, ext: 'spec',
            tags: ['seam', 'auto-chunked', provider, plan.meta.name || 'unnamed'],
            priority: body.priority || 'normal', source: body.source || 'api', project: body.project || null,
            meta: { queueId: queue.uuid, totalChunks: plan.totalChunks },
          });
          if (ncp.isConnected(provider)) { queue.start(); }
          else {
            const pq = pendingQueue.get(provider) || [];
            pq.push({ _seamQueue: queue });
            pendingQueue.set(provider, pq);
          }
          pRes(res, 200, {
            ok: true, type: 'seam', autoChunked: true,
            queueId: queue.uuid, provider, total: plan.totalChunks + 1, meta: plan.meta,
            status: ncp.isConnected(provider) ? 'dispatching' : 'queued_waiting_for_provider',
          });
        } catch (e) {
          pRes(res, 400, { ok: false, error: 'auto-chunk spec parse failed: ' + e.message });
        }
        return;
      }

      // §BUILT 2026-07-14 — found during an invariant audit prompted by
      // the chunking-enforcement fix: this was the actual ungated default
      // case. The explicit .spec path and the auto-chunk path both went
      // through RAID's approval gate; this — which is what nearly every
      // small prompt in the system actually hits — never did. action:
      // 'chat', not 'forge' — this is a plain dispatch, not a self-
      // modification request, and copilot's own contract explicitly
      // denies 'forge' by design (gating this with the wrong action name
      // would have silently broken copilot's own basic dispatch).
      try {
        const raid = require('../cortex/core/raid');
        const approval = raid._approveTool(body.source || 'unknown', (prompt + content).slice(0, 200), { action: 'chat', proof: body.proof });
        if (!approval.approved) {
          pRes(res, 403, { ok: false, error: `RAID denied dispatch: ${approval.reason}` });
          return;
        }
      } catch (e) {
        pRes(res, 503, { ok: false, error: `RAID approval gate unavailable, refusing to dispatch without it: ${e.message}` });
        return;
      }

      // §LAW II — createJob writes to JAA
      const job = createJob({ command, provider, prompt, content, source: body.source || null,
        accountId: body.accountId, agentId: body.agentId, transport: body.transport === 'ncp' ? 'ncp' : undefined, wakeDepth: body.wakeDepth,
        canonical: typeof body.canonical === 'string' ? body.canonical : undefined, reuse: body.reuse === 'complete' ? 'complete' : undefined,
        // §CODE-ARTIFACT 2026-09-19 — the file this job's code belongs in,
        // and the fence language to trust. Both optional: absent means the
        // completion listener captures nothing, exactly as before.
        fileName: body.fileName, syntax: body.syntax,
        hatInPrompt: typeof body.hatInPrompt === 'string' ? body.hatInPrompt : null });   // §0.39.269 — persona already in the prompt
      dispatchJob(job);
      pRes(res, 200, { ok:true, jobId: job.id, status: job.status, provider });

    }).catch(e => pRes(res, 400, { ok:false, error: e.message }));
    return true;
  }

  if (method==='GET' && (url.pathname==='/jobs'||url.pathname==='/jobs/')) {
    // §PERSISTENCE-NODES 2026-09-16 — James: "how about .job .dispatch and
    // .response .artifact nodes for persistence?" Real gap found while
    // answering: this route only ever supported a *list* (?status=), never
    // a single job lookup — so 'guardian.job' (one record, its real
    // status/result) and 'guardian.response' (that same record's result
    // once complete) had no real endpoint to register against. ?id= is
    // additive — list behavior below is completely unchanged when it's
    // absent.
    const id = url.searchParams.get('id');
    if (id) {
      const job = jobs.get(id);
      if (!job) { pRes(res, 404, { ok:false, error:`no job "${id}"` }); return true; }
      pRes(res, 200, { ok:true, job }); return true;
    }
    const limit = parseInt(url.searchParams.get('limit')||'50');
    const status = url.searchParams.get('status');
    let list = [...jobs.values()];
    if (status) list = list.filter(j=>j.status===status);
    pRes(res, 200, { ok:true, jobs:list.slice(-limit) }); return true;
  }
  if (method==='GET' && url.pathname==='/bus') {
    const n   = parseInt(url.searchParams.get('n') || '20');
    const smp = bus.sample(n);          // { logLevel, count, entries }
    const gts = [...bus.gates.keys()];
    pRes(res, 200, { ok:true, gates:gts, ...smp }); return true;
  }
  if (method==='POST' && url.pathname==='/bus/emit') {
    bodyJ(req).then(body => {
      const { type, data } = body;
      if (!type) { pRes(res,400,{ok:false,error:'type required'}); return; }
      const r = bus.emit(type, data || {});
      pRes(res, 200, { ok:true, type, seq: r.seq });
    }).catch(e => pRes(res,500,{ok:false,error:e.message}));
    return true;
  }

  // Cockpit
  if (method==='GET' && (url.pathname==='/'||url.pathname==='/cockpit'||url.pathname==='/cockpit/')) {
    // Serve from root /ui/guardian/index.html (sovereign UI source of truth)
    const forgeIdePath = require('path').join(__dirname, '..', 'ui', 'guardian', 'index.html');
    const cockpitPath  = require('path').join(__dirname, '..', 'ui', 'home', 'index.html');
    const cockpitHtml  = require('fs').existsSync(forgeIdePath)
      ? require('fs').readFileSync(forgeIdePath, 'utf8')
      : require('fs').existsSync(cockpitPath)
        ? require('fs').readFileSync(cockpitPath, 'utf8')
        : buildCockpitHTML();
    res.writeHead(200,{'Content-Type':'text/html','Access-Control-Allow-Origin':'*'}); res.end(cockpitHtml); return true;
  }

  // Guardian sovereign UI — serve guardian/ui/ at /guardian-ui/
  if (method==='GET' && url.pathname.startsWith('/guardian-ui/')) {
    const rel = url.pathname.replace('/guardian-ui/', '');
    const assetPath = require('path').join(__dirname, 'ui', rel || 'index.html');
    try {
      const data = require('fs').readFileSync(assetPath);
      const ext  = require('path').extname(assetPath);
      const mime = {'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json'}[ext]||'text/plain';
      res.writeHead(200,{'Content-Type':mime,'Access-Control-Allow-Origin':'*'}); res.end(data); return true;
    } catch(e) { pRes(res,404,{error:'not found'}); return true; }
  }

  // Static UI assets
  if (method==='GET' && url.pathname.startsWith('/ui/')) {
    const assetPath = require('path').join(__dirname, '..', url.pathname);
    try {
      const data = require('fs').readFileSync(assetPath);
      const ext = require('path').extname(url.pathname);
      const mime = {'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json'}[ext]||'text/plain';
      res.writeHead(200,{'Content-Type':mime,'Access-Control-Allow-Origin':'*'}); res.end(data); return true;
    } catch(e) { pRes(res,404,{error:'not found'}); return true; }
  }

  // SSE events
  if (method==='GET' && url.pathname==='/events') {
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});
    res.write(`data: ${JSON.stringify({type:'connected',ts:Date.now()})}\n\n`);
    cockpitClients.add(res); req.on('close',()=>cockpitClients.delete(res)); return true;
  }

  // ── Settings ──────────────────────────────────────────────────────────────────
  if (parts[0]==='settings') {
    if (method==='GET' && parts.length===1) { pRes(res,200,{ok:true,settings:getAllSettings()}); return true; }
    if (method==='GET' && parts[1]) {
      const v = getSetting(parts[1]); if(v===null){pRes(res,404,{ok:false,error:'Not found'});return true;}
      pRes(res,200,{ok:true,key:parts[1],value:v}); return true;
    }
    if (method==='PUT' && parts[1]) {
      bodyJ(req).then(b=>{setSetting(parts[1],b.value??'');pRes(res,200,{ok:true,key:parts[1],value:b.value});}).catch(e=>pRes(res,400,{ok:false,error:e.message})); return true;
    }
    if (method==='POST' && parts[1]==='reset') {
      // Re-bootstrap defaults
      const { JaaStore: JS2 } = require('./jaa-store.js');
      const defaults = JS2.prototype?._bootstrapSettings?.call?.(jaa) || null;
      // Force re-insert all defaults
      for (const [k,v] of Object.entries({session_greeting_enabled:'true',session_greeting_text:'Guardian session initialising. Please ask me: "What are we calling this session?" — then wait for my answer before we begin.',scan_debounce_ms:'1500',artifact_max:'500',gap_min_score:'0.25',pa_enabled:'true',memory_auto_push:'true',dropzone_auto_upload:'true',stream_log_level:'EVENTS',greeting_delay_ms:'1200',poll_interval_ms:'500',stable_count_threshold:'5'})) {
        setSetting(k, v);
      }
      pRes(res,200,{ok:true,settings:getAllSettings()}); return true;
    }
  }

  // ── Artifacts ─────────────────────────────────────────────────────────────────
  if (parts[0]==='artifacts') {
    if (method==='GET' && !parts[1]) {
      const limit   = Math.min(parseInt(url.searchParams.get('limit')||'100'),500);
      const lang    = url.searchParams.get('lang');
      const chatId  = url.searchParams.get('chatId');
      const account = url.searchParams.get('account');
      const after   = parseInt(url.searchParams.get('after')||'0');
      const q       = url.searchParams.get('q');
      const where = {};
      if (lang)    where.lang     = lang;
      if (chatId)  where.chat_id  = chatId;
      if (account) where.account  = account;
      let rows = jaa.all('artifacts', where, { orderBy:'ts', order:'DESC', limit });
      if (after) rows = rows.filter(r => r.ts > after);
      if (q) { const ql=q.toLowerCase(); rows = rows.filter(r=>(r.name||'').toLowerCase().includes(ql)||(r.content||'').toLowerCase().includes(ql)||(r.lang||'').toLowerCase().includes(ql)); }
      pRes(res,200,{ok:true,count:rows.length,artifacts:rows}); return true;
    }
    if (method==='GET' && parts[1]) {
      const r = jaa.get('artifacts',{hash:parts[1]}) || jaa.get('artifacts',{id:parts[1]});
      if(!r){pRes(res,404,{ok:false,error:'Not found'});return true;}
      pRes(res,200,{ok:true,artifact:r}); return true;
    }
    if (method==='DELETE' && parts[1]) {
      const r = jaa.get('artifacts',{hash:parts[1]}) || jaa.get('artifacts',{id:parts[1]});
      if (r) jaa.delete('artifacts',{id:r.id});
      pRes(res,200,{ok:true}); return true;
    }
    if (method==='PUT' && parts[1] && parts[2]==='tags') {
      bodyJ(req).then(b=>{
        const r = jaa.get('artifacts',{hash:parts[1]}) || jaa.get('artifacts',{id:parts[1]});
        if (r) jaa.update('artifacts',{id:r.id},{tags:JSON.stringify(b.tags||[])});
        pRes(res,200,{ok:true,tags:b.tags});
      }).catch(e=>pRes(res,400,{ok:false,error:e.message})); return true;
    }
  }

  // ── Gaps ──────────────────────────────────────────────────────────────────────
  if (parts[0]==='gaps') {
    if (method==='GET' && parts[1]==='summary') {
      const rows = jaa.all('gaps').filter(g=>g.status!=='ignored');
      const bt = {};
      for (const g of rows) {
        if(!bt[g.type])bt[g.type]={count:0,totalScore:0,open:0,widening:0};
        bt[g.type].count++;bt[g.type].totalScore+=(g.score||0);
        if(g.status==='open')bt[g.type].open++;if(g.status==='widening')bt[g.type].widening++;
      }
      pRes(res,200,{ok:true,total:rows.length,byType:bt}); return true;
    }
    if (method==='GET' && parts[1]==='catalogue') {
      pRes(res,200,{ok:true,gapTypes:GAP_TYPE,domains:DOMAIN,reasons:GAP_REASON}); return true;
    }
    if (method==='GET' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'50'),200);
      const where = {};
      const type   = url.searchParams.get('type');
      const domain = url.searchParams.get('domain');
      const status = url.searchParams.get('status');
      if (type)   where.type   = type;
      if (domain) where.domain = domain;
      if (status) where.status = status;
      const rows = jaa.all('gaps', where, { orderBy:'score', order:'DESC', limit });
      pRes(res,200,{ok:true,gaps:rows}); return true;
    }
    if (method==='POST' && parts[1] && parts[2]==='close') {
      jaa.update('gaps',{id:parts[1]},{status:'closed',closed_ts:Date.now()});
      pRes(res,200,{ok:true}); return true;
    }
    if (method==='POST' && parts[1] && parts[2]==='ignore') {
      jaa.update('gaps',{id:parts[1]},{status:'ignored',closed_ts:Date.now()});
      pRes(res,200,{ok:true}); return true;
    }
  }

  // ── Ledger ────────────────────────────────────────────────────────────────────
  if (parts[0]==='ledger') {
    if (method==='GET' && parts[1]==='metrics') {
      const all = jaa.all('ledger_entries');
      pRes(res,200,{ok:true,
        total:    all.length,
        upgrades: all.filter(e=>e.ledger_type==='upgrade').length,
        ideas:    all.filter(e=>e.ledger_type==='idea').length,
        gaps:     all.filter(e=>e.category==='GAP').length,
      }); return true;
    }
    if (method==='POST' && parts.length===1) {
      bodyJ(req).then(b=>{bus.emit('guardian.ledger',{...b,source:'api'});pRes(res,200,{ok:true});}).catch(e=>{console.error('[guardian] ledger error:',e.message);pRes(res,400,{ok:false,error:e.message});}); return true;
    }
    if (method==='GET' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'100'),500);
      const where  = {};
      const cat    = url.searchParams.get('category');
      const after  = parseInt(url.searchParams.get('after')||'0');
      if (cat) where.category = cat;
      let rows = jaa.all('ledger_entries', where, { orderBy:'ts', order:'DESC', limit });
      if (after) rows = rows.filter(r=>r.ts>after);
      pRes(res,200,{ok:true,count:rows.length,ledger:rows}); return true;
    }
  }

  // ── Sessions ──────────────────────────────────────────────────────────────────
  // §WIRED 2026-08-22 — James: "clear-glass to have the account name for
  // cookies... so we can address it from nexus." The receiving half of a
  // real, previously-closed gap: guardian/lib/ncp.js's chat_log/artifacts
  // inserts already destructure account/chatUrl and always got undefined,
  // because no client ever sent them. guardian/userscript-nexus-wake.js now
  // does, once per real session (not per message). This is where it lands.
  if (method === 'POST' && url.pathname === '/api/account-identity') {
    bodyJ(req).then(body => {
      const { provider, tabId, sessionId, account, chatUrl, ts } = body || {};
      if (!provider || !account) { pRes(res, 400, { ok: false, error: 'provider and account required' }); return; }
      // §WIRED 2026-08-22 — James: "having a uuid for accounts... an index
      // of each agent and accounts." Real, stable UUID per (provider,
      // account) — distinct from sessions.uuid below, which is correctly
      // per-session. Same real account now resolves to the same UUID
      // across every chat, which is what retry/fallback routing needs.
      const accountIdx = require('../lib/account-identity-index.js').resolve(provider, account);
      const existing = jaa.get('sessions', { chat_id: sessionId });
      // §FIXED 2026-09-11 — was `uuid`/`tabId`, the other two real drift
      // fields found alongside site 2's duplicate-write bug. `id` matches
      // every other guardian table (jobs, downloads, pa_sessions,
      // timeline_events) and the primary write site (guardian.session.named,
      // below); `tab_id` matches this same route's own chat_id/updated_ts/
      // created_ts, which were already snake_case here — only these two
      // fields had drifted.
      if (existing) jaa.update('sessions', { chat_id: sessionId }, { account, chat_url: chatUrl, account_uuid: accountIdx.uuid, updated_ts: ts || Date.now() });
      else jaa.insert('sessions', {
        id: randomUUID(), chat_id: sessionId || null,
        provider, tab_id: tabId || null, account, chat_url: chatUrl || null,
        account_uuid: accountIdx.uuid,
        created_ts: ts || Date.now(), updated_ts: ts || Date.now(),
      });
      pRes(res, 200, { ok: true, accountUuid: accountIdx.uuid });
    }).catch(e => pRes(res, 500, { ok: false, error: e.message }));
    return true;
  }

  if (parts[0]==='sessions') {
    if (method==='GET' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'50'),200);
      const where  = {};
      const prov   = url.searchParams.get('provider');
      const acc    = url.searchParams.get('account');
      if (prov) where.provider = prov;
      if (acc)  where.account  = acc;
      pRes(res,200,{ok:true,sessions:jaa.all('sessions',where,{orderBy:'updated_ts',order:'DESC',limit})}); return true;
    }
    if (method==='GET' && parts[1] && !parts[2]) {
      const r = jaa.get('sessions',{id:parts[1]}) || jaa.get('sessions',{chat_id:parts[1]});
      if(!r){pRes(res,404,{ok:false,error:'Not found'});return true;}
      pRes(res,200,{ok:true,session:r}); return true;
    }
    if (method==='POST' && parts[1] && parts[2]==='name') {
      bodyJ(req).then(b=>{
        bus.emit('guardian.session.named',{chatId:parts[1],name:b.name,...b});
        pRes(res,200,{ok:true,name:b.name});
      }).catch(e=>pRes(res,400,{ok:false,error:e.message})); return true;
    }
    if (method==='GET' && parts[1] && parts[2]==='timeline') {
      const events = jaa.all('timeline_events').filter(e=>e.session_id===parts[1]||e.chat_id===parts[1]).sort((a,b)=>a.ts-b.ts).slice(0,500);
      pRes(res,200,{ok:true,events}); return true;
    }
  }

  // ── PA sessions ───────────────────────────────────────────────────────────────
  if (parts[0]==='pa') {
    if (method==='GET' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'20'),100);
      const where  = {};
      const chatId = url.searchParams.get('chatId');
      if (chatId) where.chat_id = chatId;
      const rows   = jaa.all('pa_sessions', where, {orderBy:'ts',order:'DESC',limit}).map(r=>{
        try{r.hypotheses=JSON.parse(r.hypotheses||'[]');}catch(_){r.hypotheses=[];}
        return r;
      });
      pRes(res,200,{ok:true,sessions:rows}); return true;
    }
    if (method==='GET' && parts[1]) {
      const r = jaa.get('pa_sessions',{id:parts[1]});
      if(!r){pRes(res,404,{ok:false,error:'Not found'});return true;}
      try{r.hypotheses=JSON.parse(r.hypotheses||'[]');}catch(_){r.hypotheses=[];}
      pRes(res,200,{ok:true,session:r}); return true;
    }
  }

  // ── Timeline ──────────────────────────────────────────────────────────────────
  if (parts[0]==='timeline' && method==='GET') {
    const limit    = Math.min(parseInt(url.searchParams.get('limit')||'100'),500);
    const where    = {};
    const personId = url.searchParams.get('personId');
    const channel  = url.searchParams.get('channel');
    const from     = parseInt(url.searchParams.get('from')||'0');
    if (personId) where.person_id = personId;
    if (channel)  where.channel   = channel;
    let rows = jaa.all('timeline_events', where, {orderBy:'ts',order:'DESC',limit});
    if (from) rows = rows.filter(r=>r.ts>from);
    pRes(res,200,{ok:true,events:rows}); return true;
  }

  // ── Memory (query / context / stats) ──────────────────────────────────────────
  if (parts[0]==='memory') {
    if (method==='GET' && parts[1]==='query') {
      const q = url.searchParams.get('q')||'';
      if (!q) { pRes(res,400,{ok:false,error:'Missing q'}); return true; }
      const results = jaa.search(q);
      pRes(res,200,{ok:true,query:q,results}); return true;
    }
    if (method==='GET' && parts[1]==='context') {
      const chatId = url.searchParams.get('chatId');
      const arts   = chatId ? jaa.all('artifacts',{chat_id:chatId},{orderBy:'ts',order:'DESC',limit:50}) : jaa.all('artifacts',{},{orderBy:'ts',order:'DESC',limit:50});
      const gaps   = jaa.all('gaps',{status:'open'},{orderBy:'score',order:'DESC',limit:20});
      const led    = jaa.all('ledger_entries',{},{orderBy:'ts',order:'DESC',limit:20});
      pRes(res,200,{ok:true,ts:Date.now(),artifacts:arts,gaps,ledger:led}); return true;
    }
    if (method==='GET' && parts[1]==='stats') {
      const s = jaa.stats();
      s.storeDir = STORE_DIR;
      pRes(res,200,{ok:true,stats:s}); return true;
    }
    // POST /memory/ingest — used by userscripts when they can't hit WS
    if (method==='POST' && parts[1]==='ingest') {
      bodyJ(req).then(body => {
        memoryServer?.ingest(body);
        // Also route through SISO bus
        if (body.type==='ARTIFACT' && body.payload) bus.emit('guardian.artifact', body.payload);
        if (body.type==='LEDGER' && body.payload) bus.emit('guardian.ledger', { ...body.payload, chatUrl:body.chatUrl, account:body.account, source:'memory-ingest' });
        pRes(res,200,{ok:true});
      }).catch(e=>pRes(res,400,{ok:false,error:e.message})); return true;
    }
  }

  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
//  COCKPIT HTML
// ══════════════════════════════════════════════════════════════════════════════
function buildCockpitHTML() {
  const ips = getLocalIPs();
  const port = HTTP_PORT;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guardian Cockpit v8</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#020408;--s1:#06090e;--s2:#0a0e14;--border:#0d1a26;--text:#b0cce0;--muted:#2a4050;--mono:'SF Mono','Fira Code',monospace;--acc:#00b4d8;--grn:#22c55e;--yel:#f59e0b;--red:#ef4444;--pur:#a78bfa}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--mono);overflow:hidden}
.grid{position:fixed;inset:0;background-image:linear-gradient(rgba(0,180,216,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,216,.02) 1px,transparent 1px);background-size:40px 40px;pointer-events:none}
.scan{position:fixed;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--acc),transparent);opacity:.3;animation:scan 6s linear infinite;z-index:1}
@keyframes scan{from{top:-1px}to{top:100vh}}
.app{display:grid;grid-template-rows:48px 1fr;height:100vh;position:relative;z-index:10}
.topbar{display:flex;align-items:center;gap:16px;padding:0 20px;border-bottom:1px solid var(--border);background:var(--s1);flex-shrink:0}
.topbar-logo{font-size:.85rem;font-weight:700;letter-spacing:.2em;color:var(--acc)}
.body{display:grid;grid-template-columns:200px 1fr;height:100%;overflow:hidden}
.sidebar{border-right:1px solid var(--border);background:var(--s1);overflow-y:auto}
.nav-item{padding:8px 16px;cursor:pointer;font-size:.72rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;border-left:2px solid transparent;transition:all .15s}
.nav-item:hover{color:var(--text);background:rgba(0,180,216,.04)}
.nav-item.active{color:var(--acc);border-left-color:var(--acc);background:rgba(0,180,216,.06)}
.main{overflow:hidden;display:flex;flex-direction:column}
.panel{display:none;flex-direction:column;height:100%;overflow:hidden}
.panel.active{display:flex}
.ph{padding:10px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0;background:var(--s2)}
.pt{font-size:.7rem;text-transform:uppercase;letter-spacing:.15em;color:var(--acc);font-weight:700}
.pb{flex:1;overflow-y:auto;padding:12px 20px}
.pb::-webkit-scrollbar{width:4px}.pb::-webkit-scrollbar-thumb{background:var(--border)}
.stats{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.stat{background:var(--s1);border:1px solid var(--border);padding:7px 10px;position:relative}
.stat::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--acc)}
.sv{color:var(--acc);font-size:1rem;font-weight:600}.sl{color:var(--muted);font-size:.6rem;text-transform:uppercase;letter-spacing:.08em}
#stream-feed{font-size:.7rem;height:100%;overflow-y:auto;padding:2px 0}
.sr{padding:2px 0;border-bottom:1px solid rgba(13,26,38,.5);display:flex;gap:8px}
.sts{color:#1a3040;font-size:.62rem;flex-shrink:0;width:68px}.sty{font-size:.62rem;font-weight:700;flex-shrink:0;width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sd{color:#1a3040;font-size:.62rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn{background:none;border:1px solid var(--border);color:var(--muted);padding:2px 8px;font-size:.68rem;cursor:pointer;font-family:var(--mono);transition:all .15s}
.btn:hover{border-color:var(--acc);color:var(--acc)}
.search{background:var(--bg);border:1px solid var(--border);color:var(--text);padding:5px 10px;font-family:var(--mono);font-size:.75rem;width:100%;margin-bottom:8px;outline:none}
.search:focus{border-color:rgba(0,180,216,.4)}
.fb{display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap}
.fb .btn.on{border-color:var(--acc);color:var(--acc);background:rgba(0,180,216,.06)}
.acard{border:1px solid var(--border);margin-bottom:5px;overflow:hidden;cursor:pointer}
.acard:hover{border-color:rgba(0,180,216,.3)}.acard.exp{border-color:var(--acc)}
.ahdr{display:flex;align-items:center;gap:7px;padding:6px 10px;background:var(--s1);font-size:.75rem}
.aname{color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.alang{color:var(--muted);font-size:.62rem}.ats{color:#1a3040;font-size:.6rem}
.abody{padding:7px 10px;border-top:1px solid var(--border);background:#030608}
.ameta{display:flex;gap:10px;font-size:.62rem;margin-bottom:5px;flex-wrap:wrap}
.aml{color:#1a3040;text-transform:uppercase;letter-spacing:.08em}
.amv{color:var(--muted)}.amv.url{color:var(--acc);cursor:pointer;text-decoration:underline}
.acont{background:#020305;border:1px solid var(--border);padding:6px 8px;font-size:.65rem;color:#2a4050;white-space:pre-wrap;word-break:break-all;max-height:140px;overflow-y:auto;margin-top:4px;font-family:var(--mono)}
.aact{display:flex;gap:4px;margin-top:5px}
.gap-hm{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:5px;margin-bottom:10px}
.gcel{background:var(--s1);border:1px solid var(--border);padding:7px 10px;cursor:pointer;transition:all .15s}
.gcel:hover{border-color:var(--acc)}
.gcet{font-size:.7rem;font-weight:700;margin-bottom:2px}.gcec{font-size:.62rem;color:var(--muted)}
.gcebar{height:2px;margin-top:3px;background:var(--border);border-radius:1px;overflow:hidden}
.gcebarfill{height:100%;background:var(--acc);border-radius:1px}
.grow{padding:4px 0;border-bottom:1px solid var(--border);display:flex;gap:6px;font-size:.7rem}
.gtype{font-weight:700;flex-shrink:0;width:78px}.gdomain{color:var(--muted);flex-shrink:0;width:80px;font-size:.62rem}
.greason{color:#1a3040;flex-shrink:0;width:90px;font-size:.6rem}
.gdesc{color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gscore{flex-shrink:0;width:34px;text-align:right;font-weight:700}
.drift{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.dbar{flex:1;height:3px;background:var(--border);border-radius:2px;overflow:hidden}
.dfill{height:100%;background:var(--acc);transition:width .5s}
.sg{display:grid;grid-template-columns:1fr 1fr;gap:6px}
@media(max-width:900px){.sg{grid-template-columns:1fr}}
.sc{background:var(--s1);border:1px solid var(--border);padding:9px 11px}
.sk{font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px}
.sl2{font-size:.74rem;color:var(--text);margin-bottom:6px;font-weight:600}
.sd2{font-size:.6rem;color:#1a3040;margin-bottom:7px}
.sc input[type=range]{width:100%;accent-color:var(--acc)}
.sc input[type=text],.sc textarea,.sc select{background:var(--bg);border:1px solid var(--border);color:var(--text);padding:4px 8px;font-family:var(--mono);font-size:.7rem;width:100%;outline:none}
.sc textarea{resize:vertical;min-height:54px}
.tgl{position:relative;width:34px;height:18px;cursor:pointer}
.tgl input{opacity:0;width:0;height:0}
.tsl{position:absolute;inset:0;background:var(--border);border-radius:18px;transition:.2s}
.tsl::before{content:'';position:absolute;height:12px;width:12px;left:3px;bottom:3px;background:var(--muted);border-radius:50%;transition:.2s}
.tgl input:checked+.tsl{background:var(--acc)}
.tgl input:checked+.tsl::before{transform:translateX(16px);background:#fff}
.pacard{background:var(--s1);border:1px solid var(--border);padding:9px 11px;margin-bottom:5px}
.pamets{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:6px}
.pamet{background:var(--bg);border:1px solid var(--border);padding:4px 6px;text-align:center}
.pamv{color:var(--acc);font-size:.85rem;font-weight:600}.paml{color:var(--muted);font-size:.58rem;text-transform:uppercase}
.pahyp{background:var(--bg);border-left:2px solid var(--acc);padding:4px 7px;margin-bottom:3px}
.pahyl{color:var(--text);font-size:.7rem;margin-bottom:2px}.pahyc{color:var(--acc);font-size:.62rem}
.pabar{height:3px;background:var(--border);border-radius:2px;overflow:hidden;margin:2px 0}
.pabarf{height:100%;background:var(--acc);border-radius:2px}
.pc{background:var(--s1);border:1px solid var(--border);padding:9px 12px;margin-bottom:5px;display:flex;align-items:center;gap:10px}
.ps{font-size:.66rem;flex:1}.ps.on{color:var(--grn)}.ps.off{color:var(--muted)}
.jcard{background:var(--s1);border:1px solid var(--border);padding:7px 11px;margin-bottom:5px}
.jhdr{display:flex;gap:7px;align-items:center;margin-bottom:3px}.jid{font-size:.62rem;color:#1a3040}
.jst{font-size:.62rem;padding:1px 5px;border-radius:3px}
.jst.pending{background:rgba(245,158,11,.1);color:var(--yel)}.jst.complete{background:rgba(34,197,94,.1);color:var(--grn)}
.jst.streaming{background:rgba(0,180,216,.1);color:var(--acc)}.jst.failed{background:rgba(239,68,68,.1);color:var(--red)}
#cli-out{background:#010305;border:1px solid var(--border);padding:9px;font-size:.7rem;color:#2a6080;height:280px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;font-family:var(--mono);margin-bottom:7px}
.clir{display:flex;gap:5px}
#cli-in{flex:1;background:transparent;border:none;border-bottom:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:.7rem;padding:4px 0;outline:none}
.ccmds{display:flex;flex-wrap:wrap;gap:3px;margin-top:7px}
.empty{color:var(--muted);text-align:center;padding:2.5rem;font-size:.76rem}
</style>
</head>
<body>
<div class="grid"></div><div class="scan"></div>
<div class="app">
  <div class="topbar">
    <span class="topbar-logo">GUARDIAN v8</span>
    <span style="color:var(--muted);font-size:.66rem">${ips.map(i=>i.address).join(' · ')||'localhost'} · :${port}</span>
    <div id="pstatus" style="display:flex;gap:8px;margin-left:auto"></div>
    <span id="dbst" style="font-size:.62rem;color:var(--muted)">DB…</span>
  </div>
  <div class="body">
    <div class="sidebar">
      <div class="nav-item active" data-p="stream">◈ Stream</div>
      <div class="nav-item" data-p="artifacts">◻ Artifacts</div>
      <div class="nav-item" data-p="gaps">△ Gaps</div>
      <div class="nav-item" data-p="pa">⚡ PA Sessions</div>
      <div class="nav-item" data-p="sessions">◇ Sessions</div>
      <div class="nav-item" data-p="agents">◉ Agents</div>
      <div class="nav-item" data-p="settings">⚙ Settings</div>
      <div class="nav-item" data-p="cli">$ CLI</div>
      <div style="flex:1;min-height:40px"></div>
      <div style="padding:8px 14px;font-size:.6rem;color:var(--muted);border-top:1px solid var(--border)">
        <div id="sb1">Artifacts: —</div><div id="sb2">Gaps: —</div><div id="sb3">Sessions: —</div>
      </div>
    </div>
    <div class="main">
      <div class="panel active" id="panel-stream">
        <div class="ph"><span class="pt">Live SISO Stream</span><button class="btn" style="margin-left:auto" onclick="document.getElementById('stream-feed').innerHTML=''">Clear</button><label style="display:flex;align-items:center;gap:5px;font-size:.65rem;color:var(--muted);margin-left:8px"><input type="checkbox" id="sp"> Pause</label></div>
        <div class="pb" style="padding:0"><div id="stream-feed"></div></div>
      </div>
      <div class="panel" id="panel-artifacts">
        <div class="ph"><span class="pt">Artifact Store</span><span id="artcnt" style="margin-left:auto;font-size:.62rem;color:var(--muted)"></span></div>
        <div class="pb"><div class="stats" id="artstats"></div><input class="search" id="asrch" placeholder="Search name, lang, content, account…" oninput="loadArt()"><div class="fb" id="afilts"></div><div id="artlist"></div></div>
      </div>
      <div class="panel" id="panel-gaps">
        <div class="ph"><span class="pt">Gap Intelligence (GapHunter v3)</span><span id="gapcnt" style="margin-left:auto;font-size:.62rem;color:var(--muted)"></span></div>
        <div class="pb"><div class="drift"><span style="font-size:.66rem;color:var(--muted)">Drift</span><div class="dbar"><div class="dfill" id="drf" style="width:0%"></div></div><span id="drv" style="font-size:.7rem;font-weight:700;width:36px;text-align:right">—</span></div><div class="gap-hm" id="ghm"></div><div id="glist"></div></div>
      </div>
      <div class="panel" id="panel-pa"><div class="ph"><span class="pt">Prompt Archaeology</span></div><div class="pb"><div id="palist"></div></div></div>
      <div class="panel" id="panel-sessions"><div class="ph"><span class="pt">Sessions</span></div><div class="pb"><div id="sesslist"></div></div></div>
      <div class="panel" id="panel-agents"><div class="ph"><span class="pt">Agent Controls</span></div><div class="pb"><div style="font-size:.62rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.1em">Providers</div><div id="provlist"></div><div style="font-size:.62rem;color:var(--muted);margin:10px 0 6px;text-transform:uppercase;letter-spacing:.1em">Jobs</div><div id="joblist"></div></div></div>
      <div class="panel" id="panel-settings"><div class="ph"><span class="pt">Settings</span><button class="btn" style="margin-left:auto;color:var(--red)" onclick="resetS()">Reset All</button></div><div class="pb"><div class="sg" id="sgrid"></div></div></div>
      <div class="panel" id="panel-cli"><div class="ph"><span class="pt">CLI Bridge</span></div><div class="pb"><div id="cli-out">[guardian] CLI ready\n</div><div class="clir"><span style="color:var(--acc);font-size:.7rem;flex-shrink:0;font-family:var(--mono)">guardian $</span><input id="cli-in" placeholder="jobs | artifacts | gaps | sessions | providers | health | stats" autocomplete="off"></div><div class="ccmds" id="ccmds"></div></div></div>
    </div>
  </div>
</div>
<script>
const BASE='';let af='all',aexp=new Set(),spsd=false,ch=[],ci=-1;
const TC={'guardian.artifact':'#a78bfa','guardian.gaps':'#f472b6','guardian.job.complete':'#34d399','guardian.pa.session':'#f59e0b','guardian.ledger':'#94a3b8','GUARDIAN_COMPLETE':'#34d399','GUARDIAN_ARTIFACT':'#a78bfa','GUARDIAN_GAPS':'#f472b6','GUARDIAN_DONE':'#22c55e','GUARDIAN_CHUNK':'#475569'};
const ICONS={typescript:'🔷',ts:'🔷',javascript:'🟨',js:'🟨',python:'🐍',html:'🌐',css:'🎨',json:'📋',bash:'💲',sh:'💲',rust:'🦀',go:'🟦'};
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function ft(ts){return new Date(ts).toLocaleTimeString()}
document.querySelectorAll('.nav-item').forEach(n=>{n.onclick=()=>{document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));n.classList.add('active');document.getElementById('panel-'+n.dataset.p)?.classList.add('active');const p=n.dataset.p;if(p==='artifacts')loadArt();if(p==='gaps')loadGaps();if(p==='pa')loadPA();if(p==='sessions')loadSess();if(p==='agents')loadAgents();if(p==='settings')loadSettings();}});
const es=new EventSource('/events');const sf=document.getElementById('stream-feed');
es.onmessage=function(e){
  try {
    const msg=JSON.parse(e.data);
    // CLI_RESULT: mirror to CLI panel if open
    if(msg.type==='CLI_RESULT'){
      const cout=document.getElementById('cli-out');
      if(cout){
        if(msg.error) cout.textContent+='[error] '+msg.error+'\n';
        else if(msg.result) cout.textContent+=JSON.stringify(msg.result,null,2)+'\n';
        cout.scrollTop=cout.scrollHeight;
      }
    }
    // Stream feed: all events
    if(!document.getElementById('sp')?.checked){
es.onmessage=e=>{if(spsd)return;const d=JSON.parse(e.data);const row=document.createElement('div');row.className='sr';const col=TC[d.type]||'#2a4050';row.innerHTML='<span class="sts">'+ft(d.ts||Date.now())+'</span><span class="sty" style="color:'+col+'">'+esc(d.type||'event')+'</span><span class="sd">'+esc(JSON.stringify(d.data||{}).slice(0,100))+'</span>';sf.appendChild(row);if(sf.children.length>200)sf.firstChild.remove();sf.scrollTop=sf.scrollHeight;updateSB();};
document.getElementById('sp').onchange=e=>spsd=e.target.checked;
async function loadPS(){try{const r=await fetch('/providers').then(x=>x.json());document.getElementById('pstatus').innerHTML=Object.entries(r.providers||{}).map(([n,s])=>'<span style="display:flex;align-items:center;gap:4px;font-size:.65rem;color:'+(s==='connected'?'var(--grn)':'var(--muted)')+'"><span style="width:5px;height:5px;border-radius:50%;background:'+(s==='connected'?'var(--grn)':'var(--muted)')+'"></span>'+n+'</span>').join('');}catch(_){}}
async function loadDB(){try{const r=await fetch('/memory/stats').then(x=>x.json());const el=document.getElementById('dbst');el.textContent=r.stats?.dbExists?'DB ✓':'DB flat';el.style.color=r.stats?.dbExists?'var(--grn)':'var(--yel)';}catch(_){}}
async function updateSB(){try{const r=await fetch('/memory/stats').then(x=>x.json());const s=r.stats||{};document.getElementById('sb1').textContent='Artifacts: '+(s.artifacts||0);document.getElementById('sb2').textContent='Gaps: '+(s.gaps||0);document.getElementById('sb3').textContent='Sessions: '+(s.sessions||0);}catch(_){}}
async function loadArt(){const q=document.getElementById('asrch')?.value||'',lang=af==='all'?'':af;const r=await fetch('/artifacts?'+new URLSearchParams({limit:100,...(lang?{lang}:{}),...(q?{q}:{})})).then(x=>x.json());const arts=r.artifacts||[];document.getElementById('artcnt').textContent=arts.length+' results';document.getElementById('artstats').innerHTML=[['Total',arts.length],['Langs',[...new Set(arts.map(a=>a.lang).filter(Boolean))].length],['Chats',[...new Set(arts.map(a=>a.chat_id))].length]].map(([l,v])=>'<div class="stat"><div class="sv">'+v+'</div><div class="sl">'+l+'</div></div>').join('');document.getElementById('afilts').innerHTML=['all','ts','js','python','html','css','json','bash','rust'].map(f=>'<button class="btn'+(af===f?' on':'')+'" onclick="af=\''+f+'\';loadArt()">'+f+'</button>').join('');const list=document.getElementById('artlist');if(!arts.length){list.innerHTML='<div class="empty">No artifacts</div>';return;}list.innerHTML=arts.slice(0,80).map(a=>{const ic=ICONS[a.lang]||'◻',exp=aexp.has(a.hash);const body=exp?'<div class="abody"><div class="ameta"><span><span class="aml">Account </span><span class="amv">'+esc((a.account||'').slice(0,28))+'</span></span><span><span class="aml">Chat </span><span class="amv url" onclick="window.open(\''+esc(a.chat_url||'')+'\',\'_blank\')">'+((a.chat_id||'').slice(0,14))+'</span></span><span><span class="aml">Hash </span><span class="amv">'+(a.hash||'').slice(0,8)+'</span></span></div>'+(a.context?'<div style="color:#1a3040;font-size:.62rem;margin-bottom:4px;font-style:italic">'+esc(a.context.slice(0,120))+'</div>':'')+'<pre class="acont">'+esc((a.content||'').slice(0,1800))+'</pre><div class="aact"><button class="btn" onclick="navigator.clipboard.writeText('+JSON.stringify(a.content||'')+').then(()=>this.textContent=\'✓\')">⎘ Copy</button><button class="btn" onclick="window.open(\''+esc(a.chat_url||'')+'\',\'_blank\')">↗ Chat</button></div></div>':'';return'<div class="acard'+(exp?' exp':'')+'" onclick="aexp.'+(exp?'delete':'add')+'(\''+a.hash+'\');loadArt()"><div class="ahdr"><span>'+ic+'</span><span class="aname" style="color:'+(a.direction==='output'?'#a78bfa':'#60a5fa')+'">'+esc(a.name||'artifact')+'</span>'+(a.lang?'<span class="alang">'+a.lang+'</span>':'')+'<span class="ats">'+ft(a.ts)+'</span></div>'+body+'</div>';}).join('');}
async function loadGaps(){const r=await fetch('/gaps?limit=80').then(x=>x.json());const gs=r.gaps||[];const sum=await fetch('/gaps/summary').then(x=>x.json());document.getElementById('gapcnt').textContent=gs.length+' open';const open=gs.filter(g=>g.status==='open').length,tot=gs.length,dr=tot>0?(open/tot):0;document.getElementById('drf').style.width=(dr*100)+'%';document.getElementById('drv').textContent=(dr*100).toFixed(0)+'%';const bt=sum.byType||{},mx=Math.max(...Object.values(bt).map(t=>t.count||0),1);document.getElementById('ghm').innerHTML=Object.entries(bt).map(([type,info])=>{const pct=(info.count/mx*100).toFixed(0);const col=info.widening>0?'var(--red)':info.open>info.count/2?'var(--yel)':'var(--acc)';return'<div class="gcel" onclick="fgtype(\''+type+'\')"><div class="gcet" style="color:'+col+'">'+type+'</div><div class="gcec">'+info.count+' · '+(info.widening||0)+' wid.</div><div class="gcebar"><div class="gcebarfill" style="width:'+pct+'%;background:'+col+'"></div></div></div>';}).join('');document.getElementById('glist').innerHTML=!gs.length?'<div class="empty">No open gaps</div>':gs.map(g=>{const col=g.status==='widening'?'var(--red)':g.status==='narrowing'?'var(--grn)':'var(--yel)';return'<div class="grow"><span class="gtype" style="color:'+col+'">'+(g.type||'—')+'</span><span class="gdomain">'+(g.domain||'—')+'</span><span class="greason">'+(g.reason||'—')+'</span><span class="gdesc">'+esc(g.description||'')+'</span><span class="gscore" style="color:'+col+'">'+((g.score||0)*100).toFixed(0)+'%</span></div>';}).join('');}
async function loadPA(){const r=await fetch('/pa?limit=15').then(x=>x.json());const ss=r.sessions||[];document.getElementById('palist').innerHTML=!ss.length?'<div class="empty">No PA sessions yet</div>':ss.map(s=>{const hs=Array.isArray(s.hypotheses)?s.hypotheses:[];return'<div class="pacard"><div style="display:flex;gap:8px;align-items:center;margin-bottom:5px"><span style="font-size:.65rem;color:var(--muted)">'+ft(s.ts)+'</span><span style="font-size:.65rem;color:var(--acc);margin-left:auto">'+(s.provider||'—')+'</span></div><div class="pamets">'+[['Tokens',s.total_tokens||0],['Tok/s',(s.tps_avg||0).toFixed(1)],['Pauses',s.pause_count||0],['Entropy',(s.entropy_avg||0).toFixed(2)]].map(([l,v])=>'<div class="pamet"><div class="pamv">'+v+'</div><div class="paml">'+l+'</div></div>').join('')+'</div>'+hs.slice(0,3).map(h=>'<div class="pahyp"><div class="pahyl">'+esc(h.label||'')+'</div><div class="pahyc">'+((h.confidence||0)*100).toFixed(0)+'%</div><div class="pabar"><div class="pabarf" style="width:'+((h.confidence||0)*100)+'%"></div></div></div>').join('')+'</div>';}).join('');}
async function loadSess(){const r=await fetch('/sessions?limit=30').then(x=>x.json());const ss=r.sessions||[];document.getElementById('sesslist').innerHTML=!ss.length?'<div class="empty">No sessions yet</div>':ss.map(s=>'<div style="background:var(--s1);border:1px solid var(--border);padding:7px 11px;margin-bottom:5px;display:flex;gap:8px;align-items:center"><span style="font-size:.76rem;font-weight:700;color:var(--acc)">'+esc(s.name||'Unnamed')+'</span><span style="font-size:.62rem;color:var(--muted)">'+(s.provider||'—')+'</span><span style="font-size:.62rem;color:#1a3040;margin-left:auto">'+ft(s.updated_ts||s.started_ts)+'</span><button class="btn" onclick="window.open(\''+esc(s.chat_url||'')+'\',\'_blank\')">↗</button></div>').join('');}
async function loadAgents(){const[pr,jr]=await Promise.all([fetch('/providers').then(x=>x.json()),fetch('/jobs?limit=8').then(x=>x.json())]);const prov=pr.providers||{},jobs=jr.jobs||[];document.getElementById('provlist').innerHTML=Object.entries(prov).map(([n,s])=>'<div class="pc"><span style="font-size:.76rem;font-weight:700;width:72px">'+n+'</span><span class="ps '+(s==='connected'?'on':'off')+'">'+s+'</span><button class="btn" onclick="fetch(\'/providers/'+n+'/claim\',{method:\'POST\'})">Claim</button><button class="btn" onclick="fetch(\'/providers/'+n+'/release\',{method:\'POST\'})">Release</button></div>').join('');document.getElementById('joblist').innerHTML=!jobs.length?'<div style="color:var(--muted);font-size:.7rem">No recent jobs</div>':jobs.map(j=>'<div class="jcard"><div class="jhdr"><span class="jid">#'+(j.id||'').slice(0,8)+'</span><span style="font-size:.66rem;font-weight:700;color:'+(j.provider==='claude'?'#a78bfa':'#34d399')+'">'+(j.provider||'—')+'</span><span class="jst '+(j.status||'pending')+'">'+(j.status||'—')+'</span><span style="margin-left:auto;font-size:.6rem;color:#1a3040">'+ft(j.started_ts)+'</span></div><div style="font-size:.7rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc((j.prompt||'').slice(0,70))+'</div></div>').join('');}
const SMETA={session_greeting_enabled:{label:'Session Greeting',type:'toggle',desc:'Auto-inject on new chats'},session_greeting_text:{label:'Greeting Text',type:'textarea',desc:'Prompt injected into blank chats'},scan_debounce_ms:{label:'Scan Debounce',type:'range',min:200,max:5000,step:100,unit:'ms',desc:'DOM scan delay'},artifact_max:{label:'Artifact Limit',type:'range',min:100,max:5000,step:100,unit:'',desc:'Max artifacts in memory'},gap_min_score:{label:'Gap Min Score',type:'range',min:0,max:1,step:0.05,unit:'',desc:'Minimum gap magnitude'},pa_enabled:{label:'Prompt Archaeology',type:'toggle',desc:'Enable PA analysis'},memory_auto_push:{label:'Auto Memory Push',type:'toggle',desc:'Push artifacts to memory'},dropzone_auto_upload:{label:'Auto Dropzone Upload',type:'toggle',desc:'Upload artifacts to file server'},stream_log_level:{label:'SISO Log Level',type:'select',options:['OFF','EVENTS','DEEP','DATA'],desc:'Event bus verbosity'},greeting_delay_ms:{label:'Greeting Delay',type:'range',min:500,max:5000,step:100,unit:'ms',desc:'Delay before greeting inject'},poll_interval_ms:{label:'Poll Interval',type:'range',min:100,max:2000,step:100,unit:'ms',desc:'Response check interval'},stable_count_threshold:{label:'Stable Threshold',type:'range',min:2,max:15,step:1,unit:'',desc:'Polls before job complete'}};
async function loadSettings(){const r=await fetch('/settings').then(x=>x.json());const cs=r.settings||{};document.getElementById('sgrid').innerHTML=Object.entries(SMETA).map(([key,m])=>{const val=cs[key]??'';let ctrl='';if(m.type==='toggle'){ctrl='<div style="display:flex;align-items:center;gap:6px"><label class="tgl"><input type="checkbox" id="s_'+key+'" '+(val==='true'?'checked':'')+' onchange="sv(\''+key+'\',this.checked?\'true\':\'false\')"><span class="tsl"></span></label><span style="font-size:.7rem;color:var(--muted)">'+(val==='true'?'ON':'OFF')+'</span></div>';}else if(m.type==='range'){ctrl='<div><input type="range" id="s_'+key+'" min="'+m.min+'" max="'+m.max+'" step="'+m.step+'" value="'+val+'" oninput="document.getElementById(\'sv_'+key+'\').textContent=this.value+\''+(m.unit||'')+'\'" onchange="sv(\''+key+'\',this.value)"> <span id="sv_'+key+'" style="font-size:.7rem;color:var(--acc)">'+val+(m.unit||'')+'</span></div>';}else if(m.type==='select'){ctrl='<select id="s_'+key+'" onchange="sv(\''+key+'\',this.value)">'+(m.options||[]).map(o=>'<option '+(o===val?'selected':'')+' value="'+o+'">'+o+'</option>').join('')+'</select>';}else if(m.type==='textarea'){ctrl='<textarea id="s_'+key+'" onchange="sv(\''+key+'\',this.value)">'+esc(val)+'</textarea>';}else{ctrl='<input type="text" id="s_'+key+'" value="'+esc(val)+'" onchange="sv(\''+key+'\',this.value)">';}return'<div class="sc"><div class="sk">'+key+'</div><div class="sl2">'+m.label+'</div><div class="sd2">'+m.desc+'</div>'+ctrl+'</div>';}).join('');}
async function sv(key,value){await fetch('/settings/'+key,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value})});}
async function resetS(){if(!confirm('Reset all settings to defaults?'))return;await fetch('/settings/reset',{method:'POST'});loadSettings();}
function fgtype(type){fetch('/gaps?type='+type+'&limit=50').then(x=>x.json()).then(r=>{document.getElementById('glist').innerHTML=(r.gaps||[]).map(g=>'<div class="grow"><span class="gtype">'+(g.type||'—')+'</span><span class="gdomain">'+(g.domain||'—')+'</span><span class="greason">'+(g.reason||'—')+'</span><span class="gdesc">'+esc(g.description||'')+'</span><span class="gscore">'+((g.score||0)*100).toFixed(0)+'%</span></div>').join('');});}
const CMDS=[
  {l:'jobs',c:'jobs'},{l:'jobs pending',c:'jobs --status pending'},
  {l:'artifacts',c:'artifacts'},{l:'gaps open',c:'gaps --status open'},
  {l:'sessions',c:'sessions'},{l:'providers',c:'providers'},
  {l:'health',c:'health'},{l:'stats',c:'stats'},
  {l:'ledger',c:'ledger'},{l:'settings',c:'settings'},
  {l:'seam queues',c:'seam queues'},{l:'version',c:'version'},
  {l:'bus',c:'bus'},{l:'send claude <prompt>',c:'send claude '},
];
document.getElementById('ccmds').innerHTML=CMDS.map(c=>'<button class="btn" onclick="runCLI(\''+c.c+'\')">'+c.l+'</button>').join('');
const cin=document.getElementById('cli-in'),cout=document.getElementById('cli-out');
cin.onkeydown=e=>{if(e.key==='Enter'){runCLI(cin.value);cin.value='';}if(e.key==='ArrowUp'){ci=Math.min(ci+1,ch.length-1);cin.value=ch[ci]||'';}if(e.key==='ArrowDown'){ci=Math.max(ci-1,-1);cin.value=ci>=0?ch[ci]:'';}};
async function runCLI(cmd){
  if(!cmd.trim())return;
  ch.unshift(cmd);ci=-1;
  clog('> guardian ' + cmd);
  try {
    // All commands go through /cli/exec — single source of truth (§LAW II)
    // Server writes to ledger, broadcasts via SSE
    const r = await fetch('/cli/exec',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({command:cmd, source:'cockpit'})
    }).then(x=>x.json());
    if(r.error) { clog('[error] ' + r.error); return; }
    if(r.result) clog(JSON.stringify(r.result, null, 2));
    else clog(JSON.stringify(r, null, 2));
  } catch(e) { clog('[error] ' + e.message); }
}
function parseFL(args){const fl={};for(let i=0;i<args.length;i+=2){const k=args[i]?.replace(/^--/,''),v=args[i+1];if(k&&v&&!v.startsWith('--'))fl[k]=v;else if(k&&(!v||v.startsWith('--'))){fl[k]='true';i--;}}return fl;}
function clog(t){cout.textContent+=t+'\n';cout.scrollTop=cout.scrollHeight;}
loadPS();loadDB();updateSB();setInterval(loadPS,5000);setInterval(loadDB,15000);
</script>
</body>
</html>`;
}

// ── SISO gate wiring moved to _handleNCPMessage (NCP is the transport — no WSS) ──
// GUARDIAN_ARTIFACT, GUARDIAN_GAPS, GUARDIAN_COMPLETE, GUARDIAN_PA_SESSION,
// GUARDIAN_LEDGER_EVENT, GUARDIAN_FILE_UPLOAD, GUARDIAN_DOWNLOAD
// are all handled in the switch statement above via POST /result (NCP).

// ══════════════════════════════════════════════════════════════════════════════
//  PATCH HTTP SERVER — inject extended routes
// ══════════════════════════════════════════════════════════════════════════════

const _origListeners = server.listeners('request');
server.removeAllListeners('request');
server.on('request', (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
  // NCP SSE channel must NOT have CORS headers pre-set (they set their own)
  // All other routes get CORS headers
  const isNCP = url.pathname === '/channel' || url.pathname === '/result' || url.pathname === '/heartbeat';
  if (!isNCP) {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
  }
  if (req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end();return;}
  // §0.39.282 — handleExtendedRoutes() ends with an explicit `return false` when no route matched; everything else is a
  // route that handled the request. 24 async routes (bodyJ().then(…); return;) and every `return pRes(…)` returned
  // undefined, so the 404 fallback answered first (POST /api/intake from Clear Glass's download capture got 404) and
  // the real answer then threw ERR_HTTP_HEADERS_SENT. Only an explicit false falls through now.
  if (handleExtendedRoutes(req,res,url,req.method) !== false) return;
  for (const listener of _origListeners) listener.call(server,req,res);
});

// ── MEMORY SERVER (inline — port 7823) ────────────────────────────────────────
//
//  Persistent artifact + event store.  LAN-accessible.
//  All data written to ./memory_store/ as flat JSON.
//
//  POST /ingest              push any event (ARTIFACT, LEDGER, DOWNLOAD, JOB_*)
//  GET  /artifacts           list artifacts  (?lang=ts&limit=50&after=<ts>)
//  GET  /artifacts/:hash     get one artifact
//  DELETE /artifacts/:hash   remove artifact
//  GET  /query?q=...         full-text search
//  GET  /context             full bundle for agent injection
//  GET  /ledger              event ledger
//  GET  /downloads           detected downloads
//  GET  /stats               store stats
//  GET  /health              health check
//  GET  /                    live dashboard UI

function startMemoryServer() {
  const MEMORY_PORT  = process.env.MEMORY_PORT  || 7823;
  const MEMORY_HOST  = '0.0.0.0';
  // §MIGRATED 2026-07-18 — same move as the main jaa store above (see that
  // comment for the full migration record). This function predates
  // JaaStore's prefix support and reads/writes the same physical files
  // (artifacts.json, ledger.json, downloads.json, jobs.json) as the main
  // API's JaaStore instance via its own separate fs.readFileSync/
  // writeFileSync calls, not through the JaaStore class at all — "memory
  // server and main API share the same store" (see original comment,
  // still true) meant same directory + same filenames, not same code.
  // Kept sharing exactly those same physical files at the new location by
  // reusing the identical guardian_ prefix in storeFile() below.
  const STORE_DIR    = process.env.MEMORY_STORE_DIR || path.join(__dirname, '..', 'data', 'cortex', 'memory');
  const TABLE_PREFIX = 'guardian_';
  const MAX_ARTIFACTS = 10000;
  const MAX_LEDGER    = 5000;

  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });

  // ── Persistence ─────────────────────────────────────────────────────────────

  function storeFile(name) { return path.join(STORE_DIR, `${TABLE_PREFIX}${name}.json`); }

  function loadStore(name, fallback) {
    try {
      const f = storeFile(name);
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) { console.error(`[memory] load(${name}): ${e.message}`); }
    return fallback;
  }

  function saveStore(name, data) {
    try { fs.writeFileSync(storeFile(name), JSON.stringify(data), 'utf8'); }
    catch (e) { console.error(`[memory] save(${name}): ${e.message}`); }
  }

  let memArtifacts = loadStore('artifacts', []);
  let memLedger    = loadStore('ledger',    []);
  let memDownloads = loadStore('downloads', []);
  let memJobs      = loadStore('jobs',      []);

  const memSaveTimers = {};
  function memSave(name, data) {
    clearTimeout(memSaveTimers[name]);
    memSaveTimers[name] = setTimeout(() => saveStore(name, data), 2000);
  }

  // ── Hash ─────────────────────────────────────────────────────────────────────

  function memHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return Math.abs(h).toString(16).slice(0, 8);
  }

  // ── Ingest ───────────────────────────────────────────────────────────────────

  function memIngest(event) {
    const { type, payload, source, chatUrl, account, chatId } = event;
    const ts = event.ts || Date.now();

    if (type === 'ARTIFACT' || type === 'ARTIFACT_MANUAL_PUSH') {
      if (!payload?.content) return { ok: false, error: 'No content' };
      const hash = payload.hash || memHash(payload.content);
      const existing = memArtifacts.find(a => a.hash === hash);
      if (existing) {
        existing.lastSeen = ts;
        existing.seenCount = (existing.seenCount || 1) + 1;
        memSave('artifacts', memArtifacts);
        return { ok: true, hash, action: 'updated', id: existing.id };
      }
      const entry = {
        id:        payload.id || randomUUID(),
        hash,
        name:      payload.name      || 'artifact',
        type:      payload.type      || 'code_block',
        lang:      payload.lang      || null,
        content:   (payload.content  || '').slice(0, 8000),
        context:   (payload.context  || '').slice(0, 400),
        chatUrl:   payload.chatUrl   || chatUrl || '',
        chatId:    payload.chatId    || chatId  || '',
        account:   payload.account   || account || '',
        jobId:     payload.jobId     || null,
        direction: payload.direction || 'output',
        ts, lastSeen: ts, seenCount: 1,
        source:    source || 'guardian',
        tags:      [],
      };
      memArtifacts.unshift(entry);
      if (memArtifacts.length > MAX_ARTIFACTS) memArtifacts.pop();
      memSave('artifacts', memArtifacts);
      console.log(`[memory] artifact: ${entry.name} (${entry.lang || entry.type}) ${entry.content.length}ch`);
      return { ok: true, hash, action: 'created', id: entry.id };
    }

    if (type === 'LEDGER') {
      if (!payload) return { ok: false, error: 'No payload' };
      const entry = {
        id: randomUUID(), ts,
        category: payload.category || 'EVENT',
        msg:      payload.msg      || '',
        meta:     payload.meta     || {},
        chatUrl:  chatUrl || payload.chatUrl || '',
        account:  account || payload.account || '',
        source:   source || 'guardian',
      };
      memLedger.unshift(entry);
      if (memLedger.length > MAX_LEDGER) memLedger.pop();
      memSave('ledger', memLedger);
      return { ok: true, id: entry.id };
    }

    if (type === 'DOWNLOAD') {
      if (!payload) return { ok: false, error: 'No payload' };
      const entry = {
        id: payload.id || randomUUID(), ts,
        filename: payload.filename || 'download',
        href:     payload.href     || '',
        chatUrl:  payload.chatUrl  || chatUrl || '',
        chatId:   payload.chatId   || chatId  || '',
        account:  payload.account  || account || '',
        jobId:    payload.jobId    || null,
        source:   source || 'guardian',
      };
      memDownloads.unshift(entry);
      if (memDownloads.length > 500) memDownloads.pop();
      memSave('downloads', memDownloads);
      return { ok: true, id: entry.id };
    }

    if (type === 'JOB_START') {
      if (!payload?.jobId) return { ok: false, error: 'No jobId' };
      if (!memJobs.find(j => j.id === payload.jobId)) {
        memJobs.unshift({ id: payload.jobId, status: 'started', prompt: (payload.prompt || '').slice(0, 500), chatUrl: chatUrl || '', account: account || '', ts, source: source || 'guardian' });
        if (memJobs.length > 500) memJobs.pop();
        memSave('jobs', memJobs);
      }
      return { ok: true };
    }

    if (type === 'JOB_COMPLETE') {
      if (!payload?.jobId) return { ok: false, error: 'No jobId' };
      const job = memJobs.find(j => j.id === payload.jobId);
      if (job) { job.status = 'complete'; job.completedAt = ts; job.chars = payload.chars; }
      memSave('jobs', memJobs);
      return { ok: true };
    }

    if (type === 'FILE_UPLOAD') {
      return memIngest({ ...event, type: 'LEDGER', payload: { category: 'INPUT', msg: `Upload: ${(payload?.files || []).map(f => f.name).join(', ')}`, meta: payload } });
    }

    // Generic → ledger
    return memIngest({ ...event, type: 'LEDGER', payload: { category: 'EVENT', msg: type, meta: payload || {} } });
  }

  // ── Search ───────────────────────────────────────────────────────────────────

  function memQuery(q, limit = 50) {
    if (!q) return { artifacts: [], ledger: [], downloads: [] };
    const ql = q.toLowerCase();
    const score = a => {
      let s = 0;
      if ((a.name    || '').toLowerCase().includes(ql)) s += 10;
      if ((a.lang    || '').toLowerCase() === ql)       s += 8;
      if ((a.content || '').toLowerCase().includes(ql)) s += 3;
      if ((a.context || '').toLowerCase().includes(ql)) s += 2;
      s += Math.max(0, 5 - (Date.now() - a.ts) / 3600000 * 0.1);
      return s;
    };
    return {
      artifacts: memArtifacts.filter(a =>
        (a.name||'').toLowerCase().includes(ql) || (a.lang||'').toLowerCase().includes(ql) ||
        (a.content||'').toLowerCase().includes(ql) || (a.account||'').toLowerCase().includes(ql)
      ).slice(0, limit).map(a => ({ ...a, content: (a.content||'').slice(0, 500), _score: score(a) })).sort((a,b) => b._score - a._score),
      ledger: memLedger.filter(l => (l.msg||'').toLowerCase().includes(ql)).slice(0, limit),
      downloads: memDownloads.filter(d => (d.filename||'').toLowerCase().includes(ql)).slice(0, limit),
    };
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────

  function memStats() {
    const langs = {}, accounts = {}, types = {};
    for (const a of memArtifacts) {
      if (a.lang)    langs[a.lang]       = (langs[a.lang]       || 0) + 1;
      if (a.account) accounts[a.account] = (accounts[a.account] || 0) + 1;
      if (a.type)    types[a.type]       = (types[a.type]       || 0) + 1;
    }
    return {
      artifacts:         memArtifacts.length,
      ledger:            memLedger.length,
      downloads:         memDownloads.length,
      jobs:              memJobs.length,
      totalContentBytes: memArtifacts.reduce((n,a) => n + (a.content?.length||0), 0),
      langs:    Object.entries(langs).sort((a,b)=>b[1]-a[1]).slice(0,20),
      accounts: Object.entries(accounts).sort((a,b)=>b[1]-a[1]),
      types:    Object.entries(types).sort((a,b)=>b[1]-a[1]),
      uptime:   process.uptime(),
      memoryMB: Math.round(process.memoryUsage().heapUsed/1024/1024),
      storeDir: STORE_DIR,
    };
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  function memDashboard() {
    const ips   = getLocalIPs();
    const stats = memStats();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guardian Memory</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#030508;--s1:#080d12;--s2:#0d1318;--border:#0f2030;--text:#c8e0f0;--muted:#3a5060;--mono:'SF Mono','Fira Code',monospace;--accent:#00c8ff}
body{background:var(--bg);color:var(--text);font-family:var(--mono);min-height:100vh;overflow-x:hidden}
.grid{position:fixed;inset:0;z-index:0;pointer-events:none;background-image:linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px);background-size:36px 36px}
.scan{position:fixed;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.4;animation:scan 5s linear infinite;z-index:1}
@keyframes scan{from{top:-1px}to{top:100vh}}
.app{position:relative;z-index:10;max-width:1400px;margin:0 auto;padding:1.5rem}
h1{font-size:clamp(1.2rem,3vw,2rem);letter-spacing:.15em;color:var(--accent);text-shadow:0 0 20px rgba(0,200,255,.4);margin-bottom:1.5rem}
h1 small{color:var(--muted);font-size:.45em;display:block;letter-spacing:.1em;margin-top:4px}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:1.5rem}
.stat{background:var(--s1);border:1px solid var(--border);padding:8px 12px;position:relative}
.stat::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--accent)}
.stat-v{color:var(--accent);font-size:1.2rem;font-weight:600}
.stat-l{color:var(--muted);font-size:.6rem;text-transform:uppercase;letter-spacing:.08em}
.panels{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
@media(max-width:900px){.panels{grid-template-columns:1fr}}
.panel{background:var(--s1);border:1px solid var(--border)}
.panel-h{padding:.6rem 1rem;border-bottom:1px solid var(--border);background:var(--s2);display:flex;align-items:center;justify-content:space-between}
.panel-t{font-size:.6rem;text-transform:uppercase;letter-spacing:.15em;color:var(--accent)}
.panel-b{padding:.75rem 1rem;max-height:340px;overflow-y:auto}
.panel-b::-webkit-scrollbar{width:4px}
.panel-b::-webkit-scrollbar-thumb{background:var(--border)}
.search{width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 10px;font-family:var(--mono);font-size:.78rem;outline:none;margin-bottom:.75rem}
.search:focus{border-color:rgba(0,200,255,.4)}
.lang-bar{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:.75rem}
.lc{background:var(--s2);border:1px solid var(--border);color:var(--muted);padding:2px 7px;font-size:.62rem;cursor:pointer}
.lc:hover,.lc.on{border-color:var(--accent);color:var(--accent)}
.art-row{padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer}
.art-row:hover{background:rgba(0,200,255,.03);margin:0 -1rem;padding:5px 1rem}
.art-name{color:var(--text);font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.art-meta{color:var(--muted);font-size:.62rem;display:flex;gap:.5rem;flex-wrap:wrap;margin-top:2px}
.art-meta .lang{color:var(--accent);opacity:.7}
.art-expand{padding:6px;background:var(--bg);border:1px solid var(--border);margin-top:4px;font-size:.68rem;white-space:pre-wrap;word-break:break-all;max-height:120px;overflow-y:auto;color:#64748b}
.led-row{padding:3px 0;border-bottom:1px solid var(--border);display:flex;gap:8px}
.led-ts{color:#1e293b;font-size:.62rem;flex-shrink:0;width:60px}
.led-cat{font-size:.62rem;font-weight:700;flex-shrink:0;width:50px}
.led-msg{color:#64748b;font-size:.72rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{color:var(--muted);text-align:center;padding:2rem;font-size:.78rem}
footer{margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:.62rem;color:var(--muted)}
footer span{color:var(--accent)}
</style>
</head>
<body>
<div class="grid"></div><div class="scan"></div>
<div class="app">
  <h1>Guardian Memory <small>Persistent AI Interaction Store · v1.0.0 · Port ${MEMORY_PORT}</small></h1>
  <div class="stats" id="stats"></div>
  <div class="panels">
    <div class="panel">
      <div class="panel-h"><span class="panel-t">Artifacts</span><span id="ac" style="color:var(--muted);font-size:.65rem"></span></div>
      <div class="panel-b">
        <input class="search" id="asrch" placeholder="Search artifacts…" oninput="fa()">
        <div class="lang-bar" id="lbar"></div>
        <div id="alist"></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-h"><span class="panel-t">Ledger</span><span id="lc2" style="color:var(--muted);font-size:.65rem"></span></div>
      <div class="panel-b">
        <input class="search" id="lsrch" placeholder="Search events…" oninput="fl()">
        <div id="llist"></div>
      </div>
    </div>
  </div>
  <footer>
    <span>Guardian Memory · IPs: <span>${ips.map(i=>i.address).join(' · ') || 'localhost'}</span></span>
    <span id="upt"></span>
  </footer>
</div>
<script>
let arts=[],leds=[],aLang='',aExp=new Set();
const LCAT={OUTPUT:'#a78bfa',INPUT:'#60a5fa',EVENT:'#94a3b8',GAP:'#f472b6',UPGRADE:'#34d399',SYSTEM:'#818cf8'};
const ICONS={typescript:'🔷',ts:'🔷',javascript:'🟨',js:'🟨',python:'🐍',py:'🐍',html:'🌐',css:'🎨',json:'📋',md:'📝',bash:'💲',sh:'💲',rust:'🦀',go:'🟦'};
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function fts(ts){return new Date(ts).toLocaleTimeString()}
function fsz(n){if(n<1024)return n+'B';if(n<1048576)return(n/1024).toFixed(1)+'KB';return(n/1048576).toFixed(1)+'MB'}
async function load(){
  const[sr,lr]=await Promise.all([fetch('/memory/artifacts?limit=500').then(r=>r.json()),fetch('/memory/ledger?limit=200').then(r=>r.json())]);
  arts=sr.artifacts||[];leds=lr.ledger||[];
  ls();lb();fa();fl();
}
async function ls(){
  const r=await fetch('/memory/stats').then(x=>x.json()),s=r.stats;
  document.getElementById('stats').innerHTML=
    st(s.artifacts,'Artifacts')+st(s.ledger,'Events')+st(s.downloads,'Downloads')+
    st(s.jobs,'Jobs')+st(fsz(s.totalContentBytes||0),'Content')+
    st(s.memoryMB+'MB','Heap')+st(Math.floor(s.uptime/60)+'m','Uptime');
}
function st(v,l){return'<div class="stat"><div class="stat-v">'+v+'</div><div class="stat-l">'+l+'</div></div>'}
function lb(){
  const ls=[...new Set(arts.map(a=>a.lang).filter(Boolean))];
  document.getElementById('lbar').innerHTML='<span class="lc'+(aLang===''?' on':'')+'" onclick="sl(\'\')">all</span>'+ls.map(l=>'<span class="lc'+(aLang===l?' on':'')+'" onclick="sl(\''+l+'\')">'+l+'</span>').join('');
}
function sl(l){aLang=l;lb();fa()}
function fa(){
  const q=(document.getElementById('asrch').value||'').toLowerCase();
  let list=arts.filter(a=>(!aLang||a.lang===aLang)&&(!q||(a.name||'').toLowerCase().includes(q)||(a.lang||'').toLowerCase().includes(q)||(a.content||'').toLowerCase().includes(q)));
  document.getElementById('ac').textContent=list.length+' results';
  document.getElementById('alist').innerHTML=list.length===0?'<div class="empty">No artifacts</div>':list.slice(0,100).map(a=>{
    const ic=ICONS[a.lang]||'◻',exp=aExp.has(a.hash);
    return'<div class="art-row" onclick="ta(\''+a.hash+'\')"><div class="art-name">'+ic+' '+esc(a.name||'artifact')+'</div><div class="art-meta">'+(a.lang?'<span class="lang">'+a.lang+'</span>':'')+(a.account?'<span>'+esc(a.account.slice(0,28))+'</span>':'')+'<span>'+fts(a.ts)+'</span><span>'+fsz(a.content?.length||0)+'</span></div>'+(exp?'<pre class="art-expand">'+esc((a.content||'').slice(0,800))+'</pre>':'')+'</div>';
  }).join('');
}
function ta(h){if(aExp.has(h))aExp.delete(h);else aExp.add(h);fa()}
function fl(){
  const q=(document.getElementById('lsrch').value||'').toLowerCase();
  let list=leds.filter(l=>!q||(l.msg||'').toLowerCase().includes(q));
  document.getElementById('lc2').textContent=list.length+' events';
  document.getElementById('llist').innerHTML=list.length===0?'<div class="empty">No events</div>':list.slice(0,80).map(l=>'<div class="led-row"><span class="led-ts">'+fts(l.ts)+'</span><span class="led-cat" style="color:'+(LCAT[l.category]||'#94a3b8')+'">'+l.category+'</span><span class="led-msg">'+esc(l.msg)+'</span></div>').join('');
}
function tick(){document.getElementById('upt').textContent='Last refresh: '+new Date().toLocaleTimeString()}
setInterval(()=>{load();tick()},10000);load();tick();
</script>
</body>
</html>`;
  }

  // ── HTTP server ───────────────────────────────────────────────────────────────

  function memRespond(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
  }

  function memBodyJson(req) {
    return new Promise((resolve, reject) => {
      let body = ''; let memBytes = 0; let memRejected = false;
      // §FOUND & FIXED 2026-09-06 — same real fix as bodyJ() above.
      req.on('data', c => {
        if (memRejected) return;
        memBytes += Buffer.byteLength(c);
        if (memBytes > MAX_BODY_BYTES) {
          memRejected = true;
          req.destroy();
          reject(new Error(`request body exceeded ${MAX_BODY_BYTES} bytes — refused, not silently buffered forever`));
          return;
        }
        body += c;
      });
      req.on('end', () => { if (!memRejected) { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } } });
      req.on('error', reject);
    });
  }

  const memServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url   = new URL(req.url, `http://localhost:${MEMORY_PORT}`);
    // Strip leading /memory prefix if called via guardian HTTP proxy
    const rawPath = url.pathname.replace(/^\/memory/, '') || '/';
    const parts = rawPath.split('/').filter(Boolean);
    const method = req.method;

    // Dashboard
    if (method === 'GET' && parts.length === 0) {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
      res.end(memDashboard()); return;
    }

    // POST /ingest
    if (method === 'POST' && parts[0] === 'ingest') {
      try { const body = await memBodyJson(req); memRespond(res, 200, memIngest(body)); }
      catch(e) { memRespond(res, 400, { ok: false, error: e.message }); }
      return;
    }

    // POST /artifacts  (manual push)
    if (method === 'POST' && parts[0] === 'artifacts') {
      try { const body = await memBodyJson(req); memRespond(res, 200, memIngest({ type: 'ARTIFACT', payload: body })); }
      catch(e) { memRespond(res, 400, { ok: false, error: e.message }); }
      return;
    }

    // GET /artifacts
    if (method === 'GET' && parts[0] === 'artifacts' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'100'), 500);
      const lang   = url.searchParams.get('lang');
      const after  = parseInt(url.searchParams.get('after')||'0');
      let list = memArtifacts;
      if (lang)  list = list.filter(a => a.lang === lang);
      if (after) list = list.filter(a => a.ts > after);
      memRespond(res, 200, { ok: true, count: list.length, artifacts: list.slice(0, limit) }); return;
    }

    // GET /artifacts/:hash
    if (method === 'GET' && parts[0] === 'artifacts' && parts[1]) {
      const found = memArtifacts.find(a => a.hash === parts[1] || a.id === parts[1]);
      if (!found) { memRespond(res, 404, { ok: false, error: 'Not found' }); return; }
      memRespond(res, 200, { ok: true, artifact: found }); return;
    }

    // DELETE /artifacts/:hash
    if (method === 'DELETE' && parts[0] === 'artifacts' && parts[1]) {
      const idx = memArtifacts.findIndex(a => a.hash === parts[1] || a.id === parts[1]);
      if (idx === -1) { memRespond(res, 404, { ok: false, error: 'Not found' }); return; }
      memArtifacts.splice(idx, 1);
      memSave('artifacts', memArtifacts);
      memRespond(res, 200, { ok: true }); return;
    }

    // GET /query?q=...
    if (method === 'GET' && parts[0] === 'query') {
      const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
      if (!q) { memRespond(res, 400, { ok: false, error: 'Missing q' }); return; }
      memRespond(res, 200, { ok: true, query: q, results: memQuery(q, parseInt(url.searchParams.get('limit')||'50')) }); return;
    }

    // GET /ledger
    if (method === 'GET' && parts[0] === 'ledger') {
      const limit = Math.min(parseInt(url.searchParams.get('limit')||'100'), 500);
      memRespond(res, 200, { ok: true, count: memLedger.length, ledger: memLedger.slice(0, limit) }); return;
    }

    // GET /downloads
    if (method === 'GET' && parts[0] === 'downloads') {
      const limit = Math.min(parseInt(url.searchParams.get('limit')||'50'), 200);
      memRespond(res, 200, { ok: true, count: memDownloads.length, downloads: memDownloads.slice(0, limit) }); return;
    }

    // GET /context
    if (method === 'GET' && parts[0] === 'context') {
      const chatId = url.searchParams.get('chatId');
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'50'), 200);
      const list   = chatId ? memArtifacts.filter(a => a.chatId === chatId) : memArtifacts.slice(0, limit);
      memRespond(res, 200, { ok: true, ts: Date.now(), artifacts: list, recentLedger: memLedger.slice(0,20), recentDownloads: memDownloads.slice(0,10), stats: memStats() }); return;
    }

    // GET /stats
    if (method === 'GET' && parts[0] === 'stats') {
      memRespond(res, 200, { ok: true, stats: memStats() }); return;
    }

    // GET /health
    if (method === 'GET' && parts[0] === 'health') {
      memRespond(res, 200, { ok: true, uptime: process.uptime(), artifacts: memArtifacts.length, ledger: memLedger.length, downloads: memDownloads.length, port: MEMORY_PORT, ips: getLocalIPs() }); return;
    }

    memRespond(res, 404, { ok: false, error: 'Not found' });
  });

  memServer.listen(MEMORY_PORT, MEMORY_HOST, () => {
    const ips = getLocalIPs();

  });

  memServer.on('error', err => {
    console.error(`[memory] ERROR: ${err.message}`);
    if (err.code === 'EADDRINUSE') console.error(`[memory] Port ${MEMORY_PORT} in use — set MEMORY_PORT env var`);
  });

  // Also proxy /memory/* routes through the main HTTP server (port 7820)
  // so everything is reachable from one port if needed
  // ── JaaStore proxy — memory server is the authoritative storage layer ──────
  // When memIngest is called (from WS, userscripts, or the /memory/ingest API),
  // the data also flows into JaaStore so it's available via the main API.
  // This is the integration point: one ingest path, two read surfaces.
  const _origIngest = memIngest;
  function memIngestHooked(event) {
    const result = _origIngest(event);
    // Mirror into JaaStore tables so /artifacts, /gaps, /ledger routes are current
    try {
      const { type, payload, source, chatUrl, account, chatId } = event;
      const ts = event.ts || Date.now();
      if ((type === 'ARTIFACT' || type === 'ARTIFACT_MANUAL_PUSH') && payload?.content) {
        // Gate handles this — but if it came via HTTP POST /memory/ingest (not WS), do it here
        if (source && source.includes('userscript')) {
          bus.emit('guardian.artifact', { ...payload, chatUrl: payload.chatUrl||chatUrl, account: payload.account||account, chatId: payload.chatId||chatId, provider: payload.provider||'claude' });
        }
      }
      if (type === 'LEDGER' && payload) {
        if (source && source.includes('userscript')) {
          bus.emit('guardian.ledger', { ...payload, chatUrl, account, source: source||'memory-hook' });
        }
      }
    } catch (_) {}
    return result;
  }

  return { server: memServer, ingest: memIngestHooked, query: memQuery, stats: memStats };
}

const memoryServer = startMemoryServer();

// ── Wire GUARDIAN_ARTIFACT / LEDGER events into memory store ──────────────────
//
//  Any artifact or ledger event that hits the WSS is also forwarded into memory.
//  This means the userscript doesn't need to make a separate HTTP call —
//  guardian already has the data, memory just indexes it.

// [WSS handler removed — NCP is the transport]

module.exports = { server, wss, ncp, jobs, PROVIDERS, dropzone, memoryServer };
