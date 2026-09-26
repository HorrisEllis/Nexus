'use strict';
/**
 * tests/modules/nexus-options-autoboot.test.js
 *
 * Tests for two real changes added the same session
 * (CLEAR-GLASS-EXPANSION-PLAN-2026-08-23.md, Phase 1 + Phase 2):
 *
 *   1. src/options/store.js — new nested option keys (autoStartOnBoot,
 *      backgroundTabDefaults, accounts) and a real bugfix to set(): the
 *      old shallow merge silently wiped out sibling keys on a partial
 *      nested update (set({autoStartOnBoot:{claude:false}}) deleted
 *      chatgpt/gemini/perplexity entirely, not just left them alone).
 *      Confirmed directly before fixing, not assumed.
 *
 *   2. src/main/index.js's real autoBootSetting decision logic (tested
 *      here as an extracted, equivalent function — main/index.js itself
 *      needs a full Electron environment this test doesn't have) — the
 *      CG_AUTOBOOT_PROVIDERS env var must remain a real, higher-priority
 *      override when explicitly set (even to ''), and NexusOptions'
 *      autoStartOnBoot must only apply when it's genuinely unset.
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
  // ── NexusOptions ──────────────────────────────────────────────────────
  // §TEST-ISOLATION — each test gets its own fresh HOME so a persisted
  // change in one test can't silently leak into the next (found this the
  // hard way: the round-trip test below initially failed because an
  // earlier test's claude:false was still on disk when it ran).
  function freshOptions() {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-options-'));
    process.env.HOME = tmpHome;
    delete require.cache[require.resolve('../../clear-glass/src/options/store.js')];
    const NexusOptions = require('../../clear-glass/src/options/store.js');
    return { NexusOptions, cleanup: () => fs.rmSync(tmpHome, { recursive: true, force: true }) };
  }
  const origHome = process.env.HOME;

  await atest('defaults name every registry provider: ChatGPT + DeepSeek at boot, the rest on first use (0.39.265)', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    const auto = opts.get().autoStartOnBoot;
    const { listProviders, DEFAULT_AUTOSTART } = require('../../clear-glass/src/providers/registry.js');
    assert.deepStrictEqual(Object.keys(auto).sort(), listProviders().map(p => p.id).sort());
    assert.deepStrictEqual(auto, { ...DEFAULT_AUTOSTART });
    assert.deepStrictEqual(Object.keys(auto).filter(k => auto[k]).sort(), ['chatgpt', 'deepseek']);
    cleanup();
  });

  await atest('MIGRATION v2: a stored all-on autoStartOnBoot (never read before) is reset once to the real defaults; later choices stick', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    // an install from before: schema v1, the old all-true default stored
    opts._kv().replaceAll({ _schemaVersion: 1, autoStartOnBoot: { claude: true, chatgpt: true, gemini: true, perplexity: true } });
    await opts.load();
    assert.deepStrictEqual(Object.keys(opts.get().autoStartOnBoot).filter(k => opts.get().autoStartOnBoot[k]).sort(), ['chatgpt', 'deepseek']);
    await opts.set({ autoStartOnBoot: { claude: true } });
    const again = new NexusOptions(); await again.load();
    assert.strictEqual(again.get().autoStartOnBoot.claude, true, 'a choice made after the migration survives');
    cleanup();
  });

  await atest('BUGFIX: a partial nested update no longer wipes sibling keys', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    await opts.set({ autoStartOnBoot: { claude: true } });
    const auto = opts.get().autoStartOnBoot;
    assert.strictEqual(auto.claude, true);
    assert.strictEqual(auto.chatgpt, true, 'chatgpt must survive a claude-only update');
    assert.strictEqual(auto.deepseek, true, 'deepseek must survive a claude-only update');
    assert.strictEqual(auto.gemini, false, 'gemini must survive a claude-only update');
    assert.strictEqual(auto.perplexity, false, 'perplexity must survive a claude-only update');
    cleanup();
  });

  await atest('flat keys still replace wholesale, unaffected by the merge fix', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    await opts.set({ hideToTrayOnClose: false });
    assert.strictEqual(opts.get().hideToTrayOnClose, false);
    cleanup();
  });

  await atest('array keys still replace wholesale (not merged), unaffected by the merge fix', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    await opts.set({ pinnedToolbarButtons: ['btn-mesh'] });
    assert.deepStrictEqual(opts.get().pinnedToolbarButtons, ['btn-mesh']);
    cleanup();
  });

  await atest('a real, persisted change survives a fresh load() (round-trips through disk)', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts1 = new NexusOptions();
    await opts1.load();
    await opts1.set({ autoStartOnBoot: { gemini: true } });
    const opts2 = new NexusOptions();
    await opts2.load();
    assert.strictEqual(opts2.get().autoStartOnBoot.gemini, true);
    assert.strictEqual(opts2.get().autoStartOnBoot.claude, false);
    cleanup();
  });

  // ── §BUGFIX 2026-09-25 — defaultStartUrl real default + one-time
  // migration for an existing install. James: "the ui, its not changed at
  // all... just fix it." Root cause: src/main/index.js's boot path opens
  // the one real startup window with nexusOptions.get().defaultStartUrl,
  // whose default was 'about:blank' since before this store existed —
  // every UI build shipped was real and reachable, just never what the
  // app opened by default. Fixed the default AND added a versioned
  // migration, since load()'s {...DEFAULTS, ...raw} merge means an
  // on-disk file already holding the old literal 'about:blank' would
  // silently out-live any new default forever without one. ─────────────

  function writeRawOptions(tmpHome, raw) {
    const dir = path.join(tmpHome, '.clear-glass');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'nexus-options.json'), JSON.stringify(raw, null, 2), 'utf8');
  }

  await atest('a genuinely fresh install gets the real homepage, not about:blank', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    assert.strictEqual(opts.get().defaultStartUrl, 'http://127.0.0.1:9000/');
    assert.strictEqual(opts.get()._schemaVersion, 2);   // current schema (v2, 0.39.265)
    cleanup();
  });

  await atest('MIGRATION: an existing file with the old about:blank default is upgraded once', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-options-'));
    process.env.HOME = tmpHome;
    writeRawOptions(tmpHome, { defaultStartUrl: 'about:blank', hideToTrayOnClose: true });
    delete require.cache[require.resolve('../../clear-glass/src/options/store.js')];
    const NexusOptions = require('../../clear-glass/src/options/store.js');
    const opts = new NexusOptions();
    await opts.load();
    assert.strictEqual(opts.get().defaultStartUrl, 'http://127.0.0.1:9000/', 'about:blank must be upgraded');
    assert.strictEqual(opts.get()._schemaVersion, 2, 'stamped so this never re-runs');
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  await atest('MIGRATION: a real, already-customized start URL is left alone', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-options-'));
    process.env.HOME = tmpHome;
    writeRawOptions(tmpHome, { defaultStartUrl: 'https://claude.ai/new' });
    delete require.cache[require.resolve('../../clear-glass/src/options/store.js')];
    const NexusOptions = require('../../clear-glass/src/options/store.js');
    const opts = new NexusOptions();
    await opts.load();
    assert.strictEqual(opts.get().defaultStartUrl, 'https://claude.ai/new', 'a real choice must never be silently overwritten');
    assert.strictEqual(opts.get()._schemaVersion, 2, 'still stamped, so the file is marked migrated');
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  await atest('MIGRATION: about:blank chosen AFTER the migration (schema already current) is never re-overwritten', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-options-'));
    process.env.HOME = tmpHome;
    writeRawOptions(tmpHome, { defaultStartUrl: 'about:blank', _schemaVersion: 1 });
    delete require.cache[require.resolve('../../clear-glass/src/options/store.js')];
    const NexusOptions = require('../../clear-glass/src/options/store.js');
    const opts = new NexusOptions();
    await opts.load();
    assert.strictEqual(opts.get().defaultStartUrl, 'about:blank', 'a deliberate post-migration choice must survive');
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  await atest('MIGRATION: the upgrade round-trips through disk (persisted, not just in-memory)', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-options-'));
    process.env.HOME = tmpHome;
    writeRawOptions(tmpHome, { defaultStartUrl: 'about:blank' });
    delete require.cache[require.resolve('../../clear-glass/src/options/store.js')];
    const NexusOptions1 = require('../../clear-glass/src/options/store.js');
    await new NexusOptions1().load();
    delete require.cache[require.resolve('../../clear-glass/src/options/store.js')];
    const NexusOptions2 = require('../../clear-glass/src/options/store.js');
    const opts2 = new NexusOptions2();
    await opts2.load();
    assert.strictEqual(opts2.get().defaultStartUrl, 'http://127.0.0.1:9000/', 'the migrated value must be on disk, not re-derived each load');
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  process.env.HOME = origHome;

  // ── autoBootSetting decision logic (extracted, real equivalent of the
  // logic added to src/main/index.js) ────────────────────────────────────
  // §0.39.265 — the REAL function main/index.js calls (it used to read only the
  // env var, so the options this test covered never took effect)
  const { autoBootList: computeAutoBootSetting } = require('../../clear-glass/src/providers/registry.js');
  const MAIN = fs.readFileSync(path.join(__dirname, '..', '..', 'clear-glass', 'src', 'main', 'index.js'), 'utf8');

  test('main/index.js decides auto-boot with autoBootList(env, options) — the Provider tabs toggles take effect', () => {
    assert.ok(/autoBootList\(process\.env\.CG_AUTOBOOT_PROVIDERS, nexusOptions\.get\(\)\.autoStartOnBoot\)/.test(MAIN));
    assert.ok(!/mesh\.spawn\('deepseek'\)/.test(MAIN), 'DeepSeek boots as a provider tab now, not a separate mesh tab');
  });

  test('every registered provider has its guardian userscript, matching its own hosts (DeepSeek included)', () => {
    const { listProviders } = require('../../clear-glass/src/providers/registry.js');
    assert.ok(listProviders().some(p => p.id === 'deepseek'));
    for (const p of listProviders()) {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', 'guardian', p.userscriptFile), 'utf8');
      assert.ok(p.hosts.some(h => src.includes(`@match        https://${h}/`) || src.includes(`https://${h}/*`)), `${p.userscriptFile} matches ${p.hosts.join(', ')}`);
      assert.ok(new RegExp(`const PROVIDER\\s*=\\s*'${p.id}'`).test(src) || p.id !== 'deepseek', `${p.userscriptFile} reports itself as ${p.id}`);
    }
  });

  test('env var unset — defaults boot ChatGPT and DeepSeek', () => {
    assert.strictEqual(computeAutoBootSetting(undefined, {}), 'chatgpt,deepseek');
  });

  test('env var unset — enabled toggles boot, disabled ones do not', () => {
    const r = computeAutoBootSetting(undefined, { claude: true, chatgpt: false, gemini: true, perplexity: false, deepseek: false });
    assert.strictEqual(r, 'claude,gemini');
  });

  test('env var unset — all disabled resolves to the real "none" skip path', () => {
    const r = computeAutoBootSetting(undefined, { claude: false, chatgpt: false, gemini: false, perplexity: false, deepseek: false });
    assert.strictEqual(r, 'none');
  });

  test('env var EXPLICITLY set to empty string overrides options entirely, not falls through', () => {
    const r = computeAutoBootSetting('', { claude: true, chatgpt: true, gemini: true, perplexity: true });
    assert.strictEqual(r, '', 'must be the real env value, not options-derived');
  });

  test('env var explicitly set to a specific list overrides options entirely, even when options say "all off"', () => {
    const r = computeAutoBootSetting('claude,gemini', { claude: false, chatgpt: false, gemini: false, perplexity: false });
    assert.strictEqual(r, 'claude,gemini');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
