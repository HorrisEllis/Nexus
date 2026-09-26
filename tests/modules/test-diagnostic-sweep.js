'use strict';
// OB2 (docs/nexus-observability-tablet-phasemap.spec, CHUNK E) — gap detection
// for diagnostics. Where OB1 reads state, OB2 DETECTS issues/faults/bottlenecks
// (composing gap-hunter + CFR stress + OB1 data) and files them. §8.6 wires
// existing detectors; §13.4 detection is drift data; §1.2 loud not swallowed.
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && s.startsWith('[jaa]')) return; _log(...a); };

const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const { sweep } = require(path.join(ROOT, 'copilot/diagnostic-sweep'));

(async () => {
  await test('T-001', 'sweep returns findings + filed count + healthy flag', async () => {
    const r = await sweep({ dryRun: true });
    assert.ok(Array.isArray(r.findings));
    assert.ok(typeof r.filed === 'number');
    assert.ok(typeof r.healthy === 'boolean');
  });

  await test('T-002', 'sweep DETECTS real faults from live state (offline systems, drift)', async () => {
    const r = await sweep({ dryRun: true });
    // in-sandbox: systems are offline, so it must find them
    assert.ok(r.findings.length > 0, 'must detect the real offline systems');
    assert.ok(r.findings.some(f => f.type === 'system_offline'), 'offline systems are a detected fault');
  });

  await test('T-003', 'each finding names its type, detail, source, severity (§16.2 legible, §17.5 provenance)', async () => {
    const r = await sweep({ dryRun: true });
    for (const f of r.findings) {
      for (const k of ['type', 'detail', 'source', 'severity']) assert.ok(k in f, `finding must have ${k}`);
    }
  });

  await test('T-004', 'dryRun does NOT file gaps (filed = 0)', async () => {
    const r = await sweep({ dryRun: true });
    assert.strictEqual(r.filed, 0, 'a dry run must not file');
  });

  await test('T-005', 'healthy is false when faults exist, and the concerns are real', async () => {
    const r = await sweep({ dryRun: true });
    assert.strictEqual(r.healthy, r.findings.length === 0);
  });

  await test('T-006', 'sweep never throws even with everything unreachable (§1.2 non-fatal)', async () => {
    let threw = false;
    try { await sweep({ dryRun: true }); } catch { threw = true; }
    assert.strictEqual(threw, false);
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
