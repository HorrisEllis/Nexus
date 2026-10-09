// ARCHIVED 0.54.0 (docs/2026-10-09-one-roadmap-phasemap.spec OR6) — an older copy of ui/pulse.js (232 vs 287 lines); nothing loads it. James: "make sure to clean up old code that isnt needed anymore". Was ui/ui-pulse.js.
/**
 * ui/pulse.js — NEXUS Browser Pulse System  v1.0.0
 * UUID: nexus-ui-pulse-v1-0000-4000-0000-000000000001
 *
 * Browser-side pulse. Two independent heartbeats:
 *
 *   1. ORCHESTRATOR PULSE — any NEXUS UI page → POST /api/heartbeat :9000
 *      Tells the orchestrator the UI is alive and receiving events.
 *      Receives back: full system health snapshot.
 *      Drives health dots in real time without waiting for the 8s store poll.
 *
 *   2. NCP PULSE — provider tab (claude.ai, chatgpt.com) → POST /heartbeat :7820
 *      Keeps the NCP channel alive so Guardian knows the tab is still there.
 *      Receives back: latency measurement.
 *      Guardian evicts stale provider tabs after missed beats.
 *
 * Both are opt-in. The orchestrator pulse is started by the store on boot.
 * The NCP pulse is started by the Tampermonkey userscript when it opens a channel.
 *
 * §1.2  Nothing silently fails — missed beats update STATE, emit events.
 * §5.1  Each beat carries a pulseId UUID for end-to-end tracing.
 */

'use strict';

// Lazy resolvers (same pattern as store.js)
function _C()    { return (typeof window !== 'undefined' ? window.NX     : require('./contracts')); }
function _STORE(){ return (typeof window !== 'undefined' ? window.NX_STORE: null); }

// ── Inline ring (no deps) ─────────────────────────────────────────────────────
class _Ring {
  constructor(max) { this._max = max; this._buf = []; }
  push(v) { this._buf.push(v); if (this._buf.length > this._max) this._buf.shift(); }
  last(n)  { return this._buf.slice(-n); }
  avg()    {
    if (!this._buf.length) return null;
    return Math.round(this._buf.reduce((a,b)=>a+b,0) / this._buf.length);
  }
  p95() {
    if (!this._buf.length) return null;
    const s = [...this._buf].sort((a,b)=>a-b);
    return s[Math.floor(s.length * 0.95)];
  }
}

// ── Orchestrator pulse ────────────────────────────────────────────────────────

/**
 * createOrchestratorPulse — UI page sends heartbeat to orchestrator.
 *
 * @param {object} opts
 * @param {string}   [opts.source]        — identifier for this UI page, e.g. 'nexus-chat'
 * @param {string}   [opts.orchUrl]       — default from contracts ORCH.heartbeat
 * @param {number}   [opts.intervalMs]    — default 10000
 * @param {function} [opts.onBeat]        — called with { latency, systems, seq }
 * @param {function} [opts.onMiss]        — called when orchestrator doesn't respond
 * @param {function} [opts.onOnline]      — orchestrator came back
 * @param {function} [opts.onOffline]     — orchestrator stopped responding
 */
