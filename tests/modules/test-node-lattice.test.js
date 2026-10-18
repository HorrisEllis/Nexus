'use strict';
/**
 * tests/modules/test-node-lattice.test.js — GM4 (0.60.157): every data node of every system, one lattice, edges typed.
 * James, 2026-10-18: "associative lattice, every data node, is a node in the associative lattice, interconnected by the timestamp
 * and cuasal graph." Map: docs/2026-10-18-gate-memory-phasemap.spec GM4.
 *
 *   NL-01  the edges, typed: causal (causedBy names a node), wire (a .wire joins two systems), reference (a node names another's
 *          id), temporal (happened within the window — never from export times); a cause naming no node is counted dangling
 *   NL-02  the real tree through the real route: Idearium lists the systems that keep nodes and serves each one's edge projection
 *          (with or without a node database — the five "no database yet" are read); the lattice holds every one of them
 *   NL-03  it answers the context stream: the lattice row of lib/context-sources.js gets typed pieces from it
 *   NL-04  the wiring: intelligence serves the routes and declares them; Idearium's door; the command rows; the agent's /lattice
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '../..');
require(path.join(ROOT, 'lib/test-sandbox.js')).ensure();
const assert = require('assert');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, i = console.info; console.log = () => {}; console.warn = () => {}; console.info = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.info = i; } };

(async () => {
  const NL = require(path.join(ROOT, 'intelligence/lattice/node-lattice.js'));
  const NE = require(path.join(ROOT, 'lib/node-edges.js'));

  await test('NL-01', 'the edges, typed; temporal from when it happened only; dangling causes counted', async () => {
    const P = (doc) => NE.project(doc);
    const fixture = {
      a: { nodes: [
        P({ id: 'gap-0001', type: 'gap', system: 'a', payload: { ts: 1000, causedBy: 'run-0077' } }),
        P({ id: 'run-0077', type: 'run', system: 'a', payload: { ts: 1500, file: 'lib/x.js' } }),
        P({ id: 'run-0078', type: 'run', system: 'a', payload: { ts: 900000, note: 'see gap-0001' } }),
        P({ id: 'batch-1', type: 'capability', system: 'a', exported_at: 1200, payload: {} }),
        P({ id: 'gap-0002', type: 'gap', system: 'a', payload: { ts: 2000, causedBy: ['nobody-here'] } }),
        P({ id: 'a', type: 'system', system: 'a', payload: {} }),
      ] },
      b: { nodes: [P({ id: 'b', type: 'system', system: 'b', payload: {} }), P({ id: 'a--b', type: 'wire', system: 'b', payload: { from: 'a', to: 'b' } })] },
      gone: null,
    };
    const L = await NL.build({ systems: ['a', 'b', 'gone'], read: async (s) => { if (!fixture[s]) throw new Error('unreachable'); return fixture[s]; } });
    const st = L.stats();
    assert.strictEqual(st.nodes, 8);
    assert.deepStrictEqual(st.systems.failed.map(f => f.system), ['gone'], 'a system that does not answer is said');
    assert.strictEqual(st.dangling, 1, 'a cause naming no node');
    const n = L.neighbours({ node: 'gap-0001', window: 900 });
    const by = Object.fromEntries(n.neighbours.map(x => [x.id, x.kind]));
    assert.strictEqual(by['run-0077'], 'causal', 'causedBy is the strongest edge');
    assert.strictEqual(by['run-0078'], 'reference', 'a node naming another is a reference');
    assert.ok(!('batch-1' in by), 'an export time never joins by time');
    assert.strictEqual(by['gap-0002'], undefined, 'outside the window: not joined');
    assert.strictEqual(L.neighbours({ node: 'gap-0001', window: 2000 }).neighbours.find(x => x.id === 'gap-0002').kind, 'temporal');
    const w = L.neighbours({ node: 'a--b', kinds: ['wire'] });
    assert.deepStrictEqual(w.neighbours.map(x => x.id).sort(), ['a', 'b'], 'a wire joins the two systems');
    assert.ok(n.neighbours.every(x => x.kind && x.key && typeof x.score === 'number'), 'every answer carries its kind');
  });

  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  const route = async (u) => { const r = await quiet(() => api._route('GET', u)); assert.strictEqual(r.status, 200, `${u}: ${JSON.stringify(r.json).slice(0, 200)}`); return r.json.data || r.json; };

  let lattice = null;
  await test('NL-02', 'the real tree through the real route: every system that keeps nodes, database or not', async () => {
    const list = (await route('/api/system/nodes')).systems;
    const onDisk = fs.readdirSync(ROOT).filter(d => fs.existsSync(path.join(ROOT, d, 'data', 'nodes')));
    assert.deepStrictEqual(list, onDisk.sort(), 'the route lists what is on disk');
    for (const s of ['cortex', 'diagnostic', 'idearium', 'orchestrator', 'sentinel']) if (list.includes(s)) {
      const d = await route(`/api/system/nodes/${s}?edges=1`);
      assert.ok(d.count > 0 && d.nodes.every(n => n.id && n.type && n.system), `${s}: read with or without a node database (${d.count})`);
    }
    lattice = await quiet(() => NL.build({ systems: list, read: (s) => route(`/api/system/nodes/${encodeURIComponent(s)}?edges=1`) }));
    const st = lattice.stats();
    assert.deepStrictEqual(st.systems.read, list, 'every one read');
    assert.ok(st.nodes > 500 && st.edges.reference > 100, JSON.stringify(st));
    const src = fs.readFileSync(path.join(ROOT, 'intelligence/lattice/node-lattice.js'), 'utf8');
    assert.ok(!/require\([^)]*\/data\/nodes/.test(src) && !/readdirSync|readFileSync/.test(src), 'the lattice reads by route, never the files');
  });

  await test('NL-03', 'it answers the context stream: typed pieces through the lattice row', async () => {
    assert.ok(lattice, 'NL-02 built it');
    const CS = require(path.join(ROOT, 'lib/context-stream.js'));
    const r = await CS.find({ text: 'guardian artifacts list', need: ['guardian artifacts'] }, { sources: ['lattice'],
      ask: { lattice: async (q) => lattice.neighbours({ text: q.text }).neighbours.map(n => ({ id: n.key, text: n.text, score: n.score, kind: n.kind })) } });
    assert.ok(r.pieces.length > 0 && r.pieces.every(p => p.from === 'lattice' && ['causal', 'wire', 'reference', 'temporal'].includes(p.kind)), JSON.stringify(r.pieces.slice(0, 2)));
  });

  await test('NL-04', 'the wiring: intelligence routes and declarations, Idearium\'s door, command rows, /lattice', () => {
    const rt = fs.readFileSync(path.join(ROOT, 'intelligence/routes.js'), 'utf8');
    assert.ok(rt.includes("'/api/intelligence/lattice/neighbours', '/api/intelligence/lattice/nodes'") && /require\('\.\/lattice\/node-lattice\.js'\)\.get/.test(rt), 'served');
    const reg = require(path.join(ROOT, 'intelligence/registry-components.js'));
    assert.ok(reg.some(c => c.route.path === '/api/intelligence/lattice/neighbours') && reg.some(c => c.route.path === '/api/intelligence/lattice/nodes'), 'declared');
    const ia = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(ia.includes("['POST',   ['api','lattice',  'neighbours'],") && /post\('intelligence', '\/api\/intelligence\/lattice\/neighbours'/.test(ia), "Idearium's door, by route");
    const { SPEC } = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = SPEC.find(r => r.key === 'lattice.neighbours');
    assert.deepStrictEqual([row.req({ args: ['gap-0001'], flags: {} }).system, row.req({ args: ['gap-0001'], flags: {} }).body.node], ['intelligence', 'gap-0001']);
    assert.ok(SPEC.find(r => r.key === 'lattice.nodes'), 'lattice nodes');
    assert.ok(/case 'lattice': \{[\s\S]{0,300}\/api\/lattice\/neighbours/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8')), "the agent's /lattice");
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
