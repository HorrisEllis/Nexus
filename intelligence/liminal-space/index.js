'use strict';
/**
 * cortex/liminal-space/index.js — Liminal Space Organ
 * UUID: nexus-liminal-space-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * The five interstitial spaces. The boundary between memory levels.
 * Not where unresolved things live — what the boundary IS.
 * The intersection defines both sides.
 *
 * Five focal points:
 *
 *   L0 ∩ L2  Constitutional Threshold
 *     Where accumulated synthesis meets immovable axiom.
 *     What happens when L2 produces something that violates L0?
 *     INV-001: filter gate. Some things absorbed, some bounce, some dissolve.
 *
 *   L1 ∩ L3  Pattern-Causality Membrane
 *     Where shadow connections in the lattice meet causal tracing.
 *     Pattern that survives causal interrogation → load-bearing.
 *     Pattern that doesn't → shadow in a different sense.
 *     INV-002: the moment something moves from recognition to understanding.
 *
 *   L2 ∩ L4  Velocity Field
 *     High oscillation + high decay = processing faster than synthesising.
 *     Runaway state. The most unstable interstitial zone.
 *     INV-003: system knows when it's integrating faster than it can evaluate.
 *
 *   L3 ∩ L0  Root Terminus
 *     Every causal chain must terminate at an L0 axiom or return L0_UNKNOWN.
 *     Chains that terminate nowhere hang here indefinitely.
 *     INV-004: known enough to trace, not anchored enough to close.
 *
 *   L1 ∩ L2  Coherence Surface
 *     Lattice and conflict buffer must agree on every node.
 *     Nodes simultaneously patterned and quarantined live here.
 *     Superposition before collapse.
 *     INV-005: productive contradiction held open, not forced to resolve.
 *
 * Crystallisation gate:
 *   Evidence threshold: N confirmed instances, confidence above threshold
 *   OR focal point confirmation: pattern survives intersection of two levels
 *   The intersection IS the verification.
 *
 * Forward inference:
 *   Same architecture as spec-drift, time direction reversed.
 *   Pattern fires now → pre-stage fix → gap hasn't opened yet.
 *   The gap shape is both diagnostic signal and fix target.
 *
 * This organ is fully isolated:
 *   ONE LINE added to organs array in cortex/boot.js
 *   No other file changed.
 *   Reads from event bus. Writes to JAA. Emits on bus.
 *   Calls nothing directly on any other organ.
 *
 * §1.2  Every state change is an event — nothing silent
 * §2.1  JAA write before in-memory update
 * §5.1  Every space item carries UUID
 */

const crypto = require('crypto');
const { jaaDB, uid } = require('../../cortex/memory/jaa-db');
const domainNodes = require('../lib/domain-nodes.js');

const MODULE_ID = 'liminal-space';
const VERSION   = '1.0.0';

// ── Focal point definitions ───────────────────────────────────────────────────
const FOCAL_POINTS = {
  'L0/L2': {
    name:        'Constitutional Threshold',
    levels:      ['L0', 'L2'],
    invariant:   'INV-001',
    description: 'Where synthesis meets axiom. Filter gate between accumulated knowledge and immovable constraints.',
    velocity:    0,
    items:       [],
  },
  'L1/L3': {
    name:        'Pattern-Causality Membrane',
    levels:      ['L1', 'L3'],
    invariant:   'INV-002',
    description: 'Where lattice patterns meet causal tracing. Recognition becoming understanding.',
    velocity:    0,
    items:       [],
  },
  'L2/L4': {
    name:        'Velocity Field',
    levels:      ['L2', 'L4'],
    invariant:   'INV-003',
    description: 'Processing rate vs synthesis rate. Runaway state when oscillation exceeds integration.',
    velocity:    0,
    items:       [],
  },
  'L3/L0': {
    name:        'Root Terminus',
    levels:      ['L3', 'L0'],
    invariant:   'INV-004',
    description: 'Where causal chains either anchor to axioms or hang unresolved as L0_UNKNOWN.',
    velocity:    0,
    items:       [],
  },
  'L1/L2': {
    name:        'Coherence Surface',
    levels:      ['L1', 'L2'],
    invariant:   'INV-005',
    description: 'Where lattice patterns and conflict buffer must agree. Productive contradiction held open.',
    velocity:    0,
    items:       [],
  },
};

