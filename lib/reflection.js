'use strict';
// ── lib/reflection.js ─────────────────────────────────────────────────────────
// UUID: nexus-reflection-v1-0000-4000-0000-000000000001
// Version: 1.0.0
// Phase: 11 — Reflection Engine
// Deps:  Phase 10 (constitutional-ai) ✓ · request-handler ✓ · raid ✓ · gap-loop ✓ · jaa ✓
// Unlocks: Phase 12 (User Model) · Phase 13 (Autonomous Loop)
//
// UNRESOLVED is honest uncertainty, not failure. Every decision request-handler
// logs to decision_log carries a satisfaction slot left as null ("filled in
// later via feedback" — lib/request-handler.js _phaseC). This module is that
// feedback: it scores decisions, writes the score back to the exact row via
// decisionLogUuid (never by guessing through requestId/timestamp matching —
// request-handler now exposes that uuid precisely so this doesn't have to),
// tracks consecutive low-satisfaction streaks per decision class, and opens a
// KNOWLEDGE or CAPABILITY loop when a streak crosses threshold.
//
// ── RAID FEEDBACK (decision: no RAID-side change) ─────────────────────────────
// RAID's own scoring (_updateW) is internal and driven only by its own dispatch
// outcomes — there is no external entrypoint, and adding one was explicitly
// declined. Per that decision, this module is a consumer of the event_log
// user.satisfied events request-handler already writes (Phase D3), not a
// caller into RAID internals. It aggregates those events into its own
// per-cluster/per-agent satisfaction view and logs that view — available for
// RAID or a human operator to read, but never mutates RAID's weights directly.
//
// ── SELF-MODEL UPDATE LOOP (§5.3) ──────────────────────────────────────────────
// Phase 10's identity kernel has no write path at all today — by design. This
// module is the *only* sanctioned future writer, and only after N confirmed
// evidence items, only via the gap system (never a direct mutation). The
// evidence-accumulation mechanism is built here (trackIdentityEvidence); the
// actual write is intentionally NOT implemented — there is no proposeKernelUpdate
// that touches constitutional-ai.js. When enough evidence accumulates, this
// module opens a CONSTITUTIONAL gap describing the proposed change and stops.
// A human (or a later phase) decides whether it becomes real. Never automatic.
//
// §1.1  Every score has a UUID — nothing silent
// §1.2  Nothing silent — every pass logged to event_log
// §2.1  decision_log rows are append-only history; scoring updates the row,
//       never deletes or replaces it
// §5.3  No monkey patches — identity kernel mutation path stays unbuilt here

const crypto = require('crypto');

const MODULE_ID = 'reflection';
const VERSION   = '1.0.0';

// ── Config ──────────────────────────────────────────────────────────────────
const POLL_MS              = parseInt(process.env.REFLECTION_POLL_MS || '15000');
const BATCH_SIZE            = parseInt(process.env.REFLECTION_BATCH || '25');
const LOW_SATISFACTION_THRESHOLD = 0.5;
const STREAK_THRESHOLD_N    = parseInt(process.env.REFLECTION_STREAK_N || '3');
const IDENTITY_EVIDENCE_N   = parseInt(process.env.REFLECTION_IDENTITY_EVIDENCE_N || '10');

// ── Lazy-load dependencies (never block boot) ──────────────────────────────────
let _jaa, _uid, _bus, _taxonomy, _bda;

function _getJAA() {
  if (_jaa) return _jaa;
  try { ({ jaaDB: _jaa, uid: _uid } = require('../cortex/memory/jaa-db')); } catch (_) {}
  return _jaa;
}
function uid() { return _uid?.() ?? crypto.randomUUID(); }

function _getBus() {
  if (_bus) return _bus;
  try { _bus = require('../nexus/nexus-bus'); } catch (_) {}
  return _bus;
}
function _getTaxonomy() {
  if (_taxonomy) return _taxonomy;
  try { _taxonomy = require('./open-loop-taxonomy'); } catch (_) {}
  return _taxonomy;
}
function _getBDA() {
  if (_bda) return _bda;
  try { _bda = require('../intelligence/bda/kernel'); } catch (_) {}
  return _bda;
}

