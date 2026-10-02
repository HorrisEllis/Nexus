'use strict';
// tests/modules/test-nexstore-types.test.js — N2 of docs/2026-09-29-nex-node-store-phasemap.spec (0.39.300).
// The map's proof: "a record missing a required field, the wrong kind's op (a patch to a ledger), a dangling reference:
// each refused with its reason; the refusal is logged".
//
//   TY-01  the registry is read, not written: every catalogued type (N0) is registered with its kind; schemas from
//          lib/node-schemas join by name and give required fields and field types; a ring with no capacity is said
//   TY-02  the three refusals of the proof, each with its reason — missing required field, a patch to a ledger,
//          a dangling reference — and a good record passes
//   TY-03  the gate is warp/core Axiom (loom's model, not a second validator); a type's own axiom joins it; soft
//          axioms report without refusing
//   TY-04  guard(log): a refused record never reaches the log, its refusal does — a nexstore.refusal ledger record
//          with the type, the axiom, the reason and the cause; the chain still verifies on reopen
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '../..');
const T = require(path.join(ROOT, 'lib/nexstore/types.js'));
const L = require(path.join(ROOT, 'lib/nexstore/log.js'));
const { Axiom } = require(path.join(ROOT, 'warp/core/Axiom.js'));
let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

const TYPES = [
  { name: 'demo.idea', kind: 'record', system: 'demo', required: ['text'], fieldTypes: { text: 'string', score: 'number' }, references: ['specUuid'], mustExist: ['specUuid'] },
  { name: 'demo.events', kind: 'ledger', system: 'demo', required: ['ts'] },
  { name: 'demo.links', kind: 'edge', system: 'demo' },
  { name: 'demo.window', kind: 'ring', system: 'demo', ring: { capacity: 100, evict: 'archive' } },
];

test('TY-01', 'the registry is read from the catalogue and the node schemas', () => {
  const reg = T.registry({ root: ROOT });
  const cat = yaml.load(fs.readFileSync(path.join(ROOT, 'docs/nexstore-type-catalogue.yaml'), 'utf8'));
  for (const d of cat.types) { const t = reg.get(d.name); assert.ok(t, `${d.name} registered`); assert.strictEqual(t.kind, d.kind); }
  assert.ok(reg.has('nexstore.refusal'), 'the refusal ledger is built in');
  const withSchema = reg.list().filter(t => t.schemaFrom && t.schemaFrom.startsWith('lib/node-schemas/'));
  assert.ok(withSchema.length >= 5, `node schemas join catalogued types by name (${withSchema.length})`);
  assert.ok(withSchema.some(t => t.required.length && Object.values(t.fieldTypes).some(Boolean)), 'a joined schema gives required fields and types');
  const rings = reg.list().filter(t => t.kind === 'ring');
  assert.ok(rings.length && rings.every(t => t.ring.capacity != null || reg.said.some(s => s.type === t.name)), 'a ring without a declared capacity is said, never defaulted');
  assert.throws(() => T.define({ name: 'x', kind: 'table' }), /one of record, ledger/);
  assert.throws(() => T.define({ name: 'x', kind: 'ring', ring: { evict: 'forget' } }), /archive or drop/);
});

