'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// Mock fault-taxonomy — already proven correct in test-fault-taxonomy.js (Phase 1).
// This suite isolates escalation.js's own logic: bus wiring, severity mapping,
// refusal-on-FAILURE_MODE, and correct event emission.
let _rows = {};
let _raiseCalls = [];
let _successCalls = [];
let _attemptCalls = [];
require.cache[require.resolve('../../cortex/self-heal/fault-taxonomy')] = {
  id: '../self-heal/fault-taxonomy', filename: '../self-heal/fault-taxonomy', loaded: true,
  exports: {
    FRICTION_THRESHOLDS: { NOMINAL: 0.0, ELEVATED: 0.4, HIGH: 0.7, FAILURE_MODE: 1.0 },
    bandFor: (f) => f >= 1.0 ? 'FAILURE_MODE' : f >= 0.7 ? 'HIGH' : f >= 0.4 ? 'ELEVATED' : 'NOMINAL',
    getFaultClass: (fc) => _rows[fc] || null,
    raiseFriction: (fc, level, meta) => {
      _raiseCalls.push({ fc, level, meta });
      const prev = _rows[fc]?.friction || 0;
      const delta = { 0: 0.10, 1: 0.20, 2: 0.35, 3: 0.50 }[level];
      const friction = Math.min(prev + delta, 1.0);
      _rows[fc] = { faultClass: fc, friction, count: (_rows[fc]?.count || 0) + 1 };
      const band = friction >= 1.0 ? 'FAILURE_MODE' : friction >= 0.7 ? 'HIGH' : friction >= 0.4 ? 'ELEVATED' : 'NOMINAL';
      const prevBand = prev >= 1.0 ? 'FAILURE_MODE' : prev >= 0.7 ? 'HIGH' : prev >= 0.4 ? 'ELEVATED' : 'NOMINAL';
      return { row: _rows[fc], band, justEnteredFailureMode: prevBand !== 'FAILURE_MODE' && band === 'FAILURE_MODE' };
    },
    recordSuccess: (fc) => {
      _successCalls.push(fc);
      if (!_rows[fc]) return null;
      _rows[fc].friction = Math.max(0, _rows[fc].friction * 0.5);
      return { friction: _rows[fc].friction, band: 'NOMINAL' };
    },
    // §BUILT 2026-09-11 — mirrors the real fault-taxonomy.js addition:
    // no-op (not a throw) against a missing row, real bump against an
    // existing one. This mock had gone stale the same way the real
    // module's callers went stale before it was added — escalation.js's
    // real recordAttemptOutcome() now calls this unconditionally.
    recordAttempt: (fc) => {
      _attemptCalls.push(fc);
      if (!_rows[fc]) return null;
      _rows[fc].attempts = (_rows[fc].attempts || 0) + 1;
      return _rows[fc];
    },
  },
};

const escalation = require('../../cortex/self-heal/escalation');

// Minimal mock bus — replicates nexus-bus.js's real emit() envelope
// ({ type, payload, source, ts, id }), not just a flat pass-through. The
// first version of this mock didn't do this and let a real event.payload
// mismatch ship undetected — fixed here, not just in the source.
function makeBus() {
  const handlers = {};
  return {
    on: (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); },
    off: (ev, fn) => { handlers[ev] = (handlers[ev] || []).filter(h => h !== fn); },
    emit: (ev, data) => {
      const event = { type: ev, payload: data, source: 'test', ts: Date.now(), id: 'test-id' };
      (handlers[ev] || []).forEach(h => h(event));
    },
  };
}

function reset() { _rows = {}; _raiseCalls = []; _successCalls = []; }

test('T-001', 'wireAnomalyTrigger subscribes to anomaly.detected on the given bus', () => {
  reset();
  const bus = makeBus();
  escalation.wireAnomalyTrigger(bus);
  bus.emit('anomaly.detected', { anomalyUuid: 'a1', type: 'timeout', severity: 'high', sessionId: 's1' });
  assert.strictEqual(_raiseCalls.length, 1);
  assert.strictEqual(_raiseCalls[0].fc, 'timeout');
});

test('T-002', 'severity maps to ladder level correctly (high → 2)', () => {
  reset();
  const bus = makeBus();
  escalation.wireAnomalyTrigger(bus);
  bus.emit('anomaly.detected', { type: 'circuit_breaker', severity: 'high' });
  assert.strictEqual(_raiseCalls[0].level, 2);
});

test('T-003', 'unrecognised severity defaults to level 1, not silently level 0', () => {
  reset();
  const bus = makeBus();
  escalation.wireAnomalyTrigger(bus);
  bus.emit('anomaly.detected', { type: 'bottleneck', severity: 'nonsense' });
  assert.strictEqual(_raiseCalls[0].level, 1);
});

