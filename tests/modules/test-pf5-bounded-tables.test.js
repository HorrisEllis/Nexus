'use strict';
/**
 * tests/modules/test-pf5-bounded-tables.test.js — §0.43.0 PF5: bounded tables, nothing lost (cortex/memory/table-compactor.js).
 * James: "do it. tell me what that would do"
 */
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`); failed++; } }
const quiet = (fn) => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
const { JaaStore } = require(path.join(ROOT, 'guardian/jaa-store.js'));
const TC = require(path.join(ROOT, 'cortex/memory/table-compactor.js'));
function jaaAt(dir) {   // the jaaDB surface the compactor uses, over a store in a temp dir
  const s = quiet(() => new JaaStore(dir, { settings: false }));
  return { _store: () => s, count: (t, w) => s.count(t, w), query: (t, w, l) => s.all(t, w, { limit: l }), delete: (t, w) => s.delete(t, w), insert: (t, r) => s.insert(t, r), s };
}

console.log('\n⬡  PF5 — bounded tables, nothing lost\n');
const now = Date.now();

test('PF-10', 'a table over its cap keeps its newest rows; the older ones are archived, then deleted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf5-'));
  const j = jaaAt(dir);
  for (let i = 0; i < 1200; i++) j.insert('event_log', { id: `e${i}`, ts: now - (1200 - i) * 1000, type: 'x' });
  const r = quiet(() => TC.capRows(j, 'event_log', 1000, now));
  assert.strictEqual(r.removed, 200); assert.strictEqual(r.archived, 200);
  assert.strictEqual(j.count('event_log'), 1000);
  assert.ok(j.s.get('event_log', { id: 'e1199' }) && !j.s.get('event_log', { id: 'e199' }), 'kept the wrong end');
  const back = TC.readArchive(j, 'event_log');
  assert.strictEqual(back.length, 200);
  assert.deepStrictEqual(back.map(x => x.id).sort(), Array.from({ length: 200 }, (_, i) => `e${i}`).sort());
  assert.strictEqual(back[0]._archived.reason, 'cap 1000');
  assert.ok(j.count('compaction_log', (x) => x.reason === 'cap') === 1);
});

test('PF-11', 'two passes on one day are one readable archive (gzip members appended)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf5-'));
  const j = jaaAt(dir);
  for (let i = 0; i < 30; i++) j.insert('t', { id: `a${i}`, ts: now - 100000 + i });
  quiet(() => TC.capRows(j, 't', 20, now));
  for (let i = 0; i < 10; i++) j.insert('t', { id: `b${i}`, ts: now + i });
  quiet(() => TC.capRows(j, 't', 20, now));
  assert.strictEqual(fs.readdirSync(path.join(dir, 'archive', 't')).length, 1);
  assert.strictEqual(TC.readArchive(j, 't').length, 20);
  assert.strictEqual(j.count('t'), 20);
});

test('PF-12', 'an archive that cannot be written deletes nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf5-'));
  const j = jaaAt(dir);
  for (let i = 0; i < 15; i++) j.insert('t', { id: `a${i}`, ts: now + i });
  fs.writeFileSync(path.join(dir, 'archive'), 'not a directory');
  const r = (() => { const w = console.warn; console.warn = () => {}; try { return TC.capRows(j, 't', 10, now); } finally { console.warn = w; } })();
  assert.ok(r.skipped && /archive failed/.test(r.reason), JSON.stringify(r));
  assert.strictEqual(j.count('t'), 15);
});

test('PF-13', 'the hot tables have caps; an env var overrides one (0 = no cap)', () => {
  assert.strictEqual(TC.capFor('event_log'), 50000);
  process.env.NEXUS_TABLE_CAP_EVENT_LOG = '0'; assert.strictEqual(TC.capFor('event_log'), 0);
  delete process.env.NEXUS_TABLE_CAP_EVENT_LOG;
  assert.strictEqual(TC.capFor('settings'), 0);
});

console.log(`\n  ${passed} passed · ${failed} failed\n`);
process.exit(failed ? 1 : 0);
