'use strict';
// ── lib/compartment-engine.js ─────────────────────────────────────────────────
// UUID: nexus-compartment-engine-v1-0000-4000-0000-000000000001
// Version: 1.0.0
// Phase: 25 — RAID Compartment Engine
// Deps:  Phase 10 (constitutional-ai) ✓ · Phase 45 (intent-classifier) ✓ ·
//        snapshot ✓ · jaa ✓
// Unlocks: Phase 13 (Autonomous Loop), Phase 46 (Case Library, real)
//
// An isolated working-memory sandbox per action. Compartments never mutate
// Cortex directly — every successful run produces a delta that gets
// committed only after PASS. This is the actual implementation; the
// phase-map previously marked this phase `complete` with zero code behind
// it (confirmed empty before this file existed — no compartment, no
// constraint frame, no adversary suite, no lattice anywhere in the repo).
//
// This file is sub-step 2 of the Phase 25 build: the COMPARTMENT object
// model and lifecycle (spawn → execute → PASS/FAIL → rewind/delete) plus
// constraint frame assembly. The adversary suite (sub-step 4) and
// crystal/lattice updates (sub-step 5) are separate files this module
// calls into via clearly-named extension points — sub-step 2 wires those
// points to safe no-op defaults so the lifecycle is fully testable on its
// own before the later sub-steps exist.
//
// ── HONESTY ABOUT WHAT'S NOT BUILT YET (this sub-step) ──────────────────────
// constraint_frame.max_resolution_level is explicitly null with a
// _pending_phase: 44 marker — Phase 44 (Resolution Spectrum) does not exist,
// so there is no real L0-L5 ceiling to put here. Fabricating one would be
// exactly the kind of confident-but-fake claim this whole reconciliation
// effort exists to avoid. Same treatment for negative_crystal_ids: real
// empty array (none exist yet, sub-step 5 builds the table), not a fake
// placeholder pretending crystals were checked.
//
// §1.1  Every compartment has a UUID, tied to its intent_uuid
// §1.2  Every status transition is logged — nothing silent
// §2.1  Snapshot before every choice; compartments cannot mutate Cortex
//       directly, only delta-commit after PASS
// §5.3  Constraint frame cannot be modified after spawn — enforced by
//       Object.freeze, not by convention

const crypto = require('crypto');

const MODULE_ID = 'compartment-engine';
const VERSION   = '1.0.0';

const STATUS = {
  RUNNING: 'RUNNING',
  PASS:    'PASS',
  FAIL:    'FAIL',
  REWOUND: 'REWOUND',
  DELETED: 'DELETED',
};

// ── Lazy-load dependencies (never block boot) ─────────────────────────────────
let _jaa, _uid, _snapshot, _constitutionalAI, _bus, _taxonomy;

function _getJAA() {
  if (_jaa) return _jaa;
  try { ({ jaaDB: _jaa, uid: _uid } = require('../cortex/memory/jaa-db')); } catch (_) {}
  return _jaa;
}
function uid() { return _uid?.() ?? crypto.randomUUID(); }

function _getSnapshot() {
  if (_snapshot) return _snapshot;
  try { _snapshot = require('../cortex/snapshot/index'); } catch (_) {}
  return _snapshot;
}
function _getConstitutionalAI() {
  if (_constitutionalAI) return _constitutionalAI;
  try { _constitutionalAI = require('./constitutional-ai'); } catch (_) {}
  return _constitutionalAI;
}
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

