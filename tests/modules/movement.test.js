'use strict';
/** lib/movement.js — the aggregator behind `nexus movement`. */
const assert = require('assert');
const path = require('path');
const m = require(path.join(__dirname, '../../lib/movement.js'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

test('MV-1', 'collect() never throws, and refuses a bad system by NAME', () => {
  for (const bad of [undefined, null, '', 0, [], {}, 123]) {
    const s = m.collect(bad);
    assert.strictEqual(s.ok, false, `${JSON.stringify(bad)} must be refused`);
    assert.ok(s.reason, 'a refusal must state its reason (§1.2)');
  }
});

test('MV-2', 'every section reports its own reachability — none is silently empty', () => {
  const s = m.collect('guardian');
  for (const k of ['process', 'events', 'ledgers', 'changes', 'gaps', 'sigma', 'friction', 'drift', 'files', 'errors']) {
    assert.ok(s[k] && typeof s[k].ok === 'boolean', `${k} must carry ok:boolean`);
    if (s[k].ok === false) assert.ok(s[k].reason, `${k} is unreachable and must say why`);
  }
});

test('MV-3', 'blind[] lists every unread source and sourcesRead agrees with it', () => {
  const s = m.collect('guardian');
  assert.ok(Array.isArray(s.blind));
  assert.strictEqual(s.sourcesRead + s.blind.length, 10,
    'read + blind must account for all 10 sources — otherwise a source vanished');
  for (const b of s.blind) assert.ok(b.source && b.reason);
});

test('MV-4', 'an unknown system yields blind sources, NOT a clean bill of health', () => {
  // The failure this guards: a dashboard showing zeros for a system that does
  // not exist looks identical to a healthy quiet one.
  const s = m.collect('definitely-not-a-real-system-xyz');
  assert.strictEqual(s.ok, true, 'collect still returns a snapshot');
  assert.ok(s.blind.length >= 1, 'a nonexistent system must report blindness');
  assert.ok(s.ledgers.ok === false && /no ledger directory/.test(s.ledgers.reason));
  assert.ok(s.errors.note && /ABSENCE OF SOURCES/.test(s.errors.note),
    'an empty error surface must be labelled an absence of sources');
});

test('MV-5', 'friction declares what it CANNOT classify', () => {
  const s = m.collect('cortex');
  if (!s.friction.ok) return;
  assert.ok(s.friction.blindTo, 'the taxonomy must state its blind spot');
  assert.ok(/constitutional/.test(s.friction.blindTo));
  // Verified empirically 2026-08-08: a real silent-swallow fault injected into a
  // built component returned getFaultClass() === null.
  assert.ok(!s.friction.knownClasses.includes('silent_swallow'));
});

test('MV-6', 'series never fabricates data outside its window', () => {
  const now = Date.now();
  const s = m._series([now - 1000, now - 5000, now - 999999999, now + 999999], 3600e3, 10);
  assert.strictEqual(s.buckets.length, 10);
  assert.strictEqual(s.counted, 2, 'out-of-window and future stamps must be dropped, not clamped');
  assert.strictEqual(s.buckets.reduce((a, b) => a + b, 0), 2);
});

test('MV-7', 'ledger reads are BOUNDED — the whole point of using ledger-tail', () => {
  const s = m.collect('guardian');
  if (!s.ledgers.ok || !s.ledgers.top || !s.ledgers.top.length) return;
  for (const t of s.ledgers.top) {
    assert.ok(t.read <= t.bytes + 65536, `${t.stream}: read ${t.read} of ${t.bytes} — unbounded`);
  }
});

test('MV-8', 'systems() discovers rather than hardcodes, and filters synthetic noise', () => {
  const list = m.systems();
  assert.ok(list.length > 5, `expected several systems, got ${list.length}`);
  assert.ok(list.includes('cortex') && list.includes('guardian'));
  // ~9,000 of component_ledger's 13,001 rows come from throwaway bl7-<ts>
  // systems, 100 rows each. They are excluded from discovery but NOT from the
  // ledger itself — that is finding, not fixed here.
  assert.ok(!list.some(s => /^bl7-\d+$/.test(s)), 'bl7-* synthetic systems must not appear as real');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
