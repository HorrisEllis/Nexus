'use strict';
/**
 * intelligence/routes.js — the intelligence-domain HTTP routes that used to
 * be hosted by cortex/boot.js. §BUILT 2026-09-19.
 * docs/2026-09-19-cortex-to-intelligence-and-versionium-consolidation-
 * phasemap.spec (P2). James: "full move. each system needs to be sovereign.
 * if cortex going down breaks something, it needs to be moved."
 *
 * The faculty CODE already lived here (intuition.js, mastermind.js,
 * adversarial.js, spatial/system-lattice, liminal-space). Cortex was only the
 * composition root: it built the instances and injected its own state
 * (jaaDB, _field, taxonomy). This module is that composition root, moved.
 *
 * ROUTES OWNED (canonical paths; cortex's old paths are 410 tombstones):
 *   ANY  /api/intelligence/context            intelligence.getContext() + legacy cortex fields (additive)
 *   ANY  /api/intelligence/intuition
 *   ANY  /api/intelligence/mastermind
 *   ANY  /api/intelligence/mastermind/patterns
 *   ANY  /api/intelligence/adversarial
 *   ANY  /api/intelligence/rca
 *   ANY  /api/intelligence/query              (was /api/cortex/query)
 *   ANY  /api/intelligence/lattice            (was /api/cortex/lattice)
 *   GET  /api/intelligence/crystals           crystals-derived pattern list (cortex's old /patterns shape)
 *   GET  /api/liminal-space/status|list       (moved with the organ)
 *   POST /api/intelligence/bus                event intake for in-process organs (allowlisted)
 *
 * CONTRACT DECISIONS, each found by reading real callers, not assumed:
 *  - /context: the browser userscripts read ctx.failureModes / .reuse /
 *    .patterns[].actionable / .systemState — intelligence.getContext()'s
 *    contract. Cortex's handler shadowed it with {field,gaps,events,rca},
 *    none of which any caller reads, so buildContextHeader() returned ''
 *    on every prompt. The owner's contract wins; cortex's four fields are
 *    kept ADDITIVELY so nothing that might read them breaks.
 *  - /mastermind: cortex's live handler read body.context; a dead,
 *    unreachable duplicate (boot.js:988) read body.contextSnippet. Both are
 *    accepted here (context wins) so neither caller family is ignored.
 *  - /rca: ported as-is ({ok, rca:[...]}). orchestrator/lib/mcp-server.js
 *    reads d.findings with a different shape — a real caller bug, fixed at
 *    the caller in P4, not papered over here.
 *
 * LIMINAL-SPACE (moved 2026-09-19). Its routes read the in-process FOCAL_POINTS map,
 * which only init() + live bus events populate, so the ORGAN moved with them:
 * server.js init()s it on this process's bus, and POST /api/intelligence/bus
 * feeds it the events cortex used to deliver in-process.
 *
 * /api/intelligence/patterns is NOT here on purpose: intelligence/index.js
 * already serves it (bep_patterns shape — what MCP nexus_patterns and the
 * orchestrator CLI read). Copilot's four modules read the CRYSTALS shape
 * (precursor/outcome/count), so that shape gets its own honest path,
 * /api/intelligence/crystals, instead of one path serving two contracts.
 *
 * FRESHNESS (B2). jaaDB is 'one file per table, shared by convention, not
 * single-writer'. These faculties READ tables that other processes write
 * (gaps, event_log, crystals, sigma_records), so every read goes through a
 * throttled reloadTable(). Read-only by design: this module never writes.
 */
const MODULE_ID = 'intelligence.routes';

// Wrap jaaDB so reads see other processes' writes. Throttled per table.
function freshReader(jaaDB, refreshMs, now = Date.now) {
  const last = new Map();
  const refresh = (t) => {
    const n = now();
    if (n - (last.get(t) || 0) < refreshMs) return;
    last.set(t, n);
    try { jaaDB.reloadTable(t); } catch (_) { /* a missing table is an honest empty read */ }
  };
  return {
    tail:  (t, n)       => { refresh(t); return jaaDB.tail(t, n); },
    query: (t, w, o)    => { refresh(t); return jaaDB.query(t, w, o); },
    count: (t, w)       => { refresh(t); return jaaDB.count(t, w); },
  };
}

