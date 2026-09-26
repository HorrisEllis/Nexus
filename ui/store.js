/**
 * ui/store.js — NEXUS Reactive State Store
 * UUID: nexus-ui-store-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * In-memory reactive state. SSE feeds in. UI reads out.
 * Nothing in the UI talks to the API directly — it goes through here.
 *
 * Architecture:
 *   SSE (cortex + guardian + orchestrator) → store.ingest()
 *   UI panels → store.get*() + store.on(event, handler)
 *   User actions → API → store.refresh*()
 *
 * §1.2  Nothing silently fails.
 * §2.1  Cortex is the memory. Store is a live projection of it.
 * §5.1  Every entity has a UUID.
 */

'use strict';

// Lazy getters — resolved at call time, not parse time.
// store.js is parsed before api.js finishes setting window.NX_API,
// so top-level const API = window.NX_API would be undefined.
function _C()  { return (typeof window !== 'undefined' ? window.NX     : require('./contracts')); }
function _API() { return (typeof window !== 'undefined' ? window.NX_API : require('./api')); }

// ── Event bus (internal) ──────────────────────────────────────────────────────

const _listeners = new Map();  // event → Set<handler>

function on(event, handler) {
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event).add(handler);
  return () => _listeners.get(event)?.delete(handler);  // unsubscribe fn
}

function emit(event, data) {
  // STO-05: §1.2 — nothing silently fails; log handler errors to console
  _listeners.get(event)?.forEach(h => {
    try { h(data); }
    catch(e) { console.error('[store] handler error on event', event, e); }
  });
  _listeners.get('*')?.forEach(h => {
    try { h({ event, data }); }
    catch(e) { console.error('[store] wildcard handler error on event', event, e); }
  });
}

// ── Ring buffer ───────────────────────────────────────────────────────────────

class Ring {
  constructor(max) { this._max = max; this._buf = []; }
  push(item) {
    this._buf.push(item);
    if (this._buf.length > this._max) this._buf.shift();
  }
  all()    { return [...this._buf]; }
  last(n)  { return this._buf.slice(-n); }
  clear()  { this._buf = []; }
  get size(){ return this._buf.length; }
}

// ── State ─────────────────────────────────────────────────────────────────────

const STATE = {
  // System health — keyed by system name
  health: {
    orchestrator: { online: false, ms: null, checkedAt: 0 },
    cortex:       { online: false, ms: null, checkedAt: 0 },
    guardian:     { online: false, ms: null, checkedAt: 0 },
    idearium:     { online: false, ms: null, checkedAt: 0 },
    emerge:       { online: false, ms: null, checkedAt: 0 },
    ollama:       { online: false, ms: null, checkedAt: 0 },
  },

  // SSE connection state
  sse: {
    cortex:    { connected: false, retries: 0 },
    guardian:  { connected: false, retries: 0 },
    orchestrator: { connected: false, retries: 0 },
  },

  // Pulse state — liveness signals separate from health poll
  pulse: {
    orchestrator: { seq: 0, latency: null, lastBeat: 0, online: false },
    ncp:          {},  // keyed by provider:tabId → { seq, latency, lastBeat }
  },

  // Latency rings — per-system rolling latency (last 20 beats)
  // Populated by orchestrator.pulse SSE events
  latency: {
    orchestrator: [],
    cortex:       [],
    guardian:     [],
    idearium:     [],
    emerge:       [],
    ollama:       [],
  },

  // Guardian provider state (NCP channels)
  providers: {
    claude:   { connected: false, tabId: null, connectedAt: null },
    chatgpt:  { connected: false, tabId: null, connectedAt: null },
    ollama:   { connected: false, tabId: null, connectedAt: null },
    gemini:   { connected: false, tabId: null, connectedAt: null },
  },

  // Active provider for dispatch
  activeProvider: 'ollama',

  // Job ring — last 200 guardian jobs
  jobs: new Ring(200),

  // SEAM queue state — active queues keyed by queueId
  seamQueues: new Map(),

  // Event log ring — last 1000 cortex events
  eventLog: new Ring(1000),

  // Gaps — open gaps from cortex + guardian
  gaps: {
    cortex:   [],
    guardian: [],
  },

  // Idearium — ideas on disc + in cortex
  ideas: {
    list:      [],       // full list from /api/ideas
    byUuid:    new Map(),
    loadedAt:  0,
    dirty:     false,
  },
  specs: {
    list:      [],
    loadedAt:  0,
  },

  // Artifacts from guardian
  artifacts: {
    list:      [],
    loadedAt:  0,
  },

  // Cortex entropy (0..1) — derived from gap density
  entropy: 0.0,

  // CFR field state
  cfr: {
    structure: 0.5,
    entropy:   0.2,
    attention: 0.5,
    damping:   0.12,
    regime:    'laminar',
    nodes:     [],
    deltas:    new Ring(50),
  },

  // UI — active tab, per-tab state
  tab:        'home',
  tabState:   {},       // per-tab saved state

  // Config — from localStorage
  config: {},

  // Boot state
  booted: false,
};

