'use strict';
/**
 * lib/pulse.js — NEXUS Pulse System  v1.0.0
 * UUID: nexus-pulse-v1-0000-4000-0000-000000000001
 *
 * The pulse is the heartbeat made active. Every system that imports this
 * module sends a regular POST /api/heartbeat to the orchestrator and
 * receives an ACK with latency data. The orchestrator broadcasts each
 * ACK as an `orchestrator.pulse` SSE event to all connected UI clients,
 * who update health dots in real time instead of waiting for the 8s poll.
 *
 * Architecture (server-side, Node.js):
 *   createPulse(opts) → starts interval, returns { stop, latency, status }
 *
 * The browser-side equivalent lives in ui/pulse.js.
 *
 * §1.2  Nothing silently fails — every missed beat is logged.
 * §2.1  Persistence first — latency ring written to ledger every minute.
 * §5.1  UUID on everything — each pulse carries a pulsId for tracing.
 */

const http        = require('http');
const { randomUUID } = require('crypto');

// ── Ring buffer (inline — no external deps) ───────────────────────────────────
class _Ring {
  constructor(max) { this._max = max; this._buf = []; }
  push(v) { this._buf.push(v); if (this._buf.length > this._max) this._buf.shift(); }
  last(n)  { return this._buf.slice(-n); }
  all()    { return [...this._buf]; }
  avg()    {
    if (!this._buf.length) return null;
    return Math.round(this._buf.reduce((a,b)=>a+b,0) / this._buf.length);
  }
  p95() {
    if (!this._buf.length) return null;
    const sorted = [...this._buf].sort((a,b)=>a-b);
    return sorted[Math.floor(sorted.length * 0.95)];
  }
}

// ── createPulse ───────────────────────────────────────────────────────────────

/**
 * createPulse — register this system with the orchestrator and send a
 * periodic heartbeat.  Starts immediately; call stop() to cancel.
 *
 * @param {object} opts
 * @param {string}   opts.systemId        — e.g. 'guardian', 'cortex', 'idearium'
 * @param {number}   opts.port            — this system's port
 * @param {string}   [opts.orchHost]      — orchestrator host (default 127.0.0.1)
 * @param {number}   [opts.orchPort]      — orchestrator port (default 9000)
 * @param {number}   [opts.intervalMs]    — heartbeat interval (default 10000)
 * @param {number}   [opts.timeoutMs]     — request timeout (default 3000)
 * @param {number}   [opts.staleAfterMs]  — log warning if no ACK in N ms (default 35000)
 * @param {function} [opts.onBeat]        — called on every ACK: ({ latency, seq, ts })
 * @param {function} [opts.onMiss]        — called when a beat is missed: ({ seq, elapsed })
 * @param {function} [opts.onOnline]      — called when orchestrator comes back up
 * @param {function} [opts.onOffline]     — called when orchestrator goes down
 * @param {function} [opts.log]           — logger fn (default console.log)
 * @returns {{ stop, getStats, latency }}
 */
