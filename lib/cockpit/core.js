/**
 * forge-core.js — SISO bus + JAA browser store + Bayesian trust + SNR
 * ─────────────────────────────────────────────────────────────────────
 * UUID:    forge-core-0001-2026-0530-jamesbrooks
 * VERSION: 1.0.0
 * PORT:    depends on forge-ui (Idearium at :4800, Guardian at :7820)
 *
 * LAW I:  SISO bus is the only shared surface. No cross-module imports.
 * LAW II: JAA write before behavior. Every record has uuid.
 * LAW III: Trust is a running Beta inference. Never assigned.
 *
 * ZERO EXTERNAL DEPENDENCIES. Runs in browser (IndexedDB) or Node (JSONL).
 */

'use strict';

// ══════════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════════

const uid  = () => typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16);
    });

const ts   = () => Date.now();
const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(16).padStart(8, '0');
};

// ══════════════════════════════════════════════════════════════════════
// SISO KERNEL — Event / Gate / Stream
// ══════════════════════════════════════════════════════════════════════

class SISOEvent {
  constructor(type, payload = {}, meta = {}) {
    this.id        = uid();
    this.type      = type;
    this.payload   = payload;
    this.causedBy  = meta.causedBy  ?? null;
    this.source    = meta.source    ?? 'forge';
    this.ts        = ts();
    this.tick      = SISOKernel._tick++;
  }
}

class SISOGate {
  constructor(signature, matchFn, transformFn) {
    this.signature = signature;
    this._match    = matchFn;
    this._transform= transformFn;
  }
  matches(event)          { return this._match(event); }
  transform(event, stream){ return this._transform(event, stream); }
}

class SISOKernel {
  constructor({ log = false } = {}) {
    this._gates      = new Map();   // signature → SISOGate
    this._listeners  = new Map();   // type|* → Set<fn>
    this._queue      = [];
    this._processing = false;
    this._log        = log;
    this._history    = [];          // last 500 events
    this.tick        = 0;
  }

  // ── Register gate (O(1) dispatch) ────────────────────────────────
  gate(signature, matchFn, transformFn) {
    if (this._gates.has(signature)) throw new Error(`Gate collision: ${signature}`);
    this._gates.set(signature, new SISOGate(signature, matchFn, transformFn));
    return this;
  }

  // ── Subscribe to event type (* = all) ────────────────────────────
  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
    return () => this._listeners.get(type)?.delete(fn); // returns unsubscribe fn
  }

  // ── Emit event ───────────────────────────────────────────────────
  emit(type, payload = {}, meta = {}) {
    const event = new SISOEvent(type, payload, meta);
    this._enqueue(event);
    return event;
  }

  _enqueue(event) {
    this._queue.push(event);
    if (!this._processing) this._drain();
  }

  _drain() {
    this._processing = true;
    while (this._queue.length) {
      const event = this._queue.shift();
      this._dispatch(event);
    }
    this._processing = false;
  }

  _dispatch(event) {
    // Record
    this._history.push(event);
    if (this._history.length > 500) this._history.shift();
    if (this._log) console.log(`[SISO] #${event.tick} ${event.type}`, event.payload);

    // Gates (pattern match → transform, may re-emit)
    for (const gate of this._gates.values()) {
      if (gate.matches(event)) {
        try { gate.transform(event, this); } catch (e) {
          console.error(`[SISO] Gate ${gate.signature} error:`, e.message);
        }
      }
    }

    // Listeners (type-specific + wildcard)
    const subs = [
      ...(this._listeners.get(event.type) ?? []),
      ...(this._listeners.get('*') ?? []),
    ];
    for (const fn of subs) {
      try { fn(event); } catch (e) {
        console.error(`[SISO] Listener error on ${event.type}:`, e.message);
      }
    }
  }

  // ── Sample current state ─────────────────────────────────────────
  sample() {
    return {
      tick:      SISOKernel._tick,
      gates:     this._gates.size,
      listeners: [...this._listeners.entries()].map(([t, s]) => ({ type: t, count: s.size })),
      history:   this._history.slice(-20),
    };
  }
}

SISOKernel._tick = 0;

// ══════════════════════════════════════════════════════════════════════
// JAA — Browser IndexedDB + in-memory fallback
// ══════════════════════════════════════════════════════════════════════

const JAA_TABLES = [
  'ideas', 'specs', 'gaps', 'snapshots', 'links',
  'pipelines', 'pipeline_runs', 'pipeline_steps',
  'conditions', 'schedules', 'workflow_runs',
  'api_configs', 'webhooks', 'variables',
  'trust_scores', 'snr_records',
  'event_log', 'artifacts', 'memory_index',
  'tension_records', 'ci_runs', 'snr_samples',
  'forge_sessions', 'seam_chunks', 'seam_programs',
];

