'use strict';
// ── cortex/guardian/mind-bridge.js ───────────────────────────────────────────
// UUID: cortex-guardian-mind-bridge-v2-0000-4000-0000-000000000001
// Version: 2.0.0
//
// THE NERVE TRUNK — the only contract surface between Cortex (brain) and
// Guardian (mind).  Nothing crosses this boundary except through these routes.
//
// AXIOMS
//   §LAW_I   Brain owns source of truth.  Mind writes here only.
//   §LAW_II  Every write is persisted to working memory BEFORE acknowledgement.
//   §LAW_III Mind never imports Cortex internals.  This bridge is the only
//             contract.
//   §LAW_IV  Health beats every 30s.  3 missed beats → guardian marked offline.
//   §WM.1    working memory write fires before every JAA insert and every
//             response.  Caller observes consistent state immediately.
//   §WM.2    Internal first — all state queryable via /api/wm/* and the
//             domain-specific endpoints below.  No external system bypasses.
//
// ROUTE SURFACE
//   ── Guardian → Cortex (state ingestion) ────────────────────────────────────
//   POST /api/guardian/health          heartbeat + provider snapshot
//   POST /api/guardian/event           arbitrary bus event
//   POST /api/guardian/job             job create / update
//   POST /api/guardian/artifact        artifact detected
//   POST /api/guardian/gap             gap detected
//   POST /api/guardian/session         session named
//   POST /api/guardian/complete        agent_call result written back
//   POST /api/guardian/provider        NCP provider connect/disconnect
//
//   ── Cortex → Guardian (task delivery) ──────────────────────────────────────
//   GET  /api/guardian/tasks           pending agent_calls for guardian
//
//   ── Relay (kernel ↔ Guardian via Cortex) ────────────────────────────────────
//   POST /api/guardian/relay/enqueue   kernel enqueues job for Guardian NCP
//   GET  /api/guardian/relay           Guardian polls pending relay jobs
//   POST /api/guardian/relay/ack       Guardian acks dispatched relay job
//   POST /api/guardian/relay/complete  Guardian signals relay job finished
//
//   ── Query (internal-first read surface) ─────────────────────────────────────
//   GET  /api/guardian/status          live guardian health + recent jobs
//   GET  /api/guardian/providers       current provider connection state
//   GET  /api/guardian/jobs            recent jobs (queryable by status/provider)
//   GET  /api/guardian/gaps            open gaps
//   GET  /api/guardian/artifacts       recent artifacts
//   GET  /api/guardian/kernel/status   combined kernel + guardian view
//
//   ── Working memory query (§WM.2 — everything queryable) ────────────────────
//   GET  /api/wm/tail                  last N wm rows
//   GET  /api/wm/search?q=             full-text search
//   GET  /api/wm/type/:type            rows by event type
//   GET  /api/wm/source/:source        rows by source
//   GET  /api/wm/chain/:uuid           causal chain from uuid
//   GET  /api/wm/since/:ts             rows since timestamp
//   GET  /api/wm/stats                 counts by type and source

const { jaaDB, uid } = require('../memory/jaa-db');
const { TABLES }     = require('../memory/jaa-tables');
const { getWM, makeHelpers } = require('../working-memory');

const MODULE_ID = 'guardian.mind-bridge';
const VERSION   = '2.0.0';

// ── Working memory ─────────────────────────────────────────────────────────────
// Opened by boot.js (Phase 1) before this module is required.
// We get the singleton here — safe because boot guarantees open() ran first.
const wm  = getWM();
const wmh = makeHelpers(wm);

// ── Relay queue ───────────────────────────────────────────────────────────────
// In-memory map: jobId → record.  Also persisted to guardian_relay JAA table.
const _relay = new Map();

// ── Liveness watchdog ─────────────────────────────────────────────────────────
const BEAT_MS    = 30_000;
const MISS_LIMIT = 3;
let _lastBeat    = 0;
let _misses      = 0;
let _watchdog    = null;
let _connected   = false;

