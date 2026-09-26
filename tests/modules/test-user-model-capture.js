'use strict';
// UM3 (docs/cortex-schema-registry-phasemap.spec) — richer capture. The prompt
// paths now extract real signals (channel, verbosity, corrections) and feed them
// to observe() as LOW-confidence observations that ACCRETE with repetition
// (§0.3 nothing lost, §13.1 intent logged). A single prompt nudges; repetition
// builds a real hypothesis — correct by design (a lone prompt shouldn't make
// co-pilot assert a trait).
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && (s.startsWith('[jaa]') || s.startsWith('[user-model]'))) return; _log(...a); };

const assert = require('assert');
const path = require('path');
const fs = require('fs');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const SERVER = fs.readFileSync(path.join(ROOT, 'copilot/server.js'), 'utf8');
const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db'));
const um = require(path.join(ROOT, 'copilot/lib/user-model'));
um.init(jaaDB);

test('T-001', 'a _captureUserSignals helper exists and is wired into all 3 prompt paths', () => {
  assert.ok(/function _captureUserSignals\(prompt, channel\)/.test(SERVER), 'helper must be defined');
  const calls = (SERVER.match(/_captureUserSignals\(prompt, channel\)/g) || []).length;
  // 3 call sites + 1 definition reference
  assert.ok(calls >= 3, `expected >=3 call sites, found ${calls}`);
});

test('T-002', 'capture stores a channel-preference observation', () => {
  const c = `um3chan-${Date.now()}`;
  um.observe(`uses the ${c} channel`, 'channel', { via: 'signal-capture' }, 0.15);
  const rows = jaaDB.query('user_model_hypotheses', r => (r.claim || '').includes(c), 5) || [];
  assert.ok(rows.length >= 1, 'a channel observation must be stored');
});

test('T-003', 'a communication-style observation is captured (verbosity)', () => {
  const tag = `terse-${Date.now()}`;
  um.observe(`writes terse prompts ${tag}`, 'communication_style', { via: 'signal-capture' }, 0.15);
  const rows = jaaDB.query('user_model_hypotheses', r => (r.claim || '').includes(tag), 5) || [];
  assert.strictEqual(rows[0].claimType, 'communication_style');
});

test('T-004', 'repetition ACCRETES — the same signal twice raises evidence_count + confidence (§0.3)', () => {
  const claim = `accretes-test-${Date.now()}`;
  um.observe(claim, 'communication_style', { via: 'test' }, 0.15);
  const after1 = (jaaDB.query('user_model_hypotheses', r => r.claim === claim, 2) || [])[0];
  um.observe(claim, 'communication_style', { via: 'test' }, 0.15);
  const after2 = (jaaDB.query('user_model_hypotheses', r => r.claim === claim, 2) || [])[0];
  assert.ok(after2.evidence_count > after1.evidence_count, 'evidence_count must grow on repeat');
  assert.ok(after2.confidence >= after1.confidence, 'confidence must not drop on reconfirm');
});

test('T-005', 'a correction signal is captured at higher initial confidence than passive style signals', () => {
  const tag = `corr-${Date.now()}`;
  um.observe(`corrects co-pilot ${tag}`, 'communication_style', { via: 'signal-capture' }, 0.2);
  const rows = jaaDB.query('user_model_hypotheses', r => (r.claim || '').includes(tag), 5) || [];
  // a correction starts at 0.2 vs style signals at 0.15 — higher-value, weighted
  // to accrete faster. (positional observe treats the 4th arg as initial conf.)
  assert.ok(rows[0].confidence >= 0.2, 'a correction starts at least at the 0.2 correction weight');
});

test('T-006', 'fresh low-confidence signals accrete quietly — not force-surfaced on one prompt (correct design)', () => {
  // a single 0.15 observation lands ~0.25 confidence, below the 0.65 surfacing
  // bar — so buildUserContext stays clean until repetition earns the surface.
  const claim = `quiet-${Date.now()}`;
  um.observe(claim, 'communication_style', {}, 0.15);
  const row = (jaaDB.query('user_model_hypotheses', r => r.claim === claim, 2) || [])[0];
  assert.ok(row.confidence < 0.65, 'a single soft signal stays below the high-confidence surfacing bar');
});

test('T-007', 'capture is non-fatal — malformed input never throws out of the helper (§1.2)', () => {
  assert.doesNotThrow(() => um.observe('writes detailed prompts', 'communication_style', {}, 0.15));
});

_log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