class JAAStore {
  constructor({ dbName = 'forge-jaa', version = 1 } = {}) {
    this._name    = dbName;
    this._version = version;
    this._db      = null;       // IDB instance
    this._mem     = new Map();  // table → row[]  (fallback + write-through cache)
    this._ready   = false;
    for (const t of JAA_TABLES) this._mem.set(t, []);
  }

  async open() {
    if (this._ready) return this;
    if (typeof indexedDB === 'undefined') {
      // Node / no IDB — pure memory mode
      this._ready = true;
      return this;
    }
    this._db = await new Promise((res, rej) => {
      const req = indexedDB.open(this._name, this._version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const t of JAA_TABLES) {
          if (!db.objectStoreNames.contains(t)) {
            db.createObjectStore(t, { keyPath: 'uuid' });
          }
        }
      };
      req.onsuccess = (e) => res(e.target.result);
      req.onerror   = (e) => rej(e.target.error);
    });
    // Load all tables into memory cache
    for (const t of JAA_TABLES) {
      const rows = await this._idbGetAll(t);
      this._mem.set(t, rows);
    }
    this._ready = true;
    return this;
  }

  async insert(table, record) {
    this._ensureTable(table);
    const row = { uuid: uid(), ts: ts(), ...record };
    this._mem.get(table).push(row);
    if (this._db) {
      await this._idbPut(table, row).catch(e => console.error('[JAA] insert error:', e));
    }
    return row;
  }

  async upsert(table, uuid, patch) {
    this._ensureTable(table);
    const rows = this._mem.get(table);
    const idx  = rows.findIndex(r => r.uuid === uuid);
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...patch, uuid, _updatedAt: ts() };
      if (this._db) await this._idbPut(table, rows[idx]).catch(() => {});
      return rows[idx];
    } else {
      return this.insert(table, { uuid, ...patch });
    }
  }

  async update(table, uuid, patch) {
    return this.upsert(table, uuid, patch);
  }

  get(table, uuid) {
    return this._mem.get(table)?.find(r => r.uuid === uuid) ?? null;
  }

  query(table, pred = () => true, limit = 500) {
    return (this._mem.get(table) ?? []).filter(pred).slice(-limit);
  }

  tail(table, n = 50) {
    const rows = this._mem.get(table) ?? [];
    return rows.slice(Math.max(0, rows.length - n));
  }

  count(table, pred = () => true) {
    return (this._mem.get(table) ?? []).filter(pred).length;
  }

  all(table) { return [...(this._mem.get(table) ?? [])]; }

  scan(table) { return this.all(table); }

  _ensureTable(t) {
    if (!this._mem.has(t)) this._mem.set(t, []);
  }

  // IDB helpers
  _idbPut(table, record) {
    return new Promise((res, rej) => {
      const tx  = this._db.transaction(table, 'readwrite');
      const req = tx.objectStore(table).put(record);
      req.onsuccess = () => res(record);
      req.onerror   = (e) => rej(e.target.error);
    });
  }

  _idbGetAll(table) {
    if (!this._db || !this._db.objectStoreNames.contains(table)) return Promise.resolve([]);
    return new Promise((res, rej) => {
      const tx  = this._db.transaction(table, 'readonly');
      const req = tx.objectStore(table).getAll();
      req.onsuccess = (e) => res(e.target.result ?? []);
      req.onerror   = (e) => rej(e.target.error);
    });
  }

  // Stats
  stats() {
    const out = {};
    for (const [t, rows] of this._mem) out[t] = rows.length;
    return out;
  }
}

// ══════════════════════════════════════════════════════════════════════
// BAYESIAN TRUST ENGINE — Beta(α,β) per source
// ══════════════════════════════════════════════════════════════════════

