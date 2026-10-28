'use strict';
/**
 * tests/modules/test-fiverr-pace.test.js — the dropdown at a person's pace, with the human mouse (0.60.271)
 * James, 2026-10-28: "it needs delays in between the dropdown menu. like drop down and then click. Also should use electrons digital
 * input and mouse curve from erosmanceros to simulate a human mouse"
 *
 *   FP-01  via auto: ErosmancerOS when wired; when Eros refuses, Electron input instead, and the result says why
 *   FP-02  _choose waits after opening and before the click (openWait, pickWait), in that order, overridable per step
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'); const path = require('path');
const Driver = require(path.join(__dirname, '..', '..', 'clear-glass/src/driver/index.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack}`); failed++; } }

(async () => {
  await test('FP-01', 'auto: Eros when it answers; Electron input when it refuses, said', async () => {
    const calls = [];
    const self = { _pointer: async (a, x) => { calls.push(x.via); if (x.via === 'eros' && self.down) throw new Error('ECONNREFUSED'); return { via: x.via }; }, erosInput: () => {} };
    const hp = Driver.prototype._humanPointer.bind(self);
    assert.strictEqual((await hp('a', { via: 'auto' })).via, 'eros');
    self.down = true; const r = await hp('a', { via: 'auto' });
    assert.strictEqual(r.via, 'native'); assert.match(r.viaWhy, /ErosmancerOS did not take it \(ECONNREFUSED\)/);
    delete self.erosInput; assert.match((await hp('a', { via: 'auto' })).viaWhy, /not wired/);
  });

  await test('FP-02', 'choose: open → wait → read options → wait → click → settle', async () => {
    const log = []; let evals = 0;
    const self = Object.create(Driver.prototype);
    self._getWebContents = () => ({});
    // 0.60.275 — the options are read until they hold still (two reads), and the page is checked for responsiveness (stubbed here)
    self._waitResponsive = async () => true;
    self._evalJs = async (wc, code) => { evals++; if (evals === 1) return { n: 1, native: false, shown: '' }; if (/data-cg-opt/.test(code) && /fresh/.test(code)) { log.push('read'); return ['1 Day', '3 Days', '30 Days']; } return '3 Days'; };
    self._pointer = async (a, x) => { log.push('click:' + x.label); return { via: 'native' }; };
    self._sleep = async (ms) => { log.push('wait:' + Math.round(ms)); };
    const r = await self._choose('a', { column: 'BASIC', shows: 'DELIVERY TIME', option: '3', openWait: [700, 700], pickWait: [400, 400], settleWait: [500, 500] });
    assert.deepStrictEqual(log, ['click:open BASIC', 'wait:700', 'read', 'wait:200', 'read', 'wait:400', 'click:3 Days', 'wait:500']);
    assert.strictEqual(r.option, '3 Days');
    assert.match(r.viaWhy, /not wired/);
  });
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