let _interval = null;
let _cfg      = {};
let _gapPredicate = null;
function _getGapPredicate() {
  if (_gapPredicate) return _gapPredicate;
  try { _gapPredicate = require('../intelligence/gap/predicate'); } catch(_) {}
  return _gapPredicate;
}

// In-memory streak tracker: classKey -> consecutive low-satisfaction count.
// Not persisted — rebuilt naturally as decisions stream through. A restart
// resets the streak rather than risk double-counting against stale state.
const _streaks = new Map();

// Decision uuids already counted toward a streak — prevents a row that gets
// re-scored (satisfaction nulled out and reflected on again, for whatever
// reason — retry, manual reset, future feature) from contributing to a
// streak a second time. Bounded by simple FIFO eviction so this never grows
// without limit across a long-running process.
const _countedDecisionUuids = new Set();
const _MAX_COUNTED_UUIDS = 5000;
function _markCounted(rowUuid) {
  if (!rowUuid) return;
  _countedDecisionUuids.add(rowUuid);
  if (_countedDecisionUuids.size > _MAX_COUNTED_UUIDS) {
    const oldest = _countedDecisionUuids.values().next().value;
    _countedDecisionUuids.delete(oldest);
  }
}

// In-memory identity-evidence accumulator: observation -> count.
// See header note — this only ever leads to a CONSTITUTIONAL gap, never a
// direct kernel write.
const _identityEvidence = new Map();

// ── Satisfaction scoring ───────────────────────────────────────────────────────
// Deterministic, explainable (no hidden LLM judge for the core score — this
// module's own axiom-compliance depends on TRUTH_OVER_COHERENCE/EXPLAINABILITY
// just as much as constitutional-ai's does). UNRESOLVED scores low but
// non-zero: it is honest uncertainty, not failure, and should not be punished
// as hard as an actual error.
//
// row: a decision_log record — { chosen, outcome, output, cost, ... }
function scoreDecision(row) {
  const chosen  = row.chosen;
  const outcome = row.outcome;

  if (outcome === 'executed' && row.output) {
    return { score: 0.9, reason: 'Executed with a recorded output.' };
  }
  if (chosen === 'RESOLVED') {
    return { score: 0.8, reason: 'Resolved outcome.' };
  }
  if (chosen === 'UNRESOLVED') {
    return { score: 0.3, reason: 'UNRESOLVED — honest uncertainty, not failure, but the system did not know what to do.' };
  }
  if (chosen === 'CLARIFICATION_REQUIRED') {
    return { score: 0.5, reason: 'Clarification requested — appropriate caution, not yet resolved.' };
  }
  if (chosen === 'HELD') {
    return { score: 0.55, reason: 'Held — intentionally preserved, may resolve favorably once context arrives.' };
  }
  if (chosen === 'DEFERRED') {
    return { score: 0.5, reason: 'Deferred — valid action, wrong time.' };
  }
  if (chosen === 'DENIED') {
    return { score: 0.4, reason: 'Denied by constitution — correct behavior if the axiom was right, but worth tracking if this class denies often.' };
  }

  return { score: 0.5, reason: 'No specific signal — neutral default, not fabricated confidence.' };
}

// ── Decision class — what streaks are tracked against ──────────────────────────
// Coarser than the raw request text: groups by chosen outcome + rough target,
// so "forge denied repeatedly" and "forge resolved repeatedly" are distinct
// streaks worth separate attention.
//
// §PHASE-31: a decision routed through grammar resolution gets its own,
// more precise class — "grammar:<componentId>" — rather than collapsing
// into the same generic "RESOLVED:request-handler" bucket every other
// resolved decision falls into. Without this, 3 consecutive misfires on
// one grammar pattern were structurally indistinguishable from 3
// unrelated successful decisions that happened to also resolve — the
// streak counter genuinely could not see a per-pattern misfire at all.
function _decisionClass(row) {
  if (row.grammarComponentId) return `grammar:${row.grammarComponentId}`;
  const target = row.input ? String(row.input).split(/\s+/).find(Boolean) : 'unknown';
  return `${row.chosen || 'unknown'}:${row.actor || MODULE_ID}`;
}