class TrustEngine {
  constructor(jaa) {
    this._jaa    = jaa;
    this._priors = new Map(); // sourceId → { alpha, beta }
    this.DECAY_HALFLIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  async restore() {
    const rows = this._jaa.scan('snr_records');
    rows.sort((a, b) => a.ts - b.ts);
    for (const row of rows) this._update(row.sourceId, row.passed);
  }

  // ── Record a gate evaluation ──────────────────────────────────────
  async record(sourceId, passed, eventData = {}) {
    const trust = this._update(sourceId, passed);
    await this._jaa.insert('snr_records', {
      sourceId, passed, posterior: trust.score,
      ...eventData,
    });
    await this._jaa.upsert('trust_scores', sourceId, {
      uuid:         sourceId,
      alpha:        trust.alpha,
      beta:         trust.beta,
      score:        trust.score,
      variance:     trust.variance,
      confidence_n: trust.confidence_n,
      wilsonLower:  this.wilsonLower(trust.score, trust.confidence_n),
      updatedAt:    ts(),
    });
    return trust;
  }

  _update(sourceId, passed) {
    if (!this._priors.has(sourceId)) this._priors.set(sourceId, { alpha: 1, beta: 1 });
    const p = this._priors.get(sourceId);
    if (passed) p.alpha += 1;
    else        p.beta  += 1;
    const n        = p.alpha + p.beta;
    const score    = p.alpha / n;
    const variance = (p.alpha * p.beta) / (n * n * (n + 1));
    return { score, variance, confidence_n: n, alpha: p.alpha, beta: p.beta };
  }

  // Wilson score lower bound (conservative estimate)
  wilsonLower(p, n, z = 1.96) {
    if (n === 0) return 0;
    const z2 = z * z;
    return (p + z2/(2*n) - z * Math.sqrt((p*(1-p) + z2/(4*n)) / n)) / (1 + z2/n);
  }

  // Routing weight (accounts for score + confidence + decay)
  weight(sourceId, lastUpdateTs) {
    const row = this._jaa.get('trust_scores', sourceId);
    if (!row) return 0.2; // cold start
    const age      = Date.now() - (lastUpdateTs ?? row.updatedAt ?? 0);
    const decayFactor = Math.exp(-age / this.DECAY_HALFLIFE_MS);
    const effN     = row.confidence_n * decayFactor;
    const wl       = this.wilsonLower(row.score, Math.max(1, effN));
    if (wl >= 0.80) return 1.2;
    if (wl >= 0.60) return 1.0;
    if (wl >= 0.35) return 0.6;
    return 0.2;
  }

  // Trust band label
  band(score) {
    if (score >= 0.80) return 'HIGH';
    if (score >= 0.60) return 'TRUSTED';
    if (score >= 0.35) return 'PROVISIONAL';
    return 'LOW';
  }

  all() {
    return this._jaa.scan('trust_scores').sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
}

// ══════════════════════════════════════════════════════════════════════
// IDEARIUM CLIENT — talks to :4800
// ══════════════════════════════════════════════════════════════════════

class IdeiarumClient {
  constructor({ host = '127.0.0.1', port = 4800, token = '' } = {}) {
    this.base  = `http://${host}:${port}`;
    this.token = token;
    this._sse  = null;
    this._sseHandlers = new Map();
  }

  async _req(path, method = 'GET', body = null, timeout = 10000) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    try {
      const res = await fetch(`${this.base}${path}`, {
        method, headers, signal: ctrl.signal,
        body: body ? JSON.stringify(body) : undefined,
      });
      clearTimeout(timer);
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  // ── Ideas ────────────────────────────────────────────────────────
  async ideas(opts = {})          { return this._req('/api/ideas?' + new URLSearchParams(opts)); }
  async createIdea(data)          { return this._req('/api/ideas', 'POST', data); }
  async updateIdea(uuid, patch)   { return this._req(`/api/ideas/${uuid}`, 'PATCH', patch); }
  async linkIdeas(a, b, type)     { return this._req(`/api/ideas/${a}/link`, 'POST', { targetUuid: b, type }); }

  // ── Specs ────────────────────────────────────────────────────────
  async specs()                   { return this._req('/api/specs'); }
  async getSpec(uuid)             { return this._req(`/api/specs/${uuid}`); }
  async updateSpec(uuid, patch)   { return this._req(`/api/specs/${uuid}`, 'PATCH', patch); }
  async runCI(uuid)               { return this._req(`/api/specs/${uuid}/build`, 'POST'); }

  // ── Gaps ─────────────────────────────────────────────────────────
  async gaps(opts = {})           { return this._req('/api/gaps?' + new URLSearchParams(opts)); }
  async createGap(data)           { return this._req('/api/gaps', 'POST', data); }
  async resolveGap(uuid, res)     { return this._req(`/api/gaps/${uuid}/resolve`, 'POST', { resolution: res }); }

  // ── Snapshots ────────────────────────────────────────────────────
  async snapshots()               { return this._req('/api/snapshots'); }
  async snapshot(msg, causedBy)   { return this._req('/api/snapshots', 'POST', { message: msg, causedBy }); }

  // ── Agents / Guardian dispatch ───────────────────────────────────
  async dispatch(provider, prompt){ return this._req('/api/agents/dispatch', 'POST', { provider, prompt }); }
  async agents()                  { return this._req('/api/agents'); }

  // ── SNR ──────────────────────────────────────────────────────────
  async snr()                     { return this._req('/api/snr'); }

  // ── SSE stream ───────────────────────────────────────────────────
  subscribeSSE(onEvent) {
    if (typeof EventSource === 'undefined') return;
    this._sse = new EventSource(`${this.base}/sse`);
    this._sse.onmessage = (e) => {
      try { onEvent(JSON.parse(e.data)); } catch (_) {}
    };
    this._sse.onerror = () => {};
    return () => this._sse?.close();
  }

  async health() {
    try { return await this._req('/health'); }
    catch (_) { return null; }
  }

  async isOnline() {
    try { await this._req('/health', 'GET', null, 2000); return true; }
    catch (_) { return false; }
  }
}

// ══════════════════════════════════════════════════════════════════════
// GUARDIAN CLIENT — talks to :7820
// ══════════════════════════════════════════════════════════════════════

class GuardianClient {
  constructor({ host = '127.0.0.1', port = 7820, token = '' } = {}) {
    this.base     = `http://${host}:${port}`;
    this.token    = token;
    this.pollMs   = 600;
    this.pollMax  = 150;
    this.timeoutMs= 90_000;
  }

  async _req(path, method = 'GET', body = null, timeout = 10_000) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['X-Guardian-Token'] = this.token;
    try {
      const res = await fetch(`${this.base}${path}`, {
        method, headers, signal: ctrl.signal,
        body: body ? JSON.stringify(body) : undefined,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Guardian ${method} ${path} → ${res.status}`);
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  async health()     { return this._req('/health'); }
  async providers()  { return this._req('/providers'); }
  async jobs(opts={})  {
    const qs = new URLSearchParams(opts).toString();
    return this._req(`/jobs${qs ? '?' + qs : ''}`);
  }

  async dispatch(provider, prompt, opts = {}) {
    const { command = 'code', onChunk } = opts;
    const created = await this._req('/command', 'POST', { provider, prompt, command });
    if (!created.ok) throw new Error(`Guardian: ${JSON.stringify(created)}`);
    const jobId = created.jobId;

    // SSE streaming if available
    let sse = null;
    if (typeof onChunk === 'function' && typeof EventSource !== 'undefined') {
      try {
        sse = new EventSource(`${this.base}/stream/${jobId}`);
        sse.onmessage = (e) => {
          try { const d = JSON.parse(e.data); if (d.chunk) onChunk(d.chunk, jobId); } catch (_) {}
        };
        sse.onerror = () => sse.close();
      } catch (_) {}
    }

    const deadline = Date.now() + this.timeoutMs;
    let polls = 0;
    while (Date.now() < deadline && polls < this.pollMax) {
      await _sleep(this.pollMs);
      polls++;
      const st = await this._req(`/status/${jobId}`).catch(() => null);
      if (!st) continue;
      if (st.complete || st.status === 'complete' || st.status === 'done') {
        sse?.close();
        const resp = await this._req(`/response/${jobId}`);
        return resp.response || resp.text || resp.content || '';
      }
      if (st.status === 'error' || st.status === 'failed') {
        sse?.close();
        throw new Error(`Guardian job ${jobId} failed: ${st.error}`);
      }
    }
    sse?.close();
    throw new Error(`Guardian timeout: job ${jobId}`);
  }

  async isOnline() {
    try { await this._req('/health', 'GET', null, 2000); return true; }
    catch (_) { return false; }
  }

  // Artifacts, gaps, ledger, sessions, memory
  async artifacts(opts={}) { return this._req('/artifacts?' + new URLSearchParams(opts)); }
  async gaps(opts={})      { return this._req('/gaps?' + new URLSearchParams(opts)); }
  async ledger(opts={})    { return this._req('/ledger?' + new URLSearchParams(opts)); }
  async sessions(opts={})  { return this._req('/sessions?' + new URLSearchParams(opts)); }
  async memoryQuery(q)     { return this._req(`/memory/query?q=${encodeURIComponent(q)}`); }
}

const _sleep = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SISOKernel, SISOEvent, SISOGate, JAAStore, TrustEngine, IdeiarumClient, GuardianClient, uid, ts, hash, JAA_TABLES };
} else if (typeof window !== 'undefined') {
  Object.assign(window, { SISOKernel, SISOEvent, SISOGate, JAAStore, TrustEngine, IdeiarumClient, GuardianClient, uid, ts, hash, JAA_TABLES });
}
