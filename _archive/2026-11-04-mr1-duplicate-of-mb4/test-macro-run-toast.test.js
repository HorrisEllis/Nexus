'use strict';
/**
 * tests/modules/test-macro-run-toast.test.js — a running macro says its step and can be paused; a recording says so (MR1, 0.60.299)
 * James, 2026-11-04: "also gating needs to hault. macros need a toast when executing. with a steps counter, pause and play. skip and previous.
 * also when macros are recording a recording indicator in the taost when recording macros."
 *
 *   MR-01  a run as him: each step is said (n of m); pause holds it (no step runs), skip leaves out the step about to run, previous runs the one
 *          before it again, play goes on, stop ends it; done is said
 *   MR-02  a gate that stays closed halts the run at that step: the state is failed, with what the gate saw
 *   MR-03  in Clear Glass: the toast shows the macro, "Step n of m", what the step does; ⏸ becomes ▶ when paused; its buttons send the
 *          controls; a failed run keeps its reason; the recording card has its red dot, the steps recorded and Stop
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(20); } return false; }

(async () => {
  console.log('\n⬡  A macro run\'s step, its controls, and the recording indicator (MR1)\n');
  const M = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/macro.js'));
  const Bridge = require(CG('src/ipc/bridge.js'));
  // a bridge with the real macro tool; the page is a stand-in that records each step it was asked to do
  function bridgeWith(runStepImpl) {
    const states = [], ran = [];
    const self = { macroTool: { execute: (a) => M.execute({ ...a, runStep: async (s) => { if (s.action === 'type') ran.push(s.data.text); return runStepImpl ? runStepImpl(s) : { ok: true, result: {} }; } }) },
      driver: null, mesh: null, _broadcast: (ch, d) => { if (ch === 'macros:runState') states.push({ ...d }); } };
    self.runMacroAsPerson = Bridge.prototype.runMacroAsPerson.bind(self);
    self._macroRunControl = Bridge.prototype._macroRunControl.bind(self);
    return { self, states, ran };
  }
  const steps = ['one', 'two', 'three', 'four'].map(t => ({ action: 'type', data: { selector: '#x', text: t } }));

  await test('MR-01', 'each step said; pause holds; skip leaves out the next; previous runs the one before again; play; stop; done', async () => {
    assert.ok((await M.execute({ action: 'create', name: 'mr-four', steps })).ok);
    // a slow page, so the controls land between steps
    const { self, states, ran } = bridgeWith(async () => { await wait(60); return { ok: true, result: {} }; });
    const p = self.runMacroAsPerson({ name: 'mr-four', agentId: 'a', url: 'https://example.com/', skipSnapshot: true, quiet: true });
    assert.ok(await until(() => states.length), 'a state was said');
    const runId = states[0].runId;
    assert.deepStrictEqual([states[0].name, states[0].i, states[0].total, states[0].state], ['mr-four', 0, 4, 'running']);
    assert.match(states[0].label, /^type #x/);
    assert.ok(self._macroRunControl(runId, 'pause').ok);
    assert.ok(await until(() => states.some(s => s.state === 'paused')), 'paused');
    const at = ran.length; await wait(250);
    assert.strictEqual(ran.length, at, 'no step runs while paused');
    self._macroRunControl(runId, 'skip');                 // paused before "two": skip it
    assert.ok(await until(() => states.some(s => s.skipped === 1)));
    self._macroRunControl(runId, 'play');
    const r = await p;
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepStrictEqual(ran, ['one', 'three', 'four'], 'skip left out "two": ' + JSON.stringify(ran));
    assert.ok(r.results.some(x => x.step === 1 && x.skipped), 'the result says it was skipped');
    // previous: paused before "two", previous runs "one" again
    const pv = bridgeWith(async () => { await wait(60); return { ok: true, result: {} }; });
    const pp = pv.self.runMacroAsPerson({ name: 'mr-four', agentId: 'a', url: 'https://example.com/', skipSnapshot: true, quiet: true });
    assert.ok(await until(() => pv.states.length));
    pv.self._macroRunControl(pv.states[0].runId, 'pause');
    assert.ok(await until(() => pv.states.some(s => s.state === 'paused')));
    pv.self._macroRunControl(pv.states[0].runId, 'previous');
    pv.self._macroRunControl(pv.states[0].runId, 'play');
    assert.ok((await pp).ok);
    assert.deepStrictEqual(pv.ran, ['one', 'one', 'two', 'three', 'four'], 'previous ran "one" again: ' + JSON.stringify(pv.ran));
    assert.strictEqual(states[states.length - 1].state, 'done');
    // stop
    const b = bridgeWith(async () => { await wait(60); return { ok: true, result: {} }; });
    const p2 = b.self.runMacroAsPerson({ name: 'mr-four', agentId: 'a', url: 'https://example.com/', skipSnapshot: true, quiet: true });
    assert.ok(await until(() => b.states.length));
    b.self._macroRunControl(b.states[0].runId, 'stop');
    const r2 = await p2;
    assert.ok(r2.stopped && /stopped by you at step/.test(r2.error), JSON.stringify(r2));
    assert.strictEqual(b.states[b.states.length - 1].state, 'stopped');
    assert.ok(b.ran.length < 4);
    assert.strictEqual(b.self._macroRunControl('nope', 'play').ok, false);
    assert.strictEqual(b.self._macroRunControl(b.states[0].runId, 'jump').ok, false);
  });

  await test('MR-02', 'a gate that stays closed halts the run at that step, with what it saw', async () => {
    assert.ok((await M.execute({ action: 'create', name: 'mr-gated', steps: [steps[0], { action: 'type', data: { selector: '#y', text: 'two' }, gate: { text: 'never shown', retries: 1, timeoutMs: 150 } }, steps[2]] })).ok);
    const { self, states, ran } = bridgeWith(async (s) => (s.action === 'get_text' || s.action === 'read_page' || s.action === 'evaluate' ? { ok: true, result: 'a page without it' } : { ok: true, result: {} }));
    const r = await self.runMacroAsPerson({ name: 'mr-gated', agentId: 'a', url: 'https://example.com/', skipSnapshot: true, quiet: true });
    assert.ok(!r.ok && r.failedAtStep === 1 && /gate/.test(r.error), JSON.stringify(r).slice(0, 300));
    assert.ok(!ran.includes('three'), 'nothing after the closed gate ran');
    const last = states[states.length - 1];
    assert.deepStrictEqual([last.state, last.i], ['failed', 1]);
    assert.match(last.error, /gate/);
  });

  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/r/')) { const f = CG('renderer/' + path.basename(req.url)); res.setHeader('Content-Type', (f.endsWith('.css') ? 'text/css' : 'text/javascript') + '; charset=utf-8'); return res.end(fs.readFileSync(f)); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html><head><link rel="stylesheet" href="/r/macro-run-toast.css"></head><body style="background:#0b0e13;height:600px"><script src="/r/macro-run-toast.js"></script></body></html>');
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - MR-03 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) await test('MR-03', 'in Clear Glass: the toast counts the steps, its buttons send the controls, a failure stays, the recording dot', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.goto(base + '/');
    await page.evaluate(() => {
      window.sent = []; window.subs = {};
      const api = { onRunState: (cb) => { window.subs.run = cb; }, onRecState: (cb) => { window.subs.rec = cb; }, runControl: async (id, cmd) => { window.sent.push([id, cmd]); return { ok: true }; },
        recordStatus: async () => ({ recording: true, steps: 3 }), recordStop: async (a) => { window.sent.push(['stop-rec', a]); return { ok: true }; } };
      window.CGMacroToast.mount(api);
      window.subs.run({ runId: 'r1', name: 'Fiverr gig - choose category', i: 1, total: 3, label: 'choose SELECT A SUBCATEGORY → AI Development', state: 'running' });
    });
    const read = () => page.evaluate(() => { const c = document.querySelector('.mrt-card[data-run="r1"]'); return { state: c.dataset.state, name: c.querySelector('.mrt-name').textContent, step: c.querySelector('.mrt-step').textContent, what: c.querySelector('.mrt-what').textContent, play: c.querySelectorAll('.mrt-ctl .mrt-btn')[1].textContent, ctl: !c.querySelector('.mrt-ctl').hidden, err: c.querySelector('.mrt-err').textContent }; });
    const first = await read(); assert.deepStrictEqual(first, { state: 'running', name: 'Fiverr gig - choose category', step: 'Step 2 of 3', what: 'choose SELECT A SUBCATEGORY → AI Development', play: '⏸', ctl: true, err: '' }, JSON.stringify(first));
    for (const i of [0, 1, 2, 3]) await page.evaluate((k) => document.querySelectorAll('.mrt-card[data-run="r1"] .mrt-ctl .mrt-btn')[k].click(), i);
    assert.deepStrictEqual(await page.evaluate(() => window.sent), [['r1', 'previous'], ['r1', 'pause'], ['r1', 'skip'], ['r1', 'stop']]);
    await page.evaluate(() => window.subs.run({ runId: 'r1', name: 'Fiverr gig - choose category', i: 1, total: 3, label: 'x', state: 'paused' }));
    assert.strictEqual((await read()).play, '▶');
    await page.evaluate(() => { document.querySelectorAll('.mrt-card[data-run="r1"] .mrt-ctl .mrt-btn')[1].click(); });
    assert.deepStrictEqual((await page.evaluate(() => window.sent)).pop(), ['r1', 'play']);
    await page.evaluate(() => window.subs.run({ runId: 'r1', name: 'Fiverr gig - choose category', i: 1, total: 3, label: 'x', state: 'failed', error: 'gate: "AI Development" is not shown (after 3 attempts)' }));
    const f = await read();
    assert.deepStrictEqual([f.state, f.ctl, f.err], ['failed', false, 'gate: "AI Development" is not shown (after 3 attempts)']);
    await page.evaluate(() => window.subs.rec({ recording: true, agentId: 'default', name: 'fiverr overview' }));
    await page.waitForFunction(() => /3 steps recorded/.test((document.querySelector('.mrt-rec .mrt-step') || {}).textContent || ''));
    const rec = await page.evaluate(() => ({ dot: !!document.querySelector('.mrt-rec .mrt-dot'), name: document.querySelector('.mrt-rec .mrt-name').textContent, chip: document.querySelector('.mrt-rec .mrt-chip').textContent, anim: getComputedStyle(document.querySelector('.mrt-rec .mrt-dot')).animationName }));
    assert.deepStrictEqual(rec, { dot: true, name: '“fiverr overview”', chip: 'Recording', anim: 'mrt-pulse' });
    await page.evaluate(() => document.querySelector('.mrt-rec .mrt-btn').click());
    assert.deepStrictEqual((await page.evaluate(() => window.sent)).pop(), ['stop-rec', 'default']);
    await page.evaluate(() => window.subs.rec({ recording: false }));
    assert.strictEqual(await page.evaluate(() => !!document.querySelector('.mrt-rec')), false);
    try { await page.evaluate(() => window.subs.run({ runId: 'r2', name: 'Fiverr gig - choose category', i: 0, total: 3, label: 'choose SELECT A CATEGORY → Programming & Tech', state: 'running' })); await page.evaluate(() => window.subs.rec({ recording: true, agentId: 'default', name: 'fiverr overview' })); await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(require('os').tmpdir(), 'macro-run-toast.png') }); } catch (_) {}
    await page.close();
  });
  if (browser) try { await browser.close(); } catch (_) {}
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