// ── Extension points — sub-steps 4/5 plug in here ───────────────────────────
// Sub-step 2 wires these to honest defaults: the adversary suite "passes
// trivially" (it doesn't exist yet, so it cannot fail anything — that is
// different from claiming it ran and found nothing) and crystal/lattice
// updates are no-ops. Each default function is named and documented so a
// later sub-step replaces the reference, not the call site.
let _adversarySuite = async function _notYetBuilt_adversarySuite(compartment, executor) {
  return { ran: false, reason: 'adversary suite not yet built (Phase 25 sub-step 4)', violations: [], attackResults: [] };
};
let _qaqcLayer = async function _notYetBuilt_qaqcLayer(compartment) {
  return { ran: false, reason: 'QA/QC layer not yet built (Phase 25 sub-step 4)', checks: {} };
};
let _crystalLatticeUpdate = async function _notYetBuilt_crystalLatticeUpdate(compartment, outcome) {
  return { ran: false, reason: 'crystal/lattice update not yet built (Phase 25 sub-step 5)' };
};
let _caseLibraryIndex = async function _notYetBuilt_caseLibraryIndex(compartment, outcome) {
  return { indexed: false, reason: 'case library not yet built (Phase 46)' };
};

// Auto-registers the real sub-step 4/5 implementations on first spawn(),
// the same lazy-require pattern as every _getX() above — so callers never
// have to remember to wire this up themselves. Explicit _registerExtensions
// calls (e.g. from tests, or a future autonomous loop wanting custom
// behavior) always take effect immediately regardless of this flag, since
// they just overwrite the same module-level variables; this only controls
// whether the auto-wiring runs once at all.
let _autoRegistered = false;
function _autoRegisterExtensions() {
  if (_autoRegistered) return;
  _autoRegistered = true;
  try {
    const adversarySuite = require('../meta/adversary-suite');
    _registerExtensions({
      adversarySuite: (compartment, executor) => adversarySuite.runAdversarySuite(compartment, executor),
      qaqcLayer: (compartment) => adversarySuite.runQAQC(compartment),
    });
  } catch (e) {
    console.warn(`[${MODULE_ID}] adversary-suite auto-registration failed, staying on honest no-op defaults: ${e.message}`);
  }
  // crystal/lattice (sub-step 5) self-registers the same way once that file exists.
  try {
    const crystalLattice = require('../meta/crystal-lattice');
    _registerExtensions({
      crystalLatticeUpdate: (compartment, outcome) => crystalLattice.updateOnExecution(compartment, outcome),
    });
  } catch (_) { /* not built yet this pass — stays on the honest no-op default */ }
  // case library (Phase 46) self-registers the same way once that file exists.
  try {
    const caseLibrary = require('./case-library');
    _registerExtensions({
      caseLibraryIndex: (compartment, outcome) => caseLibrary.indexCompartment(compartment, outcome),
    });
  } catch (_) { /* not built yet this pass — stays on the honest no-op default */ }
}

// Allows sub-steps 4/5 (separate files, built later in this same phase) to
// register the real implementations without this file needing to know
// about them at require-time — avoids a circular require between
// compartment-engine.js and the adversary-suite/crystal-lattice files that
// will need to require this file's STATUS/types too.
function _registerExtensions({ adversarySuite, qaqcLayer, crystalLatticeUpdate, caseLibraryIndex } = {}) {
  if (typeof adversarySuite === 'function') _adversarySuite = adversarySuite;
  if (typeof qaqcLayer === 'function') _qaqcLayer = qaqcLayer;
  if (typeof crystalLatticeUpdate === 'function') _crystalLatticeUpdate = crystalLatticeUpdate;
  if (typeof caseLibraryIndex === 'function') _caseLibraryIndex = caseLibraryIndex;
}

