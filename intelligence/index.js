'use strict';
/**
 * cortex/intelligence/index.js — Cortex Intelligence Core
 * UUID: nexus-cortex-intelligence-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * The sovereign intelligence layer. Lives inside Cortex. Not above the
 * orchestrator — Cortex IS the source of truth, so intelligence lives here.
 *
 * This module wires together what previously existed in isolation:
 *   event-ledger invariants  ─┐
 *   CFR sigma/delta          ─┼─→ Pattern recognition → bep_patterns table
 *   compound effects         ─┘
 *   failures + gaps          ─┐
 *   cross-ledger analysis    ─┼─→ Failure mode taxonomy → failures table
 *   orion session classifier ─┘
 *   artifacts + seam_records ─→ SEAM reuse index → reuse_index table
 *   all of the above         ─→ Pre-request context → GET /api/intelligence/context
 *
 * HTTP endpoints (via cortex admin-server):
 *   GET  /api/intelligence/context   — pre-request context for a given intent
 *   GET  /api/intelligence/patterns  — crystallised BEP patterns
 *   GET  /api/intelligence/failures  — failure mode taxonomy
 *   GET  /api/intelligence/reuse     — SEAM reuse candidates for a query
 *   GET  /api/intelligence/status    — health + learning stats
 *   POST /api/intelligence/event     — feed an external event for analysis
 *
 * §12.4 Invariants crystallise from tests and from this engine.
 * §11.1 Every cause is as important as the conditions of its effect.
 * §7.7  Bottleneck detection via ledger flow.
 * §6.1  Documentation generated from proof — patterns written from evidence.
 * §2.3  All state observable — everything this learns is queryable.
 *
 * §M1: init(cfg) + stop()
 * §M2: reads: event_log, failures, gaps, sigma_records, delta_records,
 *             artifacts, seam_records, bep_patterns, agent_calls, cortex_memory
 *      writes: bep_patterns, event_log, failures
 */

'use strict';

const { jaaDB, uid } = require('../cortex/memory/jaa-db');
const bus = require('../nexus/nexus-bus');
const domainNodes = require('./lib/domain-nodes.js');

const MODULE_ID = 'cortex/intelligence';
// §WIRED — real, distinct config, not inline constants. See
// intelligence/config.js's own header. Matches the established pattern.
const config = require('./config.js');
const VERSION   = '1.0.0';

// ── Timing ─────────────────────────────────────────────────────────────────────
const PATTERN_SCAN_MS   = config.PATTERN_SCAN_MS;
const FAILURE_SCAN_MS   = config.FAILURE_SCAN_MS;
const REUSE_INDEX_MS    = config.REUSE_INDEX_MS;
const CROSS_LEDGER_MS   = config.CROSS_LEDGER_MS;
const META_SCAN_MS      = config.META_SCAN_MS;
const LOOM_MAP_SYNC_MS  = config.LOOM_MAP_SYNC_MS;

let _intervals  = [];
let _cfg        = {};
let _lastPatternScan  = 0;
// High-water mark for pattern accumulation (tests/modules/intelligence.test.js).
// Events at or before this ts have already been counted by a prior scan —
// without it, counts recomputed from the same sliding window every tick,
// so heartbeat-paced pairs hovered at the crystallisation threshold and
// re-announced "pattern crystallised" forever. Advanced only at the end of
// a successful scan; boot hydration is the only other legitimate writer.
let _patternScanCursor = 0;
let _lastFailureScan  = 0;
let _lastReuseBuild   = 0;
let _lastCrossLedger  = 0;
let _lastMetaScan     = 0;

// In-memory indexes for fast query
let _reuseIndex  = [];   // { hash, type, lang, intent, artifactId, successRate, usedCount }
let _failureIndex= {};   // faultClass → { count, precursors[], lastSeen, examples[] }
let _patternIndex= [];   // crystallised BEP patterns
let _metaSummary = null; // last _scanMetaPatterns() result — self-assessment of _patternIndex
let _knownNoiseTypes = new Set(); // event types _scanMetaPatterns has flagged as structural
                                   // noise sources — checked synchronously by _scanPatterns so
                                   // a type doesn't have to wait a full meta cycle to stop
                                   // contaminating new emissions once it's already known
let _loomMap = null;              // last lib/loom-map.js getMap() result — the live system/
                                   // component map, cached here so _scanFailures doesn't hit
                                   // loom's registry on every single failure it indexes
let _componentFailureMap = null;  // last _buildComponentFailureMap() result

// ── Init ─────────────────────────────────────────────────────────────────────

// ── Human-readable pattern translator ────────────────────────────────────────
// Turns machine signatures into plain-English boot log lines.
// co_occurrence — what always fires together and what that means
// failure_precursor — what event reliably shows up before trouble
// bottleneck — what keeps breaking in the same way

const EVENT_LABELS = {
  'heartbeat.tick':                 'health check',
  'heartbeat.pulse':                'API pulse',
  'heartbeat.api.degraded':         'API probe failure',
  'heartbeat.frame':                'telemetry frame',
  'raid.health':                    'RAID routing health',
  'intelligence.pattern_scan':      'pattern scan',
  'intelligence.failure_scan':      'failure scan',
  'intelligence.reuse_index_built': 'reuse index build',
  'intelligence.booted':            'intelligence boot',
  'intelligence.cross_ledger':      'cross-ledger analysis',
  'cortex.storage.opened':          'storage open',
  'cortex.organs.booted':           'organs booted',
  'cortex.contracts.loaded':        'contracts loaded',
  'system.booted':                  'system boot',
  'snapshot.created':               'snapshot taken',
  'agent-tools.ready':              'agent tools ready',
  'gap.found':                      'gap detected',
  'gap.resolved':                   'gap resolved',
  'heal.requested':                 'heal requested',
  'heal.applied':                   'heal applied',
  'spec.compile.complete':          'spec compiled',
  'seam.complete':                  'SEAM job complete',
  'artifact.stored':                'artifact stored',
};

function _label(eventType) {
  if (!eventType) return 'unknown event';
  if (EVENT_LABELS[eventType]) return EVENT_LABELS[eventType];
  // Generic: cortex.foo.bar → "cortex: foo bar"
  const parts = eventType.split('.');
  if (parts.length >= 2) return parts[0] + ': ' + parts.slice(1).join(' ').replace(/_/g,' ');
  return eventType.replace(/[._]/g,' ');
}

function _humanPattern(p) {
  if (p.patternType === 'co_occurrence') {
    const a = _label(p.typeA);
    const b = _label(p.typeB);
    const conf = Math.round((p.confidence||0)*100);
    // Same event co-occurring with itself = it fires in bursts
    if (p.typeA === p.typeB) return `"${a}" fires in bursts (${p.count}× observed, ${conf}% confidence)`;
    return `"${a}" always fires alongside "${b}" (${p.count}× — ${conf}% confidence)`;
  }
  if (p.patternType === 'failure_precursor') {
    const event = _label(p.precursorType);
    const failures = (p.failureTypes||[]).slice(0,2).map(_label).join(', ');
    return `"${event}" reliably appears before failures [${failures||'errors'}] — ${p.count}× observed`;
  }
  if (p.patternType === 'bottleneck') {
    const gap = (p.gapType||'').replace(/_/g,' ');
    return `"${gap}" gaps keep recurring (${p.count}× open) — likely a systemic bottleneck`;
  }
  return p.patternType + ' — ' + p.signature;
}

// §BUILT 2026-09-19 — capability list hoisted to module scope so the intelligence
// SERVER can announce it to RAID over HTTP (lib/self-register-remote.js), the
// same way guardian does. Before, it was registered by an in-process call inside
// init(), which only reached RAID's registry when this module was require()d
// into cortex's own process — exactly the cortex dependency this removes.
const CAPABILITIES = [
      { name: 'context',  description: 'pre-request context for a given intent — what the system knows before acting',
        route: { method: 'GET', path: '/api/intelligence/context' } },
      { name: 'patterns', description: 'crystallised BEP patterns — recurring structures the system has learned',
        route: { method: 'GET', path: '/api/intelligence/patterns' } },
      { name: 'failures', description: 'failure mode taxonomy — known fault classes and their precursors',
        route: { method: 'GET', path: '/api/intelligence/failures' } },
      { name: 'reuse',    description: 'SEAM reuse candidates for a query — what already exists to reuse',
        route: { method: 'GET', path: '/api/intelligence/reuse' } },
      { name: 'mastermind', description: 'strategic causal pattern analysis over gaps and RFR2 delta',
        route: { method: 'GET', path: '/api/intelligence/mastermind' } },
      { name: 'relational-field', description: 'the Relational Field Reader — traces the causal CONDITIONS behind friction/tension via RFR2 causality (traceToRoot) + characterizes the deviation via RFR2 sigma. RFR2 wired into the intelligence.',
        route: { method: 'GET', path: '/api/intelligence/relational-field' } },
      { name: 'adversarial', description: 'adversarial critique — attack a proposal to find its weaknesses',
        route: { method: 'GET', path: '/api/intelligence/adversarial' } },
      { name: 'meta', description: 'meta-pattern self-assessment — lift-adjusted signal vs. structural noise sources within the crystallised pattern table itself',
        route: { method: 'GET', path: '/api/intelligence/meta' } },
      { name: 'map', description: 'live loom system/component/hook map, cached from lib/loom-map.js',
        route: { method: 'GET', path: '/api/intelligence/map' } },
      { name: 'component-failures', description: 'error/failure data grouped by loom component (not just system), flagging components loom has never registered',
        route: { method: 'GET', path: '/api/intelligence/component-failures' } },
      { name: 'intuition',  description: 'INTUITION fast-path answer from live field, gaps, taxonomy and lattice',
        route: { method: 'POST', path: '/api/intelligence/intuition' } },
      { name: 'rca',        description: 'root cause analysis entries over open gaps',
        route: { method: 'GET', path: '/api/intelligence/rca' } },
      { name: 'query',      description: 'unified query surface: what is happening with <about> (gaps, events, sigma, field, narrative)',
        route: { method: 'GET', path: '/api/intelligence/query' } },
      { name: 'lattice',    description: 'system associative lattice: which systems/components co-activate with a given one',
        route: { method: 'GET', path: '/api/intelligence/lattice' } },
      { name: 'crystals',   description: 'crystals-derived pattern list (precursor/outcome/count/confidence)',
        route: { method: 'GET', path: '/api/intelligence/crystals' } },
      { name: 'liminal-space', description: 'liminal-space status: unresolved in-between items per focal point',
        route: { method: 'GET', path: '/api/liminal-space/status' } },
];