// ── Streak tracking + gap opening ───────────────────────────────────────────────
// satisfaction < 0.5 for N consecutive decisions of same class → open a loop.
// KNOWLEDGE if the class looks like missing information (UNRESOLVED, unrouted);
// CAPABILITY if it looks like a missing capability (DENIED on forge/build,
// or repeated low scores on an action class entirely). This is a heuristic,
// not a certainty — the opened loop carries its own evidence so a human or
// later phase can correct the classification.
function _updateStreak(classKey, row, scoreResult) {
  const jaa = _getJAA();
  const isLow = scoreResult.score < LOW_SATISFACTION_THRESHOLD;

  // A decision that already contributed to a streak (in this process's
  // lifetime) never contributes again, even if it gets re-scored later.
  if (row.uuid && _countedDecisionUuids.has(row.uuid)) return;
  _markCounted(row.uuid);

  const prev = _streaks.get(classKey) || { count: 0, rows: [] };
  if (isLow) {
    prev.count++;
    prev.rows.push({ uuid: row.uuid, requestId: row.requestId, reason: scoreResult.reason });
  } else {
    prev.count = 0;
    prev.rows  = [];
  }
  _streaks.set(classKey, prev);

  if (prev.count >= STREAK_THRESHOLD_N) {
    const isGrammarMisfire = classKey.startsWith('grammar:');
    const loopType = isGrammarMisfire ? 'CAPABILITY' : (/UNRESOLVED/.test(classKey) ? 'KNOWLEDGE' : 'CAPABILITY');
    const taxonomy = _getTaxonomy();
    if (taxonomy && jaa) {
      try {
        const loop = taxonomy.createLoop({
          loop_type: loopType,
          source: MODULE_ID,
          path: `reflection/${classKey}`,
          body: isGrammarMisfire
            ? `${STREAK_THRESHOLD_N} consecutive low-satisfaction outcomes after grammar resolved to "${classKey.slice('grammar:'.length)}" — the pattern may be resolving to the wrong role/intent. Flagged for Idearium review per seam-component-registry-spec.md / Phase 31. Note: no automated bridge moves this gap into Idearium's own db.gaps yet (that's Phase 16, currently marked superseded) — this is a tag for a human or future phase to pick up, not a guaranteed delivery.`
            : `${STREAK_THRESHOLD_N} consecutive low-satisfaction decisions in class "${classKey}".`,
          evidence: prev.rows.map(r => r.reason),
          closure_condition: isGrammarMisfire
            ? 'Grammar pattern remapped to the correct component, or the role/intent it resolves to is corrected.'
            : (loopType === 'KNOWLEDGE'
              ? 'Missing information identified and supplied, or class reclassified.'
              : 'Capability built/extended, or class reclassified.'),
        });
        const gapRow = { uuid: uid(), ...loop, createdAt: Date.now() };
        if (isGrammarMisfire) gapRow.reviewTarget = 'idearium';
        jaa.insert('gaps', gapRow);
        _logEvent('reflection.streak.gap_opened', { classKey, loopType, count: prev.count, reviewTarget: isGrammarMisfire ? 'idearium' : null });

        // §23.7 — queue a reflection contract so Mistral can reason about
        // this streak and propose a concrete improvement (new cluster pattern,
        // Idearium idea, or wiring fix). The contract stays open until
        // verifyClosure() confirms an artifact exists.
        // §2.1 — contract written to JAA before guardian dispatch
        const gp = _getGapPredicate();
        if (gp && jaa) {
          try {
            const contractUuid = uid();
            const contract = {
              uuid:           contractUuid,
              gapUuid:        gapRow.uuid,
              decisionClass:  classKey,
              loopType,
              evidence:       prev.rows.map(r => r.reason),
              score:          scoreResult?.score ?? null,
              scoreReason:    scoreResult?.reason || null,
              decisionInput:  row?.input ? String(row.input).slice(0, 500) : null,
              decisionChosen: row?.chosen || null,
              decisionOutcome:row?.outcome || null,
              requestId:      row?.requestId || null,
              status:         'queued',
              agent:          'mistral',
              priority:       loopType === 'CONSTITUTIONAL' ? 'critical'
                            : loopType === 'CAPABILITY'     ? 'high' : 'normal',
              createdAt:      Date.now(),
              updatedAt:      Date.now(),
              resolvedAt:     null,
              proposal:       null,
              error:          null,
            };
            jaa.insert('reflection_contracts', contract);
            _logEvent('reflection.contract.queued', {
              contractUuid, decisionClass: classKey, loopType,
              priority: contract.priority, gapUuid: gapRow.uuid,
            });
            try {
              require('../lib/component-ledger').write({
                system: 'reflection', component: 'reflection.engine', action: 'contract_queued', status: contract.priority,
                tags: [loopType, classKey], detail: `streak of ${STREAK_THRESHOLD_N} low-satisfaction · ${classKey}`,
                causedBy: gapRow.uuid, contractUuid,
              });
            } catch (_) {}
            console.log(`[${MODULE_ID}] 📋 contract queued · ${loopType} · ${classKey} · ${contractUuid.slice(0,8)}`);
          } catch(e) {
            console.warn(`[${MODULE_ID}] §1.2 contract insert failed:`, e.message);
          }
        }
      } catch (_) {}
    }
    // Reset after opening so the same streak doesn't fire a gap every tick.
    prev.count = 0;
    prev.rows  = [];
    _streaks.set(classKey, prev);
  }
}