// ── Constraint frame assembly ───────────────────────────────────────────────
// Assembled at spawn from real sources only. Frozen immediately — per spec,
// "cannot be overridden mid-execution, only inspected."
function _assembleConstraintFrame({ compartmentId, intent, budget, boundary, injectedFrameworks = [] }) {
  const cai = _getConstitutionalAI();
  const axioms = cai ? cai.AXIOMS.map(a => a.name) : [];

  const frame = {
    uuid: uid(),
    compartment_id: compartmentId,
    axioms,
    architectural_laws: [
      'JAA is sole source of truth',
      'delta-only mutations — compartments cannot mutate Cortex directly',
      'deterministic replay requirement',
    ],
    risk_ceiling: intent?.risk_level ?? null,
    // Phase 44 (Resolution Spectrum) does not exist — see file header.
    // Honest absence, not a fabricated ceiling.
    max_resolution_level: null,
    _max_resolution_level_pending_phase: 44,
    injected_frameworks: injectedFrameworks,
    // Phase 26 (negative crystals) — real empty array, sub-step 5 populates this
    // from an actual table once it exists. Not a placeholder pretending a
    // check happened; there is genuinely nothing to block on yet.
    negative_crystal_ids: [],
    budget: budget ?? { tokens: null, timeMs: null, irreversibleOpsAllowed: false },
    boundary: boundary ?? { description: 'no boundary declared', paths: [], systems: [] },
    assembled_at: Date.now(),
  };

  return Object.freeze(frame);
}

// ── Spawn ──────────────────────────────────────────────────────────────────────
// Snapshots Cortex state first (§2.1), then creates the compartment record.
// Returns the live compartment object — callers execute against it, then
// call resolve() with the outcome. The compartment itself is the in-memory
// working object; the JAA row is the durable audit trail of every
// transition it goes through.
async function spawn({ intent, budget, boundary, injectedFrameworks, workingMemorySeed = null } = {}) {
  _autoRegisterExtensions();
  const jaa = _getJAA();
  const snapshot = _getSnapshot();

  if (!intent || !intent.uuid) {
    throw new Error('[compartment-engine] spawn() requires a frozen intent with a uuid (Phase 45 output)');
  }

  const compartmentId = uid();

  let snapId = null;
  let preSnapshotHash = null;
  if (snapshot) {
    try {
      const snap = snapshot.create({ type: 'pre_forge', message: `compartment spawn: ${intent.verb} ${intent.domain}`, causedBy: compartmentId });
      snapId = snap.snapId;
      preSnapshotHash = snap.cortex_state_hash;
    } catch (e) {
      console.warn(`[${MODULE_ID}] snapshot failed at spawn, proceeding without rewind target: ${e.message}`);
    }
  }

  const constraintFrame = _assembleConstraintFrame({ compartmentId, intent, budget, boundary, injectedFrameworks });

  const compartment = {
    id: compartmentId,
    intent_uuid: intent.uuid,
    input_state: { snapId, preSnapshotHash },
    working_memory: workingMemorySeed, // null until Phase 46 (real case library) exists
    constraint_frame: constraintFrame,
    trace_log: [],
    result: null,
    status: STATUS.RUNNING,
    createdAt: Date.now(),
    // Not part of the spec's COMPARTMENT object model verbatim (which only
    // lists intent_uuid, deliberately, since intent is immutable upstream)
    // but needed by real consumers: adversary-suite's cross-domain check
    // and crystal-lattice's pattern signature both need domain/verb without
    // re-fetching the intent record. Read-only convenience denormalization,
    // not a second source of truth — intent_uuid stays canonical.
    _declaredDomain: intent.domain ?? null,
    _declaredVerb: intent.verb ?? null,
  };

  _trace(compartment, 'SPAWN', { intent_uuid: intent.uuid, snapId });

  if (jaa) {
    try {
      jaa.insert('compartments', {
        uuid: compartmentId,
        intent_uuid: intent.uuid,
        status: STATUS.RUNNING,
        snapId,
        preSnapshotHash,
        constraint_frame: constraintFrame,
        trace_log: compartment.trace_log,
        createdAt: compartment.createdAt,
      });
    } catch (_) {}
  }

  _emit('compartment.spawned', { id: compartmentId, intent_uuid: intent.uuid });

  return compartment;
}

// ── Trace logging — every action, regardless of eventual outcome ───────────────
function _trace(compartment, event, data = {}) {
  compartment.trace_log.push({ event, data, ts: Date.now() });
}

function _emit(type, payload) {
  const bus = _getBus();
  if (bus?.emit) { try { bus.emit(type, payload); } catch (_) {} }
}