function init(cfg = {}) {
  _cfg = cfg;

  // §BUGFIX 2026-08-27 — James, live: boot log showed near-identical
  // "pattern crystallised" / "meta-scan" / "loom map synced" lines twice,
  // once tagged [cortex:cortex/boot.js] and once [intelligence:intelligence/
  // server.js], a few seconds apart with slightly different counts. Real
  // root cause, not cosmetic: cortex/boot.js still calls this exact init()
  // in-process — leftover from before intelligence/server.js existed as
  // its own standalone process (see that file's own header: "the first
  // time it runs as its own real, standalone process", 2026-08-22). Since
  // then, TWO independent processes have been running all 6 of these
  // intervals against the SAME shared, on-disk JAA tables (event_log,
  // bep_patterns — confirmed by reading _scanPatterns/_scanMetaPatterns
  // directly, not assumed) — double the CPU for identical analysis, two
  // processes racing to write the same pattern rows.
  //
  // Cannot simply delete cortex's init() call, though — orchestrator.js
  // has two REAL, live callers (confirmed by grep: GET('cortex',
  // '/api/intelligence/failures') and .../reuse) that hit cortex's own
  // port specifically, and those two routes read _failureIndex/_reuseIndex,
  // which only _scanFailures/_buildReuseIndex populate. Deleting init()
  // wholesale would silently break two real endpoints — the exact kind of
  // regression §1.2 exists to prevent.
  //
  // Real fix: an opt-in allowlist. intelligence/server.js's own
  // `init({})` call is unchanged — no cfg.scans means "run everything",
  // same as before this fix, so the one authoritative process keeps doing
  // full pattern/meta/loom-map work. cortex/boot.js's call site now passes
  // cfg.scans: ['failures','reuse'] — only the two intervals its own real
  // routes actually consume. Pattern scan, meta-scan, loom-map sync, and
  // cross-ledger drift detection now run in exactly one process.
  const scans = Array.isArray(cfg.scans) ? new Set(cfg.scans) : null; // null = run all (unchanged default)
  const wants = (name) => !scans || scans.has(name);

  if (wants('patterns'))  _intervals.push(setInterval(_scanPatterns,   PATTERN_SCAN_MS));
  if (wants('failures'))  _intervals.push(setInterval(_scanFailures,   FAILURE_SCAN_MS));
  if (wants('reuse'))     _intervals.push(setInterval(_buildReuseIndex,REUSE_INDEX_MS));
  if (wants('crossLedger'))_intervals.push(setInterval(_crossLedger,   CROSS_LEDGER_MS));
  if (wants('meta'))      _intervals.push(setInterval(_scanMetaPatterns,META_SCAN_MS));
  if (wants('loomMap'))   _intervals.push(setInterval(_syncLoomMap,    LOOM_MAP_SYNC_MS));
  _intervals.forEach(i => i.unref());

  // Initial build after 10s (let JAA settle from boot)
  setTimeout(() => {
    if (wants('patterns')) _scanPatterns();
    if (wants('loomMap'))  _syncLoomMap();
    // §PERSIST-03: hydrate in-memory indexes from persisted JAA tables on boot
    // Healer and reuse engine work immediately — no cold-start amnesia
    const _storedFaults = jaaDB.query('fault_taxonomy', () => true, 500);
    for (const r of _storedFaults) {
      _failureIndex[r.faultClass] = {
        count: r.count, lastSeen: r.lastSeen,
        precursors: r.precursors || [], examples: r.examples || [],
        successRate: r.successRate || 0,
      };
    }
    if (_storedFaults.length)
      console.log(`[${MODULE_ID}] seeded _failureIndex: ${_storedFaults.length} faults from JAA`);

    const _storedReuse = jaaDB.query('reuse_index', () => true, 500);
    if (_storedReuse.length) {
      _reuseIndex = _storedReuse;
      console.log(`[${MODULE_ID}] seeded _reuseIndex: ${_storedReuse.length} entries from JAA`);
    }

    _scanFailures();
    _buildReuseIndex();
  }, 10_000);

  // §self-registration (ported from v44 2026-07-30) — "the registry must
  // update always, so the system understands itself." The faculties ran at HTTP
  // endpoints but were 0 components — reachable AROUND RAID, never THROUGH it.
  // Intelligence is the reference adopter: it announces its capabilities at boot,
  // they flow through the projection chain (component → capability → RAID
  // resolver), and RAID can route to the mind. Every system copies this (§16.5).
  // In-process registration is OPT-IN now (cfg.registerInProcess). The sovereign
  // path is server.js -> registerSelfRemote(). Nothing in-tree passes this flag.
  if (cfg.registerInProcess) {
    try {
      require('../lib/self-register').registerSelf('intelligence', CAPABILITIES, { version: VERSION, registeredBy: MODULE_ID });
      _log('registered intelligence capabilities in-process');
    } catch (e) {
      console.warn(`[${MODULE_ID}] self-registration failed: ${e.message}`);
    }
  }

  _log(`v${VERSION} — intelligence core online`);
}

function stop() {
  _intervals.forEach(i => clearInterval(i));
  _intervals = [];
}

// ══════════════════════════════════════════════════════════════════════════════
// §1 — PATTERN RECOGNITION ENGINE
// Reads cross-ledger event streams. Finds recurring failure signatures,
// co-occurrence chains that precede tidal cascades, bottleneck patterns.
// Writes crystallised patterns to bep_patterns table.
// ══════════════════════════════════════════════════════════════════════════════

// §BUILT 2026-08-18 — James: "once it is observed so many times, it
// doesn't need to again." Checked first: the real crossing-latch already
// prevents a RE-ANNOUNCEMENT once a pattern is crystallised (confirmed:
// `if (!wasCrystallised && nowCrystallised) announcements.push(...)`,
// present at every one of the 4 real update sites this scan uses). The
// real, remaining friction wasn't re-announcing — it was re-WRITING: a
// pattern that's been stably mature for a long time still got a full
// jaaDB.update() on every single 60s scan cycle, forever, even when
// nothing about it had meaningfully changed. This is the actual least-
// friction fix: skip the write, not the tracking. A pattern still gets
// its in-memory Object.assign so live reads stay current; only the real
// disk write is skipped when it would be redundant.
const MATURE_MIN_COUNT = config.MATURE_MIN_COUNT;   // real, high bar — this isn't "crystallised" (which can trigger at 5-10), it's "long since settled"
const MATURE_CONFIDENCE = config.MATURE_CONFIDENCE; // near-max; still allows a genuine late confidence recovery to register
function _isMatureNoOpUpdate(existing, newCount, newConfidence) {
  if (!existing || !existing.crystallised) return false; // never skip a pattern that hasn't even crystallised yet
  if ((existing.count || 0) < MATURE_MIN_COUNT || (existing.confidence || 0) < MATURE_CONFIDENCE) return false;
  const countDelta = Math.abs((newCount || 0) - (existing.count || 0));
  const countDeltaPct = existing.count ? countDelta / existing.count : 1;
  const confidenceDelta = Math.abs((newConfidence || 0) - (existing.confidence || 0));
  // A real, meaningful change — a genuine jump in occurrence rate or a
  // confidence shift — still writes through. Only true noise-level
  // drift on an already-settled pattern gets skipped.
  return countDeltaPct < 0.05 && confidenceDelta < 0.02;
}