// ── RAID feedback aggregation (consumer of event_log, never a RAID caller) ─────
// Reads recent user.satisfied events, aggregates by cluster/agent, and writes
// its own summary event — a read surface, not a write into RAID's weights.
function _aggregateRaidFeedback() {
  const jaa = _getJAA();
  if (!jaa) return null;

  let events = [];
  try { events = jaa.query('event_log', e => e.type === 'user.satisfied', 200); } catch (_) { events = []; }
  if (!events.length) return null;

  const byKey = new Map();
  for (const e of events) {
    const key = `${e.payload?.cluster || 'unknown'}:${e.payload?.agent || 'unknown'}`;
    const prev = byKey.get(key) || { satisfied: 0, total: 0 };
    prev.total++;
    if (e.payload?.satisfied) prev.satisfied++;
    byKey.set(key, prev);
  }

  const summary = Array.from(byKey.entries()).map(([key, v]) => ({
    key, satisfactionRate: v.total ? +(v.satisfied / v.total).toFixed(3) : null, total: v.total,
  }));

  _logEvent('reflection.raid_feedback_summary', { summary });
  return summary;
}

// ── Identity evidence accumulation (§5.3 — never a direct write) ───────────────
// Call with a short, stable observation key (e.g. a recurring pattern in
// decision outcomes that suggests the identity kernel is wrong about
// something it claims). After IDENTITY_EVIDENCE_N confirmations, opens a
// CONSTITUTIONAL gap proposing the kernel update — it does not, and must
// never, write to constitutional-ai.js directly.
function trackIdentityEvidence(observationKey, evidenceItem) {
  const jaa = _getJAA();
  const taxonomy = _getTaxonomy();

  const prev = _identityEvidence.get(observationKey) || { count: 0, items: [] };
  prev.count++;
  prev.items.push(evidenceItem);
  _identityEvidence.set(observationKey, prev);

  if (prev.count >= IDENTITY_EVIDENCE_N) {
    if (taxonomy && jaa) {
      try {
        const loop = taxonomy.createLoop({
          loop_type: 'CONSTITUTIONAL',
          source: MODULE_ID,
          path: 'reflection/identity-kernel-proposal',
          body: `${IDENTITY_EVIDENCE_N} confirmed evidence items for proposed identity kernel update: "${observationKey}". Human or Phase-authorized review required before any change to constitutional-ai.js IDENTITY_KERNEL.`,
          evidence: prev.items.slice(0, 20),
          closure_condition: 'Human (or explicitly authorized later phase) reviews and either applies or rejects the proposed kernel change. Never applied automatically.',
        });
        jaa.insert('gaps', { uuid: uid(), ...loop, createdAt: Date.now() });
        _logEvent('reflection.identity_evidence.threshold_reached', { observationKey, count: prev.count });
      } catch (_) {}
    }
    _identityEvidence.delete(observationKey);
    return true; // threshold reached, gap opened
  }
  return false;
}

