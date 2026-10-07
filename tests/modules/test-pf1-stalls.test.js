'use strict';
/**
 * tests/modules/test-pf1-stalls.test.js — §0.40.1 PF1: the 5-minute cortex stall and the runaway wall.
 * James: "whats up with the optimization? it seems almost worst? also liminal space with the velocity, like use that also?"
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const os = require('os'), fs = require('fs'), path = require('path');
const EventEmitter = require('events');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); failed++; } }

console.log('\n⬡  PF1 — stalls\n');
const { JaaStore } = require(path.join(ROOT, 'guardian/jaa-store.js'));
const s = new JaaStore(fs.mkdtempSync(path.join(os.tmpdir(), 'pf1-')));
const N = 200000;
for (let i = 0; i < N; i++) s.insert('event_log', { id: `e${i}`, ts: i });

test('PF-01', 'updating 5,000 rows by id in a 200k table takes milliseconds, not minutes (the decay sweep)', () => {
  const t = Date.now();
  let n = 0; for (let i = 0; i < 5000; i++) n += s.update('event_log', { id: `e${i * 40}` }, { _evicted: true });
  const ms = Date.now() - t;
  assert.strictEqual(n, 5000);
  assert.ok(ms < 2000, `${ms} ms`);
  assert.strictEqual(s.get('event_log', { id: 'e40' })._evicted, true);
  assert.strictEqual(s.update('event_log', { id: 'nope' }, { x: 1 }), 0);
});
test('PF-02', 'other where clauses still match the old way', () => {
  assert.strictEqual(s.update('event_log', { id: 'e1', ts: 2 }, { y: 1 }), 0);
  assert.strictEqual(s.update('event_log', { id: 'e1', ts: 1 }, { y: 1 }), 1);
});
for (const t of s._timers.values()) clearTimeout(t);

test('PF-03', 'liminal L2/L4 runaway is said once when it crosses, not on every event after', () => {
  const L = require(path.join(ROOT, 'intelligence/liminal-space/index.js'));
  const bus = new EventEmitter(); let runaways = 0;
  bus.on('liminal.velocity.runaway', () => runaways++);
  const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {};
  try { L.init({ bus }); for (let i = 0; i < 30; i++) bus.emit('forge.patch.proposed', {}); } finally { console.warn = w; console.log = l; }
  try { L.stop(); } catch (_) {}
  assert.strictEqual(runaways, 1);
});

console.log(`\n  ${passed} passed · ${failed} failed\n`);
process.exit(failed ? 1 : 0);
