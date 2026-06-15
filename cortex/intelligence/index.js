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

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'cortex/intelligence';
const VERSION   = '1.0.0';

// ── Timing ─────────────────────────────────────────────────────────────────────
const PATTERN_SCAN_MS   = 60_000;   // scan for patterns every 60s
const FAILURE_SCAN_MS   = 30_000;   // scan failure taxonomy every 30s
const REUSE_INDEX_MS    = 120_000;  // rebuild reuse index every 2 min
const CROSS_LEDGER_MS   = 90_000;   // cross-ledger analysis every 90s

let _intervals  = [];
let _cfg        = {};
let _lastPatternScan  = 0;
let _lastFailureScan  = 0;
let _lastReuseBuild   = 0;
let _lastCrossLedger  = 0;

// In-memory indexes for fast query
let _reuseIndex  = [];   // { hash, type, lang, intent, artifactId, successRate, usedCount }
let _failureIndex= {};   // faultClass → { count, precursors[], lastSeen, examples[] }
let _patternIndex= [];   // crystallised BEP patterns

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

function init(cfg = {}) {
  _cfg = cfg;

  // Stagger scans — don't all fire at once on boot
  _intervals.push(setInterval(_scanPatterns,   PATTERN_SCAN_MS));
  _intervals.push(setInterval(_scanFailures,   FAILURE_SCAN_MS));
  _intervals.push(setInterval(_buildReuseIndex,REUSE_INDEX_MS));
  _intervals.push(setInterval(_crossLedger,    CROSS_LEDGER_MS));
  _intervals.forEach(i => i.unref());

  // Initial build after 10s (let JAA settle from boot)
  setTimeout(() => {
    _scanPatterns();
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

async function _scanPatterns() {
  try {
    const now = Date.now();
    _lastPatternScan = now;

    // Read recent events from event_log
    const events = jaaDB.query('event_log', () => true, 500);
    if (events.length < 20) return; // not enough data yet

    // ── Co-occurrence analysis ────────────────────────────────────────────────
    // Which event types always appear together within 5 seconds?
    const WINDOW_MS = 5000;
    const coOccur = {};
    for (let i = 0; i < events.length; i++) {
      const a = events[i];
      for (let j = i + 1; j < events.length; j++) {
        const b = events[j];
        if (!a.ts || !b.ts) continue;
        if (b.ts - a.ts > WINDOW_MS) break;
        const key = [a.type, b.type].sort().join('::');
        coOccur[key] = (coOccur[key] || 0) + 1;
      }
    }

    // ── Failure precursor analysis ────────────────────────────────────────────
    // What event types appear in the 30s before a failure/error/gap?
    const failureEvents = events.filter(e =>
      e.type?.includes('error') || e.type?.includes('fail') ||
      e.type?.includes('gap.found') || e.type?.includes('collapse') ||
      e.type?.includes('tidal')
    );
    const precursorCounts = {};
    for (const failure of failureEvents) {
      const window = events.filter(e =>
        e.ts && failure.ts &&
        e.ts < failure.ts &&
        e.ts > failure.ts - 30_000 &&
        e.type !== failure.type
      );
      for (const p of window) {
        if (!precursorCounts[p.type]) precursorCounts[p.type] = { count: 0, failureTypes: {} };
        precursorCounts[p.type].count++;
        precursorCounts[p.type].failureTypes[failure.type] =
          (precursorCounts[p.type].failureTypes[failure.type] || 0) + 1;
      }
    }

    // ── Sigma spike chain analysis ────────────────────────────────────────────
    // Are there recurring sequences of event types that always end in high sigma?
    const sigmaRecords = jaaDB.query('sigma_records', () => true, 200);
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

    // High-frequency co-occurrences → structural pattern
    for (const [pair, count] of Object.entries(coOccur)) {
      if (count < 3) continue;
      const [typeA, typeB] = pair.split('::');
      const existing = _patternIndex.find(p => p.signature === pair);
      if (!existing) {
        newPatterns.push({
          uuid:        uid(),
          signature:   pair,
          patternType: 'co_occurrence',
          typeA, typeB,
          count,
          confidence:  Math.min(1, count / 20),
          description: `"${typeA}" and "${typeB}" co-occur within 5s — ${count} observations`,
          actionable:  count >= 5,
          crystallised:count >= 10,
          source:      MODULE_ID,
          ts:          now,
        });
      }
    }

    // Strong failure precursors → warning pattern
    for (const [precursorType, data] of Object.entries(precursorCounts)) {
      if (data.count < 3) continue;
      const sig = `precursor::${precursorType}`;
      const existing = _patternIndex.find(p => p.signature === sig);
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
      }
    }

    // Bottleneck signals → recurring open gaps of same type
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
      }
    }

    // Write new patterns to JAA
    for (const p of newPatterns) {
      jaaDB.insert('bep_patterns', p);
      _patternIndex.push(p);
      if (p.crystallised) {
        _log('pattern crystallised: ' + _humanPattern(p));
      }
    }

    // Refresh in-memory index from JAA
    _patternIndex = jaaDB.query('bep_patterns', () => true, 200);

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

  } catch(e) {
    _err('_scanPatterns', e);
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
    const errorEvents  = jaaDB.query('event_log',
      e => e.type?.includes('error') || e.type?.includes('fail') ||
           e.type?.includes('unhandled') || e.type?.includes('gate.failed'),
      200
    );

    // ── Build failure mode taxonomy ───────────────────────────────────────────
    _failureIndex = {};

    function _addToIndex(faultClass, example, context = {}) {
      if (!_failureIndex[faultClass]) {
        _failureIndex[faultClass] = {
          faultClass,
          count:      0,
          examples:   [],
          precursors: [],
          lastSeen:   0,
          systems:    new Set(),
          gapTypes:   new Set(),
        };
      }
      const idx = _failureIndex[faultClass];
      idx.count++;
      idx.lastSeen = Math.max(idx.lastSeen, context.ts || now);
      if (idx.examples.length < 5) idx.examples.push(example);
      if (context.system) idx.systems.add(context.system);
      if (context.gapType) idx.gapTypes.add(context.gapType);
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
        { ts: g.ts, system: g.source, gapType: g.type }
      );
    }

    for (const v of violations) {
      _addToIndex(
        'contract_violation',
        { id: v.uuid, msg: (v.description || v.law || '').slice(0, 100), ts: v.ts },
        { ts: v.ts, system: v.source || v.agent }
      );
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
    }

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
        jaaDB.insert('gaps', {
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
        });
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
  const openGaps   = jaaDB.query('gaps', r => r.status === 'open', 20);
  const critGaps   = openGaps.filter(g => g.severity === 'fatal' || g.severity === 'high');
  const recentFail = jaaDB.query('failures', () => true, 5);

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
  const recent = jaaDB.query('event_log',
    e => e.type === 'intelligence.cross_ledger_analysis', 1
  );
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
  getContext,
  handleRequest,
  getPatterns:  () => _patternIndex,
  getFailures:  () => _failureIndex,
  getReuseIndex:() => _reuseIndex,
};