function _startWatchdog() {
  if (_watchdog) return;
  _watchdog = setInterval(() => {
    if (!_lastBeat) return;
    const age = Date.now() - _lastBeat;
    if (age > BEAT_MS * 1.5) {
      _misses++;
      if (_misses >= MISS_LIMIT && _connected) {
        _connected = false;
        const row = wm.write('guardian.health.offline', { missedBeats: _misses, beatAge: age }, { source: MODULE_ID });
        _jaaHealth({ connected: false, reason: `beat missed ${_misses}x`, beatAge: age });
        console.warn(`[${MODULE_ID}] Guardian offline — beat age ${Math.round(age / 1000)}s`);
      }
    } else {
      _misses = 0;
    }
  }, BEAT_MS);
  _watchdog.unref();
}

// ── JAA helpers (§LAW_II — always after wm.write) ────────────────────────────

function _jaaHealth(extra = {}) {
  try {
    jaaDB.insert(TABLES.GUARDIAN_HEALTH, {
      uuid:        uid(),
      ts:          Date.now(),
      connected:   _connected,
      lastBeatAge: _lastBeat ? Date.now() - _lastBeat : null,
      source:      MODULE_ID,
      ...extra,
    });
  } catch (_) {}
}

// ── Route handlers ────────────────────────────────────────────────────────────

// POST /api/guardian/health
function handleHealth(body) {
  _lastBeat   = Date.now();
  _misses     = 0;
  const wasConnected = _connected;
  _connected  = true;

  // §WM.1 — working memory first
  wm.write('guardian.health.beat', {
    uptime:    body.uptime    || 0,
    jobs:      body.jobs      || 0,
    providers: body.providers || {},
    version:   body.version   || '?',
    pid:       body.pid       || null,
    port:      body.port      || null,
  }, { source: MODULE_ID });

  const row = jaaDB.insert(TABLES.GUARDIAN_HEALTH, {
    uuid:      uid(),
    ts:        Date.now(),
    connected: true,
    uptime:    body.uptime    || 0,
    jobs:      body.jobs      || 0,
    providers: body.providers || {},
    version:   body.version   || '?',
    pid:       body.pid       || null,
    port:      body.port      || null,
    source:    MODULE_ID,
  });

  if (!wasConnected) {
    wm.write('guardian.connected', { version: body.version, pid: body.pid }, { source: MODULE_ID });
    jaaDB.insert(TABLES.EVENT_LOG, {
      uuid: uid(), type: 'guardian.connected', ts: Date.now(),
      payload: { version: body.version, pid: body.pid, port: body.port },
      source: MODULE_ID, causedBy: null,
    });
    console.log(`[${MODULE_ID}] Guardian connected v${body.version}`);
  }

  return row;
}

// POST /api/guardian/event
function handleEvent(body) {
  const { type, payload, data, causedBy, source } = body;
  if (!type) throw new Error('type required');

  const eventData = payload || data || {};

  // §WM.1
  wm.write(type, eventData, { source: source || 'guardian', causedBy: causedBy || null });

  const ev = jaaDB.insert(TABLES.EVENT_LOG, {
    uuid: uid(), type, payload: eventData,
    source: source || 'guardian', causedBy: causedBy || null, ts: Date.now(),
  });

  jaaDB.insert(TABLES.GUARDIAN_LEDGER, {
    uuid: ev.uuid, type, payload: eventData,
    source: source || 'guardian', causedBy: causedBy || null, ts: Date.now(),
  });

  return ev;
}

// POST /api/guardian/job
function handleJob(body) {
  const { jobId, command, provider, status } = body;
  if (!jobId) throw new Error('jobId required');

  // §WM.1
  if (status === 'complete') {
    wmh.jobComplete(jobId, provider, body.chars, body.durationMs, 'guardian');
  } else if (status === 'queued') {
    wmh.jobQueued(jobId, provider, body.prompt || '', 'guardian');
  } else if (status === 'dispatched' || status === 'delivered') {
    wmh.jobDispatched(jobId, provider, 'guardian');
  } else if (status === 'error') {
    wmh.jobError(jobId, provider, body.error || 'unknown', 'guardian');
  } else {
    wm.write(`guardian.job.${status || 'update'}`, { jobId, provider, status }, { source: 'guardian', causedBy: jobId, jobId, provider });
  }

  const existing = jaaDB.query(TABLES.GUARDIAN_JOBS, r => r.jobId === jobId, 1);
  if (existing.length) {
    const prev = existing[0];
    return jaaDB.insert(TABLES.GUARDIAN_JOBS, {
      ...prev,
      uuid:            uid(),
      status:          status || prev.status,
      chars:           body.chars            ?? prev.chars,
      durationMs:      body.durationMs       ?? prev.durationMs,
      responsePreview: body.responsePreview  ?? prev.responsePreview,
      completedAt:     status === 'complete' ? Date.now() : prev.completedAt,
      ts:              Date.now(),
      source:          MODULE_ID,
    });
  }

  return jaaDB.insert(TABLES.GUARDIAN_JOBS, {
    uuid: uid(), jobId,
    command:         command           || 'unknown',
    provider:        provider          || 'unknown',
    status:          status            || 'queued',
    promptLen:       body.promptLen    || 0,
    chars:           body.chars        || 0,
    durationMs:      body.durationMs   || null,
    responsePreview: body.responsePreview || null,
    completedAt:     status === 'complete' ? Date.now() : null,
    createdAt:       Date.now(),
    ts:              Date.now(),
    source:          body.source       || MODULE_ID,
  });
}

