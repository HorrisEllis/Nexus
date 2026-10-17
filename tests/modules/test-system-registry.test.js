'use strict';
// SR-01..06 (0.60.127 DB9 + DB10): a system's registry generated as its dependency graph, and its negative space.
// James, 2026-10-17: "shadow and negative space reasoning for debugging. maybe every repo has to generate a component
// registry. the component registry can also be a dependancy graph?"
const assert = require('assert'), fs = require('fs'), path = require('path');
require('../../lib/test-sandbox.js').ensure();   // settle records gaps: into a sandbox, never the real data/
const REPO = path.resolve(__dirname, '..', '..');
const SR = require('../../lib/system-registry.js');
let passed = 0, failed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const quiet = async (fn) => { const k = { log: console.log, warn: console.warn, info: console.info, error: console.error }; console.log = console.warn = console.info = console.error = () => {}; try { return await fn(); } finally { Object.assign(console, k); } };

test('SR-01 a system\'s registry has its declared half (from registry-components.js, checked by loom) and its observed half (DB1)', () => {
  const r = SR.registryOf('cortex');
  assert.ok(r.ok);
  assert.strictEqual(r.declared.file, 'cortex/registry-components.js');
  assert.ok(r.declared.routes > 0 && r.declared.served <= r.declared.routes);
  assert.ok(r.observed.depends_on.some(d => d.system === 'lib'));
  assert.ok(r.observed.consumed_by.length > 0);
});
test('SR-02 it is a dependency graph: every system a node, every crossing pair an edge, both directions consistent', () => {
  const g = SR.graph();
  const byId = new Map(g.systems.map(s => [s.id, s]));
  for (const e of g.edges) {
    assert.ok(byId.get(e.from).depends_on.includes(e.to), `${e.from} -> ${e.to}`);
    assert.ok(byId.get(e.to).consumed_by.includes(e.from), `${e.to} <- ${e.from}`);
  }
});
test('SR-03 negative space, extra: a file another system requires directly is named, with who reaches it', () => {
  const r = SR.registryOf('intelligence');
  const cfr = r.negative.extra.reached_directly.find(x => x.file.startsWith('intelligence/cfr/'));
  assert.ok(cfr && cfr.consumers > 0 && cfr.from.length > 0, JSON.stringify(r.negative.extra.reached_directly.slice(0, 3)));
  assert.ok(/past the drawbridge/.test(cfr.why));
});
test('SR-04 negative space, absent: a declared route the source does not serve is named (cortex declares routes it does not serve)', () => {
  const r = SR.registryOf('cortex');
  assert.strictEqual(r.negative.absent.routes.length, r.declared.routes - r.declared.served);
  for (const a of r.negative.absent.routes) assert.ok(a.route && /does not serve/.test(a.why));
});
test('SR-05 a system with no registry says so; a folder that is not a system is refused with the list', () => {
  const d = SR.registryOf('diagnostic');
  assert.ok(d.ok && /no registry-components\.js/.test(d.negative.extra.no_registry));
  const x = SR.registryOf('not-a-system');
  assert.strictEqual(x.ok, false); assert.ok(/not a system/.test(x.error));
});
test('SR-06 loom reads intelligence\'s and versionium\'s registries (found missing by DB9)', () => {
  const CM = require('../../loom/scanners/capability-map.js');
  assert.ok(CM.SYSTEMS.intelligence && CM.SYSTEMS.versionium);
  assert.ok(SR.registryOf('intelligence').declared.routes > 0);
});
test('SR-07 the routes are served and the command row reaches them', async () => {
  const g = await quiet(async () => { const api = await import(path.join(REPO, 'idearium/api/index.js')); return [await api._route('GET', '/api/system/registry'), await api._route('GET', '/api/system/registry/cortex'), await api._route('GET', '/api/system/registry/nope')]; });
  const d0 = g[0].json.data || g[0].json, d1 = g[1].json.data || g[1].json;
  assert.strictEqual(g[0].status, 200); assert.ok(d0.systems.length > 10);
  assert.strictEqual(g[1].status, 200); assert.strictEqual(d1.system, 'cortex');
  assert.strictEqual(g[2].status, 404);
  const rc = require('../../idearium/cli/route-commands.js');
  const row = (rc.SPEC || rc.ROWS || rc).find(r => r.key === 'system.registry');
  assert.strictEqual(row.req({ args: [] , flags: {} }).path, '/api/system/registry');
  assert.strictEqual(row.req({ args: ['cortex'], flags: {} }).path, '/api/system/registry/cortex');
  assert.deepStrictEqual([row.req({ args: ['cortex'], flags: { settle: true } }).method, row.req({ args: ['cortex'], flags: { settle: true } }).path], ['POST', '/api/system/registry/cortex/settle']);
});
test('SR-08 settle: the registry is the shadow; each declared route the source does not serve becomes a gap (lib/shadow.js)', async () => {
  const r = await quiet(async () => SR.settle('cortex'));
  assert.ok(r.ok && r.settled);
  assert.strictEqual(r.settled.absent, r.negative.absent.routes.length);
  assert.strictEqual(r.settled.ok, r.settled.absent === 0);
  const SH = require('../../lib/shadow.js');
  assert.ok(SH.settled({ step: 'drawbridge.cortex' }).length >= 1);
});

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