// ── SSE channels ──────────────────────────────────────────────────────────────

let _sseOrc, _sseCortex, _sseGuardian;

function startSSE() {
  // Orchestrator SSE
  _sseOrc = new (_API().SSEChannel)(_C().ORCH.sse, {
    onOpen:  () => { STATE.sse.orchestrator.connected = true; emit('sse.orchestrator.open'); },
    onError: () => { STATE.sse.orchestrator.connected = false; emit('sse.orchestrator.error'); },
    onEvent: (d) => _ingestOrc(d),
  });
  _sseOrc.open();

  // Cortex SSE — pushes event_log rows in real time
  _sseCortex = new (_API().SSEChannel)(_C().CORTEX.sse, {
    onOpen:  () => { STATE.sse.cortex.connected = true; emit('sse.cortex.open'); },
    onError: () => { STATE.sse.cortex.connected = false; emit('sse.cortex.error'); },
    onEvent: (d) => _ingestCortex(d),
  });
  _sseCortex.open();

  // Guardian SSE — live job events
  _sseGuardian = new (_API().SSEChannel)(_C().GUARDIAN.events, {
    onOpen:  () => { STATE.sse.guardian.connected = true; emit('sse.guardian.open'); },
    onError: () => { STATE.sse.guardian.connected = false; emit('sse.guardian.error'); },
    onEvent: (d) => _ingestGuardian(d),
  });
  _sseGuardian.open();
}

function stopSSE() {
  _sseOrc?.close();
  _sseCortex?.close();
  _sseGuardian?.close();
}

// ── Orchestrator pulse ────────────────────────────────────────────────────────

let _orchPulseHandle = null;

/**
 * _startOrchestratorPulse — begin sending heartbeats to the orchestrator.
 * Updates STATE.pulse.orchestrator and feeds health data back in real time
 * (as a fallback if the SSE orchestrator.pulse event isn't firing).
 */