function createRoutes({ jaaDB, getField, intelligence, refreshMs = 1000, now = Date.now } = {}) {
  const db = freshReader(jaaDB, refreshMs, now);

  const { createIntuition }  = require('./intuition');
  const { createMastermind } = require('./mastermind');
  const adversarial          = require('./adversarial');

  // §BUILT — wiring the previously-unwired intelligence submodules onto
  // routes, same lazy-require-and-degrade pattern as getTaxonomy/
  // getSystemLattice/getCausalGraphClass above. Nothing here is a new
  // engine — these modules already exist and work; this is their first
  // HTTP surface.
  const liminalGaps  = require('./liminal');           // 12 domain-agnostic gap detectors
  const gap          = require('./gap');               // { hunter, predicate, ledger } lazy getters
  const { BDAKernel }= require('./bda');
  const causalAnomaly= require('./causal/anomaly');
  const { createCompoundEngine } = require('./causal/compound');
  const alk          = require('./alk');
  const alkPerception= require('./alk-perception');
  const telemetryCodec = require('./telemetry-codec');
  const path         = require('path');

  // BDA — one kernel per process, same shape as system-lattice's singleton.
  // Ledger persists to intelligence's own data dir, not cortex's.
  let _bda = null;
  function getBDA() {
    if (_bda) return _bda;
    _bda = new BDAKernel({ ledgerPath: path.join(require('./config').DATA_DIR, 'bda-ledger.jsonl') });
    return _bda;
  }

  // ALK — decisions.jsonl needs hydrating into the in-memory index once
  // per process before query()/ancestors()/descendants() see history from
  // before this boot. Lazy on first touch, not at require-time, so a
  // process that never calls an /alk route never pays the read.
  let _alkLoaded = false;
  function ensureAlkLoaded() {
    if (_alkLoaded) return;
    try { alk.load(); } catch (e) { console.warn(`[${MODULE_ID}] alk.load() failed: ${e.message}`); }
    _alkLoaded = true;
  }

  // causal/anomaly — module-level init(), same one-time-lazy shape.
  let _anomalyInit = false;
  function ensureAnomalyInit() {
    if (_anomalyInit) return;
    try { causalAnomaly.init({ jaaDB: db, bus: nexusBus }); } catch (e) { console.warn(`[${MODULE_ID}] anomaly.init() failed: ${e.message}`); }
    _anomalyInit = true;
  }

  // alk-perception — windowed kernel so /api/intelligence/perception can
  // report oscillation between composite states across calls, not just a
  // single-frame classification.
  let _perceptionKernel = null;
  function getPerceptionKernel() {
    if (!_perceptionKernel) _perceptionKernel = new alkPerception.ALKPerceptionKernel({ windowSize: 20 });
    return _perceptionKernel;
  }

  // telemetry-codec — feeds the CFR field's own 4 dimensions through the
  // Slope/Stability/Oscillation/Drift engines. Honest about what this is:
  // it's re-deriving trend/stability signal FROM the field CFR already
  // computes, not a second, independent measurement.
  let _telemetryRuntime = null;
  function getTelemetryRuntime() {
    if (!_telemetryRuntime) _telemetryRuntime = new telemetryCodec.TelemetryRuntime({ serviceId: 'intelligence.cfr-field' });
    return _telemetryRuntime;
  }

  // RFR2 — a live kernel instance for THIS process's own event stream.
  // Deliberately NOT backfilled from jaaDB's event_log: kernel.ingest()
  // mints a fresh internal id per event (I-1, never reused/deterministic),
  // so a historical event_log uuid has no corresponding kernel id to link
  // causedBy against — attempting to backfill would silently produce
  // wrong or orphaned causal edges. Instead this kernel starts empty at
  // first use and subscribes to nexus-bus '*' going forward, same
  // boot-boundary honesty CFR's ring buffers and ALK's per-session index
  // already have (see routes.js/alk history above) — it only knows what
  // happened since it started listening, and says so via `live`/`since`.
  let _rfr2Kernel  = null;
  let _rfr2IdMap   = null;   // external bus-event id → this kernel's internal event id
  let _rfr2Live    = false;
  let _rfr2Since   = null;
  function getRFR2Kernel() {
    if (_rfr2Kernel) return _rfr2Kernel;
    const { createKernel } = require('./rfr2/kernel');
    _rfr2Kernel = createKernel({ ringCap: 20000 });
    _rfr2IdMap  = new Map();
    return _rfr2Kernel;
  }
  function ensureRFR2Live() {
    if (_rfr2Live) return;
    const kernel = getRFR2Kernel();
    try {
      nexusBus.on('*', (event) => {
        try {
          const extCausedBy = event.causedBy || null;
          const mapped = extCausedBy && _rfr2IdMap.has(extCausedBy) ? _rfr2IdMap.get(extCausedBy) : null;
          const ev = kernel.ingest(event.type, event.payload, {
            causedBy: mapped, edgeType: mapped ? 'causal/explicit' : null,
            source: event.source, sessionId: event.payload?.sessionId || null,
          });
          _rfr2IdMap.set(event.id, ev.id);
          // Bound the id map the same way the kernel bounds its own ring —
          // otherwise this map would be the one unbounded structure here.
          if (_rfr2IdMap.size > 20000) _rfr2IdMap.delete(_rfr2IdMap.keys().next().value);
        } catch (e) { /* a single malformed bus event must not break the live feed */ }
      });
      _rfr2Since = Date.now();
      _rfr2Live  = true;
    } catch (e) { console.warn(`[${MODULE_ID}] RFR2 live feed failed to attach: ${e.message}`); }
  }

  let _taxonomy = null;
  const getTaxonomy = () => {
    if (_taxonomy !== null) return _taxonomy;
    try { _taxonomy = require('../lib/open-loop-taxonomy'); } catch (_) { _taxonomy = false; }
    return _taxonomy;
  };
  let _sysLattice = null;
  const getSystemLattice = () => {
    if (_sysLattice !== null) return _sysLattice;
    try { _sysLattice = require('./spatial/system-lattice'); } catch (_) { _sysLattice = false; }
    return _sysLattice;
  };
  let _CausalGraph = null;
  const getCausalGraphClass = () => {
    if (_CausalGraph !== null) return _CausalGraph;
    try { _CausalGraph = require('./cfr/graph').CausalGraph; } catch (_) { _CausalGraph = false; }
    return _CausalGraph;
  };

  // crystals-derived pattern list: an INTERNAL dependency of intuition (kept
  // exactly as cortex built it). Not what GET /api/intelligence/patterns
  // serves — that is intelligence/index.js's bep_patterns index, which is what
  // every real caller (MCP nexus_patterns, orchestrator CLI) reads.
  function buildPatterns(limit = 5) {
    const crystals = db.tail('crystals', 50);
    if (!crystals.length) return []; // honest empty, not a fabricated fallback
    return crystals
      .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
      .slice(0, limit)
      .map(c => ({
        precursor:  `${c.entry_conditions?.domain || '?'}:${c.entry_conditions?.verb || '?'}`,
        outcome:    c.exit_conditions?.outcome || 'unknown',
        count:      c.usage_count || c.pattern_frequency_at_creation || 0,
        confidence: c.success_probability ?? 0,
        kind:       c.kind,
        ts:         c.ts,
      }));
  }

  function buildRCA(limit = 5) {
    const gaps = db.query('gaps', { status: 'open' }, { orderBy: 'ts', order: 'DESC', limit });
    return gaps.map(g => ({
      gapId: g.id, type: g.type || 'unknown', cause: g.root_cause || 'unresolved',
      since: g.ts, sigma: getField().entropy,
    }));
  }

  const intuition  = createIntuition({ jaaDB: db, getField, getTaxonomy, getSystemLattice, buildPatterns });
  const mastermind = createMastermind({ jaaDB: db, getField, getCausalGraphClass });

  function contextSnapshotLegacy() {
    const recent = db.tail('event_log', 10).map(e => e.type).join(', ');
    const gaps   = db.count('gaps', { status: 'open' }) || 0;
    return { field: { ...getField() }, gaps: { open: gaps }, events: { recent: recent || 'none' }, rca: buildRCA(3) };
  }

  const OWNED = new Set([
    '/api/intelligence/context', '/api/intelligence/intuition', '/api/intelligence/mastermind',
    '/api/intelligence/mastermind/patterns', '/api/intelligence/adversarial', '/api/intelligence/rca',
    '/api/intelligence/query', '/api/intelligence/lattice', '/api/intelligence/crystals',
    // §BUILT — newly-wired submodule routes
    '/api/intelligence/liminal/analyze',
    '/api/intelligence/gap/status', '/api/intelligence/gap/hunt',
    '/api/intelligence/gap/enrich', '/api/intelligence/gap/verify',
    '/api/intelligence/bda/status', '/api/intelligence/bda/observe', '/api/intelligence/bda/reset',
    '/api/intelligence/causal/anomalies', '/api/intelligence/causal/compound',
    '/api/intelligence/alk/stats', '/api/intelligence/alk/decisions',
    '/api/intelligence/alk/ancestors', '/api/intelligence/alk/descendants',
    '/api/intelligence/alk/record', '/api/intelligence/alk/resolve', '/api/intelligence/alk/rewind',
    '/api/intelligence/perception', '/api/intelligence/telemetry/frame',
    '/api/intelligence/rfr2/stats', '/api/intelligence/rfr2/query',
    '/api/intelligence/rfr2/trace', '/api/intelligence/rfr2/descendants',
    '/api/intelligence/rfr2/children',
  ]);
  const liminal = require('./liminal-space');
  const nexusBus = require('../nexus/nexus-bus');
  const owns = (method, pathname) => {
    if (pathname === '/api/liminal-space/status' || pathname === '/api/liminal-space/list') return method === 'GET';
    if (pathname === '/api/intelligence/bus') return method === 'POST';
    return OWNED.has(pathname);
  };

  // handle(method, pathname, sp, body, json) — json(status, data), the same
  // callback shape intelligence/index.js's handleRequest() already uses.
  async function handle(method, pathname, sp, body, json) {
    body = body || {};
    sp = sp || new URLSearchParams();

    if (pathname === '/api/intelligence/context') {
      const intent   = sp.get('intent')   || '';
      const command  = sp.get('command')  || '';
      const provider = sp.get('provider') || '';
      const ctx = intelligence.getContext({ intent, command, provider });
      json(200, { ok: true, ...ctx, ...contextSnapshotLegacy(), intent: ctx.intent ?? (intent || 'general'), ts: Date.now() });
      return true;
    }

    if (pathname === '/api/intelligence/intuition') {
      json(200, intuition.answer(body.prompt || sp.get('prompt') || ''));
      return true;
    }

    if (pathname === '/api/intelligence/mastermind') {
      const prompt  = body.prompt ?? sp.get('prompt') ?? '';
      const context = body.context ?? body.contextSnippet;
      json(200, mastermind.analyze(prompt, context));
      return true;
    }

    if (pathname === '/api/intelligence/mastermind/patterns') {
      const limit = Number(body.limit ?? sp.get('limit')) || 300;
      const opts = { minChainLen: body.minChainLen, minOccurrences: body.minOccurrences };
      const result = await mastermind.detectRecurringPatterns(limit, opts);
      json(200, result || { ok: true, patternsFound: 0, patterns: [], reason: 'no causal graph available yet' });
      return true;
    }

    if (pathname === '/api/intelligence/adversarial') {
      const i = intuition.answer(body.prompt);
      const m = mastermind.analyze(body.prompt, body.context ?? body.contextSnippet);
      json(200, { intuition: i, mastermind: m, adversarial: adversarial.compareCortexFaculties(i, m) });
      return true;
    }

    if (pathname === '/api/intelligence/rca') {
      json(200, { ok: true, rca: buildRCA(parseInt(sp.get('limit') || '5', 10)) });
      return true;
    }

    if (pathname === '/api/intelligence/lattice') {
      const about = sp.get('about');
      try {
        const sysLattice = require('./spatial/system-lattice');
        if (about) json(200, { ok: true, about, neighbors: sysLattice.neighbors(about), size: sysLattice.size() });
        else       json(200, { ok: true, clusters: sysLattice.clusters(), size: sysLattice.size() });
      } catch (e) {
        // 1.2 — an unavailable lattice is reported, never a fabricated empty success.
        json(503, { ok: false, error: `system-lattice unavailable: ${e.message}` });
      }
      return true;
    }

    if (pathname === '/api/liminal-space/status') { json(200, liminal.status()); return true; }
    if (pathname === '/api/liminal-space/list') {
      json(200, { ok: true, items: liminal.list(sp.get('focalPoint') || undefined) });
      return true;
    }

    // Event intake for organs that live in this process (liminal-space). Cortex
    // relays the events it emits here; producers elsewhere may post directly.
    // Allowlist = the organ's own declared subscription list, so this cannot be
    // used to inject arbitrary events onto the bus.
    if (pathname === '/api/intelligence/bus') {
      const type = body && body.type;
      if (!type || !liminal.SUBSCRIBED_EVENTS.includes(type)) {
        json(400, { ok: false, error: `event type not accepted: ${type}`, accepted: liminal.SUBSCRIBED_EVENTS });
        return true;
      }
      nexusBus.emit(type, body.payload || {}, { source: body.source || 'relay', causedBy: body.causedBy || null });
      json(200, { ok: true });
      return true;
    }

    if (pathname === '/api/intelligence/crystals') {
      json(200, { ok: true, patterns: buildPatterns(parseInt(sp.get('limit') || '5', 10)) });
      return true;
    }

    if (pathname === '/api/intelligence/query') {
      const jaaDB = db; // the query body below reads jaaDB.tail(); route it through the freshness wrapper
      const about  = sp.get('about') || '';
      const window = parseInt(sp.get('window') || '3600000');
      const since  = Date.now() - window;
      if (!about) { json(400, { ok:false, error:'about param required' }); return true; }

      const needle = about.toLowerCase();
      const hay = (v) => {
        if (v == null) return '';
        return (typeof v === 'string' ? v : JSON.stringify(v)).toLowerCase();
      };
      const matches = (row, fields) => fields.some(f => hay(row[f]).includes(needle));

      let gaps = [];
      try {
        gaps = jaaDB.tail('gaps', 500)
          .filter(g => (g.ts || 0) >= since)
          .filter(g => matches(g, ['domain', 'type', 'description', 'reason', 'source']))
          .slice(0, 50);
      } catch (_) {}

      let events = [];
      try {
        events = jaaDB.tail('event_log', 500)
          .filter(e => (e.ts || 0) >= since)
          .filter(e => matches(e, ['type', 'source', 'payload']))
          .slice(0, 50);
      } catch (_) {}

      let sigma = { records: [], note: null };
      try {
        const rows = jaaDB.tail('sigma_records', 200).filter(s => (s.ts || 0) >= since);
        if (!rows.length) {
          sigma.note = 'sigma_records table empty in this window — sigma-writer may not be running against live traffic yet';
        } else {
          const subjectRows = rows.filter(s => matches(s, ['source', 'type', 'eventType']));
          sigma.records = (subjectRows.length ? subjectRows : rows).slice(0, 20);
          if (!subjectRows.length) sigma.note = `no sigma_records matched '${about}' directly — showing recent system-wide records instead`;
        }
      } catch (_) { sigma.note = 'sigma_records table not queryable'; }

      let field = null;
      try { field = { ...getField(), _note: 'system-wide CFR field snapshot, not scoped to this subject specifically' }; } catch (_) {}

      let blueprint = [];
      try {
        const bp = require('../lib/blueprint').load?.();
        if (bp) {
          const text = JSON.stringify(bp).toLowerCase();
          if (text.includes(needle)) blueprint = [{ note: 'subject appears in current blueprint — full divergence diffing not implemented, this is presence-only', found: true }];
        }
      } catch (_) {}

      const commits = [];
      const commitsNote = 'not built — no Versionium commit-tracking implementation exists in this tree (confirmed by grep; only docs/specs/VERSIONIUM.spec.md, no .js source)';

      const labs = [];
      const labsNote = 'not built — no LabSession tracking matching this spec exists (cos/playground/llm-lab.js and eravos edm-lab are unrelated systems)';

      // Narrative — factual summary of what THIS query found, plus
      // mastermind's own causal-trace/regime analysis (which queries global
      // open gaps, not filtered to `about` — a real mismatch worth stating
      // rather than silently blending the two into one falsely-unified voice).
      const factualLine = `Found ${gaps.length} gap(s) and ${events.length} event(s) matching '${about}' in the last ${Math.round(window/60000)} minutes.` +
        (sigma.note ? ` ${sigma.note}.` : ` ${sigma.records.length} sigma record(s) in window.`);
      let mastermindLine = '';
      try { mastermindLine = mastermind.analyze(about, factualLine)?.analysis || ''; } catch (_) {}

      const result = {
        about, window, since, ts: Date.now(),
        gaps, sigma, field, events, blueprint,
        commits, labs,
        narrative: `${factualLine} ${mastermindLine}`.trim(),
        _scope_note: 'Keyword resolution is exact/substring only (spec build_order item 2, fuzzy resolution, not built). commits/labs are stubbed empty — see commits._note/labs._note.',
        commits_note: commitsNote,
        labs_note: labsNote,
      };
      json(200, { ok: true, ...result });
      return true;
    }

    // ── Liminal — 12 domain-agnostic gap detectors ──────────────────────────
    if (pathname === '/api/intelligence/liminal/analyze') {
      const input = body.input ?? body.text;
      if (input === undefined) { json(400, { ok: false, error: 'input (string or numeric array) required' }); return true; }
      try {
        const mode = body.mode || sp.get('mode') || 'auto';
        const signals = liminalGaps.analyze(input, { mode });
        json(200, { ok: true, count: signals.length, signals });
      } catch (e) { json(500, { ok: false, error: e.message }); }
      return true;
    }

    // ── Gap lifecycle — hunter (detect) / predicate (closure) / ledger (durability) ──
    if (pathname === '/api/intelligence/gap/status') {
      let ledgerStats = { exists: false, bytes: 0, lines: 0 };
      try { ledgerStats = gap.ledger.stats(); } catch (e) { /* honest empty on read failure */ }
      json(200, { ok: true, ledger: ledgerStats, predicateTypes: Object.keys(gap.predicate.PREDICATE_LIBRARY || {}) });
      return true;
    }
    if (pathname === '/api/intelligence/gap/hunt') {
      const text = body.text;
      if (!text) { json(400, { ok: false, error: 'text required' }); return true; }
      try {
        const gaps = gap.hunter.analyze(text, { minScore: body.minScore });
        json(200, { ok: true, count: gaps.length, gaps });
      } catch (e) { json(500, { ok: false, error: e.message }); }
      return true;
    }
    if (pathname === '/api/intelligence/gap/enrich') {
      if (!body.raw) { json(400, { ok: false, error: 'raw gap object required' }); return true; }
      try { json(200, { ok: true, gap: gap.predicate.enrichGap(body.raw) }); }
      catch (e) { json(500, { ok: false, error: e.message }); }
      return true;
    }
    if (pathname === '/api/intelligence/gap/verify') {
      if (!body.gap) { json(400, { ok: false, error: 'gap object required' }); return true; }
      try {
        const result = gap.predicate.verifyClosure(body.gap, { strategy: body.strategy || 'unknown', jobId: body.jobId || null });
        json(200, { ok: true, result });
      } catch (e) { json(500, { ok: false, error: e.message }); }
      return true;
    }

    // ── BDA — behavioral drift analyzer ─────────────────────────────────────
    if (pathname === '/api/intelligence/bda/status') {
      json(200, { ok: true, ...getBDA().state() });
      return true;
    }
    if (pathname === '/api/intelligence/bda/observe') {
      const { role, text } = body;
      if (!role || !text) { json(400, { ok: false, error: 'role and text required' }); return true; }
      const result = getBDA().observe({ role, text });
      if (!result) { json(400, { ok: false, error: 'observation rejected — role must be user/assistant and text non-empty' }); return true; }
      json(200, { ok: true, ...result });
      return true;
    }
    if (pathname === '/api/intelligence/bda/reset') {
      getBDA().reset();
      json(200, { ok: true });
      return true;
    }

    // ── Causal — anomaly classification + compounding-effect analysis ──────
    if (pathname === '/api/intelligence/causal/anomalies') {
      ensureAnomalyInit();
      try {
        const scope = sp.get('scope') || 'recent';
        const limit = parseInt(sp.get('limit') || '20', 10);
        const anomalies = scope === 'open' ? causalAnomaly.openAnomalies() : causalAnomaly.recentAnomalies(limit);
        json(200, { ok: true, ...causalAnomaly.status(), anomalies });
      } catch (e) { json(500, { ok: false, error: e.message }); }
      return true;
    }
    if (pathname === '/api/intelligence/causal/compound') {
      try {
        const graph = mastermind.buildRecentCausalGraph(500);
        if (!graph) { json(503, { ok: false, error: 'no causal graph available yet (CausalGraph class unreachable)' }); return true; }
        const engine = createCompoundEngine({ graph, jaaDB: db });
        const out = body.entryUuid
          ? await engine.analyzeChain(body.entryUuid)
          : body.rootEntry
            ? { ok: true, record: await engine.analyze(body.rootEntry) }
            : null;
        if (!out) { json(400, { ok: false, error: 'entryUuid or rootEntry required' }); return true; }
        json(200, out);
      } catch (e) { json(500, { ok: false, error: e.message }); }
      return true;
    }

    // ── ALK — associative lattice kernel (decision ledger + rewind) ────────
    if (pathname === '/api/intelligence/alk/stats') {
      ensureAlkLoaded();
      json(200, { ok: true, ...alk.stats() });
      return true;
    }
    if (pathname === '/api/intelligence/alk/decisions') {
      ensureAlkLoaded();
      const q = {
        actor:  sp.get('actor')  || undefined,
        intent: sp.get('intent') || undefined,
        since:  sp.get('since')  ? parseInt(sp.get('since'), 10)  : undefined,
        until:  sp.get('until')  ? parseInt(sp.get('until'), 10)  : undefined,
        limit:  sp.get('limit')  ? parseInt(sp.get('limit'), 10)  : 50,
      };
      json(200, { ok: true, decisions: alk.query(q) });
      return true;
    }
    if (pathname === '/api/intelligence/alk/ancestors') {
      ensureAlkLoaded();
      const uuid = sp.get('uuid');
      if (!uuid) { json(400, { ok: false, error: 'uuid required' }); return true; }
      json(200, { ok: true, uuid, ancestors: alk.ancestors(uuid) });
      return true;
    }
    if (pathname === '/api/intelligence/alk/descendants') {
      ensureAlkLoaded();
      const uuid = sp.get('uuid');
      if (!uuid) { json(400, { ok: false, error: 'uuid required' }); return true; }
      json(200, { ok: true, uuid, descendants: alk.descendants(uuid) });
      return true;
    }
    if (pathname === '/api/intelligence/alk/record') {
      ensureAlkLoaded();
      const { actor, intent, payload, causedBy, sigma } = body;
      if (!actor || !intent) { json(400, { ok: false, error: 'actor and intent required' }); return true; }
      try { json(200, { ok: true, decision: alk.record({ actor, intent, payload, causedBy, sigma: sigma ?? getField().entropy }) }); }
      catch (e) { json(400, { ok: false, error: e.message }); }
      return true;
    }
    if (pathname === '/api/intelligence/alk/resolve') {
      ensureAlkLoaded();
      if (!body.uuid) { json(400, { ok: false, error: 'uuid required' }); return true; }
      const node = alk.resolve(body.uuid, body.outcome || {});
      if (!node) { json(404, { ok: false, error: `decision not found in this process's session: ${body.uuid}` }); return true; }
      json(200, { ok: true, decision: node });
      return true;
    }
    if (pathname === '/api/intelligence/alk/rewind') {
      ensureAlkLoaded();
      if (!body.uuid) { json(400, { ok: false, error: 'uuid required' }); return true; }
      const node = alk.rewind(body.uuid, { reason: body.reason || 'user-initiated rewind' });
      if (!node) { json(409, { ok: false, error: `rewind refused — not found or already reversed: ${body.uuid}` }); return true; }
      json(200, { ok: true, rewind: node });
      return true;
    }

    // ── ALK-Perception — composite behavioral state from live telemetry ────
    // Honest partial input: only fields this process actually has (CFR field
    // dims + open-gap count) are supplied; everything else (artifact rate,
    // dispatch rate, truncation, systemsOnline/Total) falls back to
    // extractSignals()'s own defaults rather than being fabricated here.
    if (pathname === '/api/intelligence/perception') {
      try {
        const f = getField();
        const telemetry = {
          gapCount: db.count('gaps', { status: 'open' }) || 0,
          friction: f.friction,
          coherence: f.coherence,
          sigmaScore: 1 - f.entropy,
          ...(body.telemetry || {}), // caller may supply real artifact/dispatch/truncation signals
        };
        const result = getPerceptionKernel().feed(telemetry);
        json(200, { ok: true, ...result, _note: 'partial telemetry — only gapCount/friction/coherence/sigmaScore are this process\'s own live data; other STATES signals use extractSignals() defaults unless supplied in body.telemetry' });
      } catch (e) { json(500, { ok: false, error: e.message }); }
      return true;
    }

    // ── Telemetry-codec — Slope/Stability/Oscillation/Drift over the CFR field ──
    if (pathname === '/api/intelligence/telemetry/frame') {
      try {
        const f = getField();
        const rt = getTelemetryRuntime();
        rt.observe('coherence', f.coherence);
        rt.observe('friction', f.friction);
        rt.observe('resonance', f.resonance);
        rt.observe('entropy', f.entropy);
        const frame = rt.tick();
        json(200, { ok: true, frame, _note: 'derived from CFR field\'s own 4 dimensions, not an independent measurement' });
      } catch (e) { json(500, { ok: false, error: e.message }); }
      return true;
    }

    // ── RFR2 — live per-process causal kernel + relationship traversal ─────
    if (pathname === '/api/intelligence/rfr2/stats') {
      ensureRFR2Live();
      const k = getRFR2Kernel();
      json(200, {
        ok: true, live: _rfr2Live, since: _rfr2Since,
        length: k.length, edgeCount: k.edgeCount, version: k.version,
        droppedCount: k.droppedCount, macroCount: k.macros.length,
        _note: 'this kernel only knows events emitted on nexus-bus since `since` — not backfilled from event_log (see comment above ensureRFR2Live)',
      });
      return true;
    }
    if (pathname === '/api/intelligence/rfr2/query') {
      ensureRFR2Live();
      const cql = sp.get('cql') || body.cql;
      if (!cql) { json(400, { ok: false, error: 'cql query string required, e.g. FIND events WHERE type = \'guardian.job.error\' ORDER BY ts DESC LIMIT 10' }); return true; }
      try {
        const { query: runCQL } = require('./rfr2/query');
        const result = runCQL(cql, getRFR2Kernel());
        json(result.ok === false ? 400 : 200, result);
      } catch (e) { json(500, { ok: false, error: e.message }); }
      return true;
    }
    if (pathname === '/api/intelligence/rfr2/trace') {
      ensureRFR2Live();
      const id = sp.get('id');
      if (!id) { json(400, { ok: false, error: 'id required — an internal RFR2 event id, from /rfr2/query results' }); return true; }
      const depth = parseInt(sp.get('depth') || '50', 10);
      json(200, { ok: true, ...getRFR2Kernel().traceToRoot(id, depth) });
      return true;
    }
    if (pathname === '/api/intelligence/rfr2/descendants') {
      ensureRFR2Live();
      const id = sp.get('id');
      if (!id) { json(400, { ok: false, error: 'id required' }); return true; }
      const depth = parseInt(sp.get('depth') || '30', 10);
      json(200, { ok: true, id, descendants: getRFR2Kernel().descendants(id, depth) });
      return true;
    }
    if (pathname === '/api/intelligence/rfr2/children') {
      ensureRFR2Live();
      const id = sp.get('id');
      if (!id) { json(400, { ok: false, error: 'id required' }); return true; }
      json(200, { ok: true, id, children: [...getRFR2Kernel().getChildren(id)] });
      return true;
    }

    return false;
  }

  // system-lattice is a PER-PROCESS singleton. Cortex used to load() + feed it
  // every 60s in cortex's own process; served from here it would go stale, so
  // the feeder moves with the route (see cortex/boot.js: removed).
  let _latticeTimer = null;
  function startLatticeFeed(intervalMs = 60000) {
    if (_latticeTimer) return;
    try {
      const sysLattice = require('./spatial/system-lattice');
      sysLattice.load();
      const feed = () => {
        try {
          const graph = mastermind.buildRecentCausalGraph();
          if (graph) sysLattice.ingestCFRGraph(graph);
        } catch (e) { console.warn(`[${MODULE_ID}] system-lattice feed failed: ${e.message}`); }
      };
      feed();
      _latticeTimer = setInterval(feed, intervalMs);
      if (_latticeTimer.unref) _latticeTimer.unref();
    } catch (e) { console.warn(`[${MODULE_ID}] system-lattice not available: ${e.message}`); }
  }
  function stopLatticeFeed() { if (_latticeTimer) { clearInterval(_latticeTimer); _latticeTimer = null; } }

  return { owns, handle, buildRCA, buildPatterns, intuition, mastermind, startLatticeFeed, stopLatticeFeed, MODULE_ID };
}

module.exports = { createRoutes, freshReader, MODULE_ID };
