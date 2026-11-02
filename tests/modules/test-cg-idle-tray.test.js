'use strict';
// run-all: timeout 60000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cg-idle-tray.test.js — CA1, 0.60.366. Map: docs/2026-11-02-cos-the-application-phasemap.spec CA1 · Spec: clear-glass/spec/tray.spec.
 * James, 2026-11-02: "clearglass needs a setting for automatically minimizing to tray after a period of time."
 *   IT-01 decide: off by default; hides only past his period; never while sound plays or an automation runs; not when already hidden
 *   IT-02 start: hides once per idle stretch; input starts a new stretch
 *   IT-03 the tray icon is a real image file; the option defaults to off; the General page has the row; main wires it with the OS idle time
 */
const assert = require('assert'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const T = require(path.join(ROOT, 'clear-glass/src/main/idle-tray.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
(async () => {
  console.log('\n◎  Clear Glass to the tray after no input (CA1)\n');
  await test('IT-01', 'off by default; past the period only; never while playing or running; not when hidden', () => {
    assert.strictEqual(T.decide({ idleSec: 99999 }).hide, false, 'off by default');
    assert.strictEqual(T.decide({ minutes: 7, idleSec: 99999 }).hide, false, 'only his periods');
    assert.match(T.decide({ minutes: 5, idleSec: 120 }).why, /idle 120 s of 300 s/);
    assert.deepStrictEqual(T.decide({ minutes: 5, idleSec: 300 }), { hide: true, why: 'no input for 5 min' });
    assert.match(T.decide({ minutes: 5, idleSec: 900, audible: true }).why, /playing sound/);
    assert.match(T.decide({ minutes: 5, idleSec: 900, activeRuns: 2 }).why, /2 automation run/);
    assert.strictEqual(T.decide({ minutes: 5, idleSec: 900, anyVisible: false }).hide, false);
    assert.strictEqual(T.decide({ minutes: 5, idleSec: null }).hide, false, 'unreadable idle time hides nothing');
  });
  await test('IT-02', 'hides once per idle stretch; input starts a new one', async () => {
    let st = { minutes: 5, idleSec: 400 }, hides = 0;
    const w = T.start({ everyMs: 1e9, read: () => st, hide: () => hides++ });
    await w.tick(); await w.tick(); assert.strictEqual(hides, 1, 'once while he stays idle');
    st = { minutes: 5, idleSec: 3 }; await w.tick(); st = { minutes: 5, idleSec: 301 }; await w.tick();
    assert.strictEqual(hides, 2, 'input, then idle again → hidden again'); w.stop();
  });
  await test('IT-03', 'a real tray icon; the option off by default; the General row; main wired to the OS idle time', () => {
    const png = fs.readFileSync(path.join(ROOT, 'clear-glass/assets/tray.png'));
    assert.strictEqual(png.slice(1, 4).toString(), 'PNG'); assert.ok(png.length > 100);
    assert.ok(/trayAfterIdleMin:\s+0,/.test(fs.readFileSync(path.join(ROOT, 'clear-glass/src/options/store.js'), 'utf8')));
    assert.ok(/Go to the tray after no input/.test(fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/settings/sections/general.js'), 'utf8')));
    const m = fs.readFileSync(path.join(ROOT, 'clear-glass/src/main/index.js'), 'utf8');
    assert.ok(/require\('\.\/idle-tray'\)\.start\(/.test(m) && /powerMonitor\.getSystemIdleTime\(\)/.test(m) && /isCurrentlyAudible\(\)/.test(m) && /activeRuns\(\)\.length/.test(m));
    assert.ok(!/const icon = nativeImage\.createEmpty\(\);\n  tray = new Tray/.test(m), 'no longer an empty icon');
  });
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exit(failed ? 1 : 0);
})();
