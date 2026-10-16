'use strict';
/**
 * tests/modules/test-warp-rung.test.js — WB1/WB2 (docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec)
 * James, 2026-10-16: "Option 1 (my recommendation): wrap each of those agent calls in WARP ... while the build ladder and
 * RAID still choose which agent runs."
 * Each case can fail: a cache that never promotes, a gate-mode hit, a fresh retry served from cache, or an axiom refusal
 * that lets the reply count would each break one.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-rung-'));
process.env.NEXUS_DATA_ROOT = tmp;
const WR = require(path.join(ROOT, 'lib/warp-rung.js'));
WR._reset();

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

(async () => {
  await test('WR-01', 'cache mode: an identical call retained 3 times is served from WARP with no agent call', async () => {
    let calls = 0;
    const call = async () => { calls++; return { ok: true, text: '{"plan":1}', jobId: 'j' }; };
    for (let i = 0; i < 3; i++) {
      const r = await WR.wrap(call, { kind: 'plan', provider: 'chatgpt', key: 'same prompt', mode: 'cache' });
      assert.ok(r.ok); assert.strictEqual(r.warp.source, 'generated'); assert.strictEqual(r.jobId, 'j', 'the call\'s own fields survive');
    }
    const hit = await WR.wrap(call, { kind: 'plan', provider: 'chatgpt', key: 'same prompt', mode: 'cache' });
    assert.strictEqual(calls, 3, 'the 4th was not sent to the agent');
    assert.strictEqual(hit.warp.source, 'crystal'); assert.strictEqual(hit.text, '{"plan":1}'); assert.strictEqual(hit.warp.cost, 0);
  });

  await test('WR-02', 'a different agent or a different input is a different key', async () => {
    let calls = 0;
    const call = async () => { calls++; return { ok: true, text: 'x' }; };
    await WR.wrap(call, { kind: 'plan', provider: 'claude', key: 'same prompt', mode: 'cache' });
    await WR.wrap(call, { kind: 'plan', provider: 'chatgpt', key: 'another prompt', mode: 'cache' });
    assert.strictEqual(calls, 2);
  });

  await test('WR-03', 'a fresh retry never reads the cache', async () => {
    let calls = 0;
    const r = await WR.wrap(async () => { calls++; return { ok: true, text: 'new' }; }, { kind: 'plan', provider: 'chatgpt', key: 'same prompt', mode: 'cache', fresh: true });
    assert.strictEqual(calls, 1); assert.strictEqual(r.text, 'new'); assert.strictEqual(r.warp.source, 'generated');
  });

  await test('WR-04', 'gate mode never serves from the cache (the work is the side effects)', async () => {
    let calls = 0;
    const call = async () => { calls++; return { ok: true, text: 'built', injects: { injects: [{ path: 'a.js' }] } }; };
    for (let i = 0; i < 5; i++) await WR.wrap(call, { kind: 'phase-build', provider: 'ollama', key: 'k', mode: 'gate' });
    assert.strictEqual(calls, 5);
    const r = await WR.wrap(call, { kind: 'phase-build', provider: 'ollama', key: 'k', mode: 'gate' });
    assert.deepStrictEqual(r.injects, { injects: [{ path: 'a.js' }] }); assert.strictEqual(r.warp.mode, 'gate');
  });

  await test('WR-05', 'a reply failing a hard axiom is refused, with the axiom named', async () => {
    const axioms = [{ id: 'no-todo', severity: 'hard', check: (e) => !/TODO/.test(e.data.output) }];
    const r = await WR.wrap(async () => ({ ok: true, text: 'TODO later' }), { kind: 'plan', provider: 'x', key: 'ax', mode: 'cache', axioms });
    assert.strictEqual(r.ok, false); assert.match(r.error, /no-todo/); assert.strictEqual(r.warp.source, 'rejected');
  });

  await test('WR-06', 'the call\'s own failure and throw reach the caller unchanged', async () => {
    const r = await WR.wrap(async () => ({ ok: false, error: 'provider down' }), { kind: 'plan', provider: 'x', key: 'f', mode: 'cache' });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.error, 'provider down');
    await assert.rejects(WR.wrap(async () => { throw new Error('boom'); }, { kind: 'plan', key: 'g', mode: 'gate' }), /boom/);
  });

  await test('WR-07', 'reject(digest) drops a cached reply a later check found bad', async () => {
    const call = async () => ({ ok: true, text: 'cached' });
    let hit = await WR.wrap(call, { kind: 'plan', provider: 'chatgpt', key: 'same prompt', mode: 'cache' });
    assert.strictEqual(hit.warp.source, 'crystal');
    assert.ok(WR.reject(hit.warp.digest));
    hit = await WR.wrap(call, { kind: 'plan', provider: 'chatgpt', key: 'same prompt', mode: 'cache' });
    assert.strictEqual(hit.warp.source, 'generated');
  });

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