// ── Thresholds ────────────────────────────────────────────────────────────────
const CRYSTALLISE_THRESHOLD  = 0.75;   // confidence to crystallise
const CRYSTALLISE_MIN_COUNT  = 5;      // minimum confirmed instances
const VELOCITY_RUNAWAY       = 0.8;    // L2/L4 runaway threshold
const VELOCITY_DECAY         = 0.05;   // velocity decays each tick

// ── State ─────────────────────────────────────────────────────────────────────
// §BUILT 2026-09-19 — the events this organ listens to, declared once. It now runs
// inside the intelligence server (moved out of cortex), where the local bus only
// hears what is delivered to POST /api/intelligence/bus; that intake's allowlist
// IS this list, and cortex's relay set is pinned to it by a test.
const SUBSCRIBED_EVENTS = Object.freeze([
  'cortex.gap.found', 'cortex.intelligence.pattern_crystallised', 'escalation.friction.increased',
  'tc.drift.signal', 'guardian.job.complete', 'forge.patch.proposed', 'cortex.gap.resolved',
]);
let _bus    = null;
let _cfg    = {};
let _tick   = null;

// ── Init ──────────────────────────────────────────────────────────────────────
function init(cfg = {}) {
  _cfg = cfg;
  _bus = cfg.bus || null;

  // Load persisted items from JAA
  _loadFromJaa();

  // Subscribe to events
  if (_bus) {
    _bus.on('cortex.gap.found',                    _onGapFound);
    _bus.on('cortex.intelligence.pattern_crystallised', _onPatternCrystallised);
    _bus.on('escalation.friction.increased',        _onFrictionChange);
    _bus.on('tc.drift.signal',                      _onDriftSignal);
    _bus.on('guardian.job.complete',                _onJobComplete);
    _bus.on('forge.patch.proposed',                 _onPatchProposed);
    _bus.on('cortex.gap.resolved',                  _onGapResolved);
  }

  // Velocity decay tick every 60s
  _tick = setInterval(_tickVelocity, 60_000);
  _tick.unref();

  console.log(`[${MODULE_ID}] v${VERSION} — 5 interstitial spaces active`);
  _logSpaceStatus();

  return { ok: true };
}

function stop() {
  if (_tick) { clearInterval(_tick); _tick = null; }
  if (_bus) {
    _bus.off('cortex.gap.found',                    _onGapFound);
    _bus.off('cortex.intelligence.pattern_crystallised', _onPatternCrystallised);
    _bus.off('escalation.friction.increased',        _onFrictionChange);
    _bus.off('tc.drift.signal',                      _onDriftSignal);
    _bus.off('guardian.job.complete',                _onJobComplete);
    _bus.off('forge.patch.proposed',                 _onPatchProposed);
    _bus.off('cortex.gap.resolved',                  _onGapResolved);
  }
}

// ── Load from JAA ─────────────────────────────────────────────────────────────
function _loadFromJaa() {
  try {
    const rows = jaaDB.query('interstitial_spaces', () => true, 500);
    for (const row of rows) {
      if (FOCAL_POINTS[row.focalPoint]) {
        FOCAL_POINTS[row.focalPoint].items.push(row);
        FOCAL_POINTS[row.focalPoint].velocity = row.velocity || 0;
      }
    }
    const total = Object.values(FOCAL_POINTS).reduce((s,f) => s + f.items.length, 0);
    if (total) console.log(`[${MODULE_ID}] loaded ${total} items from JAA`);
  } catch(e) {
    console.warn(`[${MODULE_ID}] JAA load failed (starting fresh): ${e.message}`);
  }
}

