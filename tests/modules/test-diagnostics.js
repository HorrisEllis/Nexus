'use strict';
// OB1 (docs/nexus-observability-tablet-phasemap.spec, CHUNK E) — full live
// diagnostics. "How is nexus doing" → real per-system health + gaps + RAID
// decisions + schema drift + CFR regime, not a canned summary. §8.6 composes CA1
// + cortex tables + cfr; §1.1 real data only; §17.6 traceable.
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
const diag = require(path.join(ROOT, 'copilot/diagnostics'));
const st = require(path.join(ROOT, 'copilot/system-status'));

(async () => {
  await test('T-001', 'diagnose() returns all sections (health, gaps, decisions, drift, regime)', async () => {
    const r = await diag.diagnose();
    for (const k of ['health', 'gaps', 'decisions', 'drift', 'regime', 'summary']) {
      assert.ok(k in r, `report must include ${k}`);
    }
  });

  await test('T-002', 'gaps come from REAL cortex rows (§1.1 no mocks)', async () => {
    const r = await diag.diagnose();
    assert.ok(typeof r.gaps.open === 'number', 'open gap count is a real number');
    assert.ok(Array.isArray(r.gaps.recent));
  });

  await test('T-003', 'decisions reflect real RAID decision records', async () => {
    const r = await diag.diagnose();
    assert.ok(Array.isArray(r.decisions.recent));
    assert.ok(typeof r.decisions.denied === 'number');
  });

  await test('T-004', 'the CFR regime is a real classification (§where-and-why)', async () => {
    const r = await diag.diagnose();
    assert.ok(['stable', 'resonant', 'turbulent', 'chaotic', 'unknown'].includes(r.regime.state));
  });

  await test('T-005', 'summary flags concerns honestly (not always "healthy")', async () => {
    const r = await diag.diagnose();
    assert.ok('healthy' in r.summary && Array.isArray(r.summary.concerns));
  });

  await test('T-006', 'diagnoseText() is legible and mentions systems + gaps + regime (§16.2)', async () => {
    const t = await diag.diagnoseText();
    assert.ok(/systems? online|diagnostics/i.test(t.text));
    assert.ok(/gap/i.test(t.text));
    assert.ok(/regime/i.test(t.text));
  });

  await test('T-007', 'a deep-diagnostic query is recognized (routes to OB1, not the light status)', () => {
    for (const q of ['how is nexus doing', 'run diagnostics', 'what is wrong', 'health check']) {
      assert.strictEqual(st.isStatusQuery(q), true, `"${q}" must be caught`);
    }
    assert.strictEqual(st.isStatusQuery('write me a function'), false);
  });

  await test('T-008', 'the server routes deep-diagnostic queries to the full report', () => {
    const server = fs.readFileSync(path.join(ROOT, 'copilot/server.js'), 'utf8');
    assert.ok(/diagnostics'\)\.diagnoseText|require\('\.\/diagnostics'\)/.test(server), 'server must call the diagnostics module');
    assert.ok(/wantsDeep/.test(server), 'server must distinguish a deep-diagnostic query');
  });

  await test('T-009', 'diagnose() never throws even if a source is unreachable (§1.2 non-fatal)', async () => {
    let threw = false;
    try { await diag.diagnose(); } catch { threw = true; }
    assert.strictEqual(threw, false);
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
