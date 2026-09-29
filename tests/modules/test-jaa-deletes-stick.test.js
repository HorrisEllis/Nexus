'use strict';
// tests/modules/test-jaa-deletes-stick.test.js — 0.39.266.
// Failure (James's logs, 2026-09-27): orchestrator's table-compactor deleted the same 7,176 event_log rows
// every 10 minutes; event_log still grew 7,176 → 19,788 in an hour. Every process sharing data/cortex/memory
// wrote its whole in-memory view back on each flush, resurrecting what another process had deleted.
//
//   DS-001  a delete by one process survives another process's flush (the compaction case)
//   DS-002  two processes inserting different rows keep both
//   DS-003  a process's own unflushed update beats the disk copy
//   DS-004  a clean row updated on disk by another process is refreshed, not clobbered with the stale copy
//   DS-005  reloadTable() drops rows deleted elsewhere
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JaaStore } = require('../../guardian/jaa-store.js');

let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
const fresh = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jaa-ds-'));
const disk = (dir, t) => JSON.parse(fs.readFileSync(path.join(dir, `${t}.json`), 'utf8'));
const open = (dir) => new JaaStore(dir, { settings: false });

test('DS-001', 'a delete by one process survives another process\'s flush', () => {
  const dir = fresh();
  const A = open(dir);
  for (let i = 0; i < 1000; i++) A.insert('event_log', { id: `old${i}`, ts: 1 });
  A.flushAll();
  const B = open(dir);
  assert.strictEqual(B.delete('event_log', r => r.ts === 1), 1000);
  B.flushAll();
  A.insert('event_log', { id: 'new', ts: Date.now() }); A.flushAll();
  assert.deepStrictEqual(disk(dir, 'event_log').map(r => r.id), ['new']);
  assert.strictEqual(A.count('event_log'), 1, 'and A no longer holds them in memory');
});

test('DS-002', 'two processes inserting different rows keep both', () => {
  const dir = fresh();
  const A = open(dir), B = open(dir);
  A.insert('t', { id: 'a' }); B.insert('t', { id: 'b' });
  A.flushAll(); B.flushAll();
  assert.deepStrictEqual(disk(dir, 't').map(r => r.id).sort(), ['a', 'b']);
});

test('DS-003', 'a process\'s own unflushed update beats the disk copy', () => {
  const dir = fresh();
  const A = open(dir); A.insert('t', { id: 'x', v: 1 }); A.flushAll();
  const B = open(dir);
  B.update('t', { id: 'x' }, { v: 2 }); B.flushAll();
  A.update('t', { id: 'x' }, { v: 3 }); A.flushAll();
  assert.strictEqual(disk(dir, 't')[0].v, 3);
});

test('DS-004', 'a clean row changed on disk by another process is refreshed, not clobbered', () => {
  const dir = fresh();
  const A = open(dir); A.insert('t', { id: 'x', v: 1 }); A.flushAll();
  const B = open(dir); B.update('t', { id: 'x' }, { v: 2 }); B.flushAll();
  A.insert('t', { id: 'y', v: 9 }); A.flushAll();                       // A never touched x again
  assert.strictEqual(disk(dir, 't').find(r => r.id === 'x').v, 2);
});

test('DS-005', 'reloadTable() drops rows deleted elsewhere', () => {
  const dir = fresh();
  const A = open(dir); A.insert('t', { id: 'x' }); A.insert('t', { id: 'y' }); A.flushAll();
  const B = open(dir); B.delete('t', { id: 'x' }); B.flushAll();
  A.reloadTable('t');
  assert.deepStrictEqual(A.all('t').map(r => r.id), ['y']);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