function _startOrchestratorPulse() {
  // If NX_PULSE is available (ui/pulse.js loaded), use it
  const PULSE = (typeof window !== 'undefined' ? window.NX_PULSE : null);
  if (!PULSE) {
    // Fallback: simple interval that just POSTs to /api/heartbeat
    let _seq = 0;
    const _t = setInterval(async () => {
      _seq++;
      const sentAt = Date.now();
      try {
        const r = await _API().post(_C().ORCH.heartbeat, {
          systemId: 'nexus-ui',
          port:     0,
          status:   'online',
          seq:      _seq,
          ts:       sentAt,
        }, { timeoutMs: 3000 });
        const latency = Date.now() - sentAt;
        STATE.pulse.orchestrator = { seq: _seq, latency, lastBeat: Date.now(), online: true };
        // Update health from response snapshot
        if (r.ok && r.data?.systems) {
          const now = Date.now();
          for (const [sys, info] of Object.entries(r.data.systems)) {
            if (STATE.health[sys] !== undefined) {
              STATE.health[sys] = { ...STATE.health[sys], online: info.online, ms: info.ms ?? STATE.health[sys].ms, checkedAt: now };
            }
          }
          emit('health.changed', STATE.health);
          emit('pulse.received', { source: 'orchestrator', seq: _seq, latency, systems: r.data.systems, ts: now });
        }
      } catch (_) {
        STATE.pulse.orchestrator.online = false;
      }
    }, 10000);
    _orchPulseHandle = { stop: () => clearInterval(_t) };
    return;
  }

  // Full pulse system available
  _orchPulseHandle = PULSE.createOrchestratorPulse({
    source:     'nexus-ui',
    intervalMs: 10000,
    onBeat: ({ latency, seq, systems }) => {
      STATE.pulse.orchestrator = { seq, latency, lastBeat: Date.now(), online: true };
      emit('pulse.received', { source: 'orchestrator', seq, latency, systems, ts: Date.now() });
    },
    onMiss: ({ seq, missed }) => {
      emit('pulse.missed', { source: 'orchestrator', seq, missed });
    },
    onOnline:  () => emit('sse.orchestrator.open'),
    onOffline: () => {
      STATE.pulse.orchestrator.online = false;
      emit('sse.orchestrator.error');
    },
  });
}

function stopPulse() {
  _orchPulseHandle?.stop();
  _orchPulseHandle = null;
}

// ── Ingest — SSE event routers ────────────────────────────────────────────────

function _ingestOrc(d) {
  emit('log', { source: 'orchestrator', ...d });
  emit('sse.event', d);

  // orchestrator.pulse — live health snapshot pushed on every heartbeat beat
  if (d.type === 'orchestrator.pulse') {
    const now = Date.now();
    // Update pulse state
    STATE.pulse.orchestrator = {
      seq:      d.seq || 0,
      lastBeat: now,
      online:   true,
    };
    // Update health from snapshot — real-time, not waiting for 8s poll
    if (d.systems) {
      for (const [sys, info] of Object.entries(d.systems)) {
        if (STATE.health[sys] !== undefined) {
          STATE.health[sys] = {
            ...STATE.health[sys],
            online:    info.online,
            ms:        info.ms ?? STATE.health[sys].ms,
            checkedAt: now,
          };
        }
        // Update latency ring
        if (info.ms != null && STATE.latency[sys]) {
          STATE.latency[sys] = [...STATE.latency[sys].slice(-19), info.ms];
        }
      }
      emit('health.changed', STATE.health);
      emit('pulse.received', { source: 'orchestrator', seq: d.seq, systems: d.systems, ts: now });
    }
  }

  // orchestrator.watchdog.tick — also carries system health
  if (d.type === 'orchestrator.watchdog.tick' && d.systems) {
    const now = Date.now();
    for (const [sys, info] of Object.entries(d.systems)) {
      if (STATE.health[sys] !== undefined) {
        STATE.health[sys] = {
          ...STATE.health[sys],
          online:    info.online,
          ms:        info.ms ?? STATE.health[sys].ms,
          checkedAt: now,
        };
      }
    }
    emit('health.changed', STATE.health);
  }
}

function _ingestCortex(row) {
  // Cortex SSE pushes raw event_log rows
  STATE.eventLog.push(row);
  emit('eventlog.push', row);
  emit('log', { source: 'cortex', ...row });

  const t = row.type || '';

  if (t === 'cortex.gap.found' || t.startsWith('gap.')) {
    refreshGaps('cortex');
  }
  if (t === 'cortex.memory.updated') {
    emit('cortex.memory.updated', row);
  }

  // Entropy — derived from gap velocity (gaps per 10 events)
  const recentGaps = STATE.eventLog.last(10).filter(e =>
    (e.type || '').includes('gap') || (e.type || '').includes('fail')).length;
  STATE.entropy = Math.min(1, recentGaps / 10);
  STATE.cfr.entropy = STATE.entropy;
  emit('entropy.changed', STATE.entropy);
}

