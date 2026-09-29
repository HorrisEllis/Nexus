'use strict';
/**
 * tests/modules/test-warp-cascade-provider-fallback.js
 *
 * James, from a live manifest: nine of ten chunks in a real spec build
 * failed, every one with the IDENTICAL error "ollama dispatch failed:
 * huihui_ai/qwen2.5-coder-abliterate:7b timed out after 120000ms" — even
 * chunks whose own `agent` field said claude, deepseek, or gemini.
 *
 * Two compounding real bugs, both fixed together:
 *   1. warp/dispatch/cascade.js's runCascade() called generate() with no
 *      try/catch. warp-build-dispatch.js's real generate() throws on a
 *      genuine dispatch failure (documented, correct behavior on its
 *      own) — but with nothing catching it, that throw killed the whole
 *      cascade on attempt 1 instead of advancing to provider 2/3.
 *   2. lib/seam/adapters/warp-cascade.js's providersFor() had no way to
 *      learn what agent a caller actually wanted — it always returned
 *      RAID's own pick or the hardcoded LAW_I default (['ollama',
 *      'chatgpt','claude']), 'ollama' first, unconditionally. The real,
 *      correctly-computed per-chunk agent (idearium/api/index.js:1744)
 *      never reached this function.
 *
 * Together: every cascade started on ollama regardless of the chunk's
 * real assigned agent, and died there on the first timeout instead of
 * ever reaching claude/deepseek/gemini.
 */
const assert = require('assert');
const { runCascade } = require('../../warp/dispatch/cascade.js');
const { providersFor } = require('../../lib/seam/adapters/warp-cascade.js');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

async function testAsync(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

async function run() {
  // WCF-001 — the exact manifest reproduction: provider[0] throws
  // (ollama-timeout-shaped error), cascade must still try provider[1].
  await testAsync('WCF-001', 'runCascade advances to the next provider when generate() throws, instead of dying on the first', async () => {
    const calls = [];
    const result = await runCascade({
      providers: ['ollama', 'claude'],
      maxAttempts: 3,
      generate: async (provider) => {
        calls.push(provider);
        if (provider === 'ollama') {
          throw new Error('ollama dispatch failed: huihui_ai/qwen2.5-coder-abliterate:7b timed out after 120000ms');
        }
        return 'real output';
      },
      validate: (output) => ({ ok: output === 'real output', failures: output ? [] : ['no output'] }),
    });
    assert.deepStrictEqual(calls, ['ollama', 'claude']);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.output, 'real output');
  });

  await testAsync('WCF-002', 'a thrown failure is recorded on the attempt (not silently dropped) when the whole cascade still exhausts', async () => {
    const result = await runCascade({
      providers: ['ollama'],
      maxAttempts: 1,
      generate: async () => { throw new Error('ollama dispatch failed: timeout'); },
      validate: () => ({ ok: false, failures: ['unreachable'] }),
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.exhausted, true);
    assert.strictEqual(result.attempts.length, 1);
    assert.strictEqual(result.attempts[0].error, 'ollama dispatch failed: timeout');
  });

  test('WCF-003', 'providersFor puts an explicit preferredProvider first, ahead of the LAW_I default', () => {
    const order = providersFor({ preferredProvider: 'deepseek', seam_id: 'x' }, null);
    assert.strictEqual(order[0], 'deepseek');
  });

  // §0.39.280 BS13 — contract changed on purpose (James: "why claude? set to chatgpt"): a chosen provider is the only one
  // tried; the fallback chain applies only when nothing was chosen (WCF-005).
  test('WCF-004', 'providersFor with a preferred provider tries ONLY that provider — no fall-through to one nobody chose', () => {
    const order = providersFor({ preferredProvider: 'gemini', seam_id: 'x' }, null);
    assert.deepStrictEqual(order, ['gemini']);
  });

  test('WCF-005', 'providersFor with no preference at all is unchanged from before this fix', () => {
    const order = providersFor({ seam_id: 'x' }, null);
    assert.deepStrictEqual(order, ['ollama', 'chatgpt', 'claude']);
  });

  test('WCF-006', "providersFor doesn't duplicate a preferred provider already in the base list", () => {
    const order = providersFor({ preferredProvider: 'claude', seam_id: 'x' }, null);
    assert.deepStrictEqual(order, ['claude']);   // §0.39.280 BS13 — only the chosen one
  });

  test('WCF-007', 'warp-build-dispatch.js threads opts.preferAgent into the record as preferredProvider', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../idearium/spec-engine/warp-build-dispatch.js'), 'utf8');
    assert.ok(/preferredProvider:\s*opts\.preferAgent/.test(src));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
