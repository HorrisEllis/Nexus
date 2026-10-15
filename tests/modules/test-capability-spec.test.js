'use strict';
/**
 * tests/modules/test-capability-spec.test.js — CS1 (docs/2026-10-15-capability-specs-and-semantic-page-tree-phasemap.spec):
 * a spec per capability, whose surface is the gate. lib/capability-spec.js · lib/checks/ck-254-surface.js · spec-drift.
 * James (2026-10-15): "should we have each module or capability specced … like specs can reduce surface area".
 *
 *   CS-01  a spec's surface is read from inline [a, b] and block "- a" lists; meta names its files and kind
 *   CS-02  the surface is measured from the code: exports, emitted events, served routes — comments are not surface, and
 *          a '/*' inside a string does not swallow the code after it
 *   CS-03  check: grew (in the code, not promised) and unkept (promised, not in the code) are named; '*' leaves a kind
 *          unconstrained, said
 *   CS-04  a draft's surface is exactly the measured one (nothing invented), so it checks green
 *   CS-05  CK-254 runs: green on the repo's capability specs, red on a planted spec whose module grew
 *   CS-06  spec-drift counts a capability spec as the module's spec and reports its surface
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const C = require(path.join(ROOT, 'lib/capability-spec.js'));
const CC = require(path.join(ROOT, 'lib/check-catalogue.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-cs1-'));
const put = (rel, t) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), t); };
put('notes/lib/notes.js', [
  "'use strict';",
  "// a comment that says emit('fake.event') and pathname === '/api/fake' is not surface",
  "const GLOB = 'lib/**/*.js';   // a '/*' in a string must not open a comment",
  "function add(t) { bus.emit('notes.added', { t }); return t; }",
  "function list() { return []; }",
  "async function handle(req, res, { pathname }) { if (pathname === '/api/notes') return true; }",
  "/* block: emit('fake.block') */",
  "module.exports = { add, list, handle };",
].join('\n'));
const spec = (exportsLine, events = '[notes.added]') => `spec:\n  meta:\n    name: notes\n    version: 1.0.0\n    kind: capability\n    files:\n      - notes/lib/notes.js\n  surface:\n    exports: ${exportsLine}\n    events: ${events}\n    routes:\n      - /api/notes\n`;

console.log('\ntest-capability-spec — a spec per capability, whose surface is the gate (CS1)');
test('CS-01', 'the surface is read from inline and block lists', () => {
  const p = C.parse(spec('[add, list, handle]'));
  assert.deepStrictEqual([p.name, p.version, p.kind, p.files], ['notes', '1.0.0', 'capability', ['notes/lib/notes.js']]);
  assert.deepStrictEqual(p.surface, { exports: ['add', 'list', 'handle'], events: ['notes.added'], routes: ['/api/notes'] });
});
test('CS-02', 'measured from the code; comments are not surface; a /* in a string swallows nothing', () => {
  const m = C.measure(['notes/lib/notes.js'], { root: tmp });
  assert.deepStrictEqual(m.exports, ['add', 'handle', 'list']);
  assert.deepStrictEqual(m.events, ['notes.added'], 'the commented emits are not counted');
  assert.deepStrictEqual(m.routes, ['/api/notes']);
  assert.ok(C.measure(['idearium/api/index.js']).routes.length > 250, "Idearium's route table is read whole");
});
test('CS-03', 'grew and unkept are named; * is unconstrained, said', () => {
  const grew = C.check(spec('[add, handle]'), { root: tmp });
  assert.ok(!grew.ok && grew.grew.exports[0] === 'list' && /exports not in the spec: list/.test(grew.reason), JSON.stringify(grew));
  const unkept = C.check(spec('[add, list, handle, remove]'), { root: tmp });
  assert.ok(!unkept.ok && unkept.unkept.exports[0] === 'remove' && /promised but not in the code: remove/.test(unkept.reason));
  const star = C.check(spec('[add, list, handle]', '["*"]'), { root: tmp });
  assert.ok(star.ok && star.unconstrained.includes('events'), JSON.stringify(star));
  assert.ok(C.check(spec('[add, list, handle]'), { root: tmp }).ok);
});
test('CS-04', 'a draft is exactly the measured surface', () => {
  const d = C.draft('notes', ['notes/lib/notes.js'], { root: tmp, purpose: 'keeps notes' });
  assert.match(d, /kind: capability/); assert.match(d, /purpose: "keeps notes"/);
  assert.ok(C.check(d, { root: tmp }).ok);
});
test('CS-05', 'CK-254: green on the repo, red on a planted spec whose module grew', () => {
  const g = CC.run('CK-254', {}, {});
  assert.ok(g.ok && g.evidence.specs.includes('lib/spec/capability-spec.spec'), JSON.stringify(g));
  put('notes/spec/notes.spec', spec('[add, handle]'));
  const r = CC.run('CK-254', {}, { root: tmp });
  assert.ok(!r.ok && r.items[0].spec === 'notes/spec/notes.spec' && r.items[0].grew.exports[0] === 'list', JSON.stringify(r));
  assert.ok(CC.run('CK-254', { path: 'notes/spec/notes.spec' }, { root: tmp }).ok === false);
});
test('CS-06', "spec-drift counts a capability spec and reports its surface", () => {
  const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {};
  let r; try { r = require(path.join(ROOT, 'orchestrator/lib/spec-drift.js')).check(); } finally { console.warn = w; console.log = l; }
  const s = r.surface.find(x => x.name === 'capability-spec');
  assert.ok(s && s.ok, JSON.stringify(r.surface));
  assert.ok(!r.missing.some(m => m.system === 'capability-spec'));
  assert.match(r.summary, /surface drift/);
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