function _ingestGuardian(d) {
  emit('log', { source: 'guardian', ...d });
  emit('sse.event', d);

  const t = d.type || '';

  if (t === 'guardian.provider.connected') {
    const p = d.provider || d.data?.provider;
    if (p) {  // STO-06: allow providers not pre-declared in STATE
      STATE.providers[p] = { connected: true, tabId: d.tabId || d.data?.tabId, connectedAt: Date.now() };
      emit('providers.changed', STATE.providers);
    }
  }

  if (t === 'guardian.provider.disconnected') {
    const p = d.provider || d.data?.provider;
    if (p) {  // STO-06
      STATE.providers[p] = { connected: false, tabId: null, connectedAt: null };
      emit('providers.changed', STATE.providers);
    }
  }

  if (t === 'guardian.job.queued' || t === 'guardian.job.dispatched' ||
      t === 'guardian.job.complete' || t === 'guardian.artifact') {
    refreshJobs();
  }

  if (t === 'guardian.gaps') {
    refreshGaps('guardian');
  }

  if (t === 'guardian.seam.queue.complete' || t.includes('seam')) {
    refreshSeamQueues();
  }
}

// ── Refresh functions — pull from APIs into state ─────────────────────────────

async function refreshHealth() {
  // STO-02: t0 is shared across all systems (they run in parallel via healthAll).
  // ms reflects time-from-call, not per-system latency — acceptable for health display.
  const t0 = Date.now();
  const all = await _API().healthAll();
  for (const [sys, result] of Object.entries(all)) {
    const ms = Date.now() - t0;
    STATE.health[sys] = {
      online:    result.ok,
      ms:        result.ok ? ms : null,
      data:      result.data,
      checkedAt: Date.now(),
    };
  }
  emit('health.changed', STATE.health);
  return STATE.health;
}

async function refreshProviders() {
  const r = await _API().get(_C().GUARDIAN.providers, { timeoutMs: _C().TIMEOUTS.health });
  if (!r.ok) return;
  const connected = r.data?.providers || {};
  for (const [p, status] of Object.entries(connected)) {
    // STO-06: allow dynamic providers — don't gate on pre-declared keys
    STATE.providers[p] = {
      connected:   status === 'connected',
      tabId:       r.data?.channels?.[p] || null,
      connectedAt: status === 'connected' ? Date.now() : null,
    };
  }
  emit('providers.changed', STATE.providers);
}

async function refreshJobs() {
  const r = await _API().get(`${_C().GUARDIAN.jobs}?limit=100`, { timeoutMs: _C().TIMEOUTS.read });
  if (!r.ok) return;
  const jobs = r.data?.jobs || r.data || [];
  // STO-03: Merge into ring (deduplicate by id).
  // Push in ascending order (oldest first) so Ring.last(n) returns newest n,
  // and Ring.all() returns oldest-first — consistent with Ring semantics.
  const existing = new Map(STATE.jobs.all().map(j => [j.id, j]));
  for (const j of jobs) existing.set(j.id, j);
  STATE.jobs.clear();
  [...existing.values()]
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))  // ascending: oldest first
    .slice(-200)
    .forEach(j => STATE.jobs.push(j));
  emit('jobs.changed', STATE.jobs.all());
}

async function refreshGaps(source = 'cortex') {
  if (source === 'cortex') {
    const r = await _API().cortexGaps('open');
    if (r.ok) {
      STATE.gaps.cortex = r.data?.gaps || r.data?.rows || r.data || []; // STO-11: cortex returns {rows:[...]}
      emit('gaps.changed', STATE.gaps);
    }
  } else {
    const r = await _API().get(`${_C().GUARDIAN.gaps}?status=open`, { timeoutMs: _C().TIMEOUTS.read });
    if (r.ok) {
      STATE.gaps.guardian = r.data?.gaps || [];
      emit('gaps.changed', STATE.gaps);
    }
  }
}

