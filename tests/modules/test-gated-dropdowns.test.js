'use strict';
/**
 * tests/modules/test-gated-dropdowns.test.js — gated dropdowns in the node, keys in macros and automation, the bundled node upgraded, the
 * floating CLI pinned (KB4–KB7, 0.60.280)
 * James, 2026-10-29: "the drop downs, still aren't working. make the gates for them gated and have them check for the correct value. remember
 * this is the nodes in the settings, not hardcoded, so add capabilities to the actual backend. like the gates, add the keyboard shortcuts per
 * site to the macros and automation. that way we can bind arrow keys, or numbers to each drop down menu value. / the clearglass floating menu
 * button, can you make that an option to pin it?"
 *
 *   GD-01  a step's gate is validated when the macro is made: choice needs is and which dropdown; unknown keys are refused, said
 *   GD-02  a gated step: the dropdown shows the wrong value → the step runs again until it shows the right one; never → the run stops with
 *          what the gate saw; a failed choose with a gate is retried like a closed gate
 *   GD-03  in Clear Glass: readChoice says what a column's dropdown shows; keysFor binds keys to each value; by: 'keys'; press_key ×N
 *   GD-04  the bundled node: v2 is gated; an unedited copy (library file and macro store) is upgraded, an edited one kept with <file>.new
 *          beside it, a deleted one stays deleted
 *   GD-05  pin: the option saved and every window told; ✕ collapses when pinned; Settings › General's toggle (in Clear Glass)
 *   GD-06  a workflow's "Press a key" presses N times
 */
