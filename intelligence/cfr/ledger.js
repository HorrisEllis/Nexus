'use strict';
/**
 * lib/cfr/ledger.js — CFR-Ω Ledger  v1.0.0
 * UUID: nexus-cfr-ledger-v1-0000-4000-0000-000000000001
 *
 * THE TRUTH SUBSTRATE.
 *
 * This upgrades lib/event-ledger.js with full CFR-Ω integration:
 *   - Every entry stores sigma + delta + frozen CFR snapshot
 *   - Causal graph updated on every write
 *   - CFR field updated after write (event → field, not field → event)
 *   - Gap emission when sigma > threshold or CFR collapses
 *   - Streaming JSONL append-only — no mutation, ever
 *   - /cfr/* HTTP routes served directly by the kernel that owns this ledger
 *
 * §LAW II  — record before behavior. Entry written before emit fires.
 * §7.6     — the codebase is a materialised view of the ledger.
 *
 * Usage (drop-in replacement for createEventLedger):
 *
 *   const { createCFRLedger } = require('./lib/cfr/ledger');
 *   const ledger = createCFRLedger({ ledgerDir, systemId });
 *   ledger.open();
 *
 *   // In bus.emit intercept:
 *   bus.emit = function(type, data) {
 *     ledger.record(type, data, { causedBy: data.jobId });
 *     return _origEmit(type, data);
 *   };
 *
 *   // Mount CFR HTTP routes on your kernel's server:
 *   ledger.handleCFRRoute(req, res, url); // returns true if handled
 */

const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { computeSigma } = require('./sigma');
const { computeDelta  } = require('./delta');
const { createCFRField } = require('./field');
const { CausalGraph   } = require('./graph');

// §DYNAMIC-TENSION 2026-08-23 — James: "I want to use delta to measure the
// tension gaps... no hardcoded. dynamic updating over time." Lazy,
// try/catch-safe — matches lib/gap-field.js's own real require pattern for
// this same module, but CFR's core recording function must never be
// blocked by a persistence failure (§1.2 non-blocking), so this is
// resolved once and reused, never a hard dependency at module load.
let _jaaDB = null;
function _getJaaDB() {
  if (_jaaDB) return _jaaDB;
  try { ({ jaaDB: _jaaDB } = require('../../cortex/memory/jaa-db')); } catch (_) { /* real, honest absence — no fabricated fallback */ }
  return _jaaDB;
}

// ── Compound effects engine (lazy — loaded after graph is ready) ──────────────
let _compoundModule = null;
function _getCompoundModule() {
  if (_compoundModule) return _compoundModule;
  try {
    _compoundModule = require('../../intelligence/causal/compound');
  } catch(_) {}
  return _compoundModule;
}

// ── Gap threshold constants ───────────────────────────────────────────────────
const SIGMA_GAP_THRESHOLD   = 0.70;  // sigma above this → emit gap
const CFR_COLLAPSE_THRESHOLD = 0.25; // coherence below this → emit gap
const DELTA_TENSION_THRESHOLD = 0.75; // tension above this → emit gap

