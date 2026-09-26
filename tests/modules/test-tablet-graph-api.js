'use strict';
/**
 * tests/modules/test-tablet-graph-api.js — pins TABLET T4's connectome
 * surface (docs/nexus-tablet.spec phase T4).
 *
 * T4 gate: "real RAID envelope trails animate along real consumer-graph
 * edges, coloured by real CFR/sigma."
 *
 * PARTIAL BY DESIGN, and the partiality is the point. Two of three clauses
 * are met with real data: real consumer-graph edges (now possible because
 * §B1 closed — cross-process subscription publishing) and real CFR
 * colouring (read from cfr_state.json on disk). The third — per-request
 * RAID envelope TRAILS — cannot be met and is NOT faked:
 * cortex/core/raid/router.js's own header states the design, "the
 * envelope's trail + the event log together are the ledger", meaning the
 * trail lives on the in-flight envelope object and only routing EVENTS are
 * persisted. There is no trail store to read. Synthesising trails would be
 * exactly the "authoritative-looking and mostly wrong" failure this spec
 * warns about, so the endpoint reports routing as event_log activity and
 * says so in its own payload.
 *
 * The hardest requirement here is the UNKNOWN/ZERO distinction (§1.2). With
 * no process having published subscriptions, every producer edge would
 * naively read unconsumed:true — "everything is emitted into the void" —
 * when the truth is "not observed yet." That conflation is asserted against
 * directly in T4-004.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
// §SANDBOX 2026-09-25 — this test reads what the live store really holds.
// It now reads a copy of it (lib/test-sandbox.js seedFromReal), so nothing
// it or autopilot's handlers write can land in the real data/cortex/memory.
require('../../lib/test-sandbox.js').seedFromReal('JAA_DATA_DIR');
const { _handleGraphRead } = require('../../nexus/autopilot.js');

let server, PORT;
const GET = (p) => new Promise((resolve) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => { try { resolve({ code: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ code: res.statusCode, body: d }); } });
  }).on('error', e => resolve({ error: e.message }));
});

(async () => {
  server = http.createServer((req, res) => _handleGraphRead(req, res));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  PORT = server.address().port;

  try {
    await test('T4-001', 'GET /graph returns a real connectome from the live store — nodes derived from actual event_log sources', async () => {
      const r = await GET('/graph');
      assert.strictEqual(r.code, 200);
      assert.strictEqual(r.body.ok, true);
      assert.ok(r.body.nodes.length > 0, 'the real event log must yield real nodes');
      assert.ok(r.body.eventsSampled > 0, 'must have sampled real events');
      const n = r.body.nodes[0];
      for (const k of ['id', 'publishes', 'subscriptionTypes', 'listeners', 'emitted']) {
        assert.ok(k in n, `node must carry ${k}`);
      }
    });

    await test('T4-002', 'producer edges carry real weights from real event counts, heaviest first', async () => {
      const r = await GET('/graph');
      assert.ok(r.body.edges.length > 0, 'real producers must yield real edges');
      const e = r.body.edges[0];
      assert.ok(typeof e.source === 'string' && typeof e.type === 'string');
      assert.ok(e.weight >= 1, 'weight is a real observed count');
      for (let i = 1; i < Math.min(r.body.edges.length, 10); i++) {
        assert.ok(r.body.edges[i - 1].weight >= r.body.edges[i].weight, 'edges must be ordered by weight');
      }
    });

    await test('T4-003', 'CFR colouring is read from DISK and its regime is DERIVED, not assumed present', async () => {
      const r = await GET('/graph');
      const cfr = r.body.cfr;
      assert.ok(cfr, 'CFR must be readable from cfr_state.json on disk (observation law: survives a wedged cortex)');
      for (const k of ['coherence', 'friction', 'resonance', 'entropy']) {
        assert.strictEqual(typeof cfr[k], 'number', `${k} axis must be a real number`);
      }
      // cfr_state.json persists the four axes only; the first draft of this
      // endpoint assumed a stored `regime` and got undefined.
      assert.ok(typeof cfr.regime === 'string' && cfr.regime.length > 0,
        'regime must be derived via meta/cfr/field.computeRegime rather than read from a field that does not exist');
    });

    await test('T4-004', 'THE UNKNOWN/ZERO DISTINCTION: with no publisher reporting, consumer facts are null (unknown) — never false-claimed as "unconsumed"', async () => {
      const r = await GET('/graph');
      const anyPublisher = r.body.nodes.some(n => n.publishes);
      if (!anyPublisher) {
        assert.ok(r.body.edges.every(e => e.unconsumed === null),
          '"emitted into the void" must NOT be asserted when nothing has published subscriptions — that is unknown, not zero');
        assert.ok(r.body.edges.every(e => e.liveConsumerCount === null),
          'consumer counts must be null, not 0 — 0 reads as a verified fact');
        assert.ok(/NO system has published/.test(r.body.notes.consumers),
          'the payload must state this limit itself, so a raw-API reader cannot mistake absence for emptiness');
      } else {
        assert.ok(r.body.edges.every(e => typeof e.unconsumed === 'boolean'),
          'with publishers reporting, unconsumed becomes a real boolean claim');
      }
    });

    await test('T4-005', 'REAL TRAILS: /graph exposes persisted RAID trails, and distinguishes empty from unreadable', async () => {
      // §SUPERSEDES the original T4-005, which asserted the endpoint must NOT
      // expose a trails field. That was correct when trails lived only on the
      // in-flight envelope; router.js now persists them, so the honest
      // assertion changed with the code rather than the test being deleted to
      // make a claim pass.
      const r = await GET('/graph');
      assert.ok('trails' in r.body && Array.isArray(r.body.trails), 'trails must be exposed now that they are persisted');
      assert.strictEqual(typeof r.body.trailsObserved, 'boolean');
      const note = r.body.notes.raidTrails;
      if (!r.body.trailsObserved) {
        assert.ok(/UNREADABLE/.test(note), 'an unreadable store must say so — absent, not zero');
      } else if (r.body.trails.length === 0) {
        assert.ok(/EMPTY/.test(note) && /none observed yet/i.test(note),
          'an empty store must state that empty means "none observed yet", never "routing does not happen"');
      } else {
        assert.ok(/nothing synthesised/.test(note));
        const t = r.body.trails[0];
        for (const k of ['envelopeId', 'status', 'hops', 'elapsedMs', 'path']) assert.ok(k in t, `trail must carry ${k}`);
        assert.ok(Array.isArray(t.path) && t.path.every(h => h.system && h.status), 'each hop must name its system and status');
      }
    });

    await test('T4-010', 'router persists a real trail on EVERY stamp, advancing ONE row in place — including the non-terminal ROUTED state, so a stuck request is visible', async () => {
      const src = fs.readFileSync(path.join(ROOT, 'cortex/core/raid/router.js'), 'utf8');
      // 4 call sites: no_route, routed, fulfilled/failed (shared), and the def.
      assert.ok((src.match(/_persistTrail\(/g) || []).length >= 4, 'must persist at no_route, routed, and fulfil/fail');
      const fn = src.slice(src.indexOf('function _persistTrail'), src.indexOf('function _onRouteRequest'));
      assert.ok(/id: envelope\.envelopeId/.test(fn), 'keyed by envelopeId so hops advance one row rather than appending duplicates');
      assert.ok(/elapsedMs/.test(fn), 'must record real elapsed time — unrecoverable after the fact');
      assert.ok(/try\s*\{/.test(fn) && /catch/.test(fn), 'telemetry must never fail a route');
      // The ROUTED (non-terminal) persist is the one that makes stuck requests
      // observable; assert it specifically rather than only the terminals.
      const onReq = src.slice(src.indexOf('function _onRouteRequest'), src.indexOf('function _onRouteRequest') + 1400);
      assert.ok(/_persistTrail\(routed\)/.test(onReq), 'a routed-but-never-fulfilled envelope must already be on disk');
    });

    await test('T4-011', 'trail animation walks only hops whose system is a real node — a pulse never travels an unobserved edge', async () => {
      const html = fs.readFileSync(path.join(ROOT, 'tablet/index.html'), 'utf8');
      assert.ok(/function animateTrails/.test(html));
      assert.ok(/\.map\(h => pos\[h\.system\]\)\.filter\(Boolean\)/.test(html),
        'hops with no corresponding node must be filtered out, not invented');
      assert.ok(/hops\.length >= 2/.test(html), 'a single-hop trail cannot be animated as movement');
      assert.ok(/regime === 'collapsing'/.test(html), 'trail colour must come from the real CFR regime, not a decorative palette');
    });

    await test('T4-006', '?events bounds the sample — a UI read must never turn into an unbounded scan', async () => {
      const r = await GET('/graph?events=5');
      assert.ok(r.body.eventsSampled <= 5, `expected <=5, got ${r.body.eventsSampled}`);
      const big = await GET('/graph?events=999999');
      assert.ok(big.body.eventsSampled <= 2000, 'hard ceiling enforced regardless of request');
    });

    await test('T4-007', 'nodes are the UNION of subscription publishers and event_log sources — an emit-only system is never silently missing', async () => {
      const r = await GET('/graph');
      const sources = new Set(r.body.edges.map(e => e.source));
      for (const s of sources) {
        assert.ok(r.body.nodes.some(n => n.id === s), `source '${s}' produced edges but is missing from nodes`);
      }
    });

    await test('T4-008', 'BRAIN VIEW draws only observed edges, labels unknowns, and states the trail limitation in the UI itself', async () => {
      const html = fs.readFileSync(path.join(ROOT, 'tablet/index.html'), 'utf8');
      assert.ok(/data-v="brain"/.test(html), 'the brain view must be reachable');
      assert.ok(/loadBrain/.test(html));
      // No consumers observed → no line drawn. Drawing a producer as connected
      // to nothing-in-particular would be invented topology.
      assert.ok(/if \(!from \|\| !e\.consumers \|\| !e\.consumers\.length\) continue;/.test(html),
        'an edge with no observed consumer must not be drawn');
      assert.ok(/not observed", not "nothing consumes these/.test(html),
        'the UI must state the unknown-vs-zero distinction to the user, not just in the API');
      // §SUPERSEDED alongside T4-005: the UI previously had to disclose that
      // trails did not exist. They now do, so the honest requirement became
      // "report the real trail state, including an honest empty" rather than
      // "disclose absence" — the assertion moved with the code.
      assert.ok(/RAID trails/.test(html), 'the UI must surface the trail state');
      assert.ok(/notes\.raidTrails/.test(html),
        'when there are no trails the UI must show the API\'s own honest note rather than a bare empty list');
      assert.ok(!/(localStorage|sessionStorage)\s*[.\[]/.test(html), 'still owns no persistent state (§5.12)');
      assert.ok(!/374[89]|3750|9000|7705|7820|4800/.test(html), 'still zero hardcoded system ports');
    });

    await test('T4-009', 'the inline UI script still parses after the brain view was added', async () => {
      const html = fs.readFileSync(path.join(ROOT, 'tablet/index.html'), 'utf8');
      new Function(html.match(/<script>([\s\S]*)<\/script>/)[1]);
    });
  } finally {
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
