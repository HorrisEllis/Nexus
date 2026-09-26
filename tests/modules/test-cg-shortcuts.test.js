'use strict';
/**
 * tests/modules/test-cg-shortcuts.test.js — §0.39.265
 *
 * James: "add keyboard shortcuts including macro support."
 *   - clear-glass/src/shortcuts/registry.js: key presses → accelerators,
 *     normalizing, the "never steal typing" rule, one key ↔ one action,
 *     macro:/workflow: actions, defaults + overrides.
 *   - options store: shortcuts persist as overrides; reset restores defaults.
 *   - main: shortcuts are caught in before-input-event for the chrome AND the
 *     page inside it (a webview's keys never reach browser.js), macros run in
 *     the window the key was pressed in, the old Ctrl+J-only handler is gone.
 *   - renderer: every browser action has a handler; preload exposes the API.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}
const CG = path.join(__dirname, '../../clear-glass');
const R = require(path.join(CG, 'src/shortcuts/registry.js'));
const read = (rel) => fs.readFileSync(path.join(CG, rel), 'utf8');

(async () => {
  console.log('\n  keyboard shortcuts');

  await test('key presses become accelerators the same way in main (Electron input) and in Settings', () => {
    assert.strictEqual(R.accelFromInput({ key: 'k', control: true, shift: true, code: 'KeyK' }), 'Ctrl+Shift+K');
    assert.strictEqual(R.accelFromInput({ key: '!', control: true, shift: true, code: 'Digit1' }), 'Ctrl+Shift+1', 'Shift+1 binds to 1, not "!"');
    assert.strictEqual(R.accelFromInput({ key: 'ArrowLeft', alt: true }), 'Alt+Left');
    assert.strictEqual(R.accelFromInput({ key: 'F11' }), 'F11');
    assert.strictEqual(R.accelFromInput({ key: 'Control', control: true }), null, 'a bare modifier is not a shortcut');
    assert.strictEqual(R.normalize('shift+ctrl+k'), 'Ctrl+Shift+K');
    assert.strictEqual(R.normalize('CmdOrCtrl+,'), 'Ctrl+,');
  });

  await test('a shortcut can never steal ordinary typing', () => {
    for (const a of ['K', 'Shift+K', 'Shift+1', 'Space', 'Enter']) assert.strictEqual(R.isSafe(a), false, a);
    for (const a of ['Ctrl+K', 'Alt+Shift+Z', 'F5', 'Meta+K']) assert.strictEqual(R.isSafe(a), true, a);
    assert.match(R.bind({}, 'Shift+K', 'tab.new').error, /steal ordinary typing/);
  });

  await test('every default is safe, unique and names a real action', () => {
    const ids = new Set(R.ACTIONS.map(a => a.id));
    const keys = R.ACTIONS.filter(a => a.keys).map(a => R.normalize(a.keys));
    assert.strictEqual(new Set(keys).size, keys.length, 'no two actions share a default key');
    for (const [k, v] of Object.entries(R.DEFAULT_BINDINGS)) { assert.ok(R.isSafe(k), k); assert.ok(ids.has(v), v); assert.strictEqual(R.normalize(k), k, `${k} is normalized`); }
  });

  await test('one key does one thing, one action keeps one key; binding back to the default leaves no override', () => {
    let r = R.bind({}, 'Ctrl+T', 'macro:apply');
    assert.strictEqual(r.replaced, 'tab.new');
    assert.strictEqual(R.effective(r.overrides)['Ctrl+T'], 'macro:apply');
    assert.ok(!Object.values(R.effective(r.overrides)).includes('tab.new'), 'New tab lost its key rather than two keys fighting');
    r = R.bind(r.overrides, 'Ctrl+Shift+K', 'macro:apply');
    assert.strictEqual(R.effective(r.overrides)['Ctrl+Shift+K'], 'macro:apply');
    assert.strictEqual(R.effective(r.overrides)['Ctrl+T'], undefined, 'the macro\'s old key was freed');
    r = R.bind(r.overrides, 'Ctrl+T', 'tab.new');
    assert.deepStrictEqual(r.overrides, { 'Ctrl+Shift+K': 'macro:apply' });
    assert.deepStrictEqual(R.unbind(r.overrides, 'Ctrl+W').overrides['Ctrl+W'], null, 'removing a default is stored as null');
    assert.strictEqual(R.effective(R.unbind({}, 'Ctrl+W').overrides)['Ctrl+W'], undefined);
  });

  await test('macro and workflow actions are valid; anything else is refused', () => {
    assert.ok(R.isValidAction('macro:apply-upwork') && R.isValidAction('workflow:0f3a-bc') && R.isValidAction('page.find'));
    assert.ok(!R.isValidAction('rm -rf') && !R.isValidAction('workflow:../x') && !R.isValidAction(''));
    assert.strictEqual(R.describe('macro:apply'), 'Run macro “apply”');
    assert.strictEqual(R.describe('workflow:w1', { workflows: [{ id: 'w1', name: 'Digest' }] }), 'Run workflow “Digest”');
  });

  await test('the options store keeps only the user\'s changes, and reset brings the defaults back', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-shortcuts-'));
    const orig = process.env.HOME; process.env.HOME = home;
    delete require.cache[require.resolve(path.join(CG, 'src/options/store.js'))];
    const O = require(path.join(CG, 'src/options/store.js'));
    const o = new O(); await o.load();
    assert.deepStrictEqual(o.getShortcuts().bindings, R.DEFAULT_BINDINGS);
    const s = o.setShortcut('ctrl+shift+u', 'macro:apply-upwork');
    assert.strictEqual(s.bindings['Ctrl+Shift+U'], 'macro:apply-upwork');
    assert.deepStrictEqual(o.getShortcuts().overrides, { 'Ctrl+Shift+U': 'macro:apply-upwork' });
    assert.ok(o.setShortcut('K', 'tab.new').error);
    o.removeShortcut('Ctrl+W');
    assert.strictEqual(o.getShortcuts().bindings['Ctrl+W'], undefined);
    assert.deepStrictEqual(o.resetShortcuts().bindings, R.DEFAULT_BINDINGS);
    process.env.HOME = orig; fs.rmSync(home, { recursive: true, force: true });
  });

  await test('main catches shortcuts for the chrome and the page inside it; macros run in that window', () => {
    const main = read('src/main/index.js');
    const i = main.indexOf('// ── Keyboard shortcuts — §0.39.265'), block = main.slice(i, main.indexOf('// ── Shutdown', i));
    assert.ok(i > 0);
    assert.ok(/contents\.hostWebContents \|\| contents/.test(block), 'a webview page maps to the window that embeds it');
    assert.ok(/Shortcuts\.accelFromInput\(input\)/.test(block) && /nexusOptions\.getShortcuts\(\)\.bindings/.test(block));
    assert.ok(/macroTool\.execute\(\{ action: 'run', name, agentId: owner \? owner\.agentId : 'default' \}\)/.test(block));
    assert.ok(/mesh\.runWorkflow\(action\.slice\(9\), 'shortcut'\)/.test(block));
    assert.ok(/host === settingsWin\.webContents\) return/.test(block), 'Settings can record keys without triggering them');
    assert.ok(!/_isLibraryKey/.test(main), 'the Ctrl+J-only handler is replaced (Ctrl+J is cg.library\'s default)');
  });

  await test('the renderer handles every browser action; preload and bridge expose the API', () => {
    const js = read('renderer/browser.js');
    const i = js.indexOf('const SHORTCUT_ACTIONS = {'), block = js.slice(i, js.indexOf('\n  };', i));
    for (const a of R.ACTIONS.filter(x => !['cg.library', 'cg.settings'].includes(x.id))) assert.ok(block.includes(`'${a.id}':`), `renderer handles ${a.id}`);
    assert.ok(/cg\.shortcuts\?\.onAction\(/.test(js));
    const pre = read('src/preload/index.js'), br = read('src/ipc/bridge.js');
    for (const ch of ['shortcuts:list', 'shortcuts:set', 'shortcuts:remove', 'shortcuts:reset']) {
      assert.ok(pre.includes(`'${ch}'`), `preload ${ch}`); assert.ok(br.includes(`ipcMain.handle('${ch}'`), `bridge ${ch}`);
    }
    assert.ok(pre.includes("ipcRenderer.on('shortcut:action'"));
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