// ── Hold an item in a focal point space ───────────────────────────────────────
function hold(focalPoint, item, source = 'system') {
  const space = FOCAL_POINTS[focalPoint];
  if (!space) return { ok: false, error: `unknown focal point: ${focalPoint}` };

  const record = {
    uuid:        uid(),
    focalPoint,
    source,
    text:        item.text || item.description || JSON.stringify(item).slice(0, 200),
    type:        item.type || 'observation',
    confidence:  item.confidence || 0,
    count:       item.count || 1,
    causedBy:    item.causedBy || null,
    resolved:    false,
    dissolvedAt: null,
    velocity:    space.velocity,
    ts:          Date.now(),
    meta:        item.meta || {},
  };

  // §2.1 JAA first
  try {
    jaaDB.insert('interstitial_spaces', record);
  } catch(e) {
    console.warn(`[${MODULE_ID}] JAA write failed: ${e.message}`);
    return { ok: false, error: e.message };
  }

  space.items.push(record);
  _updateVelocity(focalPoint, 0.1);

  // Check for crystallisation
  _checkCrystallisation(focalPoint, record);

  if (_bus) _bus.emit('liminal.item.held', {
    focalPoint, uuid: record.uuid, type: record.type, source,
  });

  return { ok: true, record };
}

// ── Resolve an item (explicit decision made) ──────────────────────────────────
function resolve(uuid, decision, source = 'manual') {
  let found = null;
  let space = null;

  for (const [fp, s] of Object.entries(FOCAL_POINTS)) {
    const item = s.items.find(i => i.uuid === uuid);
    if (item) { found = item; space = fp; break; }
  }

  if (!found) return { ok: false, error: `item not found: ${uuid}` };

  found.resolved   = true;
  found.decision   = decision;
  found.resolvedAt = Date.now();
  found.resolvedBy = source;

  try {
    jaaDB.update('interstitial_spaces', uuid, found);
  } catch(e) {
    console.warn(`[${MODULE_ID}] resolve JAA write failed: ${e.message}`);
  }

  _updateVelocity(space, -0.05);

  if (_bus) _bus.emit('liminal.item.resolved', {
    focalPoint: space, uuid, decision, source,
  });

  return { ok: true };
}

// ── Dissolve (tension wasn't real) ────────────────────────────────────────────
function dissolve(uuid, reason = 'non_real') {
  let found = null;
  for (const s of Object.values(FOCAL_POINTS)) {
    const item = s.items.find(i => i.uuid === uuid);
    if (item) { found = item; break; }
  }
  if (!found) return { ok: false, error: `item not found: ${uuid}` };

  found.dissolved   = true;
  found.dissolvedAt = Date.now();
  found.dissolveReason = reason;

  try { jaaDB.update('interstitial_spaces', uuid, found); }
  catch(e) { console.warn(`[${MODULE_ID}] dissolve write failed: ${e.message}`); }

  if (_bus) _bus.emit('liminal.item.dissolved', { uuid, reason });
  return { ok: true };
}

