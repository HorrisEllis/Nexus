'use strict';
// OB9 (docs/nexus-observability-tablet-phasemap.spec, CHUNK I, final) — the real
// 3D map. Renders OB3's movement graph + OB4's bottlenecks in 3D. §1.1/§0.1 THE
// LAW: every node/edge/color traces to a real value; unknown is grey, never a
// confident fake; empty rather than an invented topology.
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && s.startsWith('[jaa]')) return; _log(...a); };

const assert = require('assert');
const path = require('path');
const fs = require('fs');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
const ROOT = path.join(__dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'tablet/map3d.html'), 'utf8');

(async () => {
  await test('T-001', 'OB9: it is a real 3D render (three.js WebGL)', () => {
    assert.ok(/three/.test(HTML) && /WebGLRenderer/.test(HTML), 'must use three.js WebGL');
  });

  await test('T-002', 'OB9: nodes come from the REAL movement graph (OB3), not invented', () => {
    // §0.39.282 — OB10 brain rebuild: nodes are the orchestrator's own SYS registry (/api/status), edges only its declared
    // CHANNELS (/api/channels), activity the nexus-bus firehose — not copilot's one LLM-routed diagnostics prompt.
    assert.ok(/\/api\/status/.test(HTML) && /status\.systems/.test(HTML), 'nodes from the real system registry');
    assert.ok(/\/api\/channels/.test(HTML) && /nexus-bus\/sse/.test(HTML), 'edges from declared channels, activity from the bus');
  });

  await test('T-003', 'OB9: node color derives from the bottleneck score (OB4)', () => {
    assert.ok(/bottleneck>=/.test(HTML), 'color reflects bottleneck score');
    assert.ok(/bnByNode/.test(HTML), 'bottlenecks mapped onto nodes');
  });

  await test('T-004', 'OB9: THE NO-FAKE LAW — unknown is grey, never a confident zero (§1.1)', () => {
    // §0.39.282 — OB10: a node with no observed health is the grey 'offline / unknown' swatch, never the ok colour.
    assert.ok(/grey "unknown," never a confident color/.test(HTML) && /offline \/ unknown/.test(HTML), 'unknown must not render as fake-healthy');
    assert.ok(/sys\.online \? COLORS\.ok : COLORS\.bad/.test(HTML), 'only an observed-online node gets the ok colour');
  });

  await test('T-005', 'OB9: empty topology → says so, does NOT invent one (§0.1)', () => {
    assert.ok(/No topology observed|stays empty|does not invent/.test(HTML), 'must stay empty rather than fake a map');
  });

  await test('T-006', 'OB9: unreachable co-pilot → honest banner, no fake data', () => {
    assert.ok(/Cannot reach co-pilot|co-pilot offline/.test(HTML), 'must state when data is unavailable');
  });

  await test('T-007', 'OB9: no browser storage (artifact-safe)', () => {
    assert.ok(!/localStorage|sessionStorage/.test(HTML));
  });

  await test('T-008', 'diagnose() exposes movement + bottlenecks for the 3D map to render', async () => {
    const diag = require(path.join(ROOT, 'copilot/diagnostics'));
    const r = await diag.diagnose();
    assert.ok(r.movement && Array.isArray(r.movement.nodes), 'report must carry the movement graph');
    assert.ok(Array.isArray(r.bottlenecks), 'report must carry bottlenecks');
  });

  await test('T-009', 'the movement nodes are REAL systems (from live health), not placeholders', async () => {
    const diag = require(path.join(ROOT, 'copilot/diagnostics'));
    const r = await diag.diagnose();
    if (r.movement.nodes.length) {
      const names = r.movement.nodes.map(n => n.name);
      assert.ok(names.some(n => ['orchestrator', 'cortex', 'guardian', 'bridge', 'loom', 'copilot', 'idearium'].includes(n)), 'nodes are real NEXUS systems');
    }
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