function _logEvent(type, payload) {
  const jaa = _getJAA();
  if (jaa) { try { jaa.insert('event_log', { uuid: uid(), type, payload, source: MODULE_ID, ts: Date.now() }); } catch (_) {} }
  _emit(type, payload);
}

// ── Execute — run the supplied executor inside the compartment ─────────────────
// executor: async (workingMemory, constraintFrame) => result
// The compartment is the unit of trust, not the executor function — if the
// executor throws, that's treated as a FAIL with the thrown error as
// evidence, never an uncaught crash that skips trace logging.
async function execute(compartment, executor) {
  if (compartment.status !== STATUS.RUNNING) {
    throw new Error(`[compartment-engine] cannot execute compartment ${compartment.id} — status is ${compartment.status}, expected RUNNING`);
  }

  _trace(compartment, 'EXECUTE_START', {});

  try {
    const result = await executor(compartment.working_memory, compartment.constraint_frame);
    compartment.result = result;
    _trace(compartment, 'EXECUTE_COMPLETE', { hasResult: result !== undefined && result !== null });
  } catch (e) {
    compartment.result = null;
    compartment._executionError = e.message;
    _trace(compartment, 'EXECUTE_ERROR', { error: e.message });
  }

  // executor is passed through so the adversary suite's stress class
  // (sub-step 4) can actually re-invoke it for determinism/repetition
  // checks — resolve() is also callable on its own (e.g. by a future
  // autonomous loop resuming a compartment), so executor stays optional.
  return resolve(compartment, executor);
}

// ── Resolve — adversary suite + QA/QC, then PASS/FAIL → commit/rewind/delete ───
// This is where sub-steps 4/5's real implementations get called once
// registered via _registerExtensions(). Until then, the honest no-op
// defaults run, and their `ran: false` flag is recorded in the trace so
// nobody mistakes "not yet built" for "checked and clean."
async function resolve(compartment, executor = null) {
  const jaa = _getJAA();
  const snapshot = _getSnapshot();

  if (compartment._executionError) {
    return await _fail(compartment, { reason: `execution error: ${compartment._executionError}`, recoverable: true });
  }

  const adversaryReport = await _adversarySuite(compartment, executor);
  _trace(compartment, 'ADVERSARY_SUITE', adversaryReport);

  if (adversaryReport.violations?.length) {
    const frameBreach = adversaryReport.violations.some(v => v.type === 'frame_violation');
    return frameBreach
      ? await _delete(compartment, { reason: 'constraint frame breach detected by adversary suite', violations: adversaryReport.violations })
      : await _fail(compartment, { reason: 'adversary suite found violations', violations: adversaryReport.violations, recoverable: true });
  }

  const qaReport = await _qaqcLayer(compartment);
  _trace(compartment, 'QA_QC', qaReport);

  if (qaReport.checks && Object.values(qaReport.checks).some(v => v === false)) {
    return await _fail(compartment, { reason: 'QA/QC check failed', checks: qaReport.checks, recoverable: true });
  }


  return await _pass(compartment);
}

// ── PASS ────────────────────────────────────────────────────────────────────────
async function _pass(compartment) {
  const jaa = _getJAA();
  compartment.status = STATUS.PASS;
  _trace(compartment, 'PASS', {});

  const latticeResult = await _crystalLatticeUpdate(compartment, 'PASS');
  _trace(compartment, 'CRYSTAL_LATTICE_UPDATE', latticeResult);

  const caseLibraryResult = await _caseLibraryIndex(compartment, 'PASS');
  _trace(compartment, 'CASE_LIBRARY_INDEX', caseLibraryResult);

  _updateCompartmentRecord(compartment);
  _logEvent('compartment.pass', { id: compartment.id, intent_uuid: compartment.intent_uuid });

  return compartment;
}

