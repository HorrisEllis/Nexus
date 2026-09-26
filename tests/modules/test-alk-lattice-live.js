'use strict';
/**
 * tests/modules/test-alk-lattice-live.js — pins the 2026-07-24 conversion of
 * architect/src/ui/alk-lattice.html from a hardcoded diagram into a live
 * instrument. James: "No mock. Only real data, the artifact/contract moving
 * through the system, events, chunks."
 *
 * WHAT IT WAS: `const nodes = [...]` — 20 hand-placed, hand-labelled nodes
 * with hand-authored edges, rendered convincingly enough to be mistaken for
 * an instrument. It could not go wrong because it was never right: it showed
 * the identical picture whether NEXUS was healthy, wedged, or not running.
 * That is the most dangerous kind of view — one that inspires confidence
 * without carrying information.
 *
 * WHAT IT IS: every node, edge and mover comes from autopilot's /graph, which
 * reads the live store and the real input/output folders.
 *
 * The assertions below are contract assertions: every field the renderer
 * dereferences must exist in a REAL response. That is the same discipline
 * applied to the tablet, and it exists because a renderer reading a field
 * that is absent fails silently as an empty screen — indistinguishable from
 * "nothing is happening", which is the exact confusion this whole view exists
 * to prevent.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
// §SANDBOX 2026-09-25 — this test reads what the live store really holds.
// It now reads a copy of it (lib/test-sandbox.js seedFromReal), so nothing
// it or autopilot's handlers write can land in the real data/cortex/memory.
require('../../lib/test-sandbox.js').seedFromReal('JAA_DATA_DIR');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'architect/src/ui/alk-lattice.html'), 'utf8');
const { _handleGraphRead } = require('../../nexus/autopilot.js');

let server, PORT;
const GET = (p) => new Promise((resolve) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => resolve(JSON.parse(d)));
  });
});

(async () => {
  server = http.createServer((req, res) => _handleGraphRead(req, res));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  PORT = server.address().port;

  try {
    await test('ALL-001', 'THE HARDCODED DIAGRAM IS GONE — no hand-authored node array survives', () => {
      assert.ok(!/label:'ALKKernel'/.test(HTML), 'the hardcoded kernel node must be gone');
      assert.ok(!/label:'Feed Generator'/.test(HTML), 'no hand-authored labels may remain');
      assert.ok(!/^const nodes = \[$/m.test(HTML), 'nodes must not be a const literal array');
      assert.ok(/let nodes = \[\];/.test(HTML), 'nodes must start empty and be filled from the feed');
    });

    await test('ALL-002', 'every field the renderer reads exists in a REAL /graph response', async () => {
      const g = await GET('/graph');
      assert.ok(Array.isArray(g.nodes) && g.nodes.length > 0, 'real systems must be present');
      for (const n of g.nodes) {
        for (const k of ['id', 'emitted', 'subscriptionTypes', 'listeners', 'publishes']) {
          assert.ok(k in n, `renderer reads n.${k} — missing from a real node`);
        }
      }
      assert.ok(Array.isArray(g.edges));
      assert.ok(g.movement && Array.isArray(g.movement.chunks) && Array.isArray(g.movement.artifacts)
                && Array.isArray(g.movement.contracts), 'movement arrays must all exist');
    });

    await test('ALL-003', 'the movers are REAL rows from the live store, not fabricated', async () => {
      const g = await GET('/graph');
      const m = g.movement;
      const total = m.chunks.length + m.artifacts.length + m.contracts.length;
      assert.ok(total > 0, 'the live store genuinely holds artifacts/chunks — if this fails the store is empty, not the code');
      for (const x of [...m.chunks, ...m.artifacts]) {
        assert.ok(x.id, 'every mover carries a real id');
        assert.ok(x.kind, 'and a real kind');
        assert.ok(x.system, 'and the system that holds it');
      }
    });

    await test('ALL-004', 'contracts carry their ADDENDA journey — the artifact\'s own record of where it has been', async () => {
      const g = await GET('/graph');
      // Zero contracts in flight is a legitimate state; assert the SHAPE when present.
      for (const c of g.movement.contracts) {
        assert.ok('path' in c && Array.isArray(c.path), 'a contract must expose its journey');
        assert.ok('hops' in c, 'and its hop count');
        assert.ok('from' in c && 'to' in c, 'and both endpoints');
      }
    });

    await test('ALL-005', 'NO INVENTED POSITIONS — a mover with no matching host node is skipped, never placed arbitrarily', () => {
      assert.ok(/if \(!host\) continue;/.test(HTML),
        'a mover whose home system is not a node must be dropped rather than given a made-up position');
    });

    await test('ALL-006', 'positions are DERIVED and STABLE — deterministic from the name, so nodes do not wander between refreshes', () => {
      assert.ok(/function _angleFor/.test(HTML), 'angle must be derived from the node name');
      assert.ok(/charCodeAt/.test(HTML), 'via a stable hash, not Math.random');
      assert.ok(!/Math\.random\(\)/.test(HTML), 'no randomness anywhere — a wandering node is a lie about change');
    });

    await test('ALL-007', 'an UNREACHABLE feed is stated, not rendered as an empty universe (§1.2)', () => {
      assert.ok(/autopilot unreachable/.test(HTML),
        'a dead endpoint and a genuinely empty system must not look identical');
      assert.ok(/liveState = \{ connected:false/.test(HTML), 'disconnection must be explicit state');
    });

    await test('ALL-008', 'buffers are rebuildable — the original const/STATIC_DRAW setup made live data impossible', () => {
      assert.ok(/function rebuildBuffers/.test(HTML));
      assert.ok(/DYNAMIC_DRAW/.test(HTML), 'buffers must be dynamic now that contents change');
      assert.ok(!/const lineBuf\s*=/.test(HTML), 'the const buffer binding must be gone');
    });

    await test('ALL-009', 'the poll interval does not turn the observer into a load source on the observed', () => {
      const m = HTML.match(/setInterval\(refreshGraph,\s*(\d+)\)/);
      assert.ok(m, 'the feed must poll');
      assert.ok(parseInt(m[1], 10) >= 2000, `poll interval ${m[1]}ms is too tight — /graph reads the store on every call`);
    });

    await test('ALL-010', 'the inline script parses — a broken view is not a working feature', () => {
      new Function(HTML.match(/<script>([\s\S]*)<\/script>/)[1]);
    });
  } finally {
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