function createOrchestratorPulse({
  source      = 'nexus-ui',
  orchUrl,
  intervalMs  = 10000,
  missLimit   = 3,        // beats before declaring offline
  onBeat, onMiss, onOnline, onOffline,
} = {}) {
  const _latency   = new _Ring(30);
  let _seq         = 0;
  let _missed      = 0;
  let _wasOnline   = true;
  let _timer       = null;
  let _stopped     = false;

  function _url() {
    return orchUrl || _C().ORCH.heartbeat;
  }

  async function _beat() {
    if (_stopped) return;
    _seq++;
    const seq    = _seq;
    const sentAt = Date.now();
    const pulseId = crypto.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2));

    try {
      const r = await fetch(_url(), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          systemId: source,
          port:     0,         // UI has no port
          status:   'online',
          seq,
          pulseId,
          ts:       sentAt,
          meta:     { userAgent: navigator?.userAgent?.slice(0, 80), tab: source },
        }),
        signal: AbortSignal.timeout(3000),
      });

      const data    = await r.json().catch(() => ({}));
      const latency = Date.now() - sentAt;
      _latency.push(latency);
      _missed = 0;

      // Transition: offline → online
      if (!_wasOnline) {
        _wasOnline = true;
        onOnline?.({ latency, seq, ts: Date.now() });
      }

      // Feed health data into store if available
      const store = _STORE();
      if (store && data.systems) {
        // orchestrator heartbeat ACK includes current system health snapshot
        for (const [sys, info] of Object.entries(data.systems || {})) {
          if (store.STATE.health[sys] !== undefined) {
            store.STATE.health[sys] = {
              ...store.STATE.health[sys],
              online:    info.online,
              ms:        info.ms ?? store.STATE.health[sys].ms,
              checkedAt: Date.now(),
            };
          }
        }
        store.emit('health.changed', store.STATE.health);
      }

      onBeat?.({ latency, seq, ts: Date.now(), pulseId, systems: data.systems });

    } catch(e) {
      _missed++;
      const isAbort = e.name === 'AbortError' || e.name === 'TimeoutError';
      if (_wasOnline && _missed >= missLimit) {
        _wasOnline = false;
        onOffline?.({ missed: _missed, seq, ts: Date.now(), error: e.message });

        // Mark orchestrator offline in store
        const store = _STORE();
        if (store) {
          store.STATE.health.orchestrator = {
            ...store.STATE.health.orchestrator,
            online: false,
            checkedAt: Date.now(),
          };
          store.emit('health.changed', store.STATE.health);
        }
      }
      onMiss?.({ seq, missed: _missed, error: isAbort ? 'timeout' : e.message });
    }
  }

  // Start
  _beat(); // immediate
  _timer = setInterval(_beat, intervalMs);

  return {
    stop()    { _stopped = true; clearInterval(_timer); _timer = null; },
    latency() { return { avg: _latency.avg(), p95: _latency.p95(), recent: _latency.last(3) }; },
    stats()   { return { seq: _seq, missed: _missed, online: _wasOnline }; },
  };
}

// ── NCP pulse (provider tab → Guardian) ──────────────────────────────────────

/**
 * createNCPPulse — keeps an NCP channel alive by posting heartbeats to Guardian.
 * Called by Tampermonkey userscript and the nexus-chat.html when it has a provider channel.
 *
 * @param {object} opts
 * @param {string}   opts.provider       — 'claude' | 'chatgpt' | etc.
 * @param {string}   opts.tabId          — UUID from NCP_READY event
 * @param {string}   [opts.guardianUrl]  — from contracts GUARDIAN.ncp.heartbeat
 * @param {number}   [opts.intervalMs]   — default 5000 (faster than orch pulse — NCP is tighter)
 * @param {function} [opts.onAck]        — called with { latency, serverTs }
 * @param {function} [opts.onError]      — called with error string
 */
function createNCPPulse({
  provider, tabId,
  guardianUrl,
  intervalMs = 5000,
  onAck, onError,
} = {}) {
  if (!provider || !tabId) throw new Error('createNCPPulse: provider and tabId required');

  const _latency = new _Ring(20);
  let _seq       = 0;
  let _timer     = null;
  let _stopped   = false;

  function _url() {
    return guardianUrl || _C().GUARDIAN.ncp.heartbeat;
  }

  async function _beat() {
    if (_stopped) return;
    _seq++;
    const sentAt = Date.now();
    try {
      const r = await fetch(_url(), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ provider, tabId, ts: sentAt, seq: _seq }),
        signal:  AbortSignal.timeout(3000),
      });
      const data    = await r.json().catch(() => ({}));
      const latency = Date.now() - sentAt;
      _latency.push(latency);
      onAck?.({ latency, serverTs: data.ts, latencyEcho: data.latency, seq: _seq });
    } catch(e) {
      onError?.(e.message || 'NCP heartbeat failed');
    }
  }

  _beat(); // immediate
  _timer = setInterval(_beat, intervalMs);

  return {
    stop()    { _stopped = true; clearInterval(_timer); _timer = null; },
    latency() { return { avg: _latency.avg(), p95: _latency.p95(), recent: _latency.last(3) }; },
  };
}

// ── Export ────────────────────────────────────────────────────────────────────

const PULSE = {
  createOrchestratorPulse,
  createNCPPulse,
};

if (typeof window !== 'undefined') window.NX_PULSE = PULSE;
if (typeof module !== 'undefined') module.exports = PULSE;