test('T-004', 'anomaly.detected with no type is ignored, not thrown', () => {
  reset();
  const bus = makeBus();
  escalation.wireAnomalyTrigger(bus);
  assert.doesNotThrow(() => bus.emit('anomaly.detected', { severity: 'high' }));
  assert.strictEqual(_raiseCalls.length, 0);
});

test('T-005', 'init() wires both anomaly.detected and HEAL_REQUESTED', () => {
  reset();
  const bus = makeBus();
  escalation.init({ bus });
  bus.emit('anomaly.detected', { type: 'timeout', severity: 'low' });
  assert.strictEqual(_raiseCalls.length, 1);
  escalation.stop();
});

test('T-006', 'friction_increased is emitted with the exact name liminal-space listens for', () => {
  reset();
  const bus = makeBus();
  let captured = null;
  bus.on('escalation.friction.increased', (e) => { captured = e; });
  escalation.wireAnomalyTrigger(bus);
  bus.emit('anomaly.detected', { type: 'timeout', severity: 'low' });
  assert.ok(captured, 'escalation.friction.increased was not emitted');
  assert.strictEqual(captured.payload.faultClass, 'timeout');
});

test('T-007', 'HEAL_REQUESTED for a fault freshly in FAILURE_MODE (within cooldown) is refused, not silently allowed', () => {
  reset();
  _rows.stale_module = { faultClass: 'stale_module', friction: 1.0, count: 10, lastSeen: Date.now() };
  const bus = makeBus();
  let refused = null;
  bus.on('escalation.failure_mode', (e) => { refused = e; });
  escalation.init({ bus });
  bus.emit('HEAL_REQUESTED', { gapType: 'stale_module', gapUuid: 'g1' });
  assert.ok(refused, 'expected escalation.failure_mode to fire on refusal');
  assert.strictEqual(refused.payload.faultClass, 'stale_module');
  escalation.stop();
});

test('T-007b', 'HEAL_REQUESTED for a fault in FAILURE_MODE for longer than the real cooldown is allowed through, not refused forever', () => {
  // §FIXED 2026-09-06 — James, from a real 5-hour boot log: memory_pressure
  // refused 49 times over nearly 5 hours, never once re-attempted. The
  // real fix: a real, bounded cooldown (5 min), not permanent silence.
  reset();
  _rows.stale_module = { faultClass: 'stale_module', friction: 1.0, count: 10, lastSeen: Date.now() - (6 * 60 * 1000) }; // 6 min ago — past the 5 min cooldown
  const bus = makeBus();
  let refused = false;
  bus.on('escalation.failure_mode', () => { refused = true; });
  escalation.init({ bus });
  bus.emit('HEAL_REQUESTED', { gapType: 'stale_module', gapUuid: 'g1' });
  assert.strictEqual(refused, false, 'a fault class stuck in FAILURE_MODE for longer than the real cooldown must get one real re-attempt, not be refused forever');
  escalation.stop();
});

test('T-008', 'HEAL_REQUESTED for a healthy fault class produces no refusal', () => {
  reset();
  _rows.timeout = { faultClass: 'timeout', friction: 0.1, count: 1 };
  const bus = makeBus();
  let refused = false;
  bus.on('escalation.failure_mode', () => { refused = true; });
  escalation.init({ bus });
  bus.emit('HEAL_REQUESTED', { gapType: 'timeout', gapUuid: 'g2' });
  assert.strictEqual(refused, false);
  escalation.stop();
});

test('T-009', 'escalation.failure_mode fires exactly once on the crossing call, via anomaly path', () => {
  reset();
  const bus = makeBus();
  let fireCount = 0;
  bus.on('escalation.failure_mode', () => { fireCount++; });
  escalation.wireAnomalyTrigger(bus);
  bus.emit('anomaly.detected', { type: 'memory_pressure', severity: 'critical' }); // 0.50
  bus.emit('anomaly.detected', { type: 'memory_pressure', severity: 'critical' }); // 1.00 — crosses
  bus.emit('anomaly.detected', { type: 'memory_pressure', severity: 'critical' }); // already there
  assert.strictEqual(fireCount, 1);
});

test('T-010', 'recordAttemptOutcome(success) calls recordSuccess, not raiseFriction', () => {
  reset();
  _rows.timeout = { faultClass: 'timeout', friction: 0.5, count: 3 };
  escalation.recordAttemptOutcome('timeout', 1, true);
  assert.strictEqual(_successCalls.length, 1);
  assert.strictEqual(_raiseCalls.length, 0);
});