function createPulse({
  systemId,
  port,
  orchHost     = '127.0.0.1',
  orchPort     = 9000,
  intervalMs   = 10000,
  timeoutMs    = 3000,
  staleAfterMs = 35000,
  meta         = {},
  onBeat, onMiss, onOnline, onOffline,
  log          = (...a) => console.log('[pulse]', ...a),
} = {}) {
  if (!systemId) throw new Error('pulse: systemId required');
  if (!port)     throw new Error('pulse: port required');

  const _latency   = new _Ring(60);   // last 60 beat latencies (ms)
  let   _seq       = 0;
  let   _missed    = 0;
  let   _lastAck   = Date.now();
  let   _wasOnline = true;
  let   _timer     = null;
  let   _stopped   = false;

  // ── One heartbeat ──────────────────────────────────────────────────────────
  function _beat() {
    if (_stopped) return;
    _seq++;
    const seq    = _seq;
    const sentAt = Date.now();
    const pulseId = randomUUID();

    const body = JSON.stringify({
      systemId,
      port,
      status:   'online',
      seq,
      pulseId,
      ts:       sentAt,
      intervalMs, // §BPM — the cadence this system was told to beat at; lets the
                  // receiver (orchestrator) judge regularity against the real
                  // target instead of assuming one.
      stats: {    // §BPM — self-measured, sent along so the health score can use
                  // real numbers this process already has instead of guessing
                  // them from arrival timing alone (arrival timing alone can't
                  // tell "this system is slow" from "the network is slow").
        latencyAvgMs: _latency.avg(),
        latencyP95Ms: _latency.p95(),
        missed:       _missed,
      },
      meta:     {
        ...meta,
        uptime: process.uptime(),
        memMB:  Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    });

    const req = http.request({
      hostname: orchHost,
      port:     orchPort,
      path:     '/api/heartbeat',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Pulse-Id':     pulseId,
        'X-System-Id':    systemId,
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const latency = Date.now() - sentAt;
        _latency.push(latency);
        _lastAck  = Date.now();
        _missed   = 0;

        // Transition: offline → online
        if (!_wasOnline) {
          _wasOnline = true;
          log(`orchestrator back online  latency=${latency}ms`);
          onOnline?.({ latency, seq, ts: Date.now() });
        }

        let ack = {};
        try { ack = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
        onBeat?.({ latency, seq, ts: Date.now(), pulseId, ack });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      _handleMiss(seq, sentAt);
    });
    req.on('error', () => _handleMiss(seq, sentAt));
    req.write(body);
    req.end();
  }

  function _handleMiss(seq, sentAt) {
    _missed++;
    const elapsed = Date.now() - _lastAck;

    // Transition: online → offline
    if (_wasOnline && elapsed > staleAfterMs) {
      _wasOnline = false;
      log(`orchestrator OFFLINE  missed=${_missed}  elapsed=${elapsed}ms`);
      onOffline?.({ missed: _missed, elapsed, seq, ts: Date.now() });
    }

    onMiss?.({ seq, elapsed, missed: _missed });
  }

  // ── Registration beat (announce on boot) ──────────────────────────────────
  function _register() {
    const body = JSON.stringify({
      systemId, port, meta,
      registeredAt: Date.now(),
    });
    const req = http.request({
      hostname: orchHost,
      port:     orchPort,
      path:     '/api/register',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let data = {};
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
        if (data.ok) {
          log(`registered with orchestrator :${orchPort}  registry=${Object.keys(data.registry||{}).length} systems`);
        }
      });
    });
    req.setTimeout(5000, () => req.destroy());
    req.on('error', () => {
      // Orchestrator not up yet — will register on first successful heartbeat
    });
    req.write(body);
    req.end();
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  _register();
  _beat(); // immediate first beat
  _timer = setInterval(_beat, intervalMs);
  if (_timer.unref) _timer.unref(); // don't keep process alive just for heartbeats

  // ── Public API ─────────────────────────────────────────────────────────────
  function stop() {
    _stopped = true;
    if (_timer) { clearInterval(_timer); _timer = null; }
    log(`stopped  seq=${_seq}`);
  }

  function getStats() {
    return {
      systemId,
      port,
      seq:       _seq,
      missed:    _missed,
      online:    _wasOnline,
      lastAckMs: Date.now() - _lastAck,
      latency: {
        avg:    _latency.avg(),
        p95:    _latency.p95(),
        recent: _latency.last(5),
      },
    };
  }

  return { stop, getStats };
}

// ── NCP client pulse (browser tab → Guardian NCP) ─────────────────────────────
// Used by the Tampermonkey userscript and any browser page that opens an NCP channel.
// In Node.js contexts this is the same pattern but via http.request instead of fetch.

/**
 * createNCPPulse — send periodic NCP heartbeat from a browser tab (or Node) to Guardian.
 * This is the client-side half of ncp.js handleHeartbeat.
 *
 * Only used in browser (fetch). For Node use createPulse.
 *
 * @param {object} opts
 * @param {string} opts.provider     — 'claude' | 'chatgpt' | etc.
 * @param {string} opts.tabId        — UUID assigned when channel was opened
 * @param {string} opts.guardianUrl  — base URL e.g. 'http://127.0.0.1:7820'
 * @param {number} [opts.intervalMs] — default 5000
 * @param {function} [opts.onAck]    — called with { latency, serverTs }
 * @param {function} [opts.onError]  — called with error message
 */
function createNCPPulse({
  provider, tabId, guardianUrl = 'http://127.0.0.1:7820',
  intervalMs = 5000,
  onAck, onError,
} = {}) {
  if (!provider || !tabId) throw new Error('ncpPulse: provider and tabId required');

  const _latency = new _Ring(20);
  let _timer     = null;
  let _stopped   = false;

  async function _beat() {
    if (_stopped) return;
    const sentAt = Date.now();
    try {
      const r = await fetch(`${guardianUrl}/heartbeat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ provider, tabId, ts: sentAt }),
        signal:  AbortSignal.timeout(3000),
      });
      const data = await r.json();
      const latency = Date.now() - sentAt;
      _latency.push(latency);
      onAck?.({ latency, serverTs: data.ts, seq: data.seq });
    } catch(e) {
      onError?.(e.message || 'heartbeat failed');
    }
  }

  _beat();
  _timer = setInterval(_beat, intervalMs);

  return {
    stop()     { _stopped = true; clearInterval(_timer); _timer = null; },
    latency()  { return { avg: _latency.avg(), p95: _latency.p95(), recent: _latency.last(3) }; },
  };
}

module.exports = { createPulse, createNCPPulse, _Ring };