// POST /api/guardian/artifact
function handleArtifact(body) {
  const { jobId, provider, name, ext } = body;
  if (!name) throw new Error('artifact name required');

  // §WM.1
  wmh.artifact(jobId, provider, name, body.lang, body.chars, 'guardian');

  const row = jaaDB.insert(TABLES.GUARDIAN_ARTIFACTS, {
    uuid:     body.uuid || uid(),
    jobId:    jobId     || null,
    provider: provider  || 'unknown',
    name, ext: ext || '',
    lang:     body.lang      || null,
    filePath: body.file_path || null,
    ts:       Date.now(),
    source:   MODULE_ID,
  });

  jaaDB.insert(TABLES.ARTIFACTS, {
    uuid:     row.uuid,
    jobId:    jobId   || null,
    provider: provider || 'unknown',
    name, ext: ext || '',
    lang:     body.lang || null,
    source:   'guardian',
    ts:       Date.now(),
    causedBy: jobId || null,
  });

  return row;
}

// POST /api/guardian/gap
function handleGap(body) {
  if (!body.type) throw new Error('gap type required');

  // §WM.1
  wmh.gap(body.causedBy, body.type, body.domain || '', body.body || body.description || '', body.score || 0, 'guardian');

  const row = jaaDB.insert(TABLES.GUARDIAN_GAPS, {
    uuid:     body.uuid     || uid(),
    type:     body.type,
    path:     body.path     || '',
    body:     body.body     || body.description || '',
    severity: body.severity || 'low',
    status:   body.status   || 'open',
    ts:       Date.now(),
    source:   MODULE_ID,
    causedBy: body.causedBy || null,
  });

  jaaDB.insert(TABLES.GAPS, {
    uuid:      row.uuid,
    type:      body.type,
    path:      body.path     || '',
    body:      body.body     || body.description || '',
    severity:  body.severity || 'low',
    status:    body.status   || 'open',
    source:    'guardian',
    causedBy:  body.causedBy || null,
    createdAt: Date.now(),
    attempts:  0,
    ts:        Date.now(),
  });

  return row;
}

// POST /api/guardian/session
function handleSession(body) {
  if (!body.name) throw new Error('session name required');

  wm.write('guardian.session.named', { name: body.name, provider: body.provider }, { source: 'guardian', causedBy: null });

  const row = jaaDB.insert(TABLES.GUARDIAN_SESSIONS, {
    uuid:      body.sessionId || uid(),
    name:      body.name,
    provider:  body.provider  || 'unknown',
    startedAt: body.startedAt || Date.now(),
    ts:        Date.now(),
    source:    MODULE_ID,
  });

  jaaDB.insert(TABLES.EVENT_LOG, {
    uuid: uid(), type: 'guardian.session.named', ts: Date.now(),
    payload: { name: body.name, provider: body.provider },
    source: 'guardian', causedBy: null,
  });

  return row;
}

// POST /api/guardian/complete  — agent_call result written back
function handleComplete(body) {
  const { callId, response, status, error } = body;
  if (!callId) throw new Error('callId required');

  const chars = (response || '').length;

  // §WM.1
  if (error) {
    wmh.agentError(callId, body.routedTo || 'guardian', error, 'guardian');
  } else {
    wmh.agentComplete(callId, body.routedTo || 'guardian', chars, 'guardian');
  }

  jaaDB.update(TABLES.AGENT_CALLS, callId, {
    status:      error ? 'failed' : (status || 'complete'),
    response:    response || null,
    error:       error   || null,
    completedAt: Date.now(),
    completedBy: 'guardian',
  });

  if (response) {
    jaaDB.insert(TABLES.CORTEX_MEMORY, {
      uuid:     uid(),
      callId,
      content:  response,
      source:   'guardian',
      ts:       Date.now(),
      causedBy: callId,
    });
  }

  jaaDB.insert(TABLES.EVENT_LOG, {
    uuid: uid(), type: 'guardian.agent.complete', ts: Date.now(),
    payload: { callId, chars, hadError: !!error },
    source: 'guardian', causedBy: callId,
  });

  return { ok: true, callId };
}