test('T-011', 'recordAttemptOutcome(failure) calls raiseFriction at the given level', () => {
  reset();
  escalation.recordAttemptOutcome('queue_saturated', 2, false);
  assert.strictEqual(_raiseCalls.length, 1);
  assert.strictEqual(_raiseCalls[0].level, 2);
});

test('T-012', 'stop() removes both listeners — no further friction raised after stop', () => {
  reset();
  const bus = makeBus();
  escalation.init({ bus });
  escalation.stop();
  bus.emit('anomaly.detected', { type: 'timeout', severity: 'high' });
  assert.strictEqual(_raiseCalls.length, 0);
});

test('T-013', 'health() reports bus-wired state accurately', () => {
  reset();
  const bus = makeBus();
  escalation.init({ bus });
  const h = escalation.health();
  assert.strictEqual(h.busWired, true);
  assert.strictEqual(h.ok, true);
  escalation.stop();
});


test('T-014', "nexus.resource.pressure level 'pressure' raises memory_pressure friction at ladder level 1", () => {
  reset();
  const bus = makeBus();
  escalation.init({ bus });
  bus.emit('nexus.resource.pressure', { level: 'pressure', reasons: ['free memory 18% < 20%'] });
  assert.strictEqual(_raiseCalls.length, 1);
  assert.strictEqual(_raiseCalls[0].fc, 'memory_pressure');
  assert.strictEqual(_raiseCalls[0].level, 1);
  escalation.stop();
});

test('T-015', "level 'critical' raises at ladder level 3 — two criticals reach FAILURE_MODE", () => {
  reset();
  const bus = makeBus();
  let failureMode = false;
  bus.on('escalation.failure_mode', () => { failureMode = true; });
  escalation.init({ bus });
  bus.emit('nexus.resource.pressure', { level: 'critical', reasons: ['free memory 4% < 5%'] }); // 0.50
  bus.emit('nexus.resource.pressure', { level: 'critical', reasons: ['free memory 3% < 5%'] }); // 1.00
  assert.strictEqual(failureMode, true, 'two criticals must trip FAILURE_MODE');
  escalation.stop();
});

// §BUILT 2026-09-12 — James: "using oscillations to balance resources."
// The real, previously-named gap from docs/escalation.spec's own
// addendum_2026_07_20 ("Oscillation damping... Named, not built.").
test('T-016', 'a REGULAR oscillating pressure signal caps a critical reading at ladder level 1, not 3 — oscillation damping', () => {
  reset();
  escalation._pressureOsc.reset(); // real, persistent module state — see its export comment
  const bus = makeBus();
  escalation.init({ bus });
  // A clear, regular critical/ok/critical/ok rhythm — enough cycles for
  // OscillationEngine's own OSC_MIN_CYCLES (3) to resolve a real, regular
  // rhythm rather than react to the first couple of data points, same
  // real shape this session's own boot logs showed for over an hour.
  for (let i = 0; i < 8; i++) {
    bus.emit('nexus.resource.pressure', { level: i % 2 === 0 ? 'critical' : 'ok', reasons: ['osc-test'] });
  }
  _raiseCalls.length = 0; // only the NEXT reading, once the rhythm is established, is under test
  bus.emit('nexus.resource.pressure', { level: 'critical', reasons: ['reading taken during an established, regular rhythm'] });
  assert.strictEqual(_raiseCalls.length, 1);
  assert.strictEqual(_raiseCalls[0].level, 1,
    'a critical reading during an established, regular oscillation must be capped at ladder level 1, not escalate at full severity 3 — that is exactly what marches a purely rhythmic signal into FAILURE_MODE on rhythm alone');
  escalation.stop();
  escalation._pressureOsc.reset(); // leave clean state for any test after this one
});

test('T-017', "level 'ok' (recovery) decays friction via recordSuccess, never raises", () => {
  reset();
  _rows.memory_pressure = { faultClass: 'memory_pressure', friction: 0.4, count: 2 };
  const bus = makeBus();
  escalation.init({ bus });
  bus.emit('nexus.resource.pressure', { level: 'ok', reasons: [] });
  assert.strictEqual(_successCalls.length, 1);
  assert.strictEqual(_raiseCalls.length, 0);
  escalation.stop();
});

test('T-018', 'pressure event with no level is ignored, not thrown', () => {
  reset();
  const bus = makeBus();
  escalation.init({ bus });
  assert.doesNotThrow(() => bus.emit('nexus.resource.pressure', { reasons: ['x'] }));
  assert.strictEqual(_raiseCalls.length, 0);
  escalation.stop();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
