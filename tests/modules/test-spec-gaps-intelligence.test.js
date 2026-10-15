'use strict';
/**
 * tests/modules/test-spec-gaps-intelligence.test.js — 0.60.49: every gap spec drift finds is mapped to the intelligence
 * gap system. orchestrator/lib/spec-drift.js → intelligence/gap/predicate.js enrichGap.
 * James (2026-10-15): "i want any gaps to be mapped to the intelligence system".
 *
 *   GI-01  a module with no spec opens a spec.missing gap carrying the intelligence fields: predicate, dedup key, truth
 *          floor, TTL, seam id
 *   GI-02  a capability spec whose code grew opens one spec.surface.drift gap (enriched), updated — not duplicated — on
 *          the next check, and resolved when the spec matches again
 *   GI-03  the predicate library knows the three spec gap types
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const SD = require(path.join(ROOT, 'orchestrator/lib/spec-drift.js'));
const GP = require(path.join(ROOT, 'intelligence/gap/predicate.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const fakeJaa = () => { const rows = []; return { rows,
  query: (t, fn, n = 1e6) => rows.filter(r => r._t === t && fn(r)).slice(0, n),
  insert: (t, r) => { rows.push({ ...r, _t: t }); return r; },
  update: (t, uuid, v) => { const r = rows.find(x => x._t === t && x.uuid === uuid); if (r) Object.assign(r, v); return r ? 1 : 0; } }; };
const quietly = (fn) => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {}; try { return fn(); } finally { console.warn = w; console.log = l; } };
const events = []; const bus = { emit: (t, d) => events.push(t) };
const planted = path.join(ROOT, 'lib/spec/__gi-test.spec');
const plant = (exportsLine) => fs.writeFileSync(planted, `spec:\n  meta:\n    name: gi-test-capability\n    version: 1.0.0\n    kind: capability\n    files: [lib/capability-spec.js, lib/checks/ck-254-surface.js]\n  surface:\n    exports: ${exportsLine}\n    events: []\n    routes: []\n`);

console.log('\ntest-spec-gaps-intelligence — spec gaps go through the intelligence gap system (0.60.49)');
try {
  test('GI-01', 'a module with no spec opens an enriched spec.missing gap', () => {
    const jaa = fakeJaa();
    const r = quietly(() => SD.check({ jaaDB: jaa, bus }));
    const g = jaa.rows.find(x => x.type === 'spec.missing');
    assert.ok(r.missing.length && g, 'some module has no spec');
    for (const k of ['predicate', 'dedup_key', 'truth_floor', 'ttl_ms', 'seam_id']) assert.ok(g[k] != null, `${k} from the intelligence gap system`);
    assert.match(String(g.seam_id), /^gap-lifecycle:spec\.missing:/);
    assert.ok(events.includes('cortex.gap.found'));
  });
  test('GI-02', 'surface drift: one enriched gap, updated not duplicated, resolved when green', () => {
    const jaa = fakeJaa();
    plant('[ID, KINDS, MODULE_ID, VERSION, check, draft, find, measure, parse, run]');   // the code also has stripComments: it grew
    quietly(() => SD.check({ jaaDB: jaa, bus }));
    let gs = jaa.rows.filter(x => x.type === 'spec.surface.drift' && x.path === 'lib/spec/__gi-test.spec');
    assert.strictEqual(gs.length, 1, JSON.stringify(gs.map(x => x.body)));
    assert.ok(gs[0].dedup_key && gs[0].truth_floor && /stripComments/.test(gs[0].body), JSON.stringify(gs[0]).slice(0, 300));
    quietly(() => SD.check({ jaaDB: jaa, bus }));
    gs = jaa.rows.filter(x => x.type === 'spec.surface.drift' && x.path === 'lib/spec/__gi-test.spec');
    assert.strictEqual(gs.length, 1, 'not duplicated');
    plant('[ID, KINDS, MODULE_ID, VERSION, check, draft, find, measure, parse, run, stripComments]');
    quietly(() => SD.check({ jaaDB: jaa, bus }));
    assert.strictEqual(gs[0].status, 'resolved'); assert.match(gs[0].resolution, /CK-254 green/);
  });
  test('GI-03', 'the predicate library knows the spec gap types', () => {
    for (const t of ['spec.version.drift', 'spec.missing', 'spec.surface.drift']) assert.ok(GP.PREDICATE_LIBRARY[t], t);
  });
} finally { try { fs.unlinkSync(planted); } catch (_) {} }
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 50).unref();
