'use strict';
// tests/modules/test-repo-settings-ui.test.js — 0.39.310 VP7 (docs/2026-10-05-verified-primitives-phasemap.spec)
// James: "the settings tab needs to be cleaned up. Like the desktop envirement settings are shown at all times. Those
// need to be hidden or show when you clikc the button. Also the iframes. Needs to be rebuilt cleaner and more
// organized. With catagories of options like github. Not in a long list. In tabs."
//
// §4.1 — the UI in a real browser (Playwright/Chromium): the REAL repo-settings.js, repo-environment.js and
// agent-blocks.js, against a stubbed api() that answers like idearium's routes. Pins: categories on the left, one
// pane at a time; no iframe in any pane until a button asks (Hat & tools is itself the click); the desktop settings
// hidden until clicked and hidden again on a second click; the environment's option list behind a button; the prompt
// blocks rendered once; the category remembered. Plus source checks: app.js no longer renders the whole console in an
// iframe nor the blocks twice; settings.html opens on ?tab= and hides its strip in &single=1.
// Playwright is not a project dependency: without it the browser part is SKIPPED, said, never passed.
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', '..');
const UI = path.join(ROOT, 'idearium', 'ui');
let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-ui-'));
  const css = fs.readFileSync(path.join(UI, 'index.html'), 'utf8').match(/\/\* §0\.39\.310 VP7[\s\S]*?@media \(max-width:760px\)\{[^\n]*\n/)[0];
  const src = (f) => pathToFileURL(path.join(UI, 'js', f)).href;
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div id="repo-subtab-settings"></div>
<script>
  const CALLS = [];
  const API_BASE = 'http://idearium.test';
  const REPO = { uuid: 'r1', name: 'daw', compartmentId: 'c1', source: 'test', specUuid: 's1' };
  let CURRENT_API_REPO = REPO;
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast() {}
  function openSettingsConsole() {} function openRepoDesktop() {} function addApiRepoFile() {} function forkApiRepo() {} function exportApiRepo() {} function openDeleteRepoModal() {}
  function renderRepoAgentSettings(repo) { const el = document.getElementById('repo-agents-section'); if (el) el.innerHTML = '<div class="agent-ok">agent for ' + repo.uuid + '</div>'; }
  async function api(p) {
    CALLS.push(p);
    if (p.endsWith('/agent/blocks')) return { blocks: [{ id: 'persona', label: 'Persona', enabled: true, when: 'always', text: '{persona}' }, { id: 'build-context', label: 'Build: relations', enabled: true, when: 'build', text: '{build}' }], placeholders: {} };
    if (p.endsWith('/environment')) return { check: { ready: false, downloaded: { ok: true, files: 3 }, configured: { ok: true, stacks: [] }, vm: { available: false, reason: 'no qemu' }, plan: {} },
      options: {}, catalogue: [{ key: 'apt', type: 'list', default: [], group: 'packages', does: 'Debian packages' }, { key: 'desktop', type: 'bool', default: true, group: 'desktop', does: 'xfce' }] };
    return {};
  }
</script>
<script src="${src('agent-blocks.js')}"></script>
<script src="${src('repo-environment.js')}"></script>
<script src="${src('repo-settings.js')}"></script>
</body></html>`);
  return path.join(dir, 'index.html');
}

async function main() {
  const APP = fs.readFileSync(path.join(UI, 'js', 'app.js'), 'utf8');
  const ENV = fs.readFileSync(path.join(UI, 'js', 'repo-environment.js'), 'utf8');
  const SET = fs.readFileSync(path.join(UI, 'settings.html'), 'utf8');
  const INDEX = fs.readFileSync(path.join(UI, 'index.html'), 'utf8');

  await test('RS-01', 'source: the whole-console iframe and the second copy of the prompt blocks are gone; the module is loaded', () => {
    assert.ok(!/repoSettingsConsoleEmbed\(/.test(APP + ENV), 'no whole-console embed is rendered');
    assert.ok(!/function renderRepoSettings/.test(APP), 'renderRepoSettings lives in repo-settings.js');
    assert.ok(!/<div id="agent-blocks-section"><\/div>/.test(APP), 'the agent section no longer carries the blocks');
    assert.ok(/<script src="js\/repo-settings\.js"><\/script>/.test(INDEX));
    assert.ok(/html\.single #tabs/.test(SET) && /get\('single'\) === '1'/.test(SET) && /get\('tab'\)/.test(SET), 'settings.html: ?tab= and &single=1');
  });

  let chromium = null;
  try { ({ chromium } = require('playwright')); } catch (_) { /* not a project dependency */ }
  if (!chromium) { console.log('  - RS-02…RS-07 SKIPPED: playwright is not installed here (not a project dependency) — the browser checks did not run'); skipped += 6; return; }
  let browser;
  try { browser = await chromium.launch(); }   // PLAYWRIGHT_BROWSERS_PATH, when set, says where chromium is
  catch (e) { console.log(`  - RS-02…RS-07 SKIPPED: chromium could not start (${e.message.split('\n')[0]})`); skipped += 6; return; }
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(harness()).href);
    await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} renderRepoSettings(REPO); });

    await test('RS-02', 'categories on the left in groups, one pane at a time, General first', async () => {
      const groups = await page.$$eval('.rs-group', els => els.map(e => e.textContent));
      assert.deepStrictEqual(groups, ['Repository', 'Agent', 'Environment']);
      const items = await page.$$eval('.rs-item[data-rs]', els => els.map(e => e.dataset.rs));
      assert.deepStrictEqual(items, ['general', 'repository', 'agent', 'prompt', 'hat', 'environment', 'desktop']);
      assert.strictEqual(await page.$$eval('.rs-pane', e => e.length), 1);
      assert.strictEqual(await page.textContent('.rs-head h3'), 'General');
      assert.strictEqual(await page.$$eval('.rs-item.on', e => e.length), 1);
    });

    await test('RS-03', 'no iframe in any pane until a button asks for it (Hat & tools is itself the click)', async () => {
      for (const id of ['general', 'repository', 'agent', 'prompt', 'environment', 'desktop']) {
        await page.click(`.rs-item[data-rs="${id}"]`);
        await page.waitForTimeout(30);
        assert.strictEqual(await page.$$eval('iframe', e => e.length), 0, `${id} shows no iframe on open`);
        assert.strictEqual(await page.$$eval('.rs-item.on', els => els.map(e => e.dataset.rs).join()), id);
      }
      await page.click('.rs-item[data-rs="hat"]');
      const src = await page.getAttribute('iframe.rs-embed', 'src');
      assert.ok(/tab=hat&embed=1&single=1/.test(src), src);
    });

    await test('RS-04', 'the desktop settings are hidden until clicked, and hidden again on a second click', async () => {
      await page.click('.rs-item[data-rs="desktop"]');
      assert.strictEqual(await page.isHidden('#rs-desktop-settings'), true);
      assert.strictEqual(await page.$$eval('iframe', e => e.length), 0);
      await page.click('button:has-text("show desktop settings")');
      assert.strictEqual(await page.isVisible('#rs-desktop-settings'), true);
      assert.ok(/tab=env&embed=1&single=1/.test(await page.getAttribute('#rs-desktop-settings iframe', 'src')));
      await page.click('button:has-text("hide desktop settings")');
      assert.strictEqual(await page.isHidden('#rs-desktop-settings'), true);
      assert.strictEqual(await page.$$eval('iframe', e => e.length), 0, 'hidden means unloaded');
    });

    await test('RS-05', 'the environment\'s option list is behind a button', async () => {
      await page.click('.rs-item[data-rs="environment"]');
      await page.waitForSelector('#repo-env-section .ds-label');
      assert.strictEqual(await page.$$eval('.env-row', e => e.length), 0, 'options hidden by default');
      await page.click('button:has-text("show options (2)")');
      assert.strictEqual(await page.$$eval('.env-row', e => e.length), 2);
      await page.click('button:has-text("hide options")');
      assert.strictEqual(await page.$$eval('.env-row', e => e.length), 0);
    });

    await test('RS-06', 'the prompt blocks render once, in the Prompt category only; the agent section has none', async () => {
      await page.click('.rs-item[data-rs="agent"]');
      assert.ok(await page.isVisible('.agent-ok'));
      assert.strictEqual(await page.$$eval('#agent-blocks-section', e => e.length), 0);
      await page.click('.rs-item[data-rs="prompt"]');
      await page.waitForSelector('#ab-persona');
      assert.strictEqual(await page.$$eval('#agent-blocks-section', e => e.length), 1);
      assert.strictEqual(await page.$$eval('#ab-persona', e => e.length), 1);
    });

    await test('RS-07', 'the category is remembered; nothing threw', async () => {
      await page.click('.rs-item[data-rs="environment"]');
      const saved = await page.evaluate(() => { try { return localStorage.getItem('idearium.repoSettings.category'); } catch (_) { return 'blocked'; } });
      assert.ok(saved === 'environment' || saved === 'blocked', saved);
      assert.deepStrictEqual(errors, []);
    });
  } finally { await browser.close(); }
}

main().then(() => {
  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped (reasons above)` : ''}`);
  process.exit(failed ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
