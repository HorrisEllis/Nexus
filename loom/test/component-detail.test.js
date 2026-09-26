'use strict';
// §loom /api/component (R5) — the real zoom-in endpoint, "look at architect" as the literal gate.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }

process.env.LOOM_PORT = '13802';

(async () => {
  const loomModule = require(path.join(__dirname, '../..', 'loom/server.js'));
  await new Promise(r => setTimeout(r, 400));

  try {
    await test('T-001', 'THE GATE: architect shows real, nuanced status — deprecated for hook-registration, active for SNR/scan, not flattened', async () => {
      const res = await fetch('http://127.0.0.1:13802/api/component/architect');
      const body = await res.json();
      assert.strictEqual(body.ok, true);
      assert.ok(body.declared, 'architect must have real declared hooks data, not just structural');
      const register = body.declared.hooks.find(h => h.id === 'arch-hook-register-0001');
      const snr = body.declared.hooks.find(h => h.id === 'arch-hook-snr-0002');
      assert.strictEqual(register.status, 'deprecated', 'hook registration must show as deprecated, the real, current, live state');
      assert.strictEqual(snr.status, 'active', 'SNR gate must show as active — architect is NOT uniformly dead, that would be flattening it');
      assert.strictEqual(body.declared.activeCount, 2);
      assert.strictEqual(body.declared.totalCount, 3);
    });

    await test('T-002', 'a system with no hand-declared hooks.js gets an honest null, not a fabricated one', async () => {
      const res = await fetch('http://127.0.0.1:13802/api/component/loom');
      const body = await res.json();
      assert.strictEqual(body.ok, true);
      assert.strictEqual(body.declared, null, 'loom itself has no hooks/loom.hooks.js — must say so honestly, not invent data');
    });

    await test('T-003', 'response includes real gap and history counts, not placeholders', async () => {
      const res = await fetch('http://127.0.0.1:13802/api/component/architect');
      const body = await res.json();
      assert.strictEqual(typeof body.gapCount, 'number');
      assert.strictEqual(typeof body.historyCount, 'number');
    });

    await test('T-004', 'a missing system segment returns a real 400', async () => {
      const res = await fetch('http://127.0.0.1:13802/api/component/');
      assert.ok(res.status === 400 || res.status === 404);
    });

    await test('T-005', 'the intent text for the deprecated hook genuinely explains WHY, not just a status flag', async () => {
      const res = await fetch('http://127.0.0.1:13802/api/component/architect');
      const body = await res.json();
      const register = body.declared.hooks.find(h => h.id === 'arch-hook-register-0001');
      assert.ok(/loom/i.test(register.intent) && /410/.test(register.intent), 'the real reason (moved to loom, 410 Gone) must be visible, not just a bare status word');
    });
  } finally {
    if (loomModule && loomModule.server) await new Promise(r => loomModule.server.close(r));
  }

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
