'use strict';
/** cortex/memory/decay.js — expiry computed from the stored timestamp. */
const assert = require('assert');
const path = require('path');
const D = require(path.join(__dirname, '../../cortex/memory/decay.js'));
const { TABLE_TIERS } = require(path.join(__dirname, '../../cortex/memory/tiers.js'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}
const NOW = 1786000000000;
const hAgo = h => NOW - h * 3600000;

test('RX-1', 'expiry is computed from the row, with no ticker and no state', () => {
  // The design point: a sweeper is a liveness dependency and this one stopped
  // on 2026-07-16. Age read from a stored timestamp cannot stop.
  const fresh = D.isExpired('event_log', { ts: hAgo(1) }, NOW);
  const stale = D.isExpired('event_log', { ts: hAgo(48) }, NOW);
  assert.strictEqual(fresh.expired, false);
  assert.strictEqual(stale.expired, true);
  assert.ok(/48\.0h old/.test(stale.reason), stale.reason);
});

test('RX-2', 'the LONG tier never expires, however old', () => {
  const r = D.isExpired('crystals', { ts: hAgo(100000) }, NOW);
  assert.strictEqual(r.expired, false);
  assert.ok(/never expires/.test(r.reason));
});

test('RX-3', 'a row with NO timestamp is UNDATABLE — never expired on a guess (§1.2)', () => {
  const r = D.isExpired('event_log', { payload: 'x' }, NOW);
  assert.strictEqual(r.expired, false);
  assert.ok(/UNDATABLE/.test(r.reason), r.reason);
});

test('RX-4', 'ISO-string timestamps parse as well as epoch numbers', () => {
  const iso = new Date(hAgo(48)).toISOString();
  assert.strictEqual(D._rowTs({ createdAt: iso }), hAgo(48));
  assert.strictEqual(D.isExpired('event_log', { createdAt: iso }, NOW).expired, true);
});

test('RX-5', 'an untracked table is left alone', () => {
  const r = D.isExpired('a_table_no_tier_names', { ts: hAgo(9999) }, NOW);
  assert.strictEqual(r.expired, false);
  assert.ok(/not tier-managed/.test(r.reason));
  // §0.39.282 — this used memory_unified, the gap it recorded ("outside TABLE_TIERS entirely"). That gap is closed:
  // cortex/memory/tiers.js puts memory_unified in the 'long' tier (current memory, never expires). Pinned here.
  assert.strictEqual(TABLE_TIERS.memory_unified, 'long');
  assert.strictEqual(D.isExpired('memory_unified', { ts: hAgo(9999) }, NOW).expired, false);
});

test('RX-6', 'liveRows applies the same predicate, and drops tombstones too', () => {
  const rows = [{ ts: hAgo(1) }, { ts: hAgo(48) }, { ts: hAgo(1), _evicted: true }, { note: 'no ts' }];
  const live = D.liveRows('event_log', rows, NOW);
  assert.strictEqual(live.length, 2, 'fresh + undatable survive; stale and tombstoned do not');
});

test('RX-7', 'expiryReport measures BEFORE anything is enforced (§17.10)', () => {
  const fake = { query: (t) => (t === 'event_log' ? [{ ts: hAgo(1) }, { ts: hAgo(48) }, { ts: hAgo(72) }] : []) };
  const r = D.expiryReport(fake, NOW);
  const el = r.tables.find(t => t.table === 'event_log');
  assert.deepStrictEqual([el.rows, el.expired, el.live], [3, 2, 1]);
  assert.strictEqual(r.totalExpired, 2);
});

test('RX-8', 'reads are NOT switched over — enforcement is a separate decision', () => {
  // Against the real store this predicate hides 11,492 rows, 100% of the short
  // tier, including all 99 gaps. That is not memory aging correctly; it is the
  // tier MAPPING being wrong and never exercised. Enforcing it here would take
  // the finding and turn it into an outage.
  const src = require('fs').readFileSync(path.join(__dirname, '../../cortex/memory/jaa-db.js'), 'utf8');
  assert.ok(!/isExpired|liveRows/.test(src),
    'jaa-db must not silently apply read-time expiry until the tier mapping is corrected');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