async function refreshIdeas(params = {}) {
  const r = await _API().listIdeas(params);
  if (!r.ok) return;
  const ideas = r.data?.ideas || r.data || [];
  STATE.ideas.list = ideas;
  STATE.ideas.byUuid = new Map(ideas.map(i => [i.uuid, i]));
  STATE.ideas.loadedAt = Date.now();
  emit('ideas.changed', STATE.ideas.list);
}

async function refreshSpecs() {
  const r = await _API().get(_C().IDEARIUM.specs.list, { timeoutMs: _C().TIMEOUTS.read });
  if (!r.ok) return;
  STATE.specs.list = r.data?.specs || r.data || [];
  STATE.specs.loadedAt = Date.now();
  emit('specs.changed', STATE.specs.list);
}

async function refreshArtifacts() {
  const r = await _API().get(`${_C().GUARDIAN.artifacts}?limit=100`, { timeoutMs: _C().TIMEOUTS.read });
  if (!r.ok) return;
  STATE.artifacts.list = r.data?.artifacts || r.data || [];
  STATE.artifacts.loadedAt = Date.now();
  emit('artifacts.changed', STATE.artifacts.list);
}

async function refreshSeamQueues() {
  const r = await _API().get(_C().GUARDIAN.seam.queues, { timeoutMs: _C().TIMEOUTS.read });
  if (!r.ok) return;
  const queues = r.data?.queues || [];
  STATE.seamQueues.clear();
  queues.forEach(q => STATE.seamQueues.set(q.uuid, q));
  emit('seam.changed', [...STATE.seamQueues.values()]);
}

async function refreshEventLog(n = 100) {
  const r = await _API().cortexEvents(n);
  if (!r.ok) return;
  const events = r.data?.events || r.data || [];
  // STO-04: deduplication — don't re-push events already in the ring
  const existing = new Set(STATE.eventLog.all().map(e => (e.uuid || '') + ':' + (e.ts || '') + ':' + (e.type || '')));
  for (const e of events.slice(-n)) {
    const key = (e.uuid || '') + ':' + (e.ts || '') + ':' + (e.type || '');
    if (!existing.has(key)) {
      existing.add(key);
      STATE.eventLog.push(e);
    }
  }
  emit('eventlog.bulk', STATE.eventLog.all());
}

// ── Config ────────────────────────────────────────────────────────────────────

function loadConfig() {
  // STO-08: guard for non-browser environments (Node.js testing)
  if (typeof localStorage === 'undefined') { STATE.config = {}; return; }
  try {
    STATE.config = JSON.parse(localStorage.getItem('nx_config') || '{}');
    STATE.activeProvider = STATE.config.provider || 'ollama';
  } catch(e) {
    console.warn('[store] loadConfig failed:', e.message);
    STATE.config = {};
  }
}

function saveConfig(patch = {}) {
  STATE.config = { ...STATE.config, ...patch };
  if (patch.provider) STATE.activeProvider = patch.provider;
  try {
    localStorage.setItem('nx_config', JSON.stringify(STATE.config));
  } catch {}
  emit('config.changed', STATE.config);
}

// ── Boot sequence ─────────────────────────────────────────────────────────────

/**
 * boot — run health checks, start SSE, load initial state.
 * Returns array of boot step results for the boot overlay.
 */