// POST /api/guardian/provider
function handleProvider(body) {
  const { provider, connected, adapterName, tabId, guardianPort } = body;
  if (!provider) throw new Error('provider required');

  // §WM.1
  if (connected) {
    wmh.providerConnected(provider, tabId, 'guardian');
  } else {
    wmh.providerDisconnected(provider, tabId, 'guardian');
  }

  return jaaDB.insert(TABLES.GUARDIAN_PROVIDERS, {
    uuid:         uid(),
    provider,
    connected:    !!connected,
    adapterName:  adapterName || provider,
    tabId:        tabId       || null,
    guardianPort: guardianPort || null,
    ts:           Date.now(),
    source:       MODULE_ID,
  });
}

// GET /api/guardian/tasks  — pending agent_calls routed to guardian
function getTasks() {
  return jaaDB.query(TABLES.AGENT_CALLS,
    r => r.status === 'routed' && r.routedTo?.startsWith('guardian-'), 10
  );
}

// ── Relay handlers ────────────────────────────────────────────────────────────

// POST /api/guardian/relay/enqueue  (called by kernel client)
function handleRelayEnqueue(body) {
  const { jobId, provider, command, prompt } = body;
  if (!jobId || !provider || !prompt) throw new Error('jobId, provider, prompt required');

  const record = { jobId, provider, command: command || 'chat', prompt, enqueuedAt: Date.now(), status: 'pending' };
  _relay.set(jobId, record);

  // §WM.1
  wmh.relayEnqueued(jobId, provider, 'mind-bridge');

  jaaDB.insert(TABLES.GUARDIAN_RELAY, {
    uuid:    uid(), jobId, provider,
    command: record.command,
    prompt:  prompt.slice(0, 2000),
    status:  'pending',
    ts:      Date.now(),
    source:  MODULE_ID,
  });

  console.log(`[${MODULE_ID}] relay enqueued: ${jobId.slice(0, 8)} → ${provider}`);
  return { ok: true, jobId };
}

// GET /api/guardian/relay  — Guardian polls this
function getRelay() {
  return [..._relay.values()].filter(r => r.status === 'pending');
}

// POST /api/guardian/relay/ack
function handleRelayAck(body) {
  const { jobId } = body;
  if (!jobId) throw new Error('jobId required');

  const record = _relay.get(jobId);
  if (record) {
    record.status  = 'dispatched';
    record.ackedAt = Date.now();
    setTimeout(() => _relay.delete(jobId), 60_000);
  }

  // §WM.1
  wmh.relayAcked(jobId, 'guardian');

  return { ok: true, jobId };
}

// POST /api/guardian/relay/complete
function handleRelayComplete(body) {
  const { jobId, response, error } = body;
  if (!jobId) throw new Error('jobId required');

  _relay.delete(jobId);

  // §WM.1
  wmh.relayComplete(jobId, (response || '').length, 'guardian');

  if (response) {
    jaaDB.insert(TABLES.CORTEX_MEMORY, {
      uuid:     uid(),
      callId:   jobId,
      content:  response,
      source:   'guardian-relay',
      ts:       Date.now(),
      causedBy: jobId,
    });
  }

  return { ok: true, jobId };
}

// ── Query handlers (§WM.2 — internal-first read surface) ─────────────────────

function queryStatus() {
  const health   = jaaDB.tail(TABLES.GUARDIAN_HEALTH, 1);
  const jobs     = jaaDB.tail(TABLES.GUARDIAN_JOBS,   10);
  const gaps     = jaaDB.query(TABLES.GUARDIAN_GAPS, r => r.status === 'open', 20);
  const sessions = jaaDB.tail(TABLES.GUARDIAN_SESSIONS, 5);
  return { health: health[0] || null, recentJobs: jobs, openGaps: gaps.length, sessions, ts: Date.now() };
}