test('TY-02', 'missing field, a patch to a ledger, a dangling reference: each refused with its reason', () => {
  const reg = T.registry({ withCatalogue: false, types: TYPES });
  const specs = new Set(['s1']);
  const ctx = { exists: (v) => specs.has(v) };
  const good = reg.check({ op: 'create', type: 'demo.idea', id: 'i1', change: { text: 'hi', specUuid: 's1' }, causedBy: null }, ctx);
  assert.ok(good.ok, JSON.stringify(good.refusals));
  const miss = reg.check({ op: 'create', type: 'demo.idea', id: 'i2', change: { score: 2 }, causedBy: null }, ctx);
  assert.ok(!miss.ok); assert.match(miss.refusals.map(r => r.reason).join(), /missing required field: text/);
  const patch = reg.check({ op: 'patch', type: 'demo.events', id: 'e1', change: { ts: 1 }, causedBy: null }, ctx);
  assert.ok(!patch.ok); assert.match(patch.refusals.map(r => r.reason).join(), /a ledger does not take patch|append-only/);
  const dang = reg.check({ op: 'create', type: 'demo.idea', id: 'i3', change: { text: 'x', specUuid: 'nope' }, causedBy: null }, ctx);
  assert.ok(!dang.ok); assert.match(dang.refusals[0].reason + dang.refusals.map(r => r.reason).join(), /dangling reference: specUuid → nope/);
  const wrongType = reg.check({ op: 'create', type: 'demo.idea', id: 'i4', change: { text: 7 }, causedBy: null }, ctx);
  assert.match(wrongType.refusals.map(r => r.reason).join(), /text is number, the schema says string/);
  const noEnds = reg.check({ op: 'link', type: 'demo.links', id: 'l1', change: { from: 'a' }, causedBy: null });
  assert.match(noEnds.refusals.map(r => r.reason).join(), /needs both ends/);
  const unknown = reg.check({ op: 'create', type: 'demo.nothing', id: 'x', causedBy: null });
  assert.ok(!unknown.ok); assert.match(unknown.refusals[0].reason, /no type demo\.nothing/);
});

test('TY-03', 'the gate is warp Axiom; own axioms join; soft axioms report without refusing', () => {
  const reg = T.registry({ withCatalogue: false, types: [
    ...TYPES,
    { name: 'demo.jotting', kind: 'record', axioms: [
      new Axiom('demo.short', { severity: 'soft', check: (rec) => (rec.change?.text || '').length < 20 || 'long note' }),
      { id: 'demo.no-shouting', check: (rec) => !/^[A-Z ]{6,}$/.test(rec.change?.text || '') || 'all capitals' },
    ] },
  ] });
  assert.ok(reg.get('demo.idea').gate.every(a => a instanceof Axiom), 'every gate entry is a warp/core Axiom');
  const soft = reg.check({ op: 'create', type: 'demo.jotting', id: 'n', change: { text: 'a quiet note that runs well past twenty' }, causedBy: null });
  assert.ok(soft.ok && soft.refusals.some(r => r.axiom === 'demo.short' && r.severity === 'soft'), 'soft: reported, not refused');
  const hard = reg.check({ op: 'create', type: 'demo.jotting', id: 'n', change: { text: 'STOP NOW' }, causedBy: null });
  assert.ok(!hard.ok && hard.refusals.some(r => r.axiom === 'demo.no-shouting'), 'a declared hard axiom refuses');
});

test('TY-04', 'guard: the refused record never reaches the log, its refusal does', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextypes-'));
  const reg = T.registry({ withCatalogue: false, types: TYPES });
  let log = L.open(dir, { by: 'demo' });
  const g = T.guard(log, reg, { exists: (v) => v === 's1' });
  const ok = g.append({ op: 'create', type: 'demo.idea', id: 'i1', change: { text: 'hi', specUuid: 's1' }, causedBy: null });
  assert.ok(ok.ok && ok.record.seq === 1);
  const r1 = g.append({ op: 'patch', type: 'demo.events', id: 'e1', change: { ts: 2 }, causedBy: ok.record.hash });
  const r2 = g.append({ op: 'create', type: 'demo.idea', id: 'i2', change: { score: 1 }, causedBy: null });
  const r3 = g.append({ op: 'create', type: 'demo.idea', id: 'i3', change: { text: 'x', specUuid: 'gone' }, causedBy: null });
  for (const r of [r1, r2, r3]) { assert.ok(!r.ok); assert.strictEqual(r.refusal.type, 'nexstore.refusal'); }
  assert.strictEqual(r1.refusal.causedBy, ok.record.hash, 'the refusal carries the cause the input carried');
  log.close();
  log = L.open(dir);
  const all = log.read();
  assert.deepStrictEqual(all.map(r => r.type), ['demo.idea', 'nexstore.refusal', 'nexstore.refusal', 'nexstore.refusal']);
  assert.ok(!all.some(r => r.id === 'i2' || r.id === 'i3' || r.type === 'demo.events'), 'no refused record was written');
  assert.match(all[1].change.reason, /append-only|does not take patch/); assert.match(all[2].change.reason, /missing required field: text/); assert.match(all[3].change.reason, /dangling reference/);
  assert.ok(log.verify().ok, 'the chain verifies');
  log.close();
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