async function boot(onStep) {
  loadConfig();

  const steps = [
    { id: 'lock',      label: 'SINGLE INSTANCE LOCK',   fn: async () => 'ACQUIRED' },
    { id: 'cfr',       label: 'CRASH LOGGER',            fn: async () => 'READY' },
    { id: 'orch',      label: 'ORCHESTRATOR :9000',      fn: () => _API().health('orchestrator').then(r => r.ok ? 'ONLINE' : null) },
    { id: 'cortex',    label: 'CORTEX :3748',            fn: () => _API().health('cortex').then(r => r.ok ? 'ONLINE' : null) },
    { id: 'guardian',  label: 'GUARDIAN :7820',          fn: () => _API().health('guardian').then(r => r.ok ? 'ONLINE' : null) },
    { id: 'idearium',  label: 'IDEARIUM :4800',          fn: () => _API().health('idearium').then(r => r.ok ? 'ONLINE' : null) },
    { id: 'ollama',    label: 'OLLAMA :11434',           fn: () => _API().health('ollama').then(r => r.ok ? 'ONLINE' : null) },
  ];

  const results = [];
  for (const step of steps) {
    onStep?.({ id: step.id, status: 'running', label: step.label });
    try {
      const status = await step.fn();
      const r = { id: step.id, label: step.label, ok: !!status, status: status || 'OFFLINE' };
      results.push(r);
      onStep?.(r);
    } catch (err) {
      const r = { id: step.id, label: step.label, ok: false, status: 'ERROR', error: err.message };
      results.push(r);
      onStep?.(r);
    }
    await _API().sleep(160);
  }

  // Start SSE after boot
  startSSE();

  // Start orchestrator pulse — sends heartbeats, receives real-time health snapshots
  // This is separate from SSE subscription: pulse is active (push), SSE is passive (receive)
  _startOrchestratorPulse();

  // Load initial state in background
  Promise.allSettled([
    refreshHealth(),
    refreshProviders(),
    refreshJobs(),
    refreshGaps('cortex'),
    refreshGaps('guardian'),
    refreshIdeas(),
    refreshEventLog(50),
    refreshArtifacts(),
    refreshSeamQueues(),
  ]).catch(() => {});

  // STO-09: guard against overlapping health polls
  let _refreshHealthRunning = false;
  const _guardedRefreshHealth = async () => {
    if (_refreshHealthRunning) return;
    _refreshHealthRunning = true;
    try { await refreshHealth(); } finally { _refreshHealthRunning = false; }
  };
  setInterval(_guardedRefreshHealth, 8000);
  setInterval(refreshProviders, 5000);

  STATE.booted = true;
  emit('booted', results);
  return results;
}

// ── Export ────────────────────────────────────────────────────────────────────

const STORE = {
  // State (read-only externally — mutate only via refresh/action)
  STATE,

  // Event bus
  on, emit,

  // SSE
  startSSE, stopSSE,

  // Pulse
  stopPulse,

  // Refresh
  refreshHealth, refreshProviders, refreshJobs,
  refreshGaps, refreshIdeas, refreshSpecs,
  refreshArtifacts, refreshSeamQueues, refreshEventLog,

  // Config
  loadConfig, saveConfig,

  // Boot
  boot,

  // Getters
  getHealth:    () => STATE.health,
  getJobs:      () => STATE.jobs.all(),
  getGaps:      () => [...STATE.gaps.cortex, ...STATE.gaps.guardian],
  getIdeas:     () => STATE.ideas.list,
  getSpecs:     () => STATE.specs.list,
  getArtifacts: () => STATE.artifacts.list,
  getSeam:      () => [...STATE.seamQueues.values()],
  getLog:       (n) => n ? STATE.eventLog.last(n) : STATE.eventLog.all(),
  getProviders: () => STATE.providers,
  getEntropy:   () => STATE.entropy,
  getCFR:       () => STATE.cfr,
  getProvider:  () => STATE.activeProvider,
  getPulse:     () => STATE.pulse,
  getLatency:   (sys) => sys ? STATE.latency[sys] || [] : STATE.latency,
  getConfig:    () => STATE.config,
};

if (typeof window !== 'undefined') window.NX_STORE = STORE;
if (typeof module !== 'undefined' && module.exports) module.exports = STORE;
