'use strict';
/**
 * tests/modules/clear-glass-eros-autostart.test.js
 *
 * James, 2026-11-13: "can you add an autostart option with erosmanceros?"
 *
 * A real, persisted setting (NexusOptions eros.autostart, Settings > ErosmancerOS) for whether Clear Glass starts
 * ErosmancerOS with itself on boot. Before this, EROS_AUTOSTART (an env var only) was the only control, read once
 * at boot with no UI and no way to change it short of restarting Clear Glass with a different environment.
 *
 *   1. src/options/store.js — DEFAULTS.eros.autostart (default true, matching today's behaviour) and
 *      NexusOptions.decideErosAutostart(envVar, optionAutostart) — the precedence: EROS_AUTOSTART wins when it is
 *      explicitly '0' or '1' (never changes behaviour for anyone already scripting it); otherwise the persisted
 *      option decides.
 *   2. src/main/index.js §14.4 — the real boot decision calls decideErosAutostart (an extracted, equivalent
 *      function tested here directly — main/index.js itself needs a full Electron environment this test doesn't
 *      have, same as this file's own autoBootSetting precedent) — and the GET/POST /eros-supervisor routes that
 *      read and persist it.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
function test(desc, fn) {
  try { fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}
async function atest(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

async function main() {
  // §TEST-ISOLATION (found and fixed building this file, 2026-11-13) — store.js's real storage is JaaKV
  // (src/storage/jaa.js), which resolves its directory from CG_JAA_DIR (checked on every call), NOT from HOME.
  // process.env.HOME alone (the pattern tests/modules/nexus-options-autoboot.test.js used) is a NO-OP on any
  // machine where APPDATA is set — every real Windows install, since OPTIONS_PATH/cgDir() both read
  // `process.env.APPDATA || process.env.HOME`. Confirmed directly, the hard way: an early run of this file's own
  // eros-autostart test, before this fix, wrote test values into this machine's REAL Clear Glass options store
  // (`eros: {autostart:false, someOtherFutureKey:"kept"}`, found and repaired by hand afterward). CG_JAA_DIR is
  // the one override that actually isolates it.
  const origJaaDir = process.env.CG_JAA_DIR, origHome = process.env.HOME;
  function freshOptions() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-eros-autostart-'));
    process.env.CG_JAA_DIR = tmpDir;
    process.env.HOME = tmpDir;   // belt and braces: also isolates OPTIONS_PATH's one-time legacy-file import path
    delete require.cache[require.resolve('../../clear-glass/src/options/store.js')];
    delete require.cache[require.resolve('../../clear-glass/src/storage/jaa.js')];
    const NexusOptions = require('../../clear-glass/src/options/store.js');
    return { NexusOptions, cleanup: () => { fs.rmSync(tmpDir, { recursive: true, force: true }); } };
  }

  await atest('a fresh install defaults to eros.autostart: true, matching today\'s behaviour before this existed', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    assert.strictEqual(opts.get().eros.autostart, true);
    cleanup();
  });

  await atest('a partial update (set({eros:{autostart:false}})) does not wipe a sibling key added to eros later', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    opts.data.eros.someOtherFutureKey = 'kept'; // simulate a sibling key existing already
    await opts.set({ eros: { autostart: false } });
    assert.strictEqual(opts.get().eros.autostart, false);
    assert.strictEqual(opts.get().eros.someOtherFutureKey, 'kept', 'the one-level merge must not drop a sibling key');
    cleanup();
  });

  await atest('the option round-trips through a fresh load, the way Settings > ErosmancerOS reads it after a restart', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    await opts.set({ eros: { autostart: false } });
    const again = new NexusOptions(); await again.load();
    assert.strictEqual(again.get().eros.autostart, false);
    cleanup();
  });

  // restore the real environment now that every store.js test above is done — nothing after this touches disk
  if (origJaaDir === undefined) delete process.env.CG_JAA_DIR; else process.env.CG_JAA_DIR = origJaaDir;
  if (origHome === undefined) delete process.env.HOME; else process.env.HOME = origHome;

  // ── decideErosAutostart: the precedence (extracted, real equivalent of main/index.js §14.4) ──────────────────
  // a pure static function, no I/O — read directly, no isolation needed
  delete require.cache[require.resolve('../../clear-glass/src/options/store.js')];
  const decide = require('../../clear-glass/src/options/store.js').decideErosAutostart;

  test('env var unset, no option saved yet (undefined) — defaults on', () => {
    assert.strictEqual(decide(undefined, undefined), true);
  });
  test('env var unset, option explicitly off — off', () => {
    assert.strictEqual(decide(undefined, false), false);
  });
  test('env var unset, option explicitly on — on', () => {
    assert.strictEqual(decide(undefined, true), true);
  });
  test('EROS_AUTOSTART=0 overrides an option left on', () => {
    assert.strictEqual(decide('0', true), false);
  });
  test('EROS_AUTOSTART=1 overrides an option saved off', () => {
    assert.strictEqual(decide('1', false), true);
  });
  test('an EROS_AUTOSTART value other than 0/1 (unrecognised) falls through to the option, not a silent on', () => {
    assert.strictEqual(decide('maybe', false), false);
    assert.strictEqual(decide('maybe', true), true);
  });

  // ── source checks: main/index.js actually calls this, and serves the two routes the Settings toggle needs ────
  const MAIN = fs.readFileSync(path.join(__dirname, '..', '..', 'clear-glass', 'src', 'main', 'index.js'), 'utf8');
  test('main/index.js decides with NexusOptions.decideErosAutostart(env, nexusOptions option) — not its own inline logic', () => {
    assert.ok(/NexusOptions\.decideErosAutostart\(process\.env\.EROS_AUTOSTART, nexusOptions\?\.\s*get\(\)\?\.\s*eros\?\.\s*autostart\)/.test(MAIN));
  });
  test('GET /eros-supervisor reports autostartOption, and why it is not running when that is the reason', () => {
    assert.ok(/autostartOption: _erosAutostart/.test(MAIN));
    assert.ok(/!_erosAutostart \? 'autostart is off' : null/.test(MAIN));
  });
  test('POST /eros-supervisor/autostart persists through nexusOptions.set, never writes a plain file of its own', () => {
    assert.ok(/u === '\/eros-supervisor\/autostart' && req\.method === 'POST'/.test(MAIN));
    assert.ok(/nexusOptions\.set\(\{ eros: \{ \.\.\.\(nexusOptions\.get\(\)\.eros \|\| \{\}\), autostart: on \} \}\)/.test(MAIN));
  });

  // ── the Settings UI really offers the toggle, wired to that route ──────────────────────────────────────────
  const EROS_UI = fs.readFileSync(path.join(__dirname, '..', '..', 'clear-glass', 'renderer', 'settings', 'sections', 'eros.js'), 'utf8');
  test('Settings > ErosmancerOS renders a real toggle that posts to /eros-supervisor/autostart', () => {
    assert.ok(/'\/eros-supervisor\/autostart', \{ method: 'POST', body: \{ on \}/.test(EROS_UI));
    assert.ok(/toggle\(sup \? sup\.autostartOption !== false : true/.test(EROS_UI));
  });

  console.log(`\n   ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