// ── Event logging (§1.2) ───────────────────────────────────────────────────────
function _logEvent(type, payload) {
  const jaa = _getJAA();
  const bus = _getBus();
  if (jaa) {
    try { jaa.insert('event_log', { uuid: uid(), type, payload, source: MODULE_ID, ts: Date.now() }); } catch (_) {}
  }
  if (bus?.emit) {
    try { bus.emit(type, payload); } catch (_) {}
  }
}

// ── Main pass — score unscored decisions, update streaks, aggregate feedback ──
async function runReflectionPass() {
  const jaa = _getJAA();
  const bda = _getBDA();
  if (!jaa) return { scored: 0, gapsOpened: 0, reason: 'jaa-unavailable' };

  let rows = [];
  try { rows = jaa.query('decision_log', r => r.satisfaction === null || r.satisfaction === undefined, BATCH_SIZE); } catch (_) { rows = []; }

  let scored = 0;
  for (const row of rows) {
    const result = scoreDecision(row);

    try { jaa.update('decision_log', row.uuid, { satisfaction: result.score, satisfactionReason: result.reason }); } catch (_) {}

    if (bda) {
      try { bda.observeSignal({ role: 'reflection', signals: { valence: result.score }, meta: { requestId: row.requestId, chosen: row.chosen } }); } catch (_) {}
    }

    _updateStreak(_decisionClass(row), row, result);
    scored++;
  }

  const raidFeedback = _aggregateRaidFeedback();

  // §23.7 — process resolved contracts: run closure verifier on the gap
  // that triggered each contract. If predicate is false AND artifact exists,
  // the gap closes. If not, it stays open for another pass.
  const gp = _getGapPredicate();
  // §23.17 — REAL BUG FOUND VIA TESTING, pre-existing, not introduced by
  // this phase's edits: this was declared with `let` *inside* the
  // `if (gp && jaa)` block below, then read again outside that block at
  // the `scored > 0 || resolvedContracts?.length > 0` check further down.
  // Block-scoped `let` doesn't reach outside its own block — that's an
  // unconditional ReferenceError every single time this function runs,
  // confirmed by tests/modules/reflection.test.js (11 of 22 cases failing
  // on exactly this). Declared at the right scope now.
  let resolvedContracts = [];
  if (gp && jaa) {
    try {
      resolvedContracts = jaa.query('reflection_contracts',
        r => r.status === 'dispatched' && r.resolvedAt == null, 10);
    } catch(_) {}

    for (const contract of resolvedContracts) {
      if (!contract.gapUuid) continue;
      try {
        const gap = jaa.query('gaps', g => g.uuid === contract.gapUuid, 1)[0];
        if (!gap) continue;
        if (gap.status === 'resolved' || gap.status === 'archived') {
          // Gap already closed — mark contract resolved too
          jaa.update('reflection_contracts', contract.uuid, {
            status: 'resolved', resolvedAt: Date.now(),
          });
          continue;
        }
        // Run closure verifier — checks predicate + artifact
        const result = gp.verifyClosure(gap, {
          strategy: 'reflection.contract',
          jobId:    contract.guardianJobId || null,
        });
        if (result.resolved) {
          jaa.update('reflection_contracts', contract.uuid, {
            status: 'resolved', resolvedAt: Date.now(),
          });
          _logEvent('reflection.contract.resolved', {
            contractUuid: contract.uuid, gapUuid: contract.gapUuid,
            decisionClass: contract.decisionClass, detail: result.detail,
          });
          try {
            require('../lib/component-ledger').write({
              system: 'reflection', component: 'reflection.engine', action: 'contract_resolved', status: 'resolved',
              tags: [contract.decisionClass], detail: result.detail,
              causedBy: contract.gapUuid, contractUuid: contract.uuid,
            });
          } catch (_) {}
          console.log(`[${MODULE_ID}] ✓ contract resolved · ${contract.uuid.slice(0,8)} · ${result.detail}`);
        }
        // If not resolved: stays dispatched, verifier logged the attempt
      } catch(e) {
        console.warn(`[${MODULE_ID}] §1.2 contract resolution check failed:`, e.message);
      }
    }

    // Retry any queued contracts that weren't dispatched yet (guardian may have been down)
    let staleQueued = [];
    try {
      staleQueued = jaa.query('reflection_contracts',
        r => r.status === 'queued' && (Date.now() - (r.createdAt||0)) > 60000, 5);
    } catch(_) {}
    if (staleQueued.length) {
      _logEvent('reflection.contracts.pending_retry', { count: staleQueued.length });
      // Guardian's own polling loop picks these up — no action needed here
      // beyond logging so the operator can see contracts are waiting
    }
  }

  if (scored > 0 || resolvedContracts?.length > 0) {
    _logEvent('reflection.pass_complete', {
      scored,
      raidFeedback:       !!raidFeedback,
      contractsProcessed: resolvedContracts?.length || 0,
    });
  }

  return { scored, raidFeedback };
}

