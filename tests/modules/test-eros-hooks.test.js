'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-eros-hooks.test.js — ER1–ER4 (0.60.253).
 * James, 2026-10-25: "can you hook erosmanceros into snowflake, accounts manager, and the dom mutator."
 *
 *   EH-01  pickTarget: one tab on the url; two told apart by title; a tie is ambiguous; none is said — never the first tab
 *   EH-02  resolveTab: the agent's own page (a fake Eros + webContents); a tie is broken by the stamped marker; a navigation finds it
 *          again; the account's pace is set on its session; no match is an error naming the agent
 *   EH-03  the DOM mesh's prepareType in a REAL page (Clear Glass glass.js): scrolled into view, focused, emptied, its centre; a div refused
 *   EH-04  handleMutate via eros: the value is typed through Eros at the field's centre, the rest applied natively; Eros missing is an
 *          error, never a silent set; the documented {selector, value} shorthand works (it timed out before)
 *   EH-05  an account's erosProfile: one of the four, or cleared; anything else refused
 *   EH-06  wired: /cli/eros/open|tabs served, Snowflake / account / plain doors, /api/input takes profile, rows, co-pilot tools, the
 *          accounts pace select, loom
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const TM = require('../../clear-glass/src/eros/tab-match.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const U = 'https://example.com/apply';

function fakeEros(tabs, { marks = {} } = {}) {
  const calls = [];
  const eros = async (method, p, body) => {
    calls.push([method, p, body]);
    if (p === '/api/tabs') return { ok: true, status: 200, body: { tabs } };
    if (p === '/api/evaluate') return { ok: true, status: 200, body: { result: marks[body.tabId] ? marks[body.tabId]() : undefined } };
    return { ok: true, status: 200, body: { ok: true } };
  };
  return { eros, calls };
}
function fakeWc(url, title) {
  const w = { url, title, stamped: null };
  return { w, wc: { getURL: () => w.url, getTitle: () => w.title, executeJavaScript: async (code) => { const m = /= "(.*)"; true$/.exec(code); if (m) w.stamped = m[1]; return true; } } };
}

(async () => {
  await test('EH-01', 'pickTarget: one by url; two by title; a tie is ambiguous; none is said — never the first tab', async () => {
    const tabs = [{ targetId: 'A', url: 'https://x.com/', title: 'X', type: 'page' }, { targetId: 'B', url: U, title: 'Apply', type: 'webview' }, { targetId: 'C', url: U, title: 'Apply — 2', type: 'webview' }, { targetId: 'D', url: U, title: 'Apply', type: 'service_worker' }];
    assert.deepStrictEqual(TM.pickTarget(tabs, { url: 'https://x.com/', title: 'X' }), { targetId: 'A' });
    assert.deepStrictEqual(TM.pickTarget(tabs, { url: U, title: 'Apply — 2' }), { targetId: 'C' });
    assert.deepStrictEqual(TM.pickTarget([...tabs, { targetId: 'E', url: U, title: 'Apply', type: 'page' }], { url: U, title: 'Apply' }), { ambiguous: ['B', 'E'] });
    const none = TM.pickTarget(tabs, { url: 'https://nowhere.test/', title: 'X' });
    assert.ok(none.none && /no Eros tab is on https:\/\/nowhere\.test\//.test(none.why), 'said, and not tabs[0]');
  });

  await test('EH-02', 'resolveTab: the agent\'s own page; a tie broken by the marker; re-found after navigation; the account\'s pace; none named', async () => {
    const tabs = [{ targetId: 'T1', url: U, title: 'Apply', type: 'page' }, { targetId: 'T2', url: U, title: 'Apply', type: 'page' }];
    const { w, wc } = fakeWc(U, 'Apply');
    const { eros, calls } = fakeEros(tabs, { marks: { T2: () => w.stamped } });
    const cache = new Map();
    const r = await TM.resolveTab({ agentId: 'acct-a1', wc, eros, cache, profileOf: (id) => (id === 'acct-a1' ? 'cautious' : null), nonce: () => 'n-1' });
    assert.deepStrictEqual([r.tabId, r.profile, w.stamped], ['T2', 'cautious', 'n-1'], JSON.stringify(r));
    assert.ok(calls.some(c => c[1] === '/api/behavior/profile' && c[2].sessionId === 'T2' && c[2].profile === 'cautious'), 'the account\'s pace is set on its Eros session');
    const before = calls.length; assert.strictEqual((await TM.resolveTab({ agentId: 'acct-a1', wc, eros, cache })).tabId, 'T2'); assert.strictEqual(calls.length, before, 'cached while the page stays');
    w.url = 'https://example.com/done'; w.title = 'Done';
    const gone = await TM.resolveTab({ agentId: 'acct-a1', wc, eros, cache });
    assert.ok(gone.error && /no ErosmancerOS tab for agent acct-a1: no Eros tab is on https:\/\/example\.com\/done/.test(gone.error), 'after a navigation it looks again, and says when there is none');
    assert.match((await TM.resolveTab({ agentId: 'x', wc: null, eros })).error, /no page is open for agent x/);
    assert.match((await TM.resolveTab({ agentId: 'x', wc, eros: async () => ({ ok: false, status: 502, error: 'ECONNREFUSED' }) })).error, /did not list its tabs \(ECONNREFUSED\)/);
  });

  await test('EH-03', 'prepareType in a real page (glass.js): in view, focused, emptied, its centre; a div is refused', async () => {
    const src = fs.readFileSync(CG('src/dom/archaeology.js'), 'utf8'); const a = src.indexOf('const DOM_OBSERVER_SCRIPT = `'); const b = src.indexOf('\n`;', a);
    const MESH = new Function(src.slice(a, b + 3) + '\nreturn DOM_OBSERVER_SCRIPT;')();
    const glass = require(CG('src/driver/glass.js'));
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - EH-03 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return; }
    try {
      const pg = await browser.newPage({ viewport: { width: 800, height: 600 } }); const errors = []; pg.on('pageerror', e => errors.push(e.message));
      await pg.goto('data:text/html,' + encodeURIComponent('<div style="height:2000px">top</div><label>Email <input id="e" value="old@x.com"></label><div id="d">text</div>'));
      await pg.evaluate(MESH);
      const r = await pg.evaluate(() => { const m = window.__cgDomMesh; const id = m.queryOne('#e').id; const out = m.prepareType(id); const el = document.getElementById('e'); const rc = el.getBoundingClientRect(); return { out, value: el.value, focused: document.activeElement === el, inView: rc.top >= 0 && rc.bottom <= innerHeight, div: m.prepareType(m.queryOne('#d').id) }; });
      assert.ok(r.out.ok && Number.isInteger(r.out.x) && Number.isInteger(r.out.y), JSON.stringify(r.out));
      assert.deepStrictEqual([r.value, r.focused, r.inView], ['', true, true]);
      assert.match(r.div.error, /a div cannot be typed into/);
      assert.deepStrictEqual(errors, []); await pg.close();
    } finally { await browser.close(); }
  });

  await test('EH-04', 'handleMutate via eros types the value at the field\'s centre; Eros missing is an error; {value} shorthand works', async () => {
    const DomArchaeology = require('../../clear-glass/src/dom/archaeology.js');
    const dom = Object.create(DomArchaeology.prototype); dom.sse = { emit() {} };
    const js = [];
    const wc = { getURL: () => U, executeJavaScript: async (code) => { js.push(code); if (/prepareType/.test(code)) return { ok: true, x: 120, y: 340, tag: 'input' }; if (/queryOne/.test(code)) return { id: 'cg-7' }; if (/mutate\(/.test(code)) return { ok: true }; return null; } };
    dom._getWebContents = () => wc;
    const typed = []; dom.erosInput = async (agentId, url, o) => { typed.push({ agentId, url, ...o }); return { ok: true, profile: 'cautious' }; };
    const r = await dom.handleMutate({ agentId: 'acct-a1', selector: '#e', mutation: { value: 'j@x.com', style: { outline: '1px solid red' } }, via: 'eros' });
    assert.ok(r.ok && r.via === 'eros' && r.typed === 7 && r.profile === 'cautious', JSON.stringify(r));
    assert.deepStrictEqual(typed, [{ agentId: 'acct-a1', url: U, x: 120, y: 340, action: 'type', text: 'j@x.com' }]);
    assert.ok(js.some(c => /mutate\("cg-7", \{"style"/.test(c)) && !js.some(c => /mutate\([^)]*"value"/.test(c)), 'the value is typed, never set; the style is applied natively');
    dom.erosInput = undefined;
    assert.match((await dom.handleMutate({ agentId: 'a', cgId: 'cg-7', mutation: { value: 'x' }, via: 'eros' })).error, /ErosmancerOS is not wired/);
    js.length = 0;
    const sh = await dom.handleMutate({ agentId: 'a', selector: '#e', value: 'plain' });
    assert.ok(sh.ok, JSON.stringify(sh)); assert.ok(js.some(c => /mutate\("cg-7", \{"value":"plain"\}\)/.test(c)), 'browser_action\'s {selector, value} becomes a mutation');
    assert.match((await dom.handleMutate({ agentId: 'a', cgId: 'cg-7' })).error, /nothing to change/);
  });

  await test('EH-05', 'an account\'s erosProfile: one of the four, or cleared; anything else refused', async () => {
    const NexusOptions = require('../../clear-glass/src/options/store.js');
    const o = Object.create(NexusOptions.prototype); o.data = { accounts: { a1: { id: 'a1', label: 'Main', agentKeys: [] } } }; o._persist = () => {};
    assert.strictEqual(o.updateAccount('a1', { erosProfile: 'cautious' }).erosProfile, 'cautious');
    assert.match(o.updateAccount('a1', { erosProfile: 'sprint' }).error, /one of precise, cautious, exploratory, turbo/);
    assert.strictEqual(o.updateAccount('a1', { erosProfile: null }).erosProfile, null);
    assert.strictEqual(o.updateAccount('a1', { label: 'Work' }).erosProfile, null, 'a rename keeps it');
  });

  await test('EH-06', 'wired: the doors, the pace in /api/input, rows, co-pilot tools, the accounts select, loom', async () => {
    const bridge = read('clear-glass/src/ipc/bridge.js'), main = read('clear-glass/src/main/index.js'), ts = read('clear-glass/erosmancer/erosmancer-os/src/api/server.ts');
    assert.ok(bridge.includes("this.app.post('/cli/eros/open'") && bridge.includes("this.app.get('/cli/eros/tabs'"));
    assert.match(main, /via === 'snowflake'[\s\S]{0,300}ipcBridge\._netOpenVia\(u\.href\)/, 'Snowflake: its own door');
    assert.match(main, /agentId = `acct-\$\{accountId\}`; await openAgentWindow/, 'an account: its own session');
    assert.ok(!/match = tabs\[0\]/.test(main), 'the first-tab guess is gone');
    assert.match(main, /dom\.erosInput = driver\.erosInput/);
    assert.match(ts, /const PACE: Record<string, number> = \{ precise: 1, cautious: 1\.6, exploratory: 1\.25, turbo: 0\.4 \}/);
    assert.match(ts, /setTimeout\(r, ms \* k\)/);
    const SPEC = require('../../idearium/cli/route-commands.js').SPEC; const by = Object.fromEntries(SPEC.map(r => [r.key, r]));
    const q = by['eros.open'].req({ args: ['micro1.ai/apply'], flags: { account: 'a1' } });
    assert.deepStrictEqual([q.path, q.body], ['/cli/eros/open', { url: 'https://micro1.ai/apply', via: 'account', accountId: 'a1' }]);
    assert.strictEqual(by['eros.open'].req({ args: ['https://x.com'], flags: { snowflake: true } }).body.via, 'snowflake');
    assert.deepStrictEqual(by['eros.pace'].req({ args: ['a1', 'default'], flags: {} }).body, { updates: { erosProfile: null } });
    assert.ok(by['eros.tabs']);
    const tools = require('../../clear-glass/src/copilot/tools.js').TOOLS.map(t => t.name);
    assert.ok(tools.includes('eros.open') && tools.includes('eros.tabs'));
    assert.match(read('clear-glass/renderer/settings/sections/accounts.js'), /cg\.accounts\.update\(acc\.id, \{ erosProfile: v \}\)/);
    assert.match(read('loom/maps/economy-map.js'), /0\.60\.253 ER1 resolveTab/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
