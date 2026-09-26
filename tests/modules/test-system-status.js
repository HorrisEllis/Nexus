'use strict';
// CA1 (docs/copilot-awareness-routing-phasemap.spec) — system status report.
// "how are you" → co-pilot polls the live system (health, gaps, loom) and gives
// a real status, not a canned "I don't have context". §8.6 composes existing
// health surfaces. §16.2 reads like a story.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const st = require(path.join(ROOT, 'copilot/system-status'));

(async () => {
  await test('T-001', 'isStatusQuery detects "how are you" and system-status phrasings', () => {
    for (const q of ['how are you', 'how is the system', 'status report', 'system status', 'are you healthy', 'how is nexus doing']) {
      assert.strictEqual(st.isStatusQuery(q), true, `"${q}" should be a status query`);
    }
  });

  await test('T-002', 'isStatusQuery does NOT fire on ordinary prompts', () => {
    for (const q of ['whats 2+2', 'write me a function', 'build the auth module']) {
      assert.strictEqual(st.isStatusQuery(q), false, `"${q}" should NOT be a status query`);
    }
  });

  await test('T-003', 'pollStatus returns a structured status (systems + counts), never throws', async () => {
    const s = await st.pollStatus();
    assert.ok(s.systems && typeof s.online === 'number' && typeof s.total === 'number');
    assert.ok(s.total >= 6, 'polls the core systems');
  });

  await test('T-004', 'statusReport returns a legible human string (§16.2)', async () => {
    const r = await st.statusReport();
    assert.ok(typeof r.text === 'string' && r.text.length > 0);
    assert.ok(/running|online|system/i.test(r.text), 'the report reads like a status');
    assert.ok(r.status, 'carries the structured status too');
  });

  await test('T-005', 'the server intercepts status queries BEFORE the LLM dispatch (CA1 wired)', () => {
    const server = fs.readFileSync(path.join(ROOT, 'copilot/server.js'), 'utf8');
    assert.ok(/isStatusQuery\(prompt\)/.test(server), 'the prompt path must check isStatusQuery');
    const statusIdx = server.indexOf('isStatusQuery(prompt)');
    const lifelineIdx = server.indexOf('_lifeline.route');
    assert.ok(statusIdx > 0 && statusIdx < lifelineIdx, 'the status check must run before the lifeline dispatch');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