// ── Crystallisation gate ──────────────────────────────────────────────────────
// Two paths:
//   1. Evidence threshold: N confirmed instances, confidence > threshold
//   2. Focal point confirmation: pattern survives intersection of two levels
function _checkCrystallisation(focalPoint, newItem) {
  const space = FOCAL_POINTS[focalPoint];

  // Group by type to count confirmed instances.
  // §14.4 — exclude items already crystallised: without this, a bucket that
  // crossed threshold once re-fires _crystallise() (and its forward-inference
  // dump) on every subsequent item held here, forever.
  const byType = {};
  for (const item of space.items.filter(i => !i.resolved && !i.dissolved && !i.crystallised)) {
    if (!byType[item.type]) byType[item.type] = [];
    byType[item.type].push(item);
  }

  for (const [type, items] of Object.entries(byType)) {
    const count      = items.length;
    const avgConf    = items.reduce((s,i) => s + (i.confidence||0), 0) / count;

    // Path 1: evidence threshold
    if (count >= CRYSTALLISE_MIN_COUNT && avgConf >= CRYSTALLISE_THRESHOLD) {
      _crystallise(focalPoint, type, items, 'evidence_threshold');
      continue;
    }

    // Path 2: focal point confirmation
    // If item exists in both levels that define this focal point
    if (count >= 2 && _focalPointConfirmed(focalPoint, type)) {
      _crystallise(focalPoint, type, items, 'focal_point_confirmation');
    }
  }
}

function _focalPointConfirmed(focalPoint, type) {
  // Check if the pattern appears in both level-adjacent spaces
  const adjacencies = {
    'L0/L2': ['L3/L0', 'L1/L2'],
    'L1/L3': ['L1/L2', 'L0/L2'],
    'L2/L4': ['L1/L2', 'L0/L2'],
    'L3/L0': ['L0/L2', 'L1/L3'],
    'L1/L2': ['L1/L3', 'L2/L4'],
  };

  const adjacent = adjacencies[focalPoint] || [];
  return adjacent.some(fp =>
    FOCAL_POINTS[fp]?.items.some(i => i.type === type && !i.resolved && !i.dissolved)
  );
}

function _crystallise(focalPoint, type, items, path) {
  const id  = uid();
  const now = Date.now();

  const crystal = {
    uuid:          id,
    focalPoint,
    type,
    path,                    // how it crystallised
    itemCount:     items.length,
    avgConfidence: items.reduce((s,i) => s + (i.confidence||0), 0) / items.length,
    summary:       items.map(i => i.text).slice(0,3).join(' | '),
    ts:            now,
  };

  try { jaaDB.insert('crystals', crystal); }
  catch(e) { console.warn(`[${MODULE_ID}] crystal write failed: ${e.message}`); }
  domainNodes.writeCrystalNode(crystal);

  // Mark items as crystallised
  for (const item of items) {
    item.crystallised   = true;
    item.crystallisedAt = now;
    try { jaaDB.update('interstitial_spaces', item.uuid, item); }
    catch(e) { console.warn(`[${MODULE_ID}] crystal mark failed: ${e.message}`); }
  }

  if (_bus) _bus.emit('liminal.crystallised', { focalPoint, type, path, crystal });

  console.log(`[${MODULE_ID}] ✦ crystallised: ${type} at ${focalPoint} via ${path}`);

  // Forward inference — pre-stage fix if pattern predicts a gap
  _forwardInference(focalPoint, type, crystal);
}

// ── Forward inference ─────────────────────────────────────────────────────────
// Same architecture as spec-drift, time direction reversed.
// Pattern fires now → pre-stage fix → gap hasn't opened yet.
function _forwardInference(focalPoint, type, crystal) {
  // Query intelligence layer for precursor patterns involving this type
  try {
    const precursors = jaaDB.query('bep_patterns',
      r => r.patternType === 'failure_precursor' &&
           (r.typeA === type || r.typeB === type || (r.failureTypes||[]).includes(type)),
      5
    );

    if (!precursors.length) return;

    for (const precursor of precursors) {
      // Pre-stage known fix if available
      const knownFix = jaaDB.query('forge_patches',
        r => r.faultClass === type && r.status === 'verified' && (r.successRate||0) > 0.5,
        1
      )[0];

      if (_bus) _bus.emit('liminal.forward_inference', {
        focalPoint, type, crystal,
        precursor: precursor.signature,
        knownFix:  knownFix ? { uuid: knownFix.uuid, successRate: knownFix.successRate } : null,
        message:   knownFix
          ? `Pattern "${type}" predicts "${precursor.signature}" — known fix pre-staged`
          : `Pattern "${type}" predicts "${precursor.signature}" — no known fix, monitoring`,
      });

      console.log(`[${MODULE_ID}] ⟳ forward: "${type}" → predicts "${precursor.signature}"`);
    }
  } catch(e) {
    console.warn(`[${MODULE_ID}] forward inference failed: ${e.message}`);
  }
}

