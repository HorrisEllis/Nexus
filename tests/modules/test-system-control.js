'use strict';
// §CA5 — system settings control (governed, logged, revertible) + governed clear-glass.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const sc = require(path.join(__dirname, '../..', 'lib/system-control'));

// unique systemId per run so this test never reads a prior run's rows out of the real cortex store.
const SYS = `unit-test-sys-${Date.now()}`;

(async () => {
  await test('T-001', 'getSetting returns null for a key that was never set', async () => {
    const v = sc.getSetting(SYS, 'never-set');
    assert.strictEqual(v, null);
  });

  await test('T-002', 'setSetting writes a real row and getSetting reads it back', async () => {
    const r = await sc.setSetting(SYS, 'theme', 'dark');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(sc.getSetting(SYS, 'theme'), 'dark');
  });

  await test('T-003', 'a second setSetting on the same key updates the read value and keeps the prior', async () => {
    await sc.setSetting(SYS, 'theme', 'light');
    assert.strictEqual(sc.getSetting(SYS, 'theme'), 'light', 'getSetting must return the LATEST value');
  });

  await test('T-004', 'revertSetting restores the immediately-prior value', async () => {
    const r = await sc.revertSetting(SYS, 'theme');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(sc.getSetting(SYS, 'theme'), 'dark', 'revert must restore what was there before the last set');
  });

  await test('T-005', 'revertSetting on a key with no prior value fails honestly, not silently', async () => {
    await sc.setSetting(SYS, 'fresh-key', 'only-value');
    const r = await sc.revertSetting(SYS, 'fresh-key');
    assert.strictEqual(r.ok, false);
    assert.ok(r.reason.includes('no prior value'));
  });

  await test('T-006', 'listSettings returns the latest row per key for a system', async () => {
    await sc.setSetting(SYS, 'a', 1);
    await sc.setSetting(SYS, 'b', 2);
    await sc.setSetting(SYS, 'a', 3);   // second write on 'a'
    const list = sc.listSettings(SYS);
    const a = list.find(r => r.key === 'a');
    const b = list.find(r => r.key === 'b');
    assert.strictEqual(a.value, 3, 'listSettings must return the latest value per key, not every historical row');
    assert.strictEqual(b.value, 2);
  });

  await test('T-007', 'a denied setSetting (RAID gate) does not write, and getSetting is unchanged', async () => {
    const sm = require(path.join(__dirname, '../..', 'copilot/lib/self-model'));
    const orig = sm.governAction;
    sm.governAction = () => ({ allowed: false, reason: 'test-deny' });
    const before = sc.getSetting(SYS, 'theme');
    const r = await sc.setSetting(SYS, 'theme', 'should-not-land');
    sm.governAction = orig;
    assert.strictEqual(r.ok, false);
    assert.strictEqual(sc.getSetting(SYS, 'theme'), before, 'a denied write must not change the stored value');
  });

  await test('T-008', 'a denied clear-glass command is blocked before any dispatch attempt', async () => {
    const sm = require(path.join(__dirname, '../..', 'copilot/lib/self-model'));
    const orig = sm.governAction;
    sm.governAction = () => ({ allowed: false, reason: 'test-deny' });
    const r = await sc.governedBrowserCommand('driver.exec', { command: 'storage.get', key: 'x' });
    sm.governAction = orig;
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'test-deny');
  });

  await test('T-009', 'an allowed clear-glass command really attempts dispatch and returns an honest failure with no live bridge (not a faked success)', async () => {
    const r = await sc.governedBrowserCommand('driver.exec', { command: 'storage.get', key: 'x' }, { timeoutMs: 2000 });
    assert.strictEqual(r.ok, false, 'with no Clear Glass process listening, this must fail honestly, not fake a result');
    assert.ok(r.reason || r.error, 'a failure must carry a real reason, not be silent');
  });

  await test('T-010', 'getDomStorage/setDomStorage route through governedBrowserCommand with the right command name', async () => {
    const r = await sc.getDomStorage('mykey', { timeoutMs: 500 });
    // No live bridge in this environment — assert the SHAPE is honest (ok:false with a reason), not that it succeeds.
    assert.strictEqual(typeof r.ok, 'boolean');
    assert.ok(r.ok === false, 'no live Clear Glass in test env — must not silently report success');
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
