'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const { JaaStore } = require('../../guardian/jaa-store');

// The store logs a line per table load and per lazy-load warning. This suite
// creates many stores, producing thousands of lines that bury the summary the
// runner parses (run-all.js matches the first "N passed, N failed"). Silence
// [jaa] chatter here — the assertions, not the logs, are the evidence.
const _origLog = console.log;
console.log = (...a) => { if (!String(a[0] ?? '').startsWith('[jaa]')) _origLog(...a); };

function seed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaa-selective-'));
  const s = new JaaStore(dir);
  s.insert('alpha', { uuid: 'a1', v: 1 });
  s.insert('beta',  { uuid: 'b1', v: 2 });
  s.insert('gamma', { uuid: 'g1', v: 3 });
  s.close();
  return dir;
}

test('T-001', 'default (no options) loads every table — unchanged behavior (§5.14)', () => {
  const dir = seed();
  const s = new JaaStore(dir);
  for (const t of ['alpha', 'beta', 'gamma']) {
    assert.ok(s._tables.has(t), `${t} must preload by default`);
  }
});

test('T-002', 'tables allowlist preloads only the declared tables', () => {
  const dir = seed();
  const s = new JaaStore(dir, { tables: ['alpha'] });
  assert.ok(s._tables.has('alpha'));
  assert.ok(!s._tables.has('beta'), 'beta must not preload');
  assert.ok(!s._tables.has('gamma'), 'gamma must not preload');
});

test('T-003', 'skipTables excludes named tables from preload', () => {
  const dir = seed();
  const s = new JaaStore(dir, { skipTables: ['beta', 'gamma'] });
  assert.ok(s._tables.has('alpha'));
  assert.ok(!s._tables.has('beta'));
  assert.ok(!s._tables.has('gamma'));
});

test('T-004', 'SAFETY: an excluded table that EXISTS lazy-loads real rows, never silently empty (§1.2)', () => {
  const dir = seed();
  const s = new JaaStore(dir, { skipTables: ['beta'] });
  assert.ok(!s._tables.has('beta'), 'precondition: beta not preloaded');
  const rows = s.all('beta', {});
  assert.strictEqual(rows.length, 1, 'excluded table must return its real row on access');
  assert.strictEqual(rows[0].v, 2);
});

test('T-005', 'SAFETY: an under-declared allowlist table also lazy-loads real rows', () => {
  const dir = seed();
  const s = new JaaStore(dir, { tables: ['alpha'] });
  const rows = s.all('gamma', {});
  assert.strictEqual(rows.length, 1, 'undeclared table must not read as empty');
});

test('T-006', 'the lazy-load warning fires once per table, not per access', () => {
  const dir = seed();
  const s = new JaaStore(dir, { skipTables: ['beta'] });
  const orig = console.warn;
  let count = 0;
  console.warn = (msg) => { if (String(msg).includes("'beta'")) count++; };
  try {
    for (let i = 0; i < 10; i++) s.all('beta', {});
  } finally { console.warn = orig; }
  assert.strictEqual(count, 1, `expected exactly 1 warning, got ${count} — repeated warnings drown the boot log`);
});

test('T-007', 'the real shared store skips the two heavy idearium tables (the measured 78% cut)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../cortex/memory/jaa-db.js'), 'utf8');
  assert.ok(/skipTables/.test(src), 'shared store must pass skipTables');
  assert.ok(/idearium_spec_chunks/.test(src) && /idearium_spec_manifests/.test(src),
    'the two heavy single-consumer tables must be named');
});

test('T-008', 'REGRESSION 2026-07-24b: lazy-load of an excluded table must not recurse — _table() must not call itself via _loadTable() before the slot exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaa-recursion-'));
  // A realistically-sized file (~1MB, 2000 rows) — small enough for a fast
  // test, large enough that unbounded recursion would blow the stack/heap
  // in this same run rather than silently completing anyway.
  const rows = [];
  for (let i = 0; i < 2000; i++) rows.push({ uuid: `r${i}`, payload: 'x'.repeat(500) });
  fs.writeFileSync(path.join(dir, 'heavy.json'), JSON.stringify(rows));

  const s = new JaaStore(dir, { skipTables: ['heavy'] });
  assert.ok(!s._tables.has('heavy'), 'precondition: heavy not preloaded');

  // This is what actually broke idearium in production: _loadTable(name)
  // calls this._table(name) to get the Map to fill, and if _table()'s
  // lazy branch hadn't created that Map slot FIRST, the inner call
  // re-entered the same lazy branch and recursed — each level re-reading
  // and re-parsing the whole file, none of the stack frames ever
  // returning, until the heap limit was hit. On idearium's real 5.4MB
  // tables that happened in under a second on boot.
  const result = s.all('heavy', {});
  assert.strictEqual(result.length, 2000, 'must return every real row, not recurse or drop data');
  assert.strictEqual(result[0].uuid, 'r0');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
