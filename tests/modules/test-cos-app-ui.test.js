'use strict';
// UI-01..10 (0.60.68 COSA6): the COS window, in jsdom with a fake window.cos (no Electron, no Playwright: AXIOMS 4.1). Draws what the controller says; every button is one call; errors in full.
// Plus CT-01..05: the controller is one exclusive operation per project over the real store/runtime/switch.
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { JSDOM } = require(path.join(__dirname, '..', '..', 'node_modules', 'jsdom'));
const D = path.join(__dirname, '..', '..', 'cos', 'app', 'desktop', 'ui');
const html = fs.readFileSync(path.join(D, 'index.html'), 'utf8').replace(/<script src="[^"]+"><\/script>/g, ''); const js = fs.readFileSync(path.join(D, 'app.js'), 'utf8');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 5).join('\n    ')); failed++; } }
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
const V = (version, o = {}) => ({ version, present: true, current: false, previous: false, verified: true, dataLinked: true, ...o });
const S = (projects) => ({ ok: true, root: 'C:\\Users\\james\\AppData\\Local\\COS', platform: 'win32', inbox: { path: 'C:\\COS\\inbox', pending: 0 }, projects });
const P = (o = {}) => ({ project: 'nexus', current: '0.60.67', previous: '0.60.66', run: { running: true, healthy: true, version: '0.60.67', pid: 7 }, busy: null, versions: [V('0.60.68'), V('0.60.67', { current: true }), V('0.60.66', { previous: true, verified: false })], ...o });
async function boot(initial, over = {}) {
  const calls = []; let st = initial, handler = null;
  const rec = (name, ret) => async (...a) => { calls.push([name, ...a]); const r = typeof ret === 'function' ? ret(...a) : ret; return r; };
  const cos = { state: async () => st, pickZip: rec('pickZip', { path: 'C:\\dl\\nexus-0.60.68.zip' }), importPath: rec('importPath', { ok: true, project: 'nexus', version: '0.60.68', verified: true }), switchTo: rec('switchTo', { ok: true, to: '0.60.68' }),
    rollback: rec('rollback', { ok: true, to: '0.60.66' }), start: rec('start', { ok: true }), stop: rec('stop', { ok: true }), remove: rec('remove', { ok: true }), logs: rec('logs', { ok: true, file: 'x.log', text: 'line one\nline two' }), pathFor: (f) => f.path || '', onEvent: (fn) => { handler = fn; }, ...over };
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'file:///cos/ui/index.html', pretendToBeVisual: true }); const w = dom.window; w.cos = cos; w.confirm = () => true; w.eval(js); await tick();
  return { w, d: w.document, calls, set: (s) => { st = s; }, ev: (e) => handler && handler(e), $: (s) => w.document.querySelector(s), $$: (s) => [...w.document.querySelectorAll(s)] };
}
const click = (w, e) => e.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  await test('UI-01 draws the project: running and healthy, the three versions, current/previous/unverified tags', async () => {
    const u = await boot(S([P()])); assert.match(u.$('#root').textContent, /COS/); assert.match(u.$('.project .pill').textContent, /running 0\.60\.67/); assert.ok(u.$('.project .pill').classList.contains('ok'));
    assert.deepStrictEqual(u.$$('tr[data-version]').map(r => r.dataset.version), ['0.60.68', '0.60.67', '0.60.66']); assert.match(u.$('tr[data-version="0.60.67"]').textContent, /current/); assert.match(u.$('tr[data-version="0.60.66"]').textContent, /previous.*unverified/s);
    assert.strictEqual(u.$('#empty').hidden, true);
  });
  await test('UI-02 no projects: the empty state says how to install one and where the inbox is', async () => {
    const u = await boot(S([])); assert.strictEqual(u.$('#empty').hidden, false); assert.match(u.$('#inbox-path').textContent, /COS\\inbox/); assert.strictEqual(u.$$('.project').length, 0);
  });
  await test('UI-03 a running-but-not-answering project is shown as such, not as healthy', async () => {
    const u = await boot(S([P({ run: { running: true, healthy: false, version: '0.60.67', pid: 7 } })])); assert.ok(u.$('.project .pill').classList.contains('bad')); assert.match(u.$('.project .pill').textContent, /NOT answering/);
  });
  await test('UI-04 Switch to this calls switchTo(project, version); the current version\'s button is off', async () => {
    const u = await boot(S([P()])); assert.strictEqual(u.$('tr[data-version="0.60.67"] [data-act="switch"]').disabled, true); click(u.w, u.$('tr[data-version="0.60.68"] [data-act="switch"]')); await tick();
    assert.deepStrictEqual(u.calls.find(c => c[0] === 'switchTo'), ['switchTo', 'nexus', '0.60.68']); assert.match(u.$('#banners').textContent, /nexus is now 0\.60\.68/);
  });
  await test('UI-05 a failed switch shows the whole reason, that it rolled back, and what is running again', async () => {
    const u = await boot(S([P()]), { switchTo: async () => ({ ok: false, error: '0.60.68 did not come up: port 7820 already in use', rolledBack: true, restoredData: true, backOn: '0.60.67' }) });
    click(u.w, u.$('tr[data-version="0.60.68"] [data-act="switch"]')); await tick(); const t = u.$('.banner.err').textContent; assert.match(t, /port 7820 already in use/); assert.match(t, /Rolled back and your data was restored; 0\.60\.67 is running again/);
  });
  await test('UI-06 Stop and Start: Stop when running, Start when stopped; Start is off with no current version', async () => {
    const u = await boot(S([P()])); const b = u.$('[data-act="stop"]'); assert.ok(b); click(u.w, b); await tick(); assert.ok(u.calls.some(c => c[0] === 'stop' && c[1] === 'nexus'));
    const u2 = await boot(S([P({ run: { running: false }, current: null })])); assert.strictEqual(u2.$('[data-act="start"]').disabled, true); assert.match(u2.$('[data-act="start"]').title, /Switch to a version first/);
    const u3 = await boot(S([P({ run: { running: false } })])); click(u3.w, u3.$('[data-act="start"]')); await tick(); assert.ok(u3.calls.some(c => c[0] === 'start'));
  });
  await test('UI-07 Remove asks first, is off for the current version, and calls remove; Roll back is off without a previous version', async () => {
    const u = await boot(S([P()])); assert.strictEqual(u.$('tr[data-version="0.60.67"] [data-act="remove"]').disabled, true); let asked = 0; u.w.confirm = () => { asked++; return false; };
    click(u.w, u.$('tr[data-version="0.60.66"] [data-act="remove"]')); await tick(); assert.strictEqual(asked, 1); assert.ok(!u.calls.some(c => c[0] === 'remove'), 'declined: nothing removed');
    u.w.confirm = () => true; click(u.w, u.$('tr[data-version="0.60.66"] [data-act="remove"]')); await tick(); assert.deepStrictEqual(u.calls.find(c => c[0] === 'remove'), ['remove', 'nexus', '0.60.66']);
    const u2 = await boot(S([P({ previous: null })])); assert.strictEqual(u2.$('[data-act="rollback"]').disabled, true);
  });
  await test('UI-08 a busy project shows what it is doing and every button on it is off', async () => {
    const u = await boot(S([P({ busy: 'switching to 0.60.68' })])); assert.match(u.$('.project .pill').textContent, /switching to 0\.60\.68/); assert.match(u.$('.busy').textContent, /buttons are off/);
    assert.ok(u.$$('.project button').filter(b => b.dataset.act !== 'logs').every(b => b.disabled), 'every action button is off while it works'); assert.strictEqual(u.$('[data-act="logs"]').disabled, false, 'the log stays open to watch a slow start');
  });
  await test('UI-09 Import: the picked zip is installed, and the banner OFFERS the switch (never starts it on its own)', async () => {
    const u = await boot(S([P()])); click(u.w, u.$('#btn-import')); await tick(); assert.deepStrictEqual(u.calls.find(c => c[0] === 'importPath'), ['importPath', 'C:\\dl\\nexus-0.60.68.zip']);
    const t = u.$('.banner.info').textContent; assert.match(t, /nexus 0\.60\.68 is installed and verified\. It has not been started/); assert.ok(!u.calls.some(c => c[0] === 'switchTo'), 'no switch without a click');
    click(u.w, [...u.$$('.banner button')].find(b => /Switch to it now/.test(b.textContent))); await tick(); assert.ok(u.calls.some(c => c[0] === 'switchTo'));
  });
  await test('UI-10 an unverified import says so; a refused zip shows the reason; a dropped non-zip is refused; an inbox arrival is announced', async () => {
    const u = await boot(S([P()]), { importPath: async () => ({ ok: true, project: 'nexus', version: '0.60.69', verified: false }) }); await u.w.COSUI.importPath('C:\\x.zip'); assert.match(u.$('.banner.info').textContent, /NOT verified/);
    const u2 = await boot(S([P()]), { importPath: async () => ({ ok: false, error: 'checksum mismatch (SHA256SUMS): refused, nothing was extracted' }) }); await u2.w.COSUI.importPath('C:\\x.zip'); assert.match(u2.$('.banner.err').textContent, /checksum mismatch/);
    const u3 = await boot(S([P()])); const ev = new u3.w.Event('drop', { bubbles: true, cancelable: true }); ev.dataTransfer = { files: [{ name: 'notes.txt', path: 'C:\\notes.txt' }] }; u3.d.dispatchEvent(ev); await tick(); assert.match(u3.$('.banner.err').textContent, /notes\.txt is not a \.zip/);
    const u4 = await boot(S([P()])); u4.ev({ type: 'policy', project: 'nexus', version: '0.60.70', action: 'offer', policy: 'ask' }); await tick(); assert.match(u4.$('.banner.info').textContent, /0\.60\.70 is installed.*It has not been started/);
  });
  await test('UI-11 Log opens the panel with the log text; Close hides it', async () => {
    const u = await boot(S([P()])); click(u.w, u.$('[data-act="logs"]')); await tick(); assert.strictEqual(u.$('#logs-panel').hidden, false); assert.match(u.$('#logs').textContent, /line two/); assert.match(u.$('#logs-title').textContent, /nexus: x\.log/);
    click(u.w, u.$('#btn-logs-close')); assert.strictEqual(u.$('#logs-panel').hidden, true);
  });

  // ── the controller, over the real store/runtime/switch ──
  const { Controller } = require('../../cos/app/controller.js'); const Zip = require('../../lib/zip.js'); const net = require('net'); const Store = require('../../cos/app/store.js'); const RT = require('../../cos/app/runtime.js');
  const free = () => new Promise(ok => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
  const SERVER = `const http=require('http');require('js-yaml');http.createServer((q,r)=>r.end('{}')).listen(+process.env.AUTOPILOT_STATUS_PORT,'127.0.0.1');`;
  function zip(dir, v, main) { const t = `nexus-${v}`, f = path.join(dir, t + '.zip'); fs.writeFileSync(f, Zip.create([{ path: `${t}/VERSION`, data: Buffer.from(v + '\n') }, { path: `${t}/package.json`, data: Buffer.from('{"dependencies":{"js-yaml":"^4"}}') }, { path: `${t}/nexus/autopilot.js`, data: Buffer.from(main) }])); return f; }
  await test('UI-12 the update policy: the select shows the stored value, changing it calls setSetting, and a refused value is shown in full', async () => {
    const st = { ...S([P()]), settings: { update: { policy: 'auto' } } }; const u = await boot(st, { setSetting: async (k, v) => (v === 'off' ? { ok: false, error: 'update.policy cannot be changed right now' } : { ok: true }) });
    assert.strictEqual(u.$('#policy').value, 'auto'); u.$('#policy').value = 'ask'; u.$('#policy').dispatchEvent(new u.w.Event('change', { bubbles: true })); await tick(); assert.match(u.$('#banners').textContent, /Update policy: ask/);
    u.$('#policy').value = 'off'; u.$('#policy').dispatchEvent(new u.w.Event('change', { bubbles: true })); await tick(); assert.match(u.$('.banner.err').textContent, /cannot be changed right now/);
  });
  await test('UI-13 the status strip says each project, its version and whether it answers, and a release that is waiting', async () => {
    const u = await boot({ ...S([P(), P({ project: 'other', current: '1.0.0', run: { running: false } })]), waiting: { nexus: '0.60.69' }, settings: { update: { policy: 'auto' } } });
    const t = u.$('#strip').textContent; assert.match(t, /nexus 0\.60\.67 running/); assert.match(t, /other 1\.0\.0 stopped/); assert.match(t, /0\.60\.69 waiting/);
  });
  await test('UI-14 what the policy did is said plainly: switched, failed and rolled back, waiting with its reason, off', async () => {
    const mk = async (policy, over) => { const u = await boot(S([P()]), { importPath: async () => ({ ok: true, project: 'nexus', version: '0.60.69', verified: true, policy }) }); await u.w.COSUI.importPath('C:\\x.zip'); return u.$('#banners').textContent; };
    assert.match(await mk({ action: 'switched', ok: true }), /COS switched to it \(update policy: auto\).*Roll back/);
    assert.match(await mk({ action: 'switched', ok: false, result: { error: 'did not answer in 60 s' } }), /failed and was rolled back: did not answer in 60 s/);
    assert.match(await mk({ action: 'waiting', reason: 'nexus is running and COS has no idle signal from it yet' }), /Not switched yet: nexus is running and COS has no idle signal/);
    assert.match(await mk({ action: 'none', policy: 'off' }), /Update policy is off: nothing switches by itself/);
  });
  await test('UI-15 the command line pane: opens, sends the line, streams output (colour codes removed), shows Stop while running and idle after the exit', async () => {
    const u = await boot(S([P()]), { shRun: async (l) => ({ ok: true }), shCancel: async () => ({ ok: true }) }); assert.strictEqual(u.$('#console').hidden, true); click(u.w, u.$('#btn-console')); assert.strictEqual(u.$('#console').hidden, false);
    u.$('#sh-in').value = 'npm run start:all'; u.$('#sh-form').dispatchEvent(new u.w.Event('submit', { bubbles: true, cancelable: true })); await tick();
    assert.match(u.$('#sh-out').textContent, /> npm run start:all/); assert.strictEqual(u.$('#sh-state').textContent, 'running'); assert.strictEqual(u.$('#sh-stop').disabled, false);
    u.ev({ type: 'sh.data', text: '\x1b[32m✓ started\x1b[0m\n' }); await tick(); assert.match(u.$('#sh-out').textContent, /✓ started/); assert.ok(!/\x1b/.test(u.$('#sh-out').textContent));
    u.ev({ type: 'sh.exit', code: 0 }); await tick(); assert.strictEqual(u.$('#sh-state').textContent, 'idle'); assert.strictEqual(u.$('#sh-stop').disabled, true);
  });
  await test('UI-16 a refused command shows its reason; Stop calls shCancel; Up recalls the last line; clear empties the pane', async () => {
    let cancelled = 0; const u = await boot(S([P()]), { shRun: async (l) => (/bad/.test(l) ? { ok: false, error: 'a command is still running: press Stop first' } : { ok: true }), shCancel: async () => { cancelled++; return { ok: true }; } });
    const send = async (v) => { u.$('#sh-in').value = v; u.$('#sh-form').dispatchEvent(new u.w.Event('submit', { bubbles: true, cancelable: true })); await tick(); };
    await send('bad one'); assert.match(u.$('#sh-out').textContent, /✗ a command is still running/); assert.strictEqual(u.$('#sh-state').textContent, 'idle');
    await send('npm run hello'); click(u.w, u.$('#sh-stop')); await tick(); assert.strictEqual(cancelled, 1);
    u.$('#sh-in').dispatchEvent(new u.w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); assert.strictEqual(u.$('#sh-in').value, 'npm run hello');
    await send('clear'); assert.strictEqual(u.$('#sh-out').textContent, '');
  });
  await test('CT-01 the controller: import, state, switch, state again, stop: the window\'s whole life on real files and processes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-ct-')), dl = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-ctdl-')), port = await free(); const events = [];
    const c = new Controller({ root, opts: { statusPort: port, ports: [port], healthTimeoutMs: 6000, graceMs: 2000, pollMs: 100 }, onEvent: (e) => events.push(e.type + (e.version ? ':' + e.version : '')) });
    assert.strictEqual((await c.state()).projects.length, 0); const imp = c.importZip(zip(dl, '1.0.0', SERVER)); assert.strictEqual(imp.ok, true); let s = await c.state(); assert.strictEqual(s.projects[0].versions[0].version, '1.0.0'); assert.strictEqual(s.projects[0].run.running, false);
    const sw = await c.switchTo('nexus', '1.0.0'); assert.strictEqual(sw.ok, true, JSON.stringify(sw)); s = await c.state(); assert.strictEqual(s.projects[0].run.healthy, true); assert.strictEqual(s.projects[0].current, '1.0.0');
    assert.strictEqual((await c.stop('nexus')).stopped, true); assert.strictEqual((await c.state()).projects[0].run.running, false); assert.ok(events.includes('imported:1.0.0') && events.includes('op.start') && events.includes('op.done'));
    assert.strictEqual((await c.start('nexus')).ok, true); assert.strictEqual((await c.state()).projects[0].run.healthy, true); const all = await c.stopAll(); assert.strictEqual(all[0].stopped, true);
  });
  await test('CT-02 one operation per project at a time: a second switch while the first runs is refused with a reason', async () => {
    const c = new Controller({ root: '/x', sw: { switchTo: () => new Promise(r => setTimeout(() => r({ ok: true }), 150)) } }); const a = c.switchTo('nexus', '1.0.0'); const b = await c.switchTo('nexus', '1.0.1');
    assert.strictEqual(b.ok, false); assert.strictEqual(b.reason, 'busy'); assert.match(b.error, /busy \(switching to 1\.0\.0\)/); assert.strictEqual((await a).ok, true); assert.strictEqual((await c.switchTo('nexus', '1.0.1')).ok, true);
  });
  await test('CT-03 an exception inside an operation comes back as an error, and the project is not left busy', async () => {
    const c = new Controller({ root: '/x', sw: { switchTo: async () => { throw new Error('disk full'); } } }); const r = await c.switchTo('nexus', '1.0.0'); assert.strictEqual(r.ok, false); assert.match(r.error, /disk full/); assert.strictEqual(c.busy.size, 0);
  });
  await test('CT-04 start with no current version says to switch first', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-ct4-')); const c = new Controller({ root }); const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-ctdl4-')); c.importZip(zip(dl, '1.0.0', SERVER)); const r = await c.start('nexus'); assert.strictEqual(r.ok, false); assert.match(r.error, /switch to one first/);
  });
  await test('CT-05 the desktop files are only a window: main.js and preload.js load no project logic of their own', () => {
    const main = fs.readFileSync(path.join(__dirname, '..', '..', 'cos', 'app', 'desktop', 'main.js'), 'utf8'); assert.match(main, /require\('\.\.\/controller\.js'\)/); assert.ok(!/require\('\.\.\/(store|runtime|switch)\.js'\)/.test(main.replace(/const Store = require\('\.\.\/store\.js'\)/, '')), 'main.js calls the controller, not runtime/switch directly');
    const pre = fs.readFileSync(path.join(__dirname, '..', '..', 'cos', 'app', 'desktop', 'preload.js'), 'utf8'); assert.ok(/contextBridge\.exposeInMainWorld\('cos'/.test(pre)); assert.ok(!/nodeIntegration:\s*true/.test(main) && /contextIsolation: true/.test(main) && /sandbox: true/.test(main));
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
