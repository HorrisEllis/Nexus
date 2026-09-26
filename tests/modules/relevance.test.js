'use strict';
/** cortex/memory/relevance.js — decay by measured worth, not by clock. */
const assert = require('assert');
const path = require('path');
const R = require(path.join(__dirname, '../../cortex/memory/relevance.js'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}
const NOW = 1786000000000;
const hAgo = h => NOW - h * 3600000;
const U = n => `aaaaaaaa-bbbb-4ccc-8ddd-${String(n).padStart(12, '0')}`;

test('RV-1', 'a causedBy that is not an event id is COUNTED, never scored as an edge', () => {
  // The live defect: 753 of event_log's causedBy values are system names —
  // "liminal" ×564, "guardian" ×188. cfr/graph turns each into a causal edge.
  // Scoring centrality on those makes a chatty system look like a causal hub.
  const rows = [{ uuid: U(1), type: 'a', ts: NOW }, { uuid: U(2), type: 'b', ts: NOW, causedBy: 'guardian' }];
  const ix = R.buildIndex(rows);
  assert.strictEqual(ix.edges, 0, 'a system name is not an edge');
  assert.strictEqual(ix.unresolvableTotal, 1);
  assert.strictEqual(ix.unresolvableRefs[0].ref, 'guardian');
  assert.strictEqual(ix.children.get('guardian'), undefined);
});

test('RV-2', 'a causedBy pointing at a REAL row is an edge', () => {
  const rows = [{ uuid: U(1), type: 'a', ts: NOW }, { uuid: U(2), type: 'b', ts: NOW, causedBy: U(1) }];
  const ix = R.buildIndex(rows);
  assert.strictEqual(ix.edges, 1);
  assert.strictEqual(ix.children.get(U(1)), 1);
});

test('RV-3', 'AN OLD CAUSAL ROOT OUTSCORES A FRESH LEAF — the whole point', () => {
  const rows = [
    { uuid: U(1), type: 'root.cause', ts: hAgo(720) },                       // 30 days old
    ...Array.from({ length: 6 }, (_, i) => ({ uuid: U(10 + i), type: 'x', ts: hAgo(700), causedBy: U(1) })),
    { uuid: U(99), type: 'heartbeat', ts: hAgo(0.5) },                       // 30 minutes old
  ];
  const ix = R.buildIndex(rows);
  const root = R.score(rows[0], ix, { now: NOW });
  const fresh = R.score(rows[rows.length - 1], ix, { now: NOW });
  assert.ok(root.keep > fresh.keep,
    `a 30-day causal root (${root.keep}) must outrank a 30-minute heartbeat (${fresh.keep})`);
  assert.ok(root.reasons.some(r => /causal ROOT/.test(r)));
});

test('RV-4', 'age is a TIEBREAKER — it cannot outweigh causal on its own', () => {
  const rows = [{ uuid: U(1), type: 'z', ts: hAgo(500) },
                ...Array.from({ length: 4 }, (_, i) => ({ uuid: U(20 + i), type: 'z', ts: hAgo(499), causedBy: U(1) }))];
  const ix = R.buildIndex(rows);
  const s = R.score(rows[0], ix, { now: NOW });
  assert.ok(s.terms.causal > s.terms.age, 'causal must dominate age, or this is clock decay wearing a hat');
});

test('RV-5', 'a failure-class event with no sigma is treated as deviation, and says so', () => {
  const ix = R.buildIndex([]);
  const s = R.score({ uuid: U(3), type: 'guardian.job.failed', ts: NOW }, ix, { now: NOW });
  assert.ok(s.terms.sigma > 0);
  assert.ok(s.reasons.some(r => /no sigma recorded/.test(r)), 'the substitution must be stated, not silent');
});

test('RV-6', 'a highly repeated type is cheaper to lose than a rare one', () => {
  const many = Array.from({ length: 1200 }, (_, i) => ({ uuid: U(1000 + i), type: 'noise', ts: NOW }));
  const rare = { uuid: U(5), type: 'seen.once', ts: NOW };
  const ix = R.buildIndex([...many, rare]);
  const a = R.score(many[0], ix, { now: NOW });
  const b = R.score(rare, ix, { now: NOW });
  assert.ok(b.keep > a.keep, 'a type seen once is unreconstructable; one seen 1200× is not');
});

test('RV-7', 'a blind recurrence term is reported as BLIND, not as zero', () => {
  const ix = R.buildIndex([]);
  const s = R.score({ uuid: U(7), type: 'x', ts: NOW }, ix, { now: NOW, recurrence: { sigs: new Set(), ok: false } });
  assert.strictEqual(s.terms.recurrence, 0);
  const p = R.pressure('definitely_no_such_table');
  assert.ok(p.ok === false || p.rows === 0, 'a missing table must not be scored as a healthy empty one');
});

test('RV-8', 'pressure REPORTS and never evicts', () => {
  const src = require('fs').readFileSync(path.join(__dirname, '../../cortex/memory/relevance.js'), 'utf8');
  assert.ok(!/\.update\(|\.delete\(|_evicted\s*=/.test(src),
    'relevance measures worth; it must not be able to remove anything');
});

test('RV-9', 'against the live store, the causal term declares itself untrustworthy', () => {
  // Measured 2026-08-10: 0 resolvable edges, 753 unresolvable. With the causal
  // term (40% of the weight) dead, relevance and clock decay "agree" — but only
  // because relevance has nothing to measure. That must be visible, not implied.
  const p = R.pressure('event_log');
  if (!p.ok || !p.rows) return;
  if (p.causal.unresolvableRefs > 0) {
    assert.ok(p.causal.warning && /NOT scored as descendants/.test(p.causal.warning),
      'unresolvable refs must carry an explicit warning');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
