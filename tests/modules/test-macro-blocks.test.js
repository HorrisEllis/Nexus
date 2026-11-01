'use strict';
/**
 * tests/modules/test-macro-blocks.test.js — MB1, 0.60.343. Map: docs/2026-11-01-macro-blocks-phasemap.spec MB1.
 * James, 2026-11-01: "i want the macros in the settings to be blocks with settings, gates between them with the delays type and everything
 * else the gates can do". The gate after a step is the gate between two blocks; the real macro runner (macro.js run, with a runStep stub
 * standing for the page, as test-gated-dropdowns does).
 *   MB-01  a gate's delay, backoff and onClosed are validated when the macro is made; wrong ones are refused, said
 *   MB-02  the delay kinds: fixed is its ms; range stays between min and max; human spreads around ms; a pause-only gate opens
 *   MB-03  a delay is waited between two blocks, and said in the run's result
 *   MB-04  backoff: the wait between tries grows (base × factor^n, capped)
 *   MB-05  onClosed skip: the run goes on past a closed gate and says it skipped; stop (the default) stops as before
 *   MB-06  a macro with no new keys runs exactly as before
 */
require('../../lib/test-sandbox.js').ensure();
process.env.JAA_DATA_DIR = require('path').join(require('os').tmpdir(), `mb-test-${Date.now()}`);
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const GE = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/gate-eval.js'));
const M = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/macro.js'));
{ const log = console.log; console.log = (...a) => { if (!/^\[jaa\]/.test(String(a[0]))) log(...a); }; }   // the store's own line would be miscounted by run-all
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const macro = (a) => M.execute(a);
const page = () => { const calls = []; let n = 0; return { calls, runStep: async ({ action, data }) => { calls.push({ action, at: Date.now(), data }); if (action === 'eval') { n++; return { ok: true, result: { url: data && /ready/.test(String(data.code)) ? 'x' : 'x', text: n >= 3 ? 'ready' : 'loading' } }; } return { ok: true, result: {} }; } }; };

