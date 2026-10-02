'use strict';
// tests/modules/test-nexstore-writers.test.js — DT1 of docs/2026-10-01-idearium-agent-ready-master-phasemap.spec (0.39.300).
// The map's proof: "the census lists every writer; each has a type or a reason; a planted new writer fails it".
//
//   WR-01  on the real tree: every writer is in docs/nexstore-writers.yaml or typed by the catalogue — none new; every
//          typed writer names a catalogued type; every idearium table writer is typed; the owed ones are counted and
//          never grow past the register's own count (a ratchet: a reason can be added, an owed one cannot appear)
//   WR-02  a planted writer — a new JSON writeFileSync in a fresh tree — is "new" and fails; given a reason, it passes;
//          a table write resolves its name through a constant, a module import and the row literal's fields
//   WR-03  the census feeds N0: tables written only in code are in the type catalogue, with their fields
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '../..');
const W = require(path.join(ROOT, 'lib/nexstore/writers.js'));
let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

test('WR-01', 'every writer in the tree has a type, a reason, or is listed as owed — none new', () => {
  const c = W.census({ root: ROOT });
  const fresh = c.writers.filter(w => w.status === 'new');
  assert.deepStrictEqual(fresh.map(w => `${w.key} (line ${w.lines.join(',')})`), [], 'a new writer must be declared in docs/nexstore-writers.yaml');
  assert.ok(c.stats.writers >= 150, `${c.stats.writers} writers found`);
  const cat = yaml.load(fs.readFileSync(path.join(ROOT, 'docs/nexstore-type-catalogue.yaml'), 'utf8'));
  const names = new Set(cat.types.map(t => t.name));
  for (const w of c.writers.filter(x => x.status === 'typed')) assert.ok(names.has(w.type) || /^schema\./.test(w.type), `${w.key} → ${w.type} is catalogued`);
  const ideariumTables = c.writers.filter(w => w.file.startsWith('idearium/') && (w.call === 'syncTable' || w.call === 'appendRow') && w.file !== 'idearium/lib/db.js');
  assert.ok(ideariumTables.length >= 20 && ideariumTables.every(w => w.status !== 'owed' && w.status !== 'new'), 'every idearium table writer is typed or reasoned');
  const reg = yaml.load(fs.readFileSync(path.join(ROOT, W.REGISTER), 'utf8'));
  assert.ok(c.stats.owed <= reg.register.stats.owed, `owed writers do not grow (${c.stats.owed} ≤ ${reg.register.stats.owed})`);
  for (const w of c.writers.filter(x => x.status === 'reason')) assert.ok(w.reason && w.reason.length > 20, `${w.key} has a stated reason`);
});

test('WR-02', 'a planted writer fails; a reason makes it pass; table names and fields resolve', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'writers-'));
  fs.mkdirSync(path.join(root, 'sys/lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'sys/lib/consts.js'), "module.exports = { TABLE: 'sys_widgets' };\n");
  fs.writeFileSync(path.join(root, 'sys/lib/store.js'), [
    "const fs = require('fs');",
    "const C = require('./consts.js');",
    "const STATE_FILE = 'state.json';",
    "function save(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); }",
    "function add(w) { appendRow(C.TABLE, { uuid: w.id, colour: w.colour, ts: Date.now() }); }",
    "fs.writeFileSync('notes.txt', 'plain text, not data');",
  ].join('\n'));
  let c = W.census({ root, register: { rules: [], writers: {} } });
  const state = c.writers.find(w => w.call === 'writeFileSync');
  assert.ok(state && state.status === 'new', 'the planted JSON writer is new');
  assert.deepStrictEqual(state.names, ['state.json'], 'its target resolves through the const');
  assert.ok(!c.writers.some(w => /notes\.txt/.test(w.key)), 'a plain text write is not a data writer');
  const table = c.writers.find(w => w.call === 'appendRow');
  assert.deepStrictEqual(table.names, ['sys_widgets'], 'C.TABLE resolves through the module import');
  assert.deepStrictEqual(table.fields, ['uuid', 'colour', 'ts'], 'the row literal gives the fields');
  c = W.census({ root, register: { rules: [], writers: { [state.key]: { reason: 'the widget panel\'s own layout state, rebuilt on load' }, [table.key]: { reason: 'OWED — a node type' } } } });
  assert.strictEqual(c.writers.find(w => w.key === state.key).status, 'reason');
  assert.strictEqual(c.writers.find(w => w.key === table.key).status, 'owed', 'an OWED entry is counted as owed, not as a reason');
  assert.strictEqual(c.stats.new, 0);
});

test('WR-03', 'tables written only in code reach the N0 catalogue', () => {
  const cat = yaml.load(fs.readFileSync(path.join(ROOT, 'docs/nexstore-type-catalogue.yaml'), 'utf8'));
  const runs = cat.types.find(t => t.name === 'idearium.idearium_phase_runs');
  assert.ok(runs, 'idearium_phase_runs is catalogued though no data is checked in');
  assert.strictEqual(runs.kind, 'ledger');
  assert.ok(runs.fields.includes('runId') && runs.fields.includes('uuid'), 'its fields come from the code');
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