// ── Lifecycle ───────────────────────────────────────────────────────────────────
function init(cfg = {}) {
  _cfg = cfg;
  _interval = setInterval(() => { runReflectionPass().catch(() => {}); }, cfg.pollMs ?? POLL_MS);
  _interval.unref?.();
  console.log(`[${MODULE_ID}] v${VERSION} — poll:${cfg.pollMs ?? POLL_MS}ms batch:${BATCH_SIZE} streakN:${STREAK_THRESHOLD_N}`);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

function getState() {
  const jaa = _getJAA();
  let contractStats = { queued: 0, dispatched: 0, resolved: 0, failed: 0 };
  if (jaa) {
    try {
      const contracts = jaa.query('reflection_contracts', () => true, 500);
      for (const c of contracts) {
        contractStats[c.status] = (contractStats[c.status] || 0) + 1;
      }
    } catch(_) {}
  }
  return {
    version:         VERSION,
    streaks:         Array.from(_streaks.entries()).map(([k, v]) => ({ class: k, count: v.count })),
    identityEvidence:Array.from(_identityEvidence.entries()).map(([k, v]) => ({ observation: k, count: v.count })),
    contracts:       contractStats,
  };
}

// Test-only: clears all in-memory state (streaks, counted uuids, identity
// evidence) without restarting the process. Never called from production
// code paths — exists purely so test suites can isolate cases that reuse
// decision uuids across runs within the same process.
function _resetInMemoryState() {
  _streaks.clear();
  _countedDecisionUuids.clear();
  _identityEvidence.clear();
}

function validateWiring() {
  const checks = { jaa: !!_getJAA(), bus: !!_getBus(), taxonomy: !!_getTaxonomy(), bda: !!_getBDA() };
  const online = Object.values(checks).filter(Boolean).length;
  console.log(`[${MODULE_ID}] wiring: ${online}/${Object.keys(checks).length} systems reachable`);
  return checks;
}

module.exports = {
  init, stop, getState, validateWiring,
  runReflectionPass, scoreDecision, trackIdentityEvidence,
  _resetInMemoryState,
  MODULE_ID, VERSION,
};