function queryProviders() {
  const rows = jaaDB.tail(TABLES.GUARDIAN_PROVIDERS, 40);
  const map  = {};
  for (const p of rows) {
    if (!map[p.provider] || p.ts > map[p.provider].ts) map[p.provider] = p;
  }
  return Object.values(map);
}

function queryJobs(filterStatus, filterProvider, limit = 50) {
  return jaaDB.query(TABLES.GUARDIAN_JOBS, r => {
    if (filterStatus   && r.status   !== filterStatus)   return false;
    if (filterProvider && r.provider !== filterProvider) return false;
    return true;
  }, limit);
}

function queryGaps(filterStatus = 'open', limit = 50) {
  return jaaDB.query(TABLES.GUARDIAN_GAPS, r => !filterStatus || r.status === filterStatus, limit);
}

function queryArtifacts(limit = 50) {
  return jaaDB.tail(TABLES.GUARDIAN_ARTIFACTS, limit);
}

function queryKernelStatus() {
  return {
    guardian: queryStatus(),
    kernel:   { providers: queryProviders(), relayQueue: _relay.size, pendingRelay: getRelay() },
    ts:       Date.now(),
  };
}

// ── Working memory query handlers (§WM.2) ─────────────────────────────────────

function wmTail(n = 100) {
  return wm.tail(parseInt(n) || 100);
}

function wmSearch(term, limit = 100) {
  if (!term) return [];
  return wm.search(term, parseInt(limit) || 100);
}

function wmByType(type, limit = 200) {
  return wm.byType(type, parseInt(limit) || 200);
}

function wmBySource(source, limit = 200) {
  return wm.bySource(source, parseInt(limit) || 200);
}

function wmChain(rootUuid) {
  return wm.causalChain(rootUuid);
}

function wmSince(ts, limit = 500) {
  return wm.since(parseInt(ts) || 0, parseInt(limit) || 500);
}

function wmStats() {
  return wm.stats();
}

// ── Route dispatch table ───────────────────────────────────────────────────────

function dispatch(method, pathname, body, urlParams = {}) {

  // ── Guardian → Cortex ingestion ──────────────────────────────────────────
  if (method === 'POST' && pathname === '/api/guardian/health')
    return { handled: true, result: handleHealth(body) };

  if (method === 'POST' && pathname === '/api/guardian/event')
    return { handled: true, result: handleEvent(body) };

  if (method === 'POST' && pathname === '/api/guardian/job')
    return { handled: true, result: handleJob(body) };

  if (method === 'POST' && pathname === '/api/guardian/artifact')
    return { handled: true, result: handleArtifact(body) };

  if (method === 'POST' && pathname === '/api/guardian/gap')
    return { handled: true, result: handleGap(body) };

  if (method === 'POST' && pathname === '/api/guardian/session')
    return { handled: true, result: handleSession(body) };

  if (method === 'POST' && pathname === '/api/guardian/complete')
    return { handled: true, result: handleComplete(body) };

  if (method === 'POST' && pathname === '/api/guardian/provider')
    return { handled: true, result: handleProvider(body) };

  if (method === 'GET'  && pathname === '/api/guardian/tasks')
    return { handled: true, result: getTasks() };

  // ── Relay ────────────────────────────────────────────────────────────────
  if (method === 'POST' && pathname === '/api/guardian/relay/enqueue')
    return { handled: true, result: handleRelayEnqueue(body) };

  if (method === 'GET'  && pathname === '/api/guardian/relay')
    return { handled: true, result: getRelay() };

  if (method === 'POST' && pathname === '/api/guardian/relay/ack')
    return { handled: true, result: handleRelayAck(body) };

  if (method === 'POST' && pathname === '/api/guardian/relay/complete')
    return { handled: true, result: handleRelayComplete(body) };

  // ── Query: guardian domain ────────────────────────────────────────────────
  if (method === 'GET'  && pathname === '/api/guardian/status')
    return { handled: true, result: queryStatus() };

  if (method === 'GET'  && pathname === '/api/guardian/providers')
    return { handled: true, result: queryProviders() };

  if (method === 'GET'  && pathname === '/api/guardian/jobs') {
    const { status, provider, limit } = urlParams;
    return { handled: true, result: queryJobs(status, provider, limit) };
  }

  if (method === 'GET'  && pathname === '/api/guardian/gaps') {
    const { status, limit } = urlParams;
    return { handled: true, result: queryGaps(status, limit) };
  }

  if (method === 'GET'  && pathname === '/api/guardian/artifacts') {
    const { limit } = urlParams;
    return { handled: true, result: queryArtifacts(limit) };
  }

  if (method === 'GET'  && pathname === '/api/guardian/kernel/status')
    return { handled: true, result: queryKernelStatus() };

  // ── Query: working memory (§WM.2) ────────────────────────────────────────
  if (method === 'GET' && pathname === '/api/wm/tail')
    return { handled: true, result: wmTail(urlParams.n) };

  if (method === 'GET' && pathname === '/api/wm/search')
    return { handled: true, result: wmSearch(urlParams.q, urlParams.limit) };

  if (method === 'GET' && pathname.startsWith('/api/wm/type/')) {
    const type = decodeURIComponent(pathname.replace('/api/wm/type/', ''));
    return { handled: true, result: wmByType(type, urlParams.limit) };
  }

  if (method === 'GET' && pathname.startsWith('/api/wm/source/')) {
    const source = decodeURIComponent(pathname.replace('/api/wm/source/', ''));
    return { handled: true, result: wmBySource(source, urlParams.limit) };
  }

  if (method === 'GET' && pathname.startsWith('/api/wm/chain/')) {
    const rootUuid = pathname.replace('/api/wm/chain/', '');
    return { handled: true, result: wmChain(rootUuid) };
  }

  // Deep causal chain — crosses hot/cold boundary, reads archive files
  // Use for forensic queries. Not for hot paths.
  if (method === 'GET' && pathname.startsWith('/api/wm/chain-deep/')) {
    const startUuid = pathname.replace('/api/wm/chain-deep/', '');
    return { handled: true, result: wm.causalChainDeep(startUuid) };
  }

  if (method === 'GET' && pathname.startsWith('/api/wm/since/')) {
    const ts = pathname.replace('/api/wm/since/', '');
    return { handled: true, result: wmSince(ts, urlParams.limit) };
  }

  if (method === 'GET' && pathname === '/api/wm/stats')
    return { handled: true, result: wmStats() };

  return { handled: false };
}