(async () => {
  console.log('\n⬡  Macros as blocks: the gate between two blocks — delay, backoff, when closed (MB1)\n');
  await test('MB-01', 'delay, backoff and onClosed validated when the macro is made', async () => {
    assert.ok(GE.validateGate({ delay: { kind: 'human', ms: 800 }, backoff: { baseMs: 100, factor: 2, capMs: 1000 }, onClosed: 'skip' }).ok);
    for (const [g, why] of [[{ delay: { kind: 'soon' } }, /delay kind/], [{ delay: { kind: 'range', min: 9, max: 1 } }, /min ≤ max/], [{ delay: { kind: 'fixed' } }, /needs ms/],
      [{ backoff: { baseMs: 1, factor: 0 } }, /backoff/], [{ onClosed: 'panic' }, /onClosed/]]) assert.match(GE.validateGate(g).why || '', why, JSON.stringify(g));
    const r = await macro({ action: 'create', name: 'mb-bad', urlPattern: null, steps: [{ action: 'navigate', data: { url: 'about:blank' }, gate: { onClosed: 'panic' } }] });
    assert.ok(r.error && /steps\[0\]\.gate: onClosed/.test(r.error), JSON.stringify(r));
  });
  await test('MB-02', 'the delay kinds: fixed, range, human; backoff curve', () => {
    assert.strictEqual(GE.delayMs({ kind: 'fixed', ms: 700 }), 700);
    for (const r of [0, 0.5, 0.999]) { const v = GE.delayMs({ kind: 'range', min: 200, max: 400 }, () => r); assert.ok(v >= 200 && v <= 400, v); }
    const seq = [0, 0.9]; let i = 0; assert.strictEqual(GE.delayMs({ kind: 'human', ms: 1000 }, () => seq[i++ % 2]), 550, 'a quick one, no look away');
    const hs = Array.from({ length: 400 }, () => GE.delayMs({ kind: 'human', ms: 1000 }));
    assert.ok(Math.min(...hs) >= 550 && Math.max(...hs) <= 2950 && new Set(hs).size > 100, 'spread around ms, never the same twice in a row');
    assert.deepStrictEqual([0, 1, 2, 3, 4].map(n => GE.backoffMs({ baseMs: 100, factor: 2, capMs: 1000 }, n)), [100, 200, 400, 800, 1000]);
    assert.strictEqual(GE.delayMs(null), 0);
  });
  await test('MB-03', 'a delay is waited between two blocks and said in the result; a pause-only gate opens', async () => {
    const c = await macro({ action: 'create', name: 'mb-delay', urlPattern: null, steps: [
      { action: 'navigate', data: { url: 'about:blank' }, gate: { delay: { kind: 'fixed', ms: 300 } } }, { action: 'navigate', data: { url: 'about:blank#2' } }] });
    assert.ok(c.ok, JSON.stringify(c));
    const p = page(); const r = await macro({ action: 'run', name: 'mb-delay', agentId: 'a', skipSnapshot: true, runStep: p.runStep });
    assert.ok(r.ok, JSON.stringify(r));
    const navs = p.calls.filter(x => x.action === 'navigate'); assert.ok(navs[1].at - navs[0].at >= 290, `${navs[1].at - navs[0].at} ms between the blocks`);
    assert.strictEqual(r.results[0].gate.delayMs, 300); assert.strictEqual(r.results[0].gate.open, true);
  });
  await test('MB-04', 'backoff: the wait between tries grows', async () => {
    const c = await macro({ action: 'create', name: 'mb-backoff', urlPattern: null, steps: [
      { action: 'navigate', data: { url: 'about:blank' }, gate: { text: 'ready', timeoutMs: 100, retries: 3, backoff: { baseMs: 150, factor: 2 } } }] });
    assert.ok(c.ok, JSON.stringify(c));
    const p = page(); const r = await macro({ action: 'run', name: 'mb-backoff', agentId: 'a', skipSnapshot: true, runStep: p.runStep });
    const navs = p.calls.filter(x => x.action === 'navigate');
    assert.ok(navs.length >= 2, JSON.stringify(r));
    const gaps = navs.slice(1).map((x, i) => x.at - navs[i].at);
    assert.ok(gaps[0] >= 140, `first retry waited ${gaps[0]} ms (base 150)`);
    if (gaps[1] != null) assert.ok(gaps[1] >= 290, `second retry waited ${gaps[1]} ms (150 × 2)`);
  });
  await test('MB-05', 'onClosed skip goes on and says so; stop (the default) stops', async () => {
    const steps = (onClosed) => [{ action: 'navigate', data: { url: 'about:blank' }, gate: { text: 'never there', timeoutMs: 100, retries: 0, ...(onClosed ? { onClosed } : {}) } }, { action: 'navigate', data: { url: 'about:blank#2' } }];
    assert.ok((await macro({ action: 'create', name: 'mb-skip', urlPattern: null, steps: steps('skip') })).ok);
    assert.ok((await macro({ action: 'create', name: 'mb-stop', urlPattern: null, steps: steps(null) })).ok);
    const s = await macro({ action: 'run', name: 'mb-skip', agentId: 'a', skipSnapshot: true, runStep: page().runStep });
    assert.ok(s.ok && s.results[0].skipped && /skipped, as the gate says/.test(s.results[0].error) && s.results[1].ok, JSON.stringify(s));
    const t = await macro({ action: 'run', name: 'mb-stop', agentId: 'a', skipSnapshot: true, runStep: page().runStep });
    assert.ok(!t.ok && t.failedAtStep === 0 && t.results.length === 1, JSON.stringify(t));
  });
  await test('MB-06', 'a macro with no new keys runs as before', async () => {
    assert.ok((await macro({ action: 'create', name: 'mb-plain', urlPattern: null, steps: [{ action: 'navigate', data: { url: 'about:blank' } }, { action: 'navigate', data: { url: 'about:blank#2' } }] })).ok);
    const r = await macro({ action: 'run', name: 'mb-plain', agentId: 'a', skipSnapshot: true, runStep: page().runStep });
    assert.ok(r.ok && r.results.every(x => !x.gate), JSON.stringify(r));
  });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
