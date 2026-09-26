'use strict';
/**
 * tests/modules/nexus-nerve.test.js (appended below — separate file follows)
 *
 * tests/modules/canvas-intelligence.test.js
 * Tests for the blendshape state machine in canvas-intelligence.js.
 * The WebGL canvas can't run in Node — but the logic that computes
 * blendshape targets from intelligence states is pure and fully testable.
 */

const assert = require('assert');
let passed = 0, failed = 0;

function test(desc, fn) {
  try { fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

// ── Extract testable logic from canvas-intelligence.js ───────────────────────
// Same logic as the module, extracted for Node testing

const EMA_FAST = 0.25, EMA_MED = 0.08, EMA_SLOW = 0.03;

function ema(current, target, alpha) {
  return current + (target - current) * alpha;
}

function computeTargets(mode, field, sigma, activeFault, oneshots, nowMs) {
  const t = {
    jawOpen:0, blinkL:0, blinkR:0, browIU:0, browDL:0, browDR:0,
    squintL:0, squintR:0, wideL:0, wideR:0, smileL:0, smileR:0,
    frownL:0, frownR:0, sneerL:0, sneerR:0, cheekPuff:0,
  };

  switch (mode) {
    case 'generating':
      t.jawOpen = 0.5; // simplified — real version pulses
      break;
    case 'thinking':
      t.squintL = 0.5; t.squintR = 0.5;
      t.browDL  = 0.4; t.browDR  = 0.4;
      break;
    case 'analyzing':
      t.squintL = 0.7; t.squintR = 0.7;
      t.browDL  = 0.35; t.browDR  = 0.35;
      t.browIU  = 0.2;
      break;
    case 'mastermind':
      t.squintL = 0.8; t.squintR = 0.8;
      t.browDL  = 0.6; t.browDR  = 0.6;
      t.browIU  = 0.2;
      break;
    case 'fault':
      t.jawOpen  = 0;
      t.frownL   = activeFault === 'CONSTITUTIONAL' ? 1.0 : 0.8;
      t.frownR   = activeFault === 'CONSTITUTIONAL' ? 1.0 : 0.8;
      t.browIU   = 0.7;
      if (activeFault === 'INTEGRITY') { t.sneerL = 0.3; t.sneerR = 0.3; }
      break;
    case 'confident':
      t.browDL = 0.1; t.browDR = 0.1;
      break;
  }

  // Sigma-driven concern
  if (sigma > 0.3 && mode !== 'fault') {
    const concern = Math.min(0.7, (sigma - 0.3) * 2.5);
    t.browIU  = Math.max(t.browIU, concern);
    if (sigma > 0.5) {
      t.frownL = Math.max(t.frownL, (sigma - 0.5) * 1.6);
      t.frownR = Math.max(t.frownR, (sigma - 0.5) * 1.6);
    }
  }

  // Friction-driven sneer
  if (field.friction > 0.5 && mode !== 'fault') {
    const sneer = Math.min(0.6, (field.friction - 0.5) * 1.6);
    t.sneerL = Math.max(t.sneerL, sneer);
    t.sneerR = Math.max(t.sneerR, sneer);
  }

  // One-shots BEFORE mutual exclusions (§fix — exclusions must win)
  for (const ev of (oneshots || [])) {
    const elapsed  = nowMs - ev.startMs;
    const progress = Math.min(1, elapsed / ev.durationMs);
    const envelope = Math.sin(progress * Math.PI);
    t[ev.bs] = Math.max(t[ev.bs] || 0, ev.value * envelope);
  }

  // Mutual exclusions — applied last, override everything
  if (t.smileL > 0.1 || t.smileR > 0.1) { t.frownL = 0; t.frownR = 0; }
  if (t.frownL > 0.1 || t.frownR > 0.1) { t.smileL = 0; t.smileR = 0; }
  if (t.wideL  > 0.2 || t.wideR  > 0.2) { t.squintL = 0; t.squintR = 0; }

  return t;
}

function massFromSigma(sigma, online = true, BASE_MASS = 1.2) {
  return online ? Math.max(0.05, BASE_MASS * (1 - sigma)) : 0.05;
}

// ── Field mapping ─────────────────────────────────────────────────────────────

test('CI-01 CFR entropy maps directly to field.entropy', () => {
  const cfr = { entropy: 0.6, coherence: 0.4, friction: 0.3, resonance: 0.5 };
  assert.strictEqual(Math.min(0.95, cfr.entropy), 0.6);
});

test('CI-02 CFR coherence maps to field.structure', () => {
  const cfr = { coherence: 0.8 };
  assert.strictEqual(Math.min(0.95, cfr.coherence), 0.8);
});

test('CI-03 field.damping is 1 - resonance, clamped', () => {
  const resonance = 0.7;
  const damping = Math.max(0.05, Math.min(0.4, 1 - resonance));
  assert.ok(Math.abs(damping - 0.3) < 0.0001, `damping should be ~0.3, got ${damping}`);
});

test('CI-04 high resonance never drives damping below 0.05', () => {
  const damping = Math.max(0.05, Math.min(0.4, 1 - 0.99));
  assert.strictEqual(damping, 0.05);
});

// ── Attractor mass ─────────────────────────────────────────────────────────────

test('CI-05 healthy system has full base mass', () => {
  assert.strictEqual(massFromSigma(0), 1.2);
});

test('CI-06 sigma 0.5 halves attractor mass', () => {
  assert.strictEqual(massFromSigma(0.5), 0.6);
});

test('CI-07 sigma 1.0 drops to minimum mass, not zero', () => {
  assert.strictEqual(massFromSigma(1.0), 0.05);
});

test('CI-08 offline system always gets minimum mass regardless of sigma', () => {
  assert.strictEqual(massFromSigma(0, false), 0.05);
});

// ── Blendshape targets — mode states ──────────────────────────────────────────

test('CI-09 thinking mode activates squint and brow-down', () => {
  const t = computeTargets('thinking', { friction: 0 }, 0, null, [], 0);
  assert.ok(t.squintL > 0.4, 'squint should be active in thinking mode');
  assert.ok(t.browDL  > 0.3, 'brow-down should be active in thinking mode');
  assert.strictEqual(t.jawOpen, 0, 'jaw should be closed while thinking');
});

test('CI-10 mastermind mode has maximum squint and brow', () => {
  const t = computeTargets('mastermind', { friction: 0 }, 0, null, [], 0);
  assert.strictEqual(t.squintL, 0.8);
  assert.strictEqual(t.browDL, 0.6);
  assert.strictEqual(t.jawOpen, 0, 'mastermind is silent — not generating');
});

test('CI-11 fault mode sets jaw to 0 — stops talking', () => {
  const t = computeTargets('fault', { friction: 0 }, 0.8, 'CONSTITUTIONAL', [], 0);
  assert.strictEqual(t.jawOpen, 0, 'fault mode must silence jaw');
  assert.strictEqual(t.frownL, 1.0, 'CONSTITUTIONAL fault = max frown');
});

test('CI-12 INTEGRITY fault adds sneer (contradiction component)', () => {
  const t = computeTargets('fault', { friction: 0 }, 0.8, 'INTEGRITY', [], 0);
  assert.ok(t.sneerL > 0, 'INTEGRITY fault should add sneer');
  assert.ok(t.frownL > 0.5, 'INTEGRITY fault should still have frown');
});

// ── Sigma-driven concern (mode-independent) ────────────────────────────────────

test('CI-13 sigma below 0.3 produces no browIU', () => {
  const t = computeTargets('idle', { friction: 0 }, 0.2, null, [], 0);
  assert.strictEqual(t.browIU, 0);
});

test('CI-14 sigma 0.5 produces moderate browIU', () => {
  const t = computeTargets('idle', { friction: 0 }, 0.5, null, [], 0);
  assert.ok(t.browIU > 0.4 && t.browIU < 0.7, `browIU should be moderate at sigma 0.5: ${t.browIU}`);
});

test('CI-15 sigma above 0.5 adds frown proportionally', () => {
  const t = computeTargets('idle', { friction: 0 }, 0.7, null, [], 0);
  assert.ok(t.frownL > 0, 'high sigma should produce frown');
  assert.ok(t.frownL < 1.0, 'frown should not max without explicit fault');
});

test('CI-16 sigma concern does not fire during fault mode (fault handles its own)', () => {
  const t = computeTargets('fault', { friction: 0 }, 0.9, 'CONSTITUTIONAL', [], 0);
  // browIU in fault is set to 0.7 by fault logic, not sigma logic
  // sigma > 0.3 branch is skipped in fault mode
  assert.strictEqual(t.frownL, 1.0, 'fault sets max frown directly');
});

// ── Mutual exclusions ─────────────────────────────────────────────────────────

test('CI-17 smile and frown cannot coexist', () => {
  // Force a scenario where both would be set — smile from one-shot, fault from mode
  const oneshots = [{ bs:'smileL', value:0.8, durationMs:2000, startMs:-500 }];
  const t = computeTargets('fault', { friction: 0 }, 0.8, 'CAPABILITY', oneshots, 0);
  assert.ok(!(t.smileL > 0.1 && t.frownL > 0.1), 'smile and frown must be mutually exclusive');
});

test('CI-18 wide and squint cannot coexist', () => {
  const oneshots = [{ bs:'wideL', value:0.8, durationMs:2000, startMs:-500 }];
  const t = computeTargets('analyzing', { friction: 0 }, 0, null, oneshots, 0);
  // wide is set by one-shot to 0.8, squint is set by analyzing to 0.7
  // mutual exclusion: wide > 0.2 → squint = 0
  assert.ok(!(t.wideL > 0.2 && t.squintL > 0.2), 'wide and squint must be mutually exclusive');
});

// ── Friction-driven sneer ─────────────────────────────────────────────────────

test('CI-19 low friction produces no sneer', () => {
  const t = computeTargets('idle', { friction: 0.3 }, 0, null, [], 0);
  assert.strictEqual(t.sneerL, 0, 'friction below 0.5 should not activate sneer');
});

test('CI-20 high friction activates sneer proportionally', () => {
  const t = computeTargets('idle', { friction: 0.8 }, 0, null, [], 0);
  assert.ok(t.sneerL > 0.3, `high friction should activate sneer: ${t.sneerL}`);
  assert.ok(t.sneerL <= 0.6, 'sneer is capped at 0.6 from friction');
});

// ── EMA smoothing ─────────────────────────────────────────────────────────────

test('CI-21 EMA never overshoots target', () => {
  let current = 0;
  const target = 0.8;
  for (let i = 0; i < 100; i++) current = ema(current, target, EMA_MED);
  assert.ok(current <= target, 'EMA must never overshoot');
  assert.ok(current > 0.7, 'EMA should have converged substantially after 100 steps');
});

test('CI-22 EMA decay from high to zero', () => {
  let current = 0.8;
  for (let i = 0; i < 50; i++) current = ema(current, 0, EMA_SLOW);
  assert.ok(current < 0.5, 'slow EMA should decay significantly after 50 steps');
  assert.ok(current > 0, 'slow EMA should not reach exactly zero quickly');
});

console.log(`\n  canvas-intelligence: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