require('../../lib/test-sandbox.js').ensure();
process.env.JAA_DATA_DIR = require('path').join(require('os').tmpdir(), `gd-test-${Date.now()}`);
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  Gated dropdowns, keys in macros, the node upgraded, the CLI pinned\n');
  const GE = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/gate-eval.js'));
  const M = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/macro.js'));
  const macro = (a) => M.execute(a);

  await test('GD-01', 'gates validated when the macro is made', async () => {
    assert.ok(GE.validateGate({ choice: { column: 'BASIC', is: '3' }, retries: 2, timeoutMs: 4000 }).ok);
    assert.match(GE.validateGate({ choice: { column: 'BASIC' } }).why, /choice needs is/);
    assert.match(GE.validateGate({ choice: { is: '3' } }).why, /choice needs column, row or selector/);
    assert.match(GE.validateGate({ choice: { column: 'B', is: '3', colour: 'x' } }).why, /unknown choice key/);
    assert.match(GE.validateGate({ retries: 9 }).why, /retries must be an integer from 0 to 5/);
    const bad = await macro({ action: 'create', name: 'gd-bad', steps: [{ action: 'choose', data: { column: 'B', option: '3' }, gate: { choice: { column: 'B' } } }] });
    assert.match(bad.error, /steps\[0\]\.gate: choice needs is/);
  });

  await test('GD-02', 'a gated step runs again until the dropdown shows the right value; never → stops with what it saw', async () => {
    const c = await macro({ action: 'create', name: 'gd-delivery', urlPattern: null, params: ['tier', 'delivery'],
      steps: [{ action: 'choose', data: { column: '{{tier}}', shows: 'DELIVERY TIME', option: '{{delivery}}' }, gate: { choice: { column: '{{tier}}', is: '{{delivery}}' }, retries: 2, timeoutMs: 200 } }] });
    assert.ok(c.ok, JSON.stringify(c));
    // the page: the first pick does not take, the second does
    let shown = 'DELIVERY TIME', picks = 0; const calls = [];
    const runStep = async ({ action, data }) => {
      calls.push(action);
      if (action === 'choose') { picks++; if (picks >= 2) shown = `${data.option} DAYS DELIVERY`; return { ok: true, result: { option: data.option } }; }
      if (action === 'read_choice') return { ok: true, result: { shown, is: data.is, matches: shown.startsWith(String(data.is) + ' ') } };
      return { ok: true, result: {} };
    };
    const r = await macro({ action: 'run', name: 'gd-delivery', agentId: 'a', params: { tier: 'STANDARD', delivery: '5' }, skipSnapshot: true, runStep });
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepStrictEqual([picks, r.results[0].gate.open, r.results[0].gate.attempts], [2, true, 2]);
    assert.strictEqual(r.results[0].gate.saw.choice.got, '5 DAYS DELIVERY');
    // never takes → stops, with what it saw; 1 run + 2 retries
    shown = 'DELIVERY TIME'; picks = -100;
    const r2 = await macro({ action: 'run', name: 'gd-delivery', agentId: 'a', params: { tier: 'PREMIUM', delivery: '14' }, skipSnapshot: true, runStep });
    assert.ok(!r2.ok && r2.failedAtStep === 0, JSON.stringify(r2));
    assert.match(r2.error, /gate: the dropdown shows "DELIVERY TIME", not "14" \(after 3 attempts\)/);
    // a choose that throws, with a gate on it, is retried like a closed gate
    let n = 0; const throwsOnce = async ({ action, data }) => {
      if (action === 'choose') { n++; if (n === 1) return { error: 'choose: "3 DAYS DELIVERY" did not take' }; return { ok: true, result: {} }; }
      if (action === 'read_choice') return { ok: true, result: { shown: '3 DAYS DELIVERY', matches: n >= 2 } };
      return { ok: true, result: {} };
    };
    const r3 = await macro({ action: 'run', name: 'gd-delivery', agentId: 'a', params: { tier: 'BASIC', delivery: '3' }, skipSnapshot: true, runStep: throwsOnce });
    assert.ok(r3.ok && n === 2, JSON.stringify(r3));
  });

  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - GD-03/05 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  const PAGE = `<!doctype html><html><head><style>body{font:14px sans-serif;margin:0} table{margin:40px;border-collapse:collapse} td,th{border:1px solid #ccc;padding:10px;width:200px}
  .dd{cursor:pointer} .menu{position:absolute;width:220px;background:#fff;border:1px solid #888} .menu div{padding:8px} .menu .active{background:#def}</style></head><body>
  <table><tr><th>BASIC</th><th>STANDARD</th><th>PREMIUM</th></tr>
  <tr><td><div class="dd">DELIVERY TIME</div></td><td><div class="dd">DELIVERY TIME</div></td><td><div class="dd">DELIVERY TIME</div></td></tr></table>
  <script>var opts = ['DELIVERY TIME','1 DAY DELIVERY'].concat([2,3,4,5,6,7,10,14].map(function(n){ return n + ' DAYS DELIVERY'; }));
  var menu = null, owner = null, hi = 0, presses = 0;
  function close(){ if (menu) { menu.remove(); menu = null; owner = null; } }
  function paint(){ Array.prototype.forEach.call(menu.children, function(c, i){ c.className = i === hi ? 'active' : ''; }); }
  document.querySelectorAll('.dd').forEach(function(dd){ dd.addEventListener('click', function(){ close(); owner = dd; hi = 0;
    menu = document.createElement('div'); menu.className = 'menu'; var r = dd.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + scrollY) + 'px';
    opts.forEach(function(t){ var o = document.createElement('div'); o.textContent = t; menu.appendChild(o); });
    document.body.appendChild(menu); paint(); }); });
  document.addEventListener('keydown', function(e){ presses++; if (!menu) return;
    if (e.key === 'ArrowDown') { hi = Math.min(opts.length - 1, hi + 1); paint(); } else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); paint(); }
    else if (e.key === 'Enter') { owner.textContent = opts[hi]; close(); } });</script></body></html>`;
  if (browser) {
    await test('GD-03', 'in Clear Glass: readChoice; keysFor binds keys to each value; by keys; press_key ×N', async () => {
      const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
      await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
      const ClearDriver = require(CG('src/driver/index.js'));
      const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
      const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' }, KEY = { Down: ['ArrowDown', 40], Up: ['ArrowUp', 38], Enter: ['Enter', 13] };
      d._getWebContents = () => ({ executeJavaScript: (c) => page._eval(c), getURL: () => 'https://www.fiverr.com/edit', sendInputEvent: (e) => {
        if (MAP[e.type]) return page._send('Input.dispatchMouseEvent', { type: MAP[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : (e.button || 'left'), buttons: e.type === 'mouseDown' ? 1 : 0, clickCount: e.type === 'mouseMove' ? 0 : (e.clickCount || 1) });
        const k = KEY[e.keyCode] || [e.keyCode, String(e.keyCode).charCodeAt(0)];
        if (e.type === 'keyDown') return page._send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k[0], code: k[0], windowsVirtualKeyCode: k[1] });
        if (e.type === 'keyUp') return page._send('Input.dispatchKeyEvent', { type: 'keyUp', key: k[0], windowsVirtualKeyCode: k[1] }); } });
      const fast = { openWait: [40, 60], pickWait: [20, 30], settleWait: [60, 80], optionsWaitMs: 2000, via: 'native', by: 'person', spotlight: false };
      // keys bound to each value in the node: "3" is Down ×3 + Enter on this menu (a wrong binding is caught by the read-back)
      const a = await d.exec({ agentId: 'w', action: 'choose', column: 'BASIC', shows: 'DELIVERY TIME', option: '3', keysFor: { '3': 'ArrowDown ArrowDown ArrowDown Enter' }, ...fast });
      assert.deepStrictEqual([a.option, a.clickedBy, a.tried.length], ['3 DAYS DELIVERY', 'keys (bound)', 1], JSON.stringify(a));
      const ok = await d.exec({ agentId: 'w', action: 'readChoice', column: 'BASIC', is: '3' });
      assert.deepStrictEqual([ok.shown, ok.matches, ok.from], ['3 DAYS DELIVERY', true, 'marked']);
      const no = await d.exec({ agentId: 'w', action: 'readChoice', column: 'BASIC', is: '5' });
      assert.strictEqual(no.matches, false);
      const b = await d.exec({ agentId: 'w', action: 'choose', column: 'STANDARD', shows: 'DELIVERY TIME', option: '7', ...fast, pick: 'keys' });
      assert.deepStrictEqual([b.option, b.clickedBy, /^arrows/.test(b.tried[0])], ['7 DAYS DELIVERY', 'keys', true], JSON.stringify(b));
      const before = await page.evaluate(() => presses);
      const p = await d.exec({ agentId: 'w', action: 'pressKey', key: 'Down', times: 4 });
      assert.deepStrictEqual([p.times, (await page.evaluate(() => presses)) - before], [4, 4]);
      await assert.rejects(d.exec({ agentId: 'w', action: 'choose', column: 'PREMIUM', shows: 'DELIVERY TIME', option: '5', ...fast, pick: 'sideways' }), /pick is auto, pointer, keys or number/);
      await page.close();
    });
  }

  await test('GD-04', 'the bundled node: v2 gated; unedited copies upgraded (file and store), an edited one kept with <file>.new, a deleted one stays', async () => {
    const N = require(path.join(ROOT, 'lib/automation-nodes.js'));
    const BUNDLED = CG('automation/nodes'), F = 'fiverr-gig-choose-delivery.macro';
    const v2 = N.parse(fs.readFileSync(path.join(BUNDLED, F), 'utf8'));
    assert.deepStrictEqual(v2.supersedes, ['c4e22f7fde7d67ff']);
    assert.deepStrictEqual(v2.payload.steps[1].gate, { choice: { column: '{{tier}}', is: '{{delivery}}' }, retries: 2, timeoutMs: 4000 });
    const v1text = require('child_process').execFileSync('git', ['show', `36945ff1:clear-glass/automation/nodes/${F}`], { cwd: ROOT, encoding: 'utf8' });
    const v1 = N.parse(v1text);
    assert.strictEqual(N.macroFingerprint(v1.payload), 'c4e22f7fde7d67ff');
    // library files
    const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-lib-'));
    fs.writeFileSync(path.join(lib, F), v1text);
    let s = N.seedBundled(lib, BUNDLED);
    assert.ok(s.upgraded.includes(F), JSON.stringify(s));
    assert.strictEqual(N.macroFingerprint(N.parse(fs.readFileSync(path.join(lib, F), 'utf8')).payload), N.macroFingerprint(v2.payload));
    const edited = v1text.replace("shows: DELIVERY TIME", "shows: DELIVERY TIMES");
    fs.writeFileSync(path.join(lib, F), edited);
    s = N.seedBundled(lib, BUNDLED);
    assert.ok(s.offered.includes(F + '.new') && fs.readFileSync(path.join(lib, F), 'utf8') === edited && fs.existsSync(path.join(lib, F + '.new')), JSON.stringify(s));
    fs.unlinkSync(path.join(lib, 'fiverr-gig-overview-steps.workflow'));
    s = N.seedBundled(lib, BUNDLED);
    assert.ok(!fs.existsSync(path.join(lib, 'fiverr-gig-overview-steps.workflow')), 'his delete stands');
    // the macro store
    const store = new Map([[v1.payload.name, { ...v1.payload }]]);
    const io = { getMacro: async (n) => (store.has(n) ? { ok: true, macro: store.get(n) } : { error: 'none' }), deleteMacro: async (n) => { store.delete(n); return { ok: true }; }, createMacro: async (m) => { store.set(m.name, m); return { ok: true }; } };
    const node = N.bundledNode(BUNDLED, v1.payload.name);
    let u = await N.upgradeMacro(node, io);
    assert.ok(u.upgraded && /upgraded to its node's version/.test(u.why), JSON.stringify(u));
    assert.ok(store.get(v1.payload.name).steps[1].gate, 'the store now holds the gated one');
    store.set(v1.payload.name, { ...v1.payload, steps: [v1.payload.steps[0], { ...v1.payload.steps[1], data: { ...v1.payload.steps[1].data, shows: 'MY EDIT' } }] });
    u = await N.upgradeMacro(node, io);
    assert.ok(u.kept && /was edited, so it is kept/.test(u.why) && store.get(v1.payload.name).steps[1].data.shows === 'MY EDIT', JSON.stringify(u));
    const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
    assert.ok(/N\.upgradeMacro\(node,/.test(rd('clear-glass/src/ipc/bridge.js')), 'the gig fill upgrades through it');
  });

  await test('GD-05', 'pin: saved, every window told; ✕ collapses when pinned; Settings › General toggle (in Clear Glass)', async () => {
    const FC = require(CG('src/main/float-cli.js'));
    const handlers = {}, sent = [];
    let pinned = false;
    const fakeWin = { isDestroyed: () => false, webContents: { send: (ch, d) => sent.push([ch, d]) } };
    FC.register({ ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; }, on: () => {} }, BrowserWindow: { getAllWindows: () => [fakeWin], fromWebContents: () => null },
      isPinned: () => pinned, setPinned: (on) => { pinned = on; return { ok: true }; } });
    assert.deepStrictEqual(await handlers['floatcli:pinned'](), { ok: true, pinned: false });
    assert.deepStrictEqual(await handlers['floatcli:pin']({}, { pinned: true }), { ok: true, pinned: true });
    assert.ok(pinned && sent.some(([ch, d]) => ch === 'floatcli:pinned' && d.pinned === true), 'every window told');
    const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
    assert.ok(/function hide\(\) \{ if \(pinned\(\)\) \{ size\(false\)/.test(rd('clear-glass/src/main/float-cli.js')), '✕ collapses when pinned');
    assert.ok(/cg\(\)\.floatCli\.pinned\(\)\.then\(\(r\) => \{ if \(r && r\.pinned\) showPinned\(\); \}\)/.test(rd('clear-glass/renderer/shell/shell.js')), 'a browser window shows it at start when pinned');
    assert.ok(/id="fc-pin"/.test(rd('clear-glass/renderer/float-cli.html')));
    if (browser) {
      const { initScript } = require(CG('src/driver/cg-stub.js'));
      const errors = [];
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(initScript({ answers: { 'options.get': { floatCli: { pinned: false } }, 'accounts.list': [], 'floatCli.pin': { ok: true, pinned: true } } }));
      await page.addInitScript('window.ClearGlass.accounts.portal = new Proxy({}, { get: (_, k) => async () => (/list|providers/.test(k) ? [] : {}) });');
      await page.goto(pathToFileURL(CG('renderer/settings.html')).href + '#general');
      await page.waitForTimeout(800);
      const has = await page.evaluate(() => /Pin the floating CLI button/.test(document.body.textContent));
      assert.ok(has, 'the toggle is there');
      await page.evaluate(() => { const row = [...document.querySelectorAll('*')].filter(e => /^Pin the floating CLI button/.test(e.textContent || '') && e.querySelector('input,button,[role="switch"]')).pop();
        const t = row.querySelector('input,button,[role="switch"]'); t.click(); });
      await page.waitForTimeout(300);
      const calls = await page.evaluate(() => window.__cgCalls.filter(c => c.key === 'floatCli.pin').map(c => c.args));
      assert.deepStrictEqual(calls, [[true]]);
      assert.deepStrictEqual(errors, []);
      await page.close();
    }
  });

  await test('GD-06', 'a workflow\'s "Press a key" presses N times', async () => {
    const E = require(path.join(ROOT, 'lib/automation/engine.js'));
    const src = fs.readFileSync(path.join(ROOT, 'lib/automation/engine.js'), 'utf8');
    assert.ok(/const times = Math\.max\(1, Math\.min\(200, parseInt\(cfg\.times, 10\) \|\| 1\)\);/.test(src) && /'pressKey', \{ key: cfg\.key \|\| 'Enter', times \}/.test(src));
    const S = require(path.join(ROOT, 'lib/automation/steps.js'));
    const browserStep = (S.CATALOGUE || S.catalogue || []).find(s => s.type === 'browser');
    assert.ok(browserStep && browserStep.fields.some(f => f.key === 'times' && f.when.action.includes('press')), 'the step editor has Times');
  });

  if (browser) try { await browser.close(); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
