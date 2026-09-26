'use strict';
// P2 (docs/raid-warp-verification-phasemap.spec) — constitution on the approve
// path. constitutional-ai.check() is a HARD WARP axiom (§17.10, runs first,
// never skipped): a BLOCK-severity violation denies, naming the axiom (§1.2).
// WARN/held falls through to contract checks (constitution's own severity model).
// §8.6 — built on the existing check(req, ctx), verified against its REAL
// return values, not assumed.
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && (s.startsWith('[jaa]') || s.startsWith('[constitution') || s.startsWith('[raid]'))) return; _log(...a); };

const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const raid = require(path.join(ROOT, 'cortex/core/raid'));

test('T-001', 'HARD BLOCK: a forge action with no provider is DENIED by constitution, naming the axiom', () => {
  const r = raid._approveTool('copilot', 'build x', { action: 'forge', intent: { action: 'forge', target: 'thing' } });
  assert.strictEqual(r.approved, false, 'must be denied');
  assert.strictEqual(r.axiom, 'EXPLAINABILITY', 'must name the blocking axiom (§1.2)');
  assert.ok(/constitution denied/.test(r.reason), 'denial must be constitution-sourced, not a contract fall-through');
});

test('T-002', 'the block is recorded as a denied decision (P1 record + P2 gate compose)', () => {
  const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db'));
  const before = (jaaDB.query('raid_decisions', () => true, 99999) || []).filter(d => d.outcome === 'denied').length;
  raid._approveTool('copilot', 'build y', { action: 'forge', intent: { action: 'forge', target: 't2' } });
  const after = (jaaDB.query('raid_decisions', () => true, 99999) || []).filter(d => d.outcome === 'denied').length;
  assert.ok(after > before, 'a constitutional denial must be recorded to cortex (§17.6)');
});

test('T-003', 'WARN/held does NOT hard-deny — it falls through to contract checks', () => {
  // a delete with no fault is GOAL_GRAPH warn/held — constitution does not BLOCK;
  // the outcome is decided by the contract layer, not the constitution gate.
  const r = raid._approveTool('copilot', 'delete data', { action: 'delete', intent: { action: 'delete', target: 'x' } });
  // whatever the contract decides, the REASON must not be constitution-sourced
  // (proving WARN fell through rather than hard-denying).
  assert.ok(!/constitution denied/.test(r.reason || ''), 'a WARN must not be reported as a constitution denial');
});

test('T-004', 'no intent → constitution is skipped gracefully, approval still returns (§1.2 not silent-fail)', () => {
  const r = raid._approveTool('copilot', 'x', { action: 'tool' });
  assert.strictEqual(typeof r.approved, 'boolean', 'must still return a decision without an intent');
});

test('T-005', 'a benign intent passes the constitution gate (severity flag/warn, not block)', () => {
  const r = raid._approveTool('copilot', 'read a file', { action: 'tool', intent: { action: 'read' } });
  // may still be approved or denied by CONTRACT, but not by constitution
  assert.ok(!/constitution denied/.test(r.reason || ''), 'a benign read must not be constitution-denied');
});

_log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