// ── Velocity field (L2/L4) ────────────────────────────────────────────────────
function _updateVelocity(focalPoint, delta) {
  const space = FOCAL_POINTS[focalPoint];
  if (!space) return;
  space.velocity = Math.max(0, Math.min(1, (space.velocity || 0) + delta));

  if (focalPoint === 'L2/L4' && space.velocity >= VELOCITY_RUNAWAY) {
    if (_bus) _bus.emit('liminal.velocity.runaway', {
      focalPoint, velocity: space.velocity,
      message: 'Processing faster than synthesis can integrate — runaway state',
    });
    console.warn(`[${MODULE_ID}] ⚠ L2/L4 velocity runaway: ${space.velocity.toFixed(2)}`);
  }
}

function _tickVelocity() {
  for (const [fp, space] of Object.entries(FOCAL_POINTS)) {
    if (space.velocity > 0) {
      space.velocity = Math.max(0, space.velocity - VELOCITY_DECAY);
    }
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────
function _onGapFound(event) {
  const gap = event.payload?.gap || event.payload;
  if (!gap) return;

  // Gaps that touch axioms → L0/L2
  if (gap.type?.includes('axiom') || gap.type?.includes('boundary')) {
    hold('L0/L2', { text: gap.body, type: gap.type, confidence: 0.6, causedBy: gap.uuid }, 'gap-finder');
  }
  // Recurring gaps → L2/L4 (velocity)
  if (gap.type?.includes('recurring') || gap.type?.includes('bottleneck')) {
    _updateVelocity('L2/L4', 0.15);
    hold('L2/L4', { text: gap.body, type: gap.type, confidence: 0.5, causedBy: gap.uuid }, 'gap-finder');
  }
  // Causal gaps without root → L3/L0
  if (gap.type?.includes('causal') || gap.type?.includes('unanchored')) {
    hold('L3/L0', { text: gap.body, type: gap.type, confidence: 0.4, causedBy: gap.uuid }, 'gap-finder');
  }
}

function _onPatternCrystallised(event) {
  const { pattern } = event.payload || {};
  if (!pattern) return;

  // Newly crystallised pattern → L1/L3 (pattern-causality membrane)
  // Check if it has a causal path
  if (pattern.patternType === 'failure_precursor') {
    hold('L1/L3', {
      text:       `Pattern "${pattern.signature}" has causal path to failures`,
      type:       pattern.patternType,
      confidence: pattern.confidence || 0.7,
      causedBy:   pattern.uuid,
      meta:       { pattern },
    }, 'intelligence');
  }

  // Co-occurrence patterns → L1/L2 (coherence surface)
  if (pattern.patternType === 'co_occurrence') {
    // §NOISE-GUARD 2026-08-13 — intelligence's meta-pattern layer tags
    // pairings involving a known structural noise source (e.g. a
    // gap-detector that re-fires hundreds of times every boot) as
    // `noiseTainted` before it ever reaches the bus. Previously this
    // handler took pattern.confidence at face value regardless — a noisy
    // detector reaching "100% confidence, co-occurs with everything" would
    // crystallise here at L1/L2 just as readily as a real relationship.
    // Tainted pairings are held at sharply reduced confidence instead of
    // being dropped outright: the co-occurrence still happened and may be
    // worth a human glance, it just shouldn't be trusted enough to
    // independently cross this membrane's own crystallisation threshold.
    const confidence = pattern.noiseTainted
      ? Math.min(0.2, (pattern.confidence || 0.6) * 0.25)
      : (pattern.confidence || 0.6);
    hold('L1/L2', {
      text:       `Co-occurrence: "${pattern.typeA}" and "${pattern.typeB}"`
        + (pattern.noiseTainted ? ' (noise-tainted — one side is a known-loud event type, discounted)' : ''),
      type:       'co_occurrence',
      confidence,
      causedBy:   pattern.uuid,
      meta:       pattern.noiseTainted ? { pattern, noiseTainted: true } : { pattern },
    }, 'intelligence');
  }
}

function _onFrictionChange(event) {
  const { faultClass, newFric } = event.payload || {};
  if (!faultClass) return;
  // High friction → L0/L2 (constitutional threshold — axiom boundary stress)
  if (newFric >= 0.7) {
    hold('L0/L2', {
      text:       `Fault class "${faultClass}" friction at ${(newFric*100).toFixed(0)}% — approaching failure mode`,
      type:       'high_friction',
      confidence: newFric,
      meta:       { faultClass, friction: newFric },
    }, 'escalation');
  }
  _updateVelocity('L2/L4', 0.08);
}

function _onDriftSignal(event) {
  const { serviceId, signal, confidence, evidence } = event.payload || {};
  if (!signal) return;
  // Behavioral drift → L1/L2 (coherence surface — AI and system disagreeing)
  hold('L1/L2', {
    text:       evidence || `Behavioral drift on ${serviceId || 'unknown service'}: ${signal}`,
    type:       'behavioral_drift',
    confidence: typeof confidence === 'number' ? confidence : 0.65,
    meta:       event.payload,
  }, 'behavioral-boundary');
  _updateVelocity('L2/L4', 0.12);
}

function _onJobComplete(event) {
  // Completed jobs reduce velocity (synthesis happening)
  _updateVelocity('L2/L4', -0.08);
}

function _onPatchProposed(event) {
  // Patches increase velocity (more processing)
  _updateVelocity('L2/L4', 0.1);
}

function _onGapResolved(event) {
  // Resolutions reduce velocity
  _updateVelocity('L2/L4', -0.1);
}

// ── Status ────────────────────────────────────────────────────────────────────
function status() {
  const spaces = {};
  for (const [fp, space] of Object.entries(FOCAL_POINTS)) {
    const active     = space.items.filter(i => !i.resolved && !i.dissolved && !i.crystallised);
    const resolved   = space.items.filter(i => i.resolved).length;
    const crystals   = space.items.filter(i => i.crystallised).length;
    spaces[fp] = {
      name:      space.name,
      invariant: space.invariant,
      active:    active.length,
      resolved,
      crystals,
      velocity:  Math.round(space.velocity * 100) / 100,
      runaway:   fp === 'L2/L4' && space.velocity >= VELOCITY_RUNAWAY,
    };
  }
  return { ok: true, spaces, version: VERSION };
}

function list(focalPoint) {
  if (focalPoint) {
    const space = FOCAL_POINTS[focalPoint];
    if (!space) return [];
    return space.items.filter(i => !i.resolved && !i.dissolved && !i.crystallised);
  }
  return Object.entries(FOCAL_POINTS).flatMap(([fp, space]) =>
    space.items
      .filter(i => !i.resolved && !i.dissolved && !i.crystallised)
      .map(i => ({ ...i, focalPoint: fp }))
  );
}

function _logSpaceStatus() {
  for (const [fp, space] of Object.entries(FOCAL_POINTS)) {
    const active = space.items.filter(i => !i.resolved && !i.dissolved).length;
    if (active > 0) {
      console.log(`[${MODULE_ID}]   ${fp} ${space.name}: ${active} active`);
    }
  }
}

module.exports = {
  init, stop, hold, resolve, dissolve, list, status, SUBSCRIBED_EVENTS,
  FOCAL_POINTS, MODULE_ID, VERSION,
};