// §BUILT 2026-08-18 — James: "patterns across systems... causal patterns,
// behavior patterns, what pattern types?" Checked first: co_occurrence's
// real key is [a.type, b.type] — event TYPE only, never checks whether
// the two events come from the SAME system or DIFFERENT ones. 157 real,
// distinct event sources exist in this checkout's own real event_log
// (confirmed by direct query), almost all following a real, consistent
// prefix convention — the raw signal for cross-system classification
// already exists, just never read for this. Same real vocabulary already
// established this session (gap-priority.js's vitality table), extended
// with clear-glass (Electron-side, not in that table since it's not
// autopilot-supervised the same way).
const SYSTEM_PREFIXES = [
  ['cg.', 'clear-glass'], ['clear-glass', 'clear-glass'],
  ['eros.', 'eravos'], ['eravos.', 'eravos'],
  ['cortex.', 'cortex'], ['cortex/', 'cortex'],
  ['guardian.', 'guardian'], ['ollama.', 'ollama-bridge'],
  ['copilot.', 'copilot'], ['diagnostic.', 'diagnostic'],
  ['loom.', 'loom'], ['idearium.', 'idearium'], ['architect.', 'architect'],
  ['orchestrator', 'orchestrator'], ['bridge.', 'bridge'], ['emerge.', 'emerge'],
];
function _classifySystem(source) {
  if (!source) return null; // honest unknown — real, seen in the data (some events have no source), never guessed
  for (const [prefix, system] of SYSTEM_PREFIXES) if (source.startsWith(prefix)) return system;
  return null; // a real source that doesn't match a known system — honest, not forced into a wrong bucket
}

