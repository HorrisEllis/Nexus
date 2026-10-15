'use strict';
/**
 * tests/modules/test-cg-attention-focus.test.js — 0.60.45: the provider tab stops fighting the person.
 * clear-glass/src/providers/attention.js · account-switch.js capture · renderer/guardian-picker.js · providers/host.js.
 * James (2026-10-15): "still says signed out. also escape does nothing. also i can't sign in on the popup. i click login
 * and it closes the login. like i cant click anywhere without closing any popup or not letting me navigate. also popup
 * windows in clearglass should look nice like the browser, borderless windowed."
 *
 *   AF-01  a panel already up on the tab: a repeat attention request (a provider that flaps) neither shows nor focuses it
 *   AF-02  while the person is using the tab (their input in the last 2 min): no focus taken, and a sign-in page is NOT
 *          sent back to the chat (the person is signing in); untouched, a loginOptional tab still goes back to its chat
 *   AF-03  "Save sign-in to vault" refuses a signed-out tab (no sign-in cookie on the site) and saves a signed-in one
 *   AF-04  the picker always has a way out: Escape on window in the capture phase, right-click, a click on the banner
 *   AF-05  the provider window: no menu bar, dark before the first paint
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const CA = require(path.join(ROOT, 'clear-glass/src/providers/attention.js'));
const AS = require(path.join(ROOT, 'clear-glass/src/providers/account-switch.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 6).join('\n    ') : e.message}`); failed++; }
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));
function fakeWin(id, url) {
  const handlers = {};
  const w = { id, shown: 0, focused: 0, loaded: [], visible: false, isDestroyed: () => false,
    show() { this.shown++; this.visible = true; }, hide() { this.visible = false; }, focus() { this.focused++; }, isVisible() { return this.visible; },
    setSkipTaskbar() {}, setTitle() {}, loadURL: async (u) => { w.loaded.push(u); w.url = u; }, url,
    webContents: { on: (ev, fn) => { handlers[ev] = fn; }, getURL: () => w.url, executeJavaScript: () => new Promise(() => {}) } };   // the panel waits for the person
  w.personTypes = () => handlers['input-event'] && handlers['input-event']();
  return w;
}

(async () => {
  console.log('\ntest-cg-attention-focus — the provider tab stops fighting the person (0.60.45)');

  await test('AF-01', 'a repeat request on a tab whose panel is up: not shown or focused again', async () => {
    const w = fakeWin(1, 'https://chatgpt.com/');
    const H = CA.createAttentionHandler({ providerHost: { windows: new Map([['chatgpt', w]]), agentTabs: new Map() }, assign: async () => ({ ok: true }), checkerSource: null, getProvider: () => ({ name: 'ChatGPT', url: 'https://chatgpt.com' }) });
    await H.attend('chatgpt', { reason: 'no-connect' });
    for (let i = 0; i < 5; i++) { const r = await H.attend('chatgpt', { reason: 'no-connect' }); assert.ok(r.already); }
    assert.deepStrictEqual([w.shown, w.focused], [1, 1], 'once, not six times');
  });

  await test('AF-02', 'the person is signing in: no focus taken, no bounce back to the chat; untouched, it still goes back', async () => {
    const def = { name: 'ChatGPT', url: 'https://chatgpt.com', loginOptional: true };
    // the real order: the tab was shown (its panel closed), the person clicked "Log in" and is on the sign-in page
    const w = fakeWin(2, 'https://chatgpt.com/');
    w.webContents.executeJavaScript = async () => ({ action: 'hide' });
    const H = CA.createAttentionHandler({ providerHost: { windows: new Map([['chatgpt', w]]), agentTabs: new Map() }, assign: async () => ({ ok: true }), checkerSource: null, getProvider: () => def, signedOutWaitMs: 5 });
    await H.attend('chatgpt', { reason: 'no-connect' }); await wait(20);
    const f0 = w.focused;
    w.url = 'https://auth.openai.com/log-in'; w.personTypes();
    await H.attend('chatgpt', { reason: 'signin' });
    assert.deepStrictEqual(w.loaded, [], 'the sign-in page is left alone while they use it');
    assert.strictEqual(w.focused, f0, 'focus is not pulled off their sign-in');
    const w2 = fakeWin(3, 'https://auth.openai.com/log-in');
    const H2 = CA.createAttentionHandler({ providerHost: { windows: new Map([['chatgpt', w2]]), agentTabs: new Map() }, assign: async () => ({ ok: true }), checkerSource: null, getProvider: () => def, signedOutWaitMs: 5 });
    const r = await H2.attend('chatgpt', { reason: 'signin' });
    assert.deepStrictEqual(w2.loaded, ['https://chatgpt.com'], 'nobody there: back to the chat, as before');
    assert.strictEqual(r.resolved, 'signed-out');
  });

  await test('AF-03', 'the vault refuses a signed-out tab and saves a signed-in one', async () => {
    let jar = [{ name: '__cf_bm', value: 'x', domain: '.chatgpt.com' }, { name: 'oai-did', value: 'y', domain: 'chatgpt.com' }];
    const ses = { cookies: { get: async () => jar.map(c => ({ ...c })) } };
    const saved = [];
    const vault = { capture: async ({ accountId }) => { saved.push(accountId); return { count: jar.length, sites: ['chatgpt.com'] }; }, accounts: () => [] };
    const options = { resolveAccountForDispatch: (p, id) => ({ accountId: id, source: 'explicit' }), recordSession: () => {} };
    const sw = AS.createAccountSwitch({ providerHost: { windows: new Map(), agentTabs: new Map() }, vault, options, getProvider: () => ({ url: 'https://chatgpt.com', hosts: ['chatgpt.com'] }), sessionFor: () => ses });
    const no = await sw.capture('chatgpt', 'acct-1', { makeCurrent: false });
    assert.ok(!no.ok && no.signedOut && /not signed in/.test(no.error) && !saved.length, JSON.stringify(no));
    jar.push({ name: '__Secure-next-auth.session-token', value: 'z', domain: 'chatgpt.com' });
    const yes = await sw.capture('chatgpt', 'acct-1', { makeCurrent: false });
    assert.ok(yes.ok && saved[0] === 'acct-1', JSON.stringify(yes));
  });

  await test('AF-04', 'the picker always has a way out', () => {
    const s = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/guardian-picker.js'), 'utf8');
    assert.ok(/window\.addEventListener\('keydown', \(e\) => \{\s*if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); stopPicker\(\); \}\s*\}, \{ signal: sig, capture: true \}\)/.test(s), 'Escape on window, capture phase');
    assert.ok(/window\.addEventListener\('contextmenu'[^\n]*stopPicker\(\)[^\n]*capture: true/.test(s), 'right-click cancels');
    assert.ok(/escHint\.addEventListener\('click'[^\n]*stopPicker\(\)/.test(s) && /#__g-esc \{[\s\S]*?pointer-events: auto; cursor: pointer;/.test(s), 'the banner is a button');
  });

  await test('AF-05', 'the provider window: no menu bar, dark before the first paint', () => {
    const s = fs.readFileSync(path.join(ROOT, 'clear-glass/src/providers/host.js'), 'utf8');
    assert.ok(s.includes('autoHideMenuBar: true') && s.includes("backgroundColor: '#0b0d12'") && s.includes('win.removeMenu()'));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50).unref();
})();
