'use strict';
// P10 bridge — diagnose + notify. On a P9-relevant event, co-pilot diagnoses and
// notifies the user (toast via the existing bus→SSE→toast path, or CLI). §8.6
// wires the existing detector + diagnose + toast, builds no new detector.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const { createAssistLoop } = require(path.join(ROOT, 'copilot/assist-loop'));
const { classifyRelevance } = require(path.join(ROOT, 'lib/stream-digest'));

function repeatedErrors() {
  const now = Date.now();
  return [1, 2, 3].map(i => ({ type: 'ui.copilot.error', ts: now - i * 1000 }));
}

(async () => {
  await test('T-001', 'createAssistLoop requires classifyRelevance + notify (§1.2 fail loud)', () => {
    assert.throws(() => createAssistLoop({}), /required/);
  });

  await test('T-002', 'on a relevant event, the loop NOTIFIES the user', async () => {
    let msg = null;
    const loop = createAssistLoop({ classifyRelevance, getStream: repeatedErrors, notify: (m) => { msg = m; } });
    const r = await loop.check();
    assert.strictEqual(r.acted, true);
    assert.ok(msg && /happened 3 times/.test(msg), 'the user must be told what recurred');
  });

  await test('T-003', 'the notice includes the diagnosis when diagnose returns one', async () => {
    let msg = null;
    const loop = createAssistLoop({
      classifyRelevance, getStream: repeatedErrors,
      runDiagnose: async () => ({ summary: 'Provider connection is flapping.' }),
      notify: (m) => { msg = m; },
    });
    await loop.check();
    assert.ok(/flapping/.test(msg), 'the diagnosis summary must reach the user');
  });

  await test('T-004', 'repeated identical signals are DEDUPED — no toast spam', async () => {
    let count = 0;
    const loop = createAssistLoop({ classifyRelevance, getStream: repeatedErrors, notify: () => { count++; } });
    await loop.check();
    await loop.check();
    assert.strictEqual(count, 1, 'the same signal must notify only once');
  });

  await test('T-005', 'clear() lets a recurrence re-notify', async () => {
    let count = 0;
    const loop = createAssistLoop({ classifyRelevance, getStream: repeatedErrors, notify: () => { count++; } });
    await loop.check();
    loop.clear();
    await loop.check();
    assert.strictEqual(count, 2, 'after clear, a recurrence re-notifies');
  });

  await test('T-006', 'no relevant event → no notification', async () => {
    let notified = false;
    const loop = createAssistLoop({ classifyRelevance, getStream: () => [{ type: 'ui.click', ts: Date.now() }], notify: () => { notified = true; } });
    const r = await loop.check();
    assert.strictEqual(r.acted, false);
    assert.strictEqual(notified, false);
  });

  await test('T-007', 'check() never throws — assist must not break the app (§1.2)', async () => {
    const loop = createAssistLoop({ classifyRelevance, getStream: () => { throw new Error('boom'); }, notify: () => {} });
    let threw = false;
    try { await loop.check(); } catch { threw = true; }
    assert.strictEqual(threw, false, 'check must swallow errors');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