function createCFRLedger({
  ledgerDir,
  systemId,
  onEvent    = null,
  onGap      = null,
  jaaDB      = null,     // optional — compound engine writes tidal gaps here
  maxHistory = 500,
} = {}) {
  if (!ledgerDir) throw new Error('CFRLedger: ledgerDir required');
  if (!systemId)  throw new Error('CFRLedger: systemId required');

  const LEDGER_FILE   = path.join(ledgerDir, 'event_log.jsonl');
  const STATS_FILE    = path.join(ledgerDir, 'event_stats.json');
  const CFR_FILE      = path.join(ledgerDir, 'cfr_state.json');

  let _stream         = null;
  let _seq            = 0;
  let _field          = createCFRField();
  let _graph          = new CausalGraph();
  let _compound       = null;   // compound engine — initialised after open()
  let _prev           = null;
  let _history        = [];
  let _sseClients     = new Set();
  let _stats          = {};
  let _baseline       = {};
  let _lastByType     = {};

  // ── Open ────────────────────────────────────────────────────────────────────
  function open() {
    fs.mkdirSync(ledgerDir, { recursive: true });
    _stream = fs.createWriteStream(LEDGER_FILE, { flags: 'a' });
    _stream.on('error', e => {
      console.error(`[cfr-ledger:${systemId}] disk write error:`, e.message);
    });

    // Load persisted stats and CFR state
    if (fs.existsSync(STATS_FILE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        _stats    = saved.stats    || {};
        _baseline = saved.baseline || {};
      } catch(_) {}
    }
    if (fs.existsSync(CFR_FILE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(CFR_FILE, 'utf8'));
        _field.restore(saved);
      } catch(_) {}
    }

    // Initialise compound engine — needs graph which is now ready
    try {
      const compMod = _getCompoundModule();
      if (compMod) {
        _compound = compMod.createCompoundEngine({ graph: _graph, jaaDB });
      }
    } catch(_) {}

    return { file: LEDGER_FILE };
  }

  function close() {
    _saveStats();
    _saveCFRState();
    _stream?.end();
    _stream = null;
    for (const res of _sseClients) { try { res.end(); } catch(_) {} }
    _sseClients.clear();
  }

  // ── Record ───────────────────────────────────────────────────────────────────
  /**
   * record — write an event to the ledger with full CFR annotation.
   *
   * This is §LAW II: write happens BEFORE any subscriber processes the event.
   * The returned entry has frozen cfr, sigma, delta — never recomputed.
   */
  function record(type, payload = {}, opts = {}) {
    // §FIX-CFR-01: coerce non-string type at entry point — never let an object
    // propagate to sigma.computeSigma() where it causes recurring warnings.
    // The root cause is callers passing event objects {type,data} instead of
    // the string type. Coerce once here instead of per-occurrence in sigma.
    if (typeof type !== 'string') {
      if (type && typeof type === 'object') {
        type = type.type || type.event || type.name || JSON.stringify(type).slice(0, 80);
      } else {
        type = String(type || 'unknown');
      }
    }
    if (!_stream) {
      try { open(); } catch(_) {
        return { uuid: 'noop', seq: 0, type, ts: Date.now() };
      }
    }

    const ts  = Date.now();
    const seq = ++_seq;
    const id  = opts.uuid || randomUUID();

    // Compute interval since last event of this type
    const intervalMs = _lastByType[type] ? ts - _lastByType[type] : 0;
    _lastByType[type] = ts;

    // Get current field state for sigma computation
    const currentField = _field.get();

    // Baseline lookup for temporal sigma
    const baseline = _baseline[type] || null;

    // ── §LAW II: Compute before write ─────────────────────────────────────
    const sigmaResult = computeSigma({ type, payload }, baseline, currentField, intervalMs);
    const delta       = computeDelta(_prev, { type, payload, ts });

    // Update field AFTER computing sigma (sigma uses pre-update field)
    const cfrSnapshot = _field.update(type, sigmaResult.score);

    // ── Build full ledger entry ────────────────────────────────────────────
    const entry = {
      // Identity
      uuid:     id,
      seq,
      type,
      source:   opts.source   || systemId,
      _system:  systemId,

      // Causality
      causedBy:  opts.causedBy  || null,
      sessionId: opts.sessionId || null,
      trace:     opts.trace     || {
        jobId:     payload?.jobId     || null,
        sessionId: payload?.sessionId || opts.sessionId || null,
        parentId:  opts.causedBy      || null,
      },

      // Payload
      payload,
      ts,
      _writtenAt: ts,

      // CFR annotation — frozen at write time, never recomputed
      sigma: {
        score:  sigmaResult.score,
        axes:   sigmaResult.axes,
        reason: sigmaResult.reason,
      },
      delta,
      cfr:   cfrSnapshot,  // frozen field snapshot
    };

    // ── §LAW II: Disk write FIRST ─────────────────────────────────────────
    _stream?.write(JSON.stringify(entry) + '\n');

    // Update learning stats
    _updateStats(type, ts);

    // Update causal graph
    _graph.ingest(entry);

    // Update ring buffer
    _history.push(entry);
    if (_history.length > maxHistory) _history.shift();

    // §DYNAMIC-TENSION 2026-08-23 — real, continuous time-series write, not
    // gated behind a threshold: every real ledger entry's delta gets a real
    // row, so a later reader (gap-priority's own tension() function) can
    // pull "the most recent real tension for this source" and get a
    // genuinely dynamic, always-current answer — not a value frozen at
    // whatever moment a gap happened to be created. Deliberately NOT
    // written as a gap-field.js gap (§CFR-WIRE-02's own real, documented
    // reason still holds: "field observations, not actionable gaps... a
    // queue that nothing will drain") — this is metric history, a
    // different real thing a gap can later READ, not a gap itself.
    try {
      const jaa = _getJaaDB();
      if (jaa) {
        jaa.insert('cfr_tension_history', {
          uuid: randomUUID(), source: entry.source, systemId,
          tension: entry.delta.tension, friction: entry.delta.friction,
          slope: entry.delta.slope, sigma: sigmaResult.score, ts,
        });
      }
    } catch (_) { /* §1.2 non-blocking — a persistence failure never blocks the real, critical write above */ }

    // Track previous for next delta
    _prev = entry;

    // Broadcast to SSE clients
    _broadcast(entry);

    // Notify subscriber
    onEvent?.(entry);

    // Gap emission — if sigma/delta/cfr crossed threshold
    _checkGaps(entry);

    // Compound effects analysis — async, gated, selective.
    // §CAUSAL-01: only triggers on genuine sigma anomalies, never on compound
    // events themselves (compound.* types) — prevents recomputation storms.
    // §CAUSAL-02: setImmediate keeps write path synchronous — analysis never blocks.
    const sigmaScore = entry.sigma?.score ?? 0;
    const isCompoundEvent = (entry.type || '').startsWith('compound.');
    if (sigmaScore >= SIGMA_GAP_THRESHOLD && _compound && !isCompoundEvent) {
      setImmediate(() => {
        _compound.analyze(entry).then(result => {
          if (result.ok && result.record && result.class !== 'ripple') {
            // compound.documented emitted by TidalAlertGate — writes to JAA directly,
            // not through CFR ledger.record() — no re-entry possible
          }
        }).catch(() => {}); // §1.2 — never crash the write path
      });
    }

    return entry;
  }

  // ── Gap emission ─────────────────────────────────────────────────────────────
  function _checkGaps(entry) {
    if (!onGap) return;

    const s = entry.sigma?.score ?? 0;
    const t = entry.delta?.tension ?? 0;
    const c = entry.cfr?.coherence ?? 1;

    if (s >= SIGMA_GAP_THRESHOLD) {
      onGap({
        type:     'sigma.spike',
        severity: s,
        entry,
        message:  `sigma ${s.toFixed(2)} on ${entry.type}: ${entry.sigma.reason}`,
      });
    }

    if (t >= DELTA_TENSION_THRESHOLD) {
      onGap({
        type:     'delta.tension',
        severity: t,
        entry,
        message:  `delta tension ${t.toFixed(2)} at ${entry.type}`,
      });
    }

    if (c <= CFR_COLLAPSE_THRESHOLD) {
      onGap({
        type:     'cfr.collapse',
        severity: 1 - c,
        entry,
        message:  `CFR coherence collapsed to ${c.toFixed(2)} (regime: ${entry.cfr?.regime})`,
      });
    }
  }

  // ── Baseline learning ─────────────────────────────────────────────────────
  function _updateStats(type, ts) {
    if (!_stats[type]) {
      _stats[type] = { count: 0, lastTs: null, intervals: [], totalMs: 0 };
    }
    const s = _stats[type];
    s.count++;
    if (s.lastTs !== null) {
      const interval = ts - s.lastTs;
      s.intervals.push(interval);
      s.totalMs += interval;
      if (s.intervals.length > 100) s.intervals.shift();
      if (s.count % 10 === 0) _recomputeBaseline(type);
    }
    s.lastTs = ts;
  }

  function _recomputeBaseline(type) {
    const s = _stats[type];
    if (!s || s.intervals.length < 5) return;
    const avg  = s.intervals.reduce((a,b) => a+b, 0) / s.intervals.length;
    const vari = s.intervals.reduce((v,i) => v + Math.pow(i-avg,2), 0) / s.intervals.length;
    const sd   = Math.sqrt(vari);
    const cv   = avg > 0 ? sd / avg : 1;
    _baseline[type] = {
      avgIntervalMs: Math.round(avg),
      stddevMs:      Math.round(sd),
      consistency:   Math.max(0, Math.min(1, 1 - cv)),
      count:         s.count,
      sampleSize:    s.intervals.length,
      computedAt:    Date.now(),
    };
  }

  // ── SSE streaming ─────────────────────────────────────────────────────────
  function _broadcast(entry) {
    if (!_sseClients.size) return;
    const msg = `data: ${JSON.stringify(entry)}\n\n`;
    for (const res of _sseClients) {
      try { res.write(msg); }
      catch(_) { _sseClients.delete(res); }
    }
  }

  // ── CFR HTTP route handler ────────────────────────────────────────────────
  /**
   * handleCFRRoute — mount on your kernel's HTTP server.
   * Returns true if the route was handled, false if not a CFR route.
   *
   * Routes served:
   *   GET  /cfr/health   — { ok, system, regime, cfr, seq }
   *   GET  /cfr/state    — full field state + stats
   *   GET  /cfr/field    — raw field dimensions
   *   GET  /cfr/nodes    — recent high-sigma nodes (graph)
   *   GET  /cfr/deltas   — recent ledger entries with delta/sigma/cfr
   *   GET  /cfr/stream   — SSE stream of live ledger entries
   *   POST /cfr/emit     — inject a synthetic event (for testing)
   *   GET  /cfr/replay   — replay filtered entries
   */
  function handleCFRRoute(req, res, urlObj) {
    const pathname = typeof urlObj === 'string' ? urlObj : (urlObj?.pathname || '');
    if (!pathname.startsWith('/cfr')) return false;

    const method = req.method || 'GET';
    const json   = (code, body) => {
      if (res.headersSent) return;
      const b = JSON.stringify(body);
      res.writeHead(code, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Content-Length': Buffer.byteLength(b),
      });
      res.end(b);
    };

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return true;
    }

    // GET /cfr/health
    if (method === 'GET' && pathname === '/cfr/health') {
      const snap = _field.snapshot();
      json(200, {
        ok: true, system: systemId, ts: Date.now(),
        regime: snap.regime, seq: _seq,
        cfr: snap, graphNodes: _graph.stats().nodes,
      });
      return true;
    }

    // GET /cfr/state
    if (method === 'GET' && pathname === '/cfr/state') {
      const snap = _field.snapshot();
      json(200, {
        ok: true, system: systemId, ts: Date.now(),
        cfr: snap, seq: _seq,
        graph: _graph.stats(),
        baselines: Object.keys(_baseline).length,
        eventTypes: Object.keys(_stats).length,
        historySize: _history.length,
        sigmaThreshold:   SIGMA_GAP_THRESHOLD,
        collapseThreshold: CFR_COLLAPSE_THRESHOLD,
      });
      return true;
    }

    // GET /cfr/field
    if (method === 'GET' && pathname === '/cfr/field') {
      // 2026-09-19: include `regime`. This route is now THE way every consumer reads the system
      // CFR field (cortex's relay, which added a regime of its own, is gone). /cfr/health already
      // returned it; /cfr/field alone did not, which left consumers to invent one (copilot read
      // `undefined !== 'stable'` as an alarm; nerve fell back to a frozen 'stable'). One definition.
      json(200, { ok: true, system: systemId, ..._field.get(), regime: _field.snapshot().regime, ts: Date.now() });
      return true;
    }

    // GET /cfr/nodes — recent high-sigma nodes as CFR attractors/repulsors
    if (method === 'GET' && pathname === '/cfr/nodes') {
      const threshold = 0.3;
      const nodes = _history
        .filter(e => (e.sigma?.score ?? 0) > threshold)
        .slice(-50)
        .map(e => ({
          id:     e.uuid,
          label:  e.type,
          type:   _nodeType(e),
          sigma:  e.sigma?.score ?? 0,
          regime: e.cfr?.regime ?? 'stable',
          ts:     e.ts,
          mass:   1 + (e.sigma?.score ?? 0) * 2, // high sigma = larger attractor
        }));
      json(200, { ok: true, nodes, total: nodes.length, system: systemId });
      return true;
    }

    // GET /cfr/deltas — recent ledger entries for replay/debug
    if (method === 'GET' && (pathname === '/cfr/deltas' || pathname.startsWith('/cfr/deltas'))) {
      const qs     = urlObj?.searchParams || new URLSearchParams(pathname.split('?')[1] || '');
      const limit  = Math.min(200, parseInt(qs.get('limit') || '50'));
      const minSig = parseFloat(qs.get('minSigma') || '0');
      const deltas = _history
        .filter(e => (e.sigma?.score ?? 0) >= minSig)
        .slice(-limit);
      json(200, { ok: true, deltas, total: deltas.length, system: systemId });
      return true;
    }

    // GET /cfr/compound — compounding effects analysis on recent high-sigma events
    // Returns all waves and tidal cascades found in the current graph
    if (method === 'GET' && pathname === '/cfr/compound') {
      if (!_compound) {
        json(200, { ok: true, compound: [], waves: [], tidal: [], note: 'compound engine not initialised' });
        return true;
      }
      const qs        = urlObj?.searchParams || new URLSearchParams(pathname.split('?')[1] || '');
      const threshold = parseFloat(qs.get('sigma') || '0.4');
      _compound.scan(threshold).then(records => {
        const tidal = records.filter(r => r.class === 'tidal');
        const waves = records.filter(r => r.class === 'wave');
        json(200, {
          ok: true,
          system:     systemId,
          scanned:    _graph.nodes.size,
          tidalCount: tidal.length,
          waveCount:  waves.length,
          tidal:      tidal.slice(0, 5),
          waves:      waves.slice(0, 10),
          topCompoundingFactors: _topFactors(records),
          ts: Date.now(),
        });
      }).catch(e => json(500, { ok: false, error: e.message }));
      return true;
    }

    // GET /cfr/compound/:uuid — analyze one entry's compounding effects
    if (method === 'GET' && pathname.startsWith('/cfr/compound/')) {
      const entryId = pathname.split('/').pop();
      if (!_compound) {
        json(200, { ok: false, error: 'compound engine not initialised' });
        return true;
      }
      _compound.analyzeChain(entryId).then(result => {
        json(200, { ok: result.ok, ...result });
      }).catch(e => json(500, { ok: false, error: e.message }));
      return true;
    }

    // GET /cfr/stream — live SSE of ledger entries
    if (method === 'GET' && pathname === '/cfr/stream') {
      if (res.headersSent) return true;
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders?.();

      // Send current field snapshot immediately
      const snap = _field.snapshot();
      res.write(`data: ${JSON.stringify({ type:'CFR_READY', system:systemId, cfr:snap, ts:Date.now() })}\n\n`);

      _sseClients.add(res);
      req.on('close', () => _sseClients.delete(res));
      return true;
    }

    // POST /cfr/emit — inject synthetic event (testing / manual nudge)
    if (method === 'POST' && pathname === '/cfr/emit') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        try {
          const { type: t, payload: p = {}, causedBy } = JSON.parse(body || '{}');
          if (!t) { json(400, { ok:false, error:'type required' }); return; }
          const entry = record(t, p, { source: 'cfr.emit', causedBy });
          json(200, { ok: true, entry: { uuid: entry.uuid, sigma: entry.sigma, cfr: entry.cfr } });
        } catch(e) { json(400, { ok:false, error:e.message }); }
      });
      return true;
    }

    // GET /cfr/replay — filtered replay
    if (method === 'GET' && pathname.startsWith('/cfr/replay')) {
      const qs      = urlObj?.searchParams || new URLSearchParams('');
      const jobId   = qs.get('jobId');
      const since   = parseInt(qs.get('since') || '0');
      const maxSig  = parseFloat(qs.get('maxSigma') || '1');
      const minSig  = parseFloat(qs.get('minSigma') || '0');

      let entries = _history.filter(e =>
        (!since  || e.ts >= since) &&
        (e.sigma?.score ?? 0) >= minSig &&
        (e.sigma?.score ?? 0) <= maxSig
      );
      if (jobId) {
        entries = _graph.jobChain(jobId);
      }

      json(200, { ok: true, entries, system: systemId, total: entries.length });
      return true;
    }

    return false; // not a CFR route
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _nodeType(entry) {
    const t = entry.type || '';
    if (t.includes('error') || t.includes('failed') || t.includes('collapse')) return 'error';
    if (t.includes('gap') || t.includes('sigma'))  return 'gap';
    if (t.includes('complete') || t.includes('ok')) return 'success';
    if (t.includes('boot') || t.includes('online')) return 'system';
    return 'event';
  }

  function _saveStats() {
    try {
      fs.writeFileSync(STATS_FILE,
        JSON.stringify({ stats: _stats, baseline: _baseline }, null, 2));
    } catch(_) {}
  }

  function _saveCFRState() {
    try {
      fs.writeFileSync(CFR_FILE, JSON.stringify(_field.get(), null, 2));
    } catch(_) {}
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function tail(n = 20) {
    return _history.slice(-n);
  }

  function checkAnomaly(type, intervalMs) {
    const b = _baseline[type];
    if (!b || b.count < 20) return { anomaly: false, score: 0, reason: 'insufficient baseline' };
    const deviation = Math.abs(intervalMs - b.avgIntervalMs);
    const sigmas    = b.stddevMs > 0 ? deviation / b.stddevMs : 0;
    return {
      anomaly: sigmas > 3,
      score:   Math.min(1, sigmas / 6),
      sigmas:  +sigmas.toFixed(1),
      expected: b.avgIntervalMs,
      actual:   intervalMs,
    };
  }

  function scanInvariants(windowMs = 5000) {
    const events = tail(1000);
    const coOccurrences = {};
    for (let i = 0; i < events.length; i++) {
      for (let j = i+1; j < events.length; j++) {
        if ((events[j].ts - events[i].ts) > windowMs) break;
        const key = [events[i].type, events[j].type].sort().join('::');
        coOccurrences[key] = (coOccurrences[key] || 0) + 1;
      }
    }
    const failures = events.filter(e =>
      e.type.includes('failure') || e.type.includes('error') ||
      e.type.includes('halted') || e.type.includes('gap'));
    const failurePrecursors = {};
    for (const f of failures) {
      for (const p of events.filter(e => e.ts < f.ts && e.ts > f.ts - 30000)) {
        failurePrecursors[p.type] = (failurePrecursors[p.type] || 0) + 1;
      }
    }
    return { coOccurrences, failurePrecursors, eventCount: events.length };
  }

  let _saveInterval = null;
  function startAutoSave(intervalMs = 60000) {
    _saveInterval = setInterval(() => { _saveStats(); _saveCFRState(); }, intervalMs);
    if (_saveInterval.unref) _saveInterval.unref();
  }
  function stopAutoSave() { clearInterval(_saveInterval); _saveInterval = null; }

  return {
    // Core
    open, close,
    record,
    // Routes
    handleCFRRoute,
    // Query
    tail, checkAnomaly, scanInvariants,
    getBaseline:    (t) => _baseline[t] || null,
    getAllBaselines: ()  => ({ ..._baseline }),
    getStats:       (t) => _stats[t] || null,
    getAllStats:     ()  => ({ ..._stats }),
    getSeq:         ()  => _seq,
    getCFR:         ()  => _field.snapshot(),
    getGraph:       ()  => _graph,
    // Compat with event-ledger callers
    startAutoSave, stopAutoSave,
  };
}

function _topFactors(records) {
  const counts = {};
  for (const r of records) {
    for (const f of (r.compoundingFactors || [])) {
      counts[f.name] = (counts[f.name] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
}

module.exports = { createCFRLedger };