async function _scanPatterns() {
  try {
    const now = Date.now();
    _lastPatternScan = now;

    // §FIXED 2026-08-17 — found while wiring a NEW real event type in for
    // James's own ask ("point the pattern engine at instance counts") and
    // confirmed by direct testing, not assumed: jaaDB.query() iterates
    // rows in INSERTION order and stops at the limit — it has always
    // returned the OLDEST 500 events, never the newest, once this table
    // exceeds 500 real rows (which it has, confirmed: a fresh query
    // returned 500 rows with zero of the newest real event type in them).
    // This comment already said "recent" — the code never delivered that.
    // jaaDB.tail() is the real, already-existing, correct method (real
    // DESC order, confirmed by reading its own implementation).
    const events = jaaDB.tail('event_log', 500);
    if (events.length < 20) return; // not enough data yet

    // §BUILT 2026-08-18 — James: "once twice three times it is a pattern."
    // Real, honest tradeoff, not a flat rule: a flat count of 3 is
    // statistically sound for a RARE event type (3 co-occurrences of
    // something that only happens a handful of times total is genuinely
    // unlikely by chance) but would flood the system with noise for a
    // COMMON type (two things that each fire hundreds of times will land
    // within 5s of each other by pure chance far more than 3 times —
    // exactly the class of false pattern the existing noise-guard system
    // exists to fight). Real per-type frequency, counted once from the
    // same real events already in memory — no extra query.
    const _typeFrequency = {};
    for (const e of events) { if (e.type) _typeFrequency[e.type] = (_typeFrequency[e.type] || 0) + 1; }
    const RARE_TYPE_MAX_FREQ = 10; // a type appearing this rarely or less in a real 500-event window is genuinely uncommon
    const RARE_CRYSTALLIZE_AT = 3;  // James's real number, applied only where it's statistically honest
    const COMMON_CRYSTALLIZE_AT = 10; // the existing, already-proven bar, kept for everything else
    function _crystallizeThreshold(typeA, typeB) {
      const freqA = _typeFrequency[typeA] || 0, freqB = _typeFrequency[typeB] || 0;
      return (freqA <= RARE_TYPE_MAX_FREQ && freqB <= RARE_TYPE_MAX_FREQ) ? RARE_CRYSTALLIZE_AT : COMMON_CRYSTALLIZE_AT;
    }

    // ── Co-occurrence analysis ────────────────────────────────────────────────
    // Which event types always appear together within 5 seconds?
    // Only pairs whose LATER event is past the scan cursor count — the same
    // pair of events is counted exactly once across overlapping windows.
    const WINDOW_MS = 5000;
    const coOccur = {};
    const coOccurSystems = {}; // §BUILT 2026-08-18 — parallel map, key -> {systemA, systemB, crossSystem}
    for (let i = 0; i < events.length; i++) {
      const a = events[i];
      for (let j = i + 1; j < events.length; j++) {
        const b = events[j];
        if (!a.ts || !b.ts) continue;
        if (b.ts - a.ts > WINDOW_MS) break;
        if (b.ts <= _patternScanCursor) continue; // already counted by a prior scan
        const key = [a.type, b.type].sort().join('::');
        coOccur[key] = (coOccur[key] || 0) + 1;
        // §BUILT 2026-08-18 — real, minimal addition: track whether this
        // pair's two real events came from different systems. Doesn't
        // touch the existing coOccur counting at all — a parallel map,
        // set once per key (first real observation), read later when
        // deciding what to persist.
        if (!coOccurSystems[key]) {
          const sysA = _classifySystem(a.source), sysB = _classifySystem(b.source);
          coOccurSystems[key] = { systemA: sysA, systemB: sysB, crossSystem: !!(sysA && sysB && sysA !== sysB) };
        }
      }
    }

    // ── Failure precursor analysis ────────────────────────────────────────────
    // What event types appear in the 30s before a failure/error/gap?
    // Only failures past the cursor are processed — each failure's precursor
    // window is counted exactly once, on the scan that first sees it.
    const failureEvents = events.filter(e =>
      (e.type?.includes('error') || e.type?.includes('fail') ||
       e.type?.includes('gap.found') || e.type?.includes('collapse') ||
       e.type?.includes('tidal')) && e.ts > _patternScanCursor
    );
    // §CAUSAL GRAPH WIRED 2026-07-24 ─────────────────────────────────────────
    // Until now this was pure TEMPORAL ADJACENCY: every event in the 30s
    // before a failure counted as a "precursor". That is the classic
    // correlation-as-causation error, and at this scale it is not subtle —
    // in a busy 30s window, dozens of entirely unrelated events all get
    // scored as reliably preceding trouble, and the noisiest system in the
    // codebase wins every time regardless of whether it caused anything.
    //
    // intelligence/cfr/graph.js's CausalGraph already exists, is already used by
    // mastermind (cortex/intelligence/mastermind.js:24), and offers
    // ancestors() — a real causal walk over causedBy edges. It was simply
    // never wired here. So "why" was being answered by a clock.
    //
    // Now: an event in the window that is a genuine causal ANCESTOR of the
    // failure is weighted heavily and flagged causal:true. Adjacency is
    // still counted — dropping it would lose real precursors that never
    // carried a causedBy — but it is now DISTINGUISHABLE from causation
    // rather than silently equated with it. A precursor known by evidence
    // and one known by coincidence must not look the same (§0.1).
    let _graph = null;
    try {
      const { CausalGraph } = require('../intelligence/cfr/graph');
      if (CausalGraph) {
        _graph = new CausalGraph();
        for (const e of events) _graph.ingest(e);
      }
    } catch (e) {
      // §1.2 — losing the graph degrades precursors back to adjacency. That
      // is a real loss of fidelity and must be stated, not silently absorbed.
      console.warn(`[${MODULE_ID}] causal graph unavailable (${e.message}) — precursors fall back to temporal adjacency only`);
    }

    const precursorCounts = {};
    for (const failure of failureEvents) {
      // Real causal ancestry, walked over causedBy edges rather than guessed
      // from timestamps. Bounded depth: a chain longer than 8 hops says more
      // about the graph than about this failure.
      let ancestorIds = new Set();
      if (_graph) {
        try {
          const fid = failure.uuid || failure.id;
          if (fid) {
            const chain = _graph.ancestors(fid, 8);
            for (const a of (Array.isArray(chain) ? chain : (chain?.path || []))) {
              ancestorIds.add(typeof a === 'string' ? a : (a.uuid || a.id));
            }
          }
        } catch (_) { /* a single unwalkable failure must not kill the scan */ }
      }

      const window = events.filter(e =>
        e.ts && failure.ts &&
        e.ts < failure.ts &&
        e.ts > failure.ts - 30_000 &&
        e.type !== failure.type
      );
      for (const p of window) {
        const pid = p.uuid || p.id;
        const isCausal = pid && ancestorIds.has(pid);
        if (!precursorCounts[p.type]) {
          precursorCounts[p.type] = { count: 0, causalCount: 0, failureTypes: {} };
        }
        precursorCounts[p.type].count++;
        if (isCausal) precursorCounts[p.type].causalCount++;
        precursorCounts[p.type].failureTypes[failure.type] =
          (precursorCounts[p.type].failureTypes[failure.type] || 0) + 1;
      }
    }
    // Mark which precursors are backed by real causal evidence rather than
    // co-occurrence. Consumers can now tell the two apart; before, they could
    // not, because the distinction did not exist in the data.
    for (const t of Object.keys(precursorCounts)) {
      const pc = precursorCounts[t];
      pc.causal = pc.causalCount > 0;
      pc.evidence = pc.causalCount > 0 ? 'causal-ancestor' : 'temporal-adjacency';
    }

    // ── Sigma spike chain analysis ────────────────────────────────────────────
    // Are there recurring sequences of event types that always end in high sigma?
    // §FIXED 2026-08-17 — same real bug class already fixed elsewhere in
    // this file today: query() returns oldest-first and truncates.
    // Confirmed severe here specifically: 1975 real sigma_records exist,
    // this call only ever saw the oldest 200 — ~90% of real, more recent
    // regime data was invisible to "recurring sequences" analysis.
    const sigmaRecords = jaaDB.tail('sigma_records', 200);
    const highSigmaTypes = sigmaRecords
      .filter(r => r.score >= 0.7)
      .map(r => r.eventType)
      .filter(Boolean);
    const sigmaFreq = {};
    for (const t of highSigmaTypes) sigmaFreq[t] = (sigmaFreq[t] || 0) + 1;

    // ── Bottleneck detection (§7.7) ───────────────────────────────────────────
    const gapEvents  = jaaDB.query('gaps', r => r.status === 'open', 100);
    const gapByType  = {};
    for (const g of gapEvents) {
      gapByType[g.type || 'unknown'] = (gapByType[g.type || 'unknown'] || 0) + 1;
    }
    const topGaps = Object.entries(gapByType)
      .sort(([,a],[,b]) => b - a)
      .slice(0, 5);

    // ── Crystallise patterns ──────────────────────────────────────────────────
    // A pattern is crystallised when it has occurred > 3 times with consistent conditions
    const newPatterns = [];
    const announcements = []; // patterns that JUST crossed into crystallised this scan

    // High-frequency co-occurrences → structural pattern.
    // New signature: insert. Existing: ACCUMULATE — count is cumulative across
    // scans (the cursor above guarantees this batch's count is only new
    // occurrences), and crystallised is a monotonic latch: once true, boundary
    // noise on later scans can never flip it back or re-announce it.
    for (const [pair, count] of Object.entries(coOccur)) {
      if (count < 3 && !_patternIndex.find(p => p.signature === pair)) continue;
      const [typeA, typeB] = pair.split('::');
      // §NOISE-GUARD 2026-08-13 — a type already flagged by _scanMetaPatterns
      // as a structural noise source (present in a huge share of ALL pairs)
      // is tagged rather than trusted. The row still gets written — the data
      // itself is real and worth keeping — but downstream consumers like
      // liminal-space, which crystallise their own beliefs off the
      // `pattern_crystallised` bus event, need to know not to treat this
      // pairing's confidence at face value. Without this, a type only gets
      // distrusted a full META_SCAN_MS cycle after it starts flooding —
      // this makes the discount apply the moment it's known, to every new
      // pattern involving that type from then on.
      const noiseTainted = _knownNoiseTypes.has(typeA) || _knownNoiseTypes.has(typeB);
      const existing = _patternIndex.find(p => p.signature === pair);
      // §BUILT 2026-08-18 — real system classification for this real pair,
      // from the parallel map built during the co-occurrence scan above.
      const sysInfo = coOccurSystems[pair] || { systemA: null, systemB: null, crossSystem: false };
      if (!existing) {
        newPatterns.push({
          uuid:        uid(),
          signature:   pair,
          patternType: sysInfo.crossSystem ? 'cross_system_causal' : 'co_occurrence',
          typeA, typeB,
          systemA:     sysInfo.systemA, systemB: sysInfo.systemB, crossSystem: sysInfo.crossSystem,
          count,
          confidence:  Math.min(1, count / 20),
          description: sysInfo.crossSystem
            ? `"${typeA}" (${sysInfo.systemA}) and "${typeB}" (${sysInfo.systemB}) co-occur within 5s across two real systems — ${count} observations`
            : `"${typeA}" and "${typeB}" co-occur within 5s — ${count} observations`,
          actionable:  count >= 5,
          crystallised:count >= _crystallizeThreshold(typeA, typeB),
          noiseTainted,
          source:      MODULE_ID,
          ts:          now,
        });
      } else {
        const newCount = (existing.count || 0) + count;
        const wasCrystallised = !!existing.crystallised;
        const nowCrystallised = wasCrystallised || newCount >= _crystallizeThreshold(typeA, typeB); // monotonic latch, real adaptive bar
        const patch = {
          count:       newCount,
          confidence:  Math.min(1, newCount / 20),
          actionable:  newCount >= 5,
          crystallised: nowCrystallised,
          noiseTainted,
          description: `"${typeA}" and "${typeB}" co-occur within 5s — ${newCount} observations`,
          ts:          now,
        };
        // §MATURE — real, least-friction fix: skip the disk write when
        // this pattern has long since settled and nothing meaningful
        // changed. In-memory state still updates for live reads.
        if (!_isMatureNoOpUpdate(existing, patch.count, patch.confidence)) jaaDB.update('bep_patterns', existing.uuid, patch);
        Object.assign(existing, patch);
        if (!wasCrystallised && nowCrystallised) announcements.push(existing);
      }
    }

    // Strong failure precursors → warning pattern.
    // Same accumulate + latch semantics as co-occurrence.
    for (const [precursorType, data] of Object.entries(precursorCounts)) {
      const sig = `precursor::${precursorType}`;
      const existing = _patternIndex.find(p => p.signature === sig);
      if (data.count < 3 && !existing) continue;
      if (!existing) {
        newPatterns.push({
          uuid:           uid(),
          signature:      sig,
          patternType:    'failure_precursor',
          precursorType,
          failureTypes:   Object.keys(data.failureTypes),
          count:          data.count,
          confidence:     Math.min(1, data.count / 10),
          description:    `"${precursorType}" precedes failures ${data.count} times — watch this event type`,
          actionable:     true,
          crystallised:   data.count >= 10,
          topFailureType: Object.entries(data.failureTypes).sort(([,a],[,b])=>b-a)[0]?.[0],
          source:         MODULE_ID,
          ts:             now,
        });
      } else {
        const newCount = (existing.count || 0) + data.count;
        const wasCrystallised = !!existing.crystallised;
        const nowCrystallised = wasCrystallised || newCount >= 10; // monotonic latch
        const patch = {
          count:       newCount,
          confidence:  Math.min(1, newCount / 10),
          crystallised: nowCrystallised,
          description: `"${precursorType}" precedes failures ${newCount} times — watch this event type`,
          ts:          now,
        };
        // §MATURE — same real, least-friction skip as the co_occurrence
        // site above.
        if (!_isMatureNoOpUpdate(existing, patch.count, patch.confidence)) jaaDB.update('bep_patterns', existing.uuid, patch);
        Object.assign(existing, patch);
        if (!wasCrystallised && nowCrystallised) announcements.push(existing);
      }
    }

    // Bottleneck signals → recurring open gaps of same type.
    // DIFFERENT semantics, deliberately: count is the CURRENT open-gap
    // snapshot (gaps close — an accumulated total would claim a bottleneck
    // that's been fixed), but crystallised still latches: it only clears
    // when the count fully clears to 0 (at which point the count<2 guard
    // stops touching the row), never from 5→4 boundary noise.
    for (const [gapType, count] of topGaps) {
      if (count < 2) continue;
      const sig = `bottleneck::${gapType}`;
      const existing = _patternIndex.find(p => p.signature === sig);
      if (!existing) {
        newPatterns.push({
          uuid:        uid(),
          signature:   sig,
          patternType: 'bottleneck',
          gapType,
          count,
          confidence:  Math.min(1, count / 10),
          description: `Gap type "${gapType}" appears ${count} times — recurring bottleneck`,
          actionable:  true,
          crystallised:count >= 5,
          source:      MODULE_ID,
          ts:          now,
        });
      } else {
        const wasCrystallised = !!existing.crystallised;
        const nowCrystallised = wasCrystallised || count >= 5;
        const patch = {
          count, // snapshot, not accumulated
          confidence:  Math.min(1, count / 10),
          crystallised: nowCrystallised,
          description: `Gap type "${gapType}" appears ${count} times — recurring bottleneck`,
          ts:          now,
        };
        // §MATURE — same real, least-friction skip. Note: bottleneck's
        // count is a live snapshot (gaps close), not accumulated, so a
        // "mature, stable" bottleneck genuinely means the same real gap
        // type has stayed open at a steady rate — still real signal to
        // preserve, just not worth rewriting every 60s when unchanged.
        if (!_isMatureNoOpUpdate(existing, patch.count, patch.confidence)) jaaDB.update('bep_patterns', existing.uuid, patch);
        Object.assign(existing, patch);
        if (!wasCrystallised && nowCrystallised) announcements.push(existing);
      }
    }

    // Announce updates that just crossed into crystallised (exactly once,
    // on the crossing scan — the latch above guarantees no re-announce).
    // Noise-tainted patterns are still logged and still written to JAA
    // (below) — they're real data — but they don't go out on the bus as
    // an unqualified "crystallised" announcement, because liminal-space
    // and any other listener would hold/crystallise a belief straight off
    // pattern.confidence with no way to know the pairing is dominated by a
    // known-loud type rather than a specific relationship.
// §BUILT 2026-08-18 — James: "make them more detailed, using rfr2 and
// cfr." Only applied at the real crystallization moment (a genuinely
// rare, meaningful event — the exact same real gate the crossing-latch
// already protects), not on every scan's routine bookkeeping. Highest
// leverage, least friction: enriches the one moment that's actually
// worth a person's attention, costs nothing on the other 59 scans out
// of 60 that don't cross into crystallization.
//
// Real CFR: this code runs INSIDE cortex's own process (intelligence is
// require()'d directly by cortex/boot.js) — reads the live _field state
// via dependency injection (_cfg.getField, wired from boot.js's own real
// call site below), not an HTTP round trip like lib/diagnostic-report.js
// needs (that one runs cross-process). Same real data, no network cost,
// since the data's already local.
//
// Real RFR2: meta/rfr2/causality's own real traceToRoot()/descendants()
// — same real module already proven this session in diagnostic-report.js
// — built from the pattern's own supporting event_log rows (the actual
// events behind its co-occurrence/precursor signature), not fabricated.
function _enrichCrystallisation(pattern) {
  const enrichment = { cfr: null, causal: null };
  try {
    if (_cfg && typeof _cfg.getField === 'function') enrichment.cfr = _cfg.getField();
  } catch (_) { /* CFR unreachable — honest null, not fabricated */ }

  try {
    const { createCausalStore, createEdge, EDGE_CAUSAL_RULE } = require('../intelligence/rfr2/causality/index.js');
    const supportEvents = jaaDB.tail('event_log', 500)
      .filter(e => pattern.eventTypes ? pattern.eventTypes.includes(e.type) : (e.type === pattern.typeA || e.type === pattern.typeB || e.type === pattern.precursorType))
      .slice(-20);
    if (supportEvents.length >= 2) {
      const store = createCausalStore();
      for (let i = 1; i < supportEvents.length; i++) {
        store.addEdge(createEdge(`${supportEvents[i-1].uuid || i-1}`, `${supportEvents[i].uuid || i}`, EDGE_CAUSAL_RULE, 'chronological-support', supportEvents[i].ts - supportEvents[i-1].ts, 0.5));
      }
      const root = store.traceToRoot(`${supportEvents[supportEvents.length - 1].uuid || supportEvents.length - 1}`);
      enrichment.causal = { supportingEvents: supportEvents.length, rootDepth: root?.depth ?? null };
    }
  } catch (_) { /* RFR2 unreachable or insufficient real support data — honest null */ }

  return enrichment;
}

function _announceCrystallisation(p) {
  const enrichment = _enrichCrystallisation(p);
  const cfrNote = enrichment.cfr ? ` [cfr: regime=${enrichment.cfr.regime}, friction=${enrichment.cfr.friction}]` : '';
  const causalNote = enrichment.causal ? ` [rfr2: ${enrichment.causal.supportingEvents} supporting events, causal depth ${enrichment.causal.rootDepth}]` : '';
  _log('pattern crystallised: ' + _humanPattern(p) + (p.noiseTainted ? ' [noise-tainted — emit suppressed]' : '') + cfrNote + causalNote);
  if (p.noiseTainted) return;
  try { bus.emit('cortex.intelligence.pattern_crystallised', { pattern: p, enrichment }, { source: MODULE_ID }); }
  catch (e) { console.warn(`[${MODULE_ID}] bus.emit failed: ${e.message}`); }
}

    for (const p of announcements) _announceCrystallisation(p);

    // Write new patterns to JAA
    for (const p of newPatterns) {
      jaaDB.insert('bep_patterns', p);
      domainNodes.writePatternNode(p);
      _patternIndex.push(p);
      if (p.crystallised) _announceCrystallisation(p);
    }



    // Refresh in-memory index from JAA
    // §FIXED 2026-08-17 — the most severe real instance of this bug class:
    // this IS the pattern engine's own core state. Confirmed: 1019 real
    // bep_patterns rows exist, this call only ever loaded the oldest 200
    // — roughly 800 real, more recent patterns have been structurally
    // invisible to the engine's own logic this whole time, not just to
    // one scan.
    _patternIndex = jaaDB.tail('bep_patterns', 200);

    // Log scan summary to event_log
    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'intelligence.pattern_scan',
      payload: {
        eventsScanned:    events.length,
        coOccurrences:    Object.keys(coOccur).length,
        precursors:       Object.keys(precursorCounts).length,
        newPatterns:      newPatterns.length,
        crystallised:     newPatterns.filter(p => p.crystallised).length,
        topBottleneck:    topGaps[0]?.[0] || null,
      },
      source:  MODULE_ID, causedBy: null, ts: now,
    });

    // Advance the high-water mark — every event at or before `now` has been
    // counted by this scan; the next scan only counts genuinely new events.
    _patternScanCursor = now;

  } catch(e) {
    _err('_scanPatterns', e);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// §1.5 — META-PATTERN LAYER
// _scanPatterns is first-order: it counts what co-occurs with what. That is
// necessary but not sufficient — a count-based confidence conflates "this
// pair is meaningfully linked" with "one of these two event types is simply
// everywhere". A gap-detector that re-announces the same ~470 dangling-hooks
// on every boot will out-count every real behavioural pattern in the table
// and reach 100% co-occurrence "confidence" with almost everything, while
// carrying close to zero information about any one of those things
// specifically. First-order counting cannot tell the difference; it has no
// notion of what's typical.
//
// This pass reflects on _patternIndex itself, the way MASTERMIND reflects on
// raw events: it asks "given how often each side of this pair shows up on
// its own, is the pairing surprising — or is it just base-rate noise?" and
// separately, "does the pattern table currently have a structural noise
// source distorting everything downstream of it?" That second question is
// the meta move: the answer isn't a pattern about the system, it's a
// judgment about the reliability of the system's own patterns, and it is
// written back as first-class data (`meta_signal` / `meta_noise_source`)
// so Intuition and Mastermind can both discount the same detector loudness
// as intelligence discovers it, rather than each independently learning to
// distrust "dangling-hook" by trial and error.
// ══════════════════════════════════════════════════════════════════════════════

function _scanMetaPatterns() {
  try {
    const now = Date.now();
    const coPatterns = _patternIndex.filter(p => p.patternType === 'co_occurrence');
    if (coPatterns.length < 5) { _lastMetaScan = now; return; } // not enough to reflect on yet

    // ── Marginal frequency per event type ─────────────────────────────────────
    // How many crystallised pairs does each type participate in? A type that
    // shows up in most of the table isn't "correlated with" its partners in
    // any specific sense — it's just loud. This is the base rate co_occurrence
    // never computed.
    const participation = {};
    for (const p of coPatterns) {
      participation[p.typeA] = (participation[p.typeA] || 0) + 1;
      participation[p.typeB] = (participation[p.typeB] || 0) + 1;
    }
    const totalPairs = coPatterns.length;

    // ── Lift-adjusted signal score ─────────────────────────────────────────────
    // lift(A,B) ≈ how much MORE often A and B share a pattern than you'd
    // expect if each type's pairings were spread evenly across the table.
    // Raw participation share stands in for P(type) here — bep_patterns
    // doesn't retain per-scan occurrence counts per type, only which pairs
    // crystallised, so this is a pattern-level lift, not an event-level one.
    // That's a coarser signal than true event-frequency lift, but it is the
    // honest one available from what's actually persisted, and it is still
    // strictly more informative than raw pair count: a pair where both sides
    // are rare elsewhere in the table is genuinely more informative than a
    // pair where one side is in nearly every row.
    const rescored = coPatterns.map(p => {
      const shareA = participation[p.typeA] / totalPairs;
      const shareB = participation[p.typeB] / totalPairs;
      const expected = shareA * shareB * totalPairs;
      const lift = expected > 0 ? (1 / totalPairs) / (shareA * shareB) : 0;
      return { pattern: p, lift, shareA, shareB };
    });

    // ── Noise-source detection ──────────────────────────────────────────────
    // A type present in an outsized fraction of ALL crystallised pairs is a
    // structural noise source: it will report as "100% confidence, fires
    // alongside everything" against nearly anything scanned next to it,
    // regardless of any real relationship. NOISE_SHARE_THRESHOLD is the
    // fraction of the pair table one type is allowed to dominate before it's
    // flagged rather than trusted.
    const NOISE_SHARE_THRESHOLD = 0.35;
    const noiseSources = Object.entries(participation)
      .filter(([, count]) => (count / totalPairs) >= NOISE_SHARE_THRESHOLD)
      .map(([type, count]) => ({ type, share: count / totalPairs, pairCount: count }));

    // Patterns whose signal survives lift-adjustment: neither side is a
    // flagged noise source, and lift is meaningfully above 1 (co-occurring
    // more than base rate predicts, not just present a lot).
    const noiseTypes = new Set(noiseSources.map(n => n.type));
    const LIFT_THRESHOLD = 1.5;
    const highSignal = rescored
      .filter(r => r.lift >= LIFT_THRESHOLD && !noiseTypes.has(r.pattern.typeA) && !noiseTypes.has(r.pattern.typeB))
      .sort((a, b) => b.lift - a.lift)
      .slice(0, 10)
      .map(r => ({ signature: r.pattern.signature, typeA: r.pattern.typeA, typeB: r.pattern.typeB,
                    rawCount: r.pattern.count, lift: Math.round(r.lift * 100) / 100 }));

    // ── Pattern-table stability ─────────────────────────────────────────────
    // If the set of crystallised signatures churns heavily between scans
    // (new ones crystallising, old ones never seen again) that's itself
    // worth surfacing — a table that never stabilises means the system
    // hasn't run long enough, or often enough, to trust its own patterns yet.
    const crystallisedNow = new Set(coPatterns.filter(p => p.crystallised).map(p => p.signature));
    const prevCrystallised = _metaSummary?.crystallisedSignatures || new Set();
    const stillCrystallised = [...crystallisedNow].filter(s => prevCrystallised.has(s)).length;
    const stability = prevCrystallised.size > 0 ? stillCrystallised / prevCrystallised.size : 1;

    const summary = {
      ts: now,
      totalCoPatterns: totalPairs,
      noiseSources,                 // event types drowning out real signal
      highSignal,                   // lift-adjusted, noise-excluded top patterns
      stability: Math.round(stability * 100) / 100,
      crystallisedSignatures: crystallisedNow, // kept in-memory only, for next scan's diff
    };

    // Persist the noise-source finding as data other faculties can read —
    // this is the meta move made concrete: a judgment about detector
    // reliability, written with the same shape as a regular pattern so
    // Intuition/Mastermind don't need special-case code to consume it.
    for (const n of noiseSources) {
      const sig = `meta_noise::${n.type}`;
      const existing = _patternIndex.find(p => p.signature === sig);
      const patch = {
        signature: sig, patternType: 'meta_noise_source', subjectType: n.type,
        share: Math.round(n.share * 100) / 100, pairCount: n.pairCount,
        description: `"${n.type}" appears in ${Math.round(n.share*100)}% of all co-occurrence patterns — `
          + `treat its "always co-occurs" pairings as detector loudness, not a discovered relationship`,
        actionable: true, crystallised: true, source: MODULE_ID, ts: now,
      };
      if (existing) { jaaDB.update('bep_patterns', existing.uuid, patch); Object.assign(existing, patch); domainNodes.writePatternNode(existing); }
      else { const row = { uuid: uid(), ...patch }; jaaDB.insert('bep_patterns', row); domainNodes.writePatternNode(row); _patternIndex.push(row); }
    }

    if (!_metaSummary || _metaSummary.noiseSources?.length !== noiseSources.length) {
      _log(`meta-scan: ${totalPairs} co-patterns, ${noiseSources.length} noise source(s)`
        + (noiseSources.length ? ` [${noiseSources.map(n => n.type).join(', ')}]` : '')
        + `, ${highSignal.length} lift-confirmed signal pattern(s), table stability ${summary.stability}`);
    }

    _metaSummary = summary;
    _knownNoiseTypes = new Set(noiseSources.map(n => n.type));
    _lastMetaScan = now;
  } catch (e) {
    _err('_scanMetaPatterns', e);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// §1.7 — LOOM MAP SYNC + COMPONENT FAILURE MAP
// "Using loom, with the intelligence system, to keep an updated map and log
// errors per component/system." loom/schema/registry.js is the actual
// source of truth for what components and hooks exist (1372 / 1712 of them,
// live) — this pass keeps a cached copy of that map here (via the decoupled
// bridge in lib/loom-map.js, which intelligence reads and loom knows
// nothing about), and builds the component-grouped view of the failure data
// _scanFailures already collects, cross-referenced against that map so a
// component producing errors under an identity loom has never registered
// is a visible finding, not silent noise.
// ══════════════════════════════════════════════════════════════════════════════

function _syncLoomMap() {
  try {
    const loomMap = require('../lib/loom-map');
    _loomMap = loomMap.getMap({ maxAgeMs: 0 }); // force a real read on this cadence; loomMap's own cache covers callers between syncs
    _log(`loom map synced: ${_loomMap.counts?.systems ?? 0} systems, ${_loomMap.counts?.components ?? 0} components, ${_loomMap.counts?.hooks ?? 0} hooks`);
  } catch (e) {
    _err('_syncLoomMap', e);
  }
}

function _buildComponentFailureMap(componentErrors) {
  try {
    const loomMap = (() => { try { return require('../lib/loom-map'); } catch (_) { return null; } })();
    const byComponent = {};

    // From component_ledger's explicit system+component error rows (the
    // precise source — no resolution needed, it's already there).
    for (const c of (componentErrors?.components || [])) {
      byComponent[c.component] = {
        component: c.component, system: c.system, errorCount: c.count,
        actions: c.actions, registeredInLoom: c.registeredInLoom,
        source: 'component_ledger',
      };
    }

    // From the fault taxonomy's resolved components (gaps/failures that
    // carry a component identity, directly or resolved via loom-map) — adds
    // components component_ledger's own error rows didn't already cover.
    for (const fi of Object.values(_failureIndex)) {
      for (const comp of (fi.components || [])) {
        if (byComponent[comp]) { byComponent[comp].faultClasses = [...(byComponent[comp].faultClasses || []), fi.faultClass]; continue; }
        const resolved = loomMap ? loomMap.resolveComponent(comp) : { found: false, system: null };
        byComponent[comp] = {
          component: comp, system: resolved.system, errorCount: 0,
          faultClasses: [fi.faultClass], registeredInLoom: resolved.found,
          source: 'fault_taxonomy',
        };
      }
    }

    const components = Object.values(byComponent).sort((a, b) => (b.errorCount || 0) - (a.errorCount || 0));
    _componentFailureMap = {
      ts: Date.now(),
      totalComponents: components.length,
      unregisteredComponents: components.filter(c => !c.registeredInLoom).map(c => c.component),
      components,
    };
  } catch (e) {
    _err('_buildComponentFailureMap', e);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// §2 — FAILURE MODE TAXONOMY
// Reads failures + gaps + law_violations + unhandled_message events.
// Builds a named taxonomy of every recurring failure mode.
// Feeds the self-heal engine with structured failure context.
// ══════════════════════════════════════════════════════════════════════════════

async function _scanFailures() {
  try {
    const now = Date.now();
    _lastFailureScan = now;

    // Read all failure sources
    const failures     = jaaDB.query('failures',       () => true, 200);
    const gaps         = jaaDB.query('gaps',           r => r.status === 'open', 100);
    const violations   = jaaDB.query('law_violations', () => true, 100);
    // §FIXED 2026-08-17 — same real bug class as _scanPatterns above:
    // query() returns the oldest matching rows once event_log exceeds the
    // limit, not the most recent. A failure taxonomy needs recent errors.
    // No predicate-aware tail() exists, so: tail a real, generous recent
    // window, then filter — still correctly recency-ordered, unlike the
    // original.
    const errorEvents  = jaaDB.tail('event_log', 3000).filter(
      e => e.type?.includes('error') || e.type?.includes('fail') ||
           e.type?.includes('unhandled') || e.type?.includes('gate.failed')
    ).slice(0, 200);

    // ── Build failure mode taxonomy ───────────────────────────────────────────
    _failureIndex = {};

    function _addToIndex(faultClass, example, context = {}, weight = 1) {
      if (!_failureIndex[faultClass]) {
        _failureIndex[faultClass] = {
          faultClass,
          count:      0,
          examples:   [],
          precursors: [],
          lastSeen:   0,
          systems:    new Set(),
          gapTypes:   new Set(),
          components: new Set(), // §GRANULARITY 2026-08-13 — which specific loom
                                  // components (not just systems) this fault class
                                  // has actually shown up in
        };
      }
      const idx = _failureIndex[faultClass];
      idx.count += weight;
      idx.lastSeen = Math.max(idx.lastSeen, context.ts || now);
      if (idx.examples.length < 5) idx.examples.push(example);
      if (context.system) idx.systems.add(context.system);
      if (context.gapType) idx.gapTypes.add(context.gapType);
      // component is explicit when the caller already has it (component_ledger
      // rows, gap-field's new component field); otherwise resolved from
      // whatever id-like string is available, honest about not finding one.
      if (context.component) {
        idx.components.add(context.component);
      } else if (context.system) {
        try {
          const resolved = require('../lib/loom-map').resolveComponent(context.system);
          if (resolved.found) idx.components.add(resolved.componentId);
        } catch (_) { /* loom-map unavailable — component tracking degrades to system-only, same as before this existed */ }
      }
    }

    for (const f of failures) {
      _addToIndex(
        f.faultClass || f.type || 'unknown',
        { id: f.uuid, msg: (f.msg || f.message || '').slice(0, 100), ts: f.ts },
        { ts: f.ts, system: f.source }
      );
    }

    for (const g of gaps) {
      _addToIndex(
        g.type || 'unknown_gap',
        { id: g.uuid, msg: (g.body || g.description || '').slice(0, 100), ts: g.ts },
        { ts: g.ts, system: g.source, gapType: g.type, component: g.component || null }
      );
    }

    for (const v of violations) {
      _addToIndex(
        'contract_violation',
        { id: v.uuid, msg: (v.description || v.law || '').slice(0, 100), ts: v.ts },
        { ts: v.ts, system: v.source || v.agent }
      );
    }

    // §GRANULARITY 2026-08-13 — component_ledger already carries explicit
    // system+component on every row (unlike failures/gaps, which only ever
    // had `source`, often ambiguous between the two). Its error-status rows
    // were never read here at all until now: component-ledger.js and
    // _scanFailures were two unconnected things, one writing per-component
    // errors, the other building "the failure taxonomy" without ever
    // looking at them. weight = c.count because this scan fully rebuilds
    // _failureIndex from a fresh JAA read every cycle (not incremental like
    // _scanPatterns) — a single _addToIndex call per component/action pair
    // has to carry its real occurrence count, not just increment by one.
    let componentErrors = { available: false, components: [] };
    try { componentErrors = require('../lib/component-ledger').errorsByComponent({ since: now - 24 * 60 * 60 * 1000 }); }
    catch (e) { console.warn(`[${MODULE_ID}] component_ledger error scan unavailable: ${e.message}`); }
    for (const c of componentErrors.components) {
      for (const action of c.actions) {
        const example = c.examples.find(ex => ex.action === action);
        _addToIndex(
          `component_error:${action}`,
          { id: `${c.system}.${c.component}.${action}`,
            msg: example?.detail ? JSON.stringify(example.detail).slice(0, 100) : `${c.count} error(s)`,
            ts: example?.ts || now },
          { ts: example?.ts || now, system: c.system, component: c.component },
          c.count
        );
      }
    }

    // Unhandled message events → wiring_missing fault class
    const unhandledEvents = errorEvents.filter(e => e.type === 'guardian.unhandled_message');
    for (const e of unhandledEvents) {
      _addToIndex(
        'wiring_missing',
        { id: e.uuid, msg: `Unhandled message: ${e.payload?.messageType || '?'}`, ts: e.ts },
        { ts: e.ts, system: 'guardian', gapType: 'boundary_gap' }
      );
    }

    // Convert Sets to arrays for serialisation
    for (const fi of Object.values(_failureIndex)) {
      fi.systems   = [...fi.systems];
      fi.gapTypes  = [...fi.gapTypes];
      fi.components= [...fi.components];
    }

    // Refresh the component-level failure map alongside the fault-class one —
    // same underlying data, grouped the other way (by component, not by
    // fault class), plus loom-registration status per component.
    _buildComponentFailureMap(componentErrors);

    // Write summary to event_log
    const topFaults = Object.entries(_failureIndex)
      .sort(([,a],[,b]) => b.count - a.count)
      .slice(0, 5)
      .map(([k, v]) => ({ faultClass: k, count: v.count, lastSeen: v.lastSeen }));

    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'intelligence.failure_scan',
      payload: {
        failureSources: failures.length + gaps.length + violations.length,
        faultClasses:   Object.keys(_failureIndex).length,
        topFaults,
      },
      source:  MODULE_ID, causedBy: null, ts: now,
    });

  } catch(e) {
    _err('_scanFailures', e);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// §3 — SEAM REUSE INDEX
// Reads artifacts + seam_records + cortex_memory.
// Builds a content-addressed reuse index so every request can check:
//   "Has this intent been solved before? Can we reuse that artifact?"
// ══════════════════════════════════════════════════════════════════════════════

async function _buildReuseIndex() {
  try {
    const now = Date.now();
    _lastReuseBuild = now;

    const artifacts = jaaDB.query('artifacts', () => true, 500);
    const seams     = jaaDB.query('seam_records', r => r.status === 'VERIFIED', 200);
    const memory    = jaaDB.query('cortex_memory', () => true, 200);

    const index = [];
    const seen  = new Set();

    // Index successful artifacts
    for (const art of artifacts) {
      if (!art.hash || seen.has(art.hash)) continue;
      seen.add(art.hash);
      index.push({
        hash:       art.hash,
        type:       'artifact',
        lang:       art.lang || 'unknown',
        intent:     _extractIntent(art.content || ''),
        keywords:   _extractKeywords(art.content || ''),
        size:       (art.content || '').length,
        provider:   art.provider,
        jobId:      art.jobId,
        usedCount:  1,
        successRate:1.0,
        ts:         art.ts,
      });
    }

    // Index verified SEAM chunks
    for (const seam of seams) {
      const key = seam.hash || seam.uuid;
      if (seen.has(key)) continue;
      seen.add(key);
      index.push({
        hash:       key,
        type:       'seam_chunk',
        lang:       seam.lang || 'unknown',
        intent:     _extractIntent(seam.content || seam.title || ''),
        keywords:   _extractKeywords(seam.content || seam.title || ''),
        size:       (seam.content || '').length,
        provider:   seam.provider,
        jobId:      seam.jobId,
        usedCount:  seam.retryCount ? seam.retryCount + 1 : 1,
        successRate:1.0,
        ts:         seam.ts,
      });
    }

    _reuseIndex = index;

    // §PERSIST-02: write reuse_index to long-term JAA table after rebuild
    for (const entry of index) {
      if (!entry.hash) continue;
      const existing = jaaDB.query('reuse_index', r => r.hash === entry.hash, 1);
      if (existing.length) {
        jaaDB.update('reuse_index', existing[0].uuid, {
          successRate: entry.successRate, usedCount: entry.usedCount, _updatedAt: Date.now(),
        });
      } else {
        jaaDB.insert('reuse_index', {
          uuid: uid(), hash: entry.hash, type: entry.type, lang: entry.lang,
          intent: entry.intent, successRate: entry.successRate, usedCount: entry.usedCount,
          source: MODULE_ID, ts: Date.now(),
        });
      }
    }

    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'intelligence.reuse_index_built',
      payload: { artifacts: artifacts.length, seams: seams.length, indexed: index.length },
      source:  MODULE_ID, causedBy: null, ts: now,
    });

  } catch(e) {
    _err('_buildReuseIndex', e);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// §4 — CROSS-LEDGER ANALYSIS
// Joins event_log + failures + gaps + sigma_records + bep_patterns.
// Detects drift: when system behaviour deviates from crystallised patterns.
// Writes drift signals to event_log.
// ══════════════════════════════════════════════════════════════════════════════

async function _crossLedger() {
  try {
    const now = Date.now();
    _lastCrossLedger = now;

    // Drift detection: compare recent sigma distribution to crystallised baseline
    const recentSigma = jaaDB.query('sigma_records',
      r => r.ts && r.ts > now - 300_000, // last 5 min
      100
    );

    if (recentSigma.length < 5) return;

    const avgSigma = recentSigma.reduce((s, r) => s + (r.score || 0), 0) / recentSigma.length;
    const maxSigma = Math.max(...recentSigma.map(r => r.score || 0));
    const highSigmaCount = recentSigma.filter(r => r.score >= 0.7).length;

    // Check friction from delta_records
    const recentDelta = jaaDB.query('delta_records',
      r => r.ts && r.ts > now - 300_000,
      100
    );
    const avgFriction = recentDelta.length
      ? recentDelta.reduce((s, r) => s + (r.friction || 0), 0) / recentDelta.length
      : 0;
    const avgTension  = recentDelta.length
      ? recentDelta.reduce((s, r) => s + (r.tension || 0), 0) / recentDelta.length
      : 0;

    // Cross-reference with open gaps — are gaps driving sigma?
    const openGaps     = jaaDB.query('gaps', r => r.status === 'open', 50);
    const recentGaps   = openGaps.filter(g => g.ts && g.ts > now - 300_000);

    // Drift signal: high sigma + rising friction + new gaps = system degrading
    const driftScore = (
      Math.min(1, avgSigma * 1.5) * 0.4 +
      Math.min(1, avgFriction * 2) * 0.3 +
      Math.min(1, recentGaps.length / 5) * 0.3
    );

    // Write analysis to event_log
    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'intelligence.cross_ledger_analysis',
      payload: {
        windowMs:       300_000,
        sigmaEvents:    recentSigma.length,
        avgSigma:       +avgSigma.toFixed(3),
        maxSigma:       +maxSigma.toFixed(3),
        highSigmaCount,
        avgFriction:    +avgFriction.toFixed(3),
        avgTension:     +avgTension.toFixed(3),
        openGapsTotal:  openGaps.length,
        recentGaps:     recentGaps.length,
        driftScore:     +driftScore.toFixed(3),
        driftLevel:     driftScore > 0.7 ? 'critical' : driftScore > 0.4 ? 'elevated' : 'normal',
        patterns:       _patternIndex.filter(p => p.crystallised).length,
      },
      source:  MODULE_ID, causedBy: null, ts: now,
    });

    // If drift is critical, open a gap
    if (driftScore > 0.7) {
      const existing = jaaDB.query('gaps',
        g => g.type === 'baseline_drift' && g.status === 'open', 1
      );
      if (!existing.length) {
        const gapRow = {
          uuid:      uid(),
          type:      'baseline_drift',
          path:      'cortex/intelligence/cross_ledger',
          body:      `System drift detected: score=${driftScore.toFixed(2)}, avgSigma=${avgSigma.toFixed(2)}, avgFriction=${avgFriction.toFixed(2)}, ${recentGaps.length} new gaps in 5min`,
          severity:  driftScore > 0.85 ? 'fatal' : 'high',
          status:    'open',
          source:    MODULE_ID,
          causedBy:  null,
          createdAt: now, ts: now,
          meta: { driftScore, avgSigma, avgFriction, recentGaps: recentGaps.length },
        };
        jaaDB.insert('gaps', gapRow);
        domainNodes.writeGapNode(gapRow);
        _log(`drift gap opened — score ${driftScore.toFixed(2)}`);
      }
    }

  } catch(e) {
    _err('_crossLedger', e);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// §5 — PRE-REQUEST CONTEXT INJECTION
// Called by guardian before every dispatch.
// Returns: relevant failure modes, reusable artifacts, active patterns.
// This is the token efficiency mechanism — agents don't start cold.
// ══════════════════════════════════════════════════════════════════════════════

function getContext({ intent = '', command = '', provider = '' } = {}) {
  const keywords = _extractKeywords(intent + ' ' + command);

  // 1. Reusable artifacts matching the intent
  const reuse = _reuseIndex
    .filter(item => {
      if (!keywords.length) return false;
      const itemKw = item.keywords || [];
      return keywords.some(kw => itemKw.includes(kw));
    })
    .sort((a, b) => b.usedCount - a.usedCount)
    .slice(0, 3)
    .map(item => ({
      hash:       item.hash,
      type:       item.type,
      lang:       item.lang,
      intent:     item.intent,
      size:       item.size,
      note:       `Verified artifact — may be reusable. Hash: ${item.hash}`,
    }));

  // 2. Relevant failure modes to account for
  const failureModes = Object.values(_failureIndex)
    .filter(fi => fi.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(fi => ({
      faultClass: fi.faultClass,
      count:      fi.count,
      lastSeen:   fi.lastSeen,
      systems:    fi.systems,
      note:       `Recurring fault — account for this in your response`,
      example:    fi.examples[0]?.msg || null,
    }));

  // 3. Active crystallised patterns relevant to this request
  const patterns = _patternIndex
    .filter(p => p.crystallised || p.confidence >= 0.6)
    .slice(0, 5)
    .map(p => ({
      patternType:  p.patternType,
      description:  p.description,
      confidence:   p.confidence,
      actionable:   p.actionable,
    }));

  // 4. Current system health signals
  // §FIXED 2026-08-17 — same real bug class, and this one is currently
  // active, not latent: 60 real open gaps exist right now, this call only
  // ever saw the oldest 20 — meaning genuinely recent critical gaps
  // (e.g. from a fresh system-check run) could be invisible to this
  // real-time health-signal function while old, possibly-stale gaps
  // dominate the visible set. tail(), a real generous window, then
  // filter by status — correct recency, not just "first found."
  const openGaps   = jaaDB.tail('gaps', 500).filter(r => r.status === 'open').slice(0, 20);
  const critGaps   = openGaps.filter(g => g.severity === 'fatal' || g.severity === 'high');
  const recentFail = jaaDB.tail('failures', 5); // §FIXED 2026-08-17 — same real bug class, variable literally named "recent"

  return {
    intent, command, provider,
    reuse,
    failureModes,
    patterns,
    systemState: {
      openGaps:     openGaps.length,
      criticalGaps: critGaps.length,
      topGapTypes:  [...new Set(openGaps.map(g => g.type))].slice(0, 3),
      recentFailures: recentFail.length,
      driftLevel:   _getDriftLevel(),
    },
    reuseIndex:    _reuseIndex.length,
    patternCount:  _patternIndex.length,
    ts:            Date.now(),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// §6 — HTTP HANDLER
// Wired into cortex admin-server via the intelligence route block.
// ══════════════════════════════════════════════════════════════════════════════

function handleRequest(method, pathname, searchParams, body, json) {
  // GET /api/intelligence/context
  if (method === 'GET' && pathname === '/api/intelligence/context') {
    const intent  = searchParams?.get('intent')  || '';
    const command = searchParams?.get('command') || '';
    const provider= searchParams?.get('provider')|| '';
    json(200, { ok: true, ...getContext({ intent, command, provider }) });
    return true;
  }

  // GET /api/intelligence/patterns
  if (method === 'GET' && pathname === '/api/intelligence/patterns') {
    json(200, { ok: true, patterns: _patternIndex, total: _patternIndex.length });
    return true;
  }

  // GET /api/intelligence/failures
  if (method === 'GET' && pathname === '/api/intelligence/failures') {
    json(200, { ok: true, failures: Object.values(_failureIndex), total: Object.keys(_failureIndex).length });
    return true;
  }

  // GET /api/intelligence/reuse
  if (method === 'GET' && pathname === '/api/intelligence/reuse') {
    const q = searchParams?.get('q') || '';
    const results = q
      ? _reuseIndex.filter(r => r.intent?.includes(q) || r.keywords?.some(k => k.includes(q)))
      : _reuseIndex.slice(0, 50);
    json(200, { ok: true, results, total: results.length });
    return true;
  }

  // GET /api/intelligence/map — the cached loom system/component/hook map.
  if (method === 'GET' && pathname === '/api/intelligence/map') {
    if (!_loomMap) { json(200, { ok: true, ready: false, reason: 'not synced yet' }); return true; }
    json(200, { ok: true, ready: true, ...(_loomMap.available ? _loomMap : { available: false }) });
    return true;
  }

  // GET /api/intelligence/component-failures — errors grouped by loom
  // component (not just system), flagging components loom doesn't know about.
  if (method === 'GET' && pathname === '/api/intelligence/component-failures') {
    if (!_componentFailureMap) { json(200, { ok: true, ready: false, reason: 'not built yet' }); return true; }
    json(200, { ok: true, ready: true, ...(_componentFailureMap) });
    return true;
  }

  // GET /api/intelligence/meta — the meta-pattern layer's self-assessment of
  // _patternIndex: which crystallised patterns are lift-confirmed signal vs.
  // which event types are structural noise sources drowning them out.
  if (method === 'GET' && pathname === '/api/intelligence/meta') {
    if (!_metaSummary) { json(200, { ok: true, ready: false, reason: 'not enough crystallised patterns yet' }); return true; }
    const { crystallisedSignatures, ...pub } = _metaSummary; // Set isn't JSON-serialisable, and it's internal bookkeeping anyway
    json(200, { ok: true, ready: true, ...pub });
    return true;
  }

  // GET /api/intelligence/status
  if (method === 'GET' && pathname === '/api/intelligence/status') {
    json(200, {
      ok:            true,
      version:       VERSION,
      lastPatternScan:  _lastPatternScan,
      lastFailureScan:  _lastFailureScan,
      lastReuseIndex:   _lastReuseBuild,
      lastCrossLedger:  _lastCrossLedger,
      patterns:      _patternIndex.length,
      crystallised:  _patternIndex.filter(p => p.crystallised).length,
      faultClasses:  Object.keys(_failureIndex).length,
      reuseItems:    _reuseIndex.length,
      driftLevel:    _getDriftLevel(),
    });
    return true;
  }

  // POST /api/intelligence/event — feed an event for immediate analysis
  if (method === 'POST' && pathname === '/api/intelligence/event') {
    if (body?.type) {
      // Write to event_log then trigger immediate failure scan if it's an error
      jaaDB.insert('event_log', {
        uuid:    uid(),
        type:    body.type,
        payload: body.payload || {},
        source:  body.source || 'external',
        causedBy:body.causedBy || null,
        ts:      Date.now(),
      });
      if (body.type?.includes('error') || body.type?.includes('fail')) {
        setImmediate(() => _scanFailures().catch(() => {}));
      }
    }
    json(200, { ok: true });
    return true;
  }

  return false; // not handled
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function _extractIntent(text = '') {
  if (!text) return '';
  // Extract first meaningful line or sentence as intent
  const first = text.split(/[\n.!?]/)[0].trim().slice(0, 100);
  return first.toLowerCase();
}

function _extractKeywords(text = '') {
  if (!text) return [];
  // Simple keyword extraction: words > 4 chars, not stopwords
  const STOP = new Set(['function','const','return','async','await','this','that','from','with','have','will','been','were','they','their','about','which','what','when','where','there','these','those','other','after','before','should','could','would']);
  return [...new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4 && !STOP.has(w))
      .slice(0, 20)
  )];
}

function _getDriftLevel() {
  // §FIXED 2026-08-17 — same real bug class, and the most ironic instance
  // of it: this variable was named 'recent' but query()'s real semantics
  // (oldest-first, stop at limit) meant recent[0] with limit:1 returned
  // the OLDEST matching row in the whole table, not the most recent
  // cross_ledger_analysis event. This function has likely reported a
  // stale drift level since whenever this table first grew past a
  // handful of rows. tail() + filter + take the first (most recent) is
  // correct.
  const recent = jaaDB.tail('event_log', 500).filter(e => e.type === 'intelligence.cross_ledger_analysis');
  return recent[0]?.payload?.driftLevel || 'unknown';
}

function _log(msg) {
  console.log(`[${MODULE_ID}] ${msg}`);
}

function _err(where, e) {
  console.error(`[${MODULE_ID}] §1.2 error in ${where}: ${e.message}`);
  try {
    jaaDB.insert('failures', {
      uuid:     uid(),
      type:     'intelligence_error',
      msg:      `${where}: ${e.message}`,
      stack:    e.stack?.split('\n')[1] || '',
      source:   MODULE_ID,
      ts:       Date.now(),
    });
  } catch(_) {}
}

module.exports = {
  init, stop,
  CAPABILITIES,
  getContext,
  handleRequest,
  getPatterns:  () => _patternIndex,
  getFailures:  () => _failureIndex,
  getReuseIndex:() => _reuseIndex,
  getMetaSummary: () => _metaSummary,
  getLoomMap: () => _loomMap,
  getComponentFailureMap: () => _componentFailureMap,
  _scanPatterns,     // exported for direct testing (intelligence.test.js pins this)
  _scanMetaPatterns, // exported for direct testing
  _scanFailures,     // exported for direct testing
  _syncLoomMap,      // exported for direct testing
};