// ── FAIL → REWIND ────────────────────────────────────────────────────────────────
// Recoverable: bad result, invariant violation, adversary/QA failure.
// Cortex snapshot is intact and valid — restore it, keep the trace for
// learning. Never silently discard a failure (§1.2).
async function _fail(compartment, { reason, recoverable = true, violations = null, checks = null } = {}) {
  const snapshot = _getSnapshot();
  compartment.status = STATUS.FAIL;
  _trace(compartment, 'FAIL', { reason, violations, checks });

  if (recoverable && compartment.input_state?.snapId && snapshot) {
    try {
      snapshot.rollback(compartment.input_state.snapId, { reason: `compartment ${compartment.id} FAIL: ${reason}` });
      compartment.status = STATUS.REWOUND;
      _trace(compartment, 'REWOUND', { snapId: compartment.input_state.snapId });
    } catch (e) {
      console.warn(`[${MODULE_ID}] rollback failed for compartment ${compartment.id}: ${e.message}`);
      _trace(compartment, 'REWIND_FAILED', { error: e.message });
    }
  }

  const latticeResult = await _crystalLatticeUpdate(compartment, 'FAIL');
  _trace(compartment, 'CRYSTAL_LATTICE_UPDATE', latticeResult);

  _updateCompartmentRecord(compartment);
  _logEvent('compartment.fail', { id: compartment.id, intent_uuid: compartment.intent_uuid, reason, status: compartment.status });

  return compartment;
}

// ── DELETE ──────────────────────────────────────────────────────────────────────
// Unrecoverable: frame breach, snapshot integrity compromised, attempted
// direct Cortex mutation. The compartment is destroyed, trace flagged
// UNTRUSTED, no delta committed, no rewind attempted — there is nothing
// trustworthy to roll back to from inside an already-compromised
// compartment; the pre-spawn snapshot stays as the actual safe state and
// was never touched, so there is nothing TO rewind.
async function _delete(compartment, { reason, violations = null } = {}) {
  compartment.status = STATUS.DELETED;
  compartment._trusted = false;
  _trace(compartment, 'DELETE', { reason, violations, flaggedUntrusted: true });

  const latticeResult = await _crystalLatticeUpdate(compartment, 'DELETE');
  _trace(compartment, 'CRYSTAL_LATTICE_UPDATE', latticeResult);

  const taxonomy = _getTaxonomy();
  const jaa = _getJAA();
  if (taxonomy && jaa) {
    try {
      const loop = taxonomy.createLoop({
        loop_type: 'CONSTITUTIONAL',
        source: MODULE_ID,
        path: `compartment/${compartment.id}`,
        body: `Compartment deleted — unrecoverable violation: ${reason}`,
        evidence: violations ? violations.map(v => JSON.stringify(v)) : [reason],
        closure_condition: 'Human or later phase reviews the violation; negative crystal candidate (Phase 26, sub-step 5) considered.',
      });
      jaa.insert('gaps', { uuid: uid(), ...loop, createdAt: Date.now() });
    } catch (_) {}
  }

  _updateCompartmentRecord(compartment);
  _logEvent('compartment.delete', { id: compartment.id, intent_uuid: compartment.intent_uuid, reason });

  return compartment;
}

function _updateCompartmentRecord(compartment) {
  const jaa = _getJAA();
  if (!jaa) return;
  try {
    jaa.update('compartments', compartment.id, {
      status: compartment.status,
      result: compartment.result,
      trace_log: compartment.trace_log,
      _trusted: compartment._trusted !== false,
      resolvedAt: Date.now(),
    });
  } catch (_) {}
}

function validateWiring() {
  const checks = {
    jaa: !!_getJAA(),
    snapshot: !!_getSnapshot(),
    constitutionalAI: !!_getConstitutionalAI(),
    bus: !!_getBus(),
    taxonomy: !!_getTaxonomy(),
  };
  const online = Object.values(checks).filter(Boolean).length;
  console.log(`[${MODULE_ID}] wiring: ${online}/${Object.keys(checks).length} systems reachable`);
  return checks;
}

module.exports = {
  spawn, execute, resolve,
  _registerExtensions,
  validateWiring,
  STATUS, MODULE_ID, VERSION,
};