// ── Relay enqueue (called from kernel-client) ─────────────────────────────────
function enqueueForGuardian(jobId, provider, command, prompt) {
  return handleRelayEnqueue({ jobId, provider, command, prompt });
}

// ── init / stop ───────────────────────────────────────────────────────────────

function init(cfg = {}) {
  _startWatchdog();

  // FIX-2: reload pending relay jobs from JAA on restart.
  // Cortex may restart while Guardian has relay jobs in-flight.
  // guardian_relay table holds the persisted state — reload pending rows
  // into the in-memory _relay Map so Guardian's next poll picks them up.
  try {
    const pending = jaaDB.query(TABLES.GUARDIAN_RELAY, r => r.status === 'pending', 100);
    let reloaded = 0;
    for (const row of pending) {
      if (!_relay.has(row.jobId)) {
        _relay.set(row.jobId, {
          jobId:      row.jobId,
          provider:   row.provider,
          command:    row.command  || 'chat',
          prompt:     row.prompt   || '',
          enqueuedAt: row.ts,
          status:     'pending',
          _reloaded:  true,
        });
        reloaded++;
      }
    }
    if (reloaded > 0) {
      console.log(`[${MODULE_ID}] reloaded ${reloaded} pending relay job(s) from JAA`);
      wm.write('relay.reloaded', { count: reloaded }, { source: MODULE_ID });
    }
  } catch (e) {
    console.warn(`[${MODULE_ID}] relay reload failed: ${e.message}`);
  }

  wm.write('guardian.mind-bridge.started', { version: VERSION }, { source: MODULE_ID });
  jaaDB.insert(TABLES.EVENT_LOG, {
    uuid: uid(), type: 'guardian.mind-bridge.started', ts: Date.now(),
    payload: { version: VERSION },
    source: MODULE_ID, causedBy: null,
  });

  console.log(`[${MODULE_ID}] v${VERSION} ready`);
}

function stop() {
  if (_watchdog) { clearInterval(_watchdog); _watchdog = null; }
}

module.exports = {
  init, stop, dispatch, enqueueForGuardian,
  VERSION, MODULE_ID,
};
