'use strict';
/** Host-side DOM transport + shared page resolver (clear-glass/src/mesh/dom-transport.js, src/driver/page-resolver.js). */
const assert = require('assert');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (_) { console.log('   SKIPPED: jsdom not installed (npm i -D jsdom)'); process.exit(0); }
const { createDomTransport } = require('../../clear-glass/src/mesh/dom-transport');
const { createPageResolver } = require('../../clear-glass/src/driver/page-resolver');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`   ${id} ${desc}`); passed++; } catch (e) { console.error(`   ${id} ${desc}\n    ${e.stack}`); failed++; } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const FAST = { pollMs: 15, quietMs: 120, confirmMs: 800, sendWaitMs: 400, firstTokenMs: 1200, stallMs: 900, inputWaitMs: 300, maxMs: 20000 };
const SEL = { input: 'textarea', send: '[data-testid="send-button"]', resp: '.msg.assistant' };

function chatPage({ reply = '<p>ok</p>', streamMs = 30, drift = false } = {}) {
  const dom = new JSDOM(`<!doctype html><body><div id="chat"></div><textarea ${drift ? 'data-x="1"' : 'placeholder="Ask anything"'}></textarea><button data-testid="send-button" aria-label="Send message"><svg></svg></button></body>`, { url: 'https://chat.test/c/1', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, sent = [], ta = w.document.querySelector('textarea');
  w.document.querySelector('button').addEventListener('click', () => {
    sent.push(ta.value); ta.value = '';
    const n = w.document.createElement('div'); n.className = 'msg assistant'; n.setAttribute('data-is-streaming', 'true'); w.document.getElementById('chat').appendChild(n);
    setTimeout(() => { n.innerHTML = reply; n.removeAttribute('data-is-streaming'); }, streamMs);
  });
  return { window: w, sent, isLoading: () => false };
}
const harness = (pages, extra = {}) => createDomTransport({ resolvePage: async (id) => { const p = pages[id]; if (!p) { const e = new Error('no window'); e.stage = 'no_window'; throw e; } if (p.err) throw p.err; return p; },
  execJs: async (wc, code) => wc.window.eval(code), pollMs: 15, settleMs: 0, ...extra });
async function finish(t, id) { for (let i = 0; i < 1500; i++) { const g = t.getJob(id); if (g.status === 'done') return g; await sleep(20); } throw new Error('never finished'); }

(async () => {
  await test('DT-001', 'send() returns at once (accepted, queued); the job then runs to a final result with the text', async () => {
    const p = chatPage({ reply: '<p>done</p>' }); const t = harness({ a1: p });
    const r = t.send({ jobId: 'j1', agentId: 'a1', provider: 'claude', prompt: 'hi', selectors: SEL, opts: FAST });
    assert.strictEqual(r.accepted, true); assert.ok(['queued', 'running'].includes(r.status));
    const g = await finish(t, 'j1');
    assert.strictEqual(g.result.ok, true); assert.strictEqual(g.result.text, 'done'); assert.strictEqual(g.result.sent, true); assert.deepStrictEqual(p.sent, ['hi']);
  });

  await test('DT-002', 'IDEMPOTENT by jobId across restarts: a repeat send returns the same job and NEVER injects twice', async () => {
    const p = chatPage(); const t = harness({ a1: p });
    t.send({ jobId: 'dup', agentId: 'a1', prompt: 'once', selectors: SEL, opts: FAST });
    const again = t.send({ jobId: 'dup', agentId: 'a1', prompt: 'once', selectors: SEL, opts: FAST });
    assert.strictEqual(again.existing, true);
    await finish(t, 'dup'); assert.deepStrictEqual(p.sent, ['once']);
    assert.strictEqual(t.send({ jobId: 'dup', agentId: 'a1', prompt: 'once', selectors: SEL, opts: FAST }).existing, true, 'even after it finished');
  });

  await test('DT-003', 'one chat box => jobs for the same agent run one at a time, in order (a lane per agent)', async () => {
    const p = chatPage({ streamMs: 150 }); const t = harness({ a1: p });
    t.send({ jobId: 'first', agentId: 'a1', prompt: 'A', selectors: SEL, opts: FAST });
    t.send({ jobId: 'second', agentId: 'a1', prompt: 'B', selectors: SEL, opts: FAST });
    await sleep(60);
    assert.deepStrictEqual(p.sent, ['A'], 'B must wait until A has finished');
    await finish(t, 'first'); const g = await finish(t, 'second');
    assert.deepStrictEqual(p.sent, ['A', 'B']); assert.strictEqual(g.result.ok, true);
  });

  await test('DT-004', 'different agents run in parallel (lanes are per agent, not global)', async () => {
    const pa = chatPage({ streamMs: 250 }), pb = chatPage({ streamMs: 250 }); const t = harness({ a: pa, b: pb });
    const t0 = Date.now();
    t.send({ jobId: 'ja', agentId: 'a', prompt: 'A', selectors: SEL, opts: FAST }); t.send({ jobId: 'jb', agentId: 'b', prompt: 'B', selectors: SEL, opts: FAST });
    await finish(t, 'ja'); await finish(t, 'jb');
    assert.ok(Date.now() - t0 < 900, 'ran serially: ' + (Date.now() - t0));
  });

  await test('DT-010', 'failure classification carries `sent`: no window/webview and a missing input are all sent:false', async () => {
    const t = harness({ w: { err: Object.assign(new Error('no webview'), { stage: 'no_webview' }) }, d: chatPage({ drift: true }) });
    t.send({ jobId: 'a', agentId: 'missing', prompt: 'p', selectors: SEL, opts: FAST });
    t.send({ jobId: 'b', agentId: 'w', prompt: 'p', selectors: SEL, opts: FAST });
    t.send({ jobId: 'c', agentId: 'd', prompt: 'p', selectors: { ...SEL, input: '#gone' }, opts: FAST });
    const [a, b, c] = [await finish(t, 'a'), await finish(t, 'b'), await finish(t, 'c')].map(x => x.result);
    assert.deepStrictEqual([a.stage, a.sent], ['no_window', false]); assert.deepStrictEqual([b.stage, b.sent], ['no_webview', false]); assert.deepStrictEqual([c.stage, c.sent], ['input_not_found', false]);
  });

  await test('DT-011', 'the page dying mid-generation is reported as sent:true (the prompt WAS sent), never as a safe fallback', async () => {
    const p = chatPage({ streamMs: 8000 }); let polls = 0;
    const t = harness({ a1: p }, { execJs: async (wc, code) => { if (/poll\(/.test(code) && ++polls > 80) throw new Error('Object has been destroyed'); return wc.window.eval(code); } });
    t.send({ jobId: 'nav', agentId: 'a1', prompt: 'p', selectors: SEL, opts: FAST });
    const g = await finish(t, 'nav');
    assert.deepStrictEqual([g.result.stage, g.result.sent], ['page_navigated', true]);
  });

  await test('DT-011b', 'dying BEFORE the send is confirmed is still never sent:false (we cannot prove nothing was sent)', async () => {
    const p = chatPage({ streamMs: 8000 }); let polls = 0;
    const t = harness({ a1: p }, { execJs: async (wc, code) => { if (/poll\(/.test(code) && ++polls > 4) throw new Error('Object has been destroyed'); return wc.window.eval(code); } });
    t.send({ jobId: 'nav2', agentId: 'a1', prompt: 'p', selectors: SEL, opts: FAST });
    const g = await finish(t, 'nav2');
    assert.strictEqual(g.result.stage, 'page_navigated'); assert.notStrictEqual(g.result.sent, false, 'must be true or null so it is never resent');
  });

  await test('DT-012', 'progress is published while it runs (phase/chars/generating) for guardian heartbeats', async () => {
    const seen = []; const p = chatPage({ streamMs: 900 });
    const t = harness({ a1: p }, { onProgress: (e) => seen.push(e) });
    t.send({ jobId: 'pr', agentId: 'a1', prompt: 'p', selectors: SEL, opts: FAST }); await finish(t, 'pr');
    assert.ok(seen.length >= 3 && seen.every(e => e.jobId === 'pr') && seen.some(e => e.generating === true), JSON.stringify(seen.slice(0, 2)));
  });

  await test('DT-020', 'diagnose(): repairs ONLY the selector that is broken and leaves working ones alone', async () => {
    const p = chatPage({ drift: true }); const t = harness({ a1: p });
    const d = await t.diagnose({ agentId: 'a1', selectors: { input: '#gone', send: SEL.send, resp: SEL.resp }, stage: 'input_not_found' });
    assert.strictEqual(d.ok, true); assert.strictEqual(d.repaired, true);
    assert.ok(p.window.document.querySelector(d.selectors.input) === p.window.document.querySelector('textarea'));
    assert.ok(!('send' in d.selectors), 'send still works and must not be rewritten');
    assert.ok(d.evidence.candidates.input.length >= 1);
  });

  await test('DT-021', 'diagnose(): nothing to repair when the page matches the selectors => repaired:false', async () => {
    const t = harness({ a1: chatPage() });
    const d = await t.diagnose({ agentId: 'a1', selectors: SEL, stage: 'input_not_found' });
    assert.strictEqual(d.repaired, false);
  });

  await test('DT-022', 'diagnose(): unreachable page is reported, not thrown', async () => {
    const d = await harness({}).diagnose({ agentId: 'nope', selectors: SEL, stage: 'input_not_found' });
    assert.strictEqual(d.ok, false); assert.strictEqual(d.stage, 'no_window');
  });

  await test('DT-023', 'diagnose + read(): a wrong response selector is repaired and the ALREADY-SENT answer is read without resending', async () => {
    const p = chatPage({ reply: '<p>the real answer</p>' }); const t = harness({ a1: p });
    t.send({ jobId: 'rr', agentId: 'a1', prompt: 'q', selectors: { ...SEL, resp: '.nope' }, opts: { ...FAST, firstTokenMs: 400 } });
    let g = await finish(t, 'rr'); assert.strictEqual(g.result.stage, 'response_not_found'); assert.strictEqual(g.result.sent, true);
    const r = await t.read({ jobId: 'rr', selectors: { resp: '.msg.assistant' } }); assert.strictEqual(r.ok, true);
    g = await finish(t, 'rr'); assert.strictEqual(g.result.ok, true); assert.strictEqual(g.result.text, 'the real answer'); assert.deepStrictEqual(p.sent, ['q']);
  });

  // ── page resolver against a fake electron ────────────────────────────────────────────────────────
  function fakeElectron({ windows = [], guests = [], focused = null } = {}) {
    const wcs = []; const wins = new Map();
    windows.forEach((w) => { const wc = { destroyed: false, isDestroyed: () => false, getURL: () => w.url || 'about:blank', getType: () => 'window' }; wcs.push(wc); wins.set(wc, { getTitle: () => w.title, isDestroyed: () => false, webContents: wc }); w.wc = wc; });
    guests.forEach((g) => { const host = windows.find(w => w.title.includes(g.host)).wc; const wc = { isDestroyed: () => false, getURL: () => g.url, getType: () => 'webview', hostWebContents: host }; wcs.push(wc); g.wc = wc; });
    return { webContents: { getAllWebContents: () => wcs, getFocusedWebContents: () => focused }, BrowserWindow: { fromWebContents: (wc) => wins.get(wc) || null } };
  }
  await test('RES-001', 'finds the <webview> guest inside the agent\'s window (which the old lookup could not reach)', () => {
    const g = { host: 'mesh-claude-work', url: 'https://claude.ai/new' };
    const el = fakeElectron({ windows: [{ title: 'Clear Glass [mesh-claude-work]', url: 'file:///browser.html' }], guests: [g] });
    assert.strictEqual(createPageResolver({ electron: el }).resolve('mesh-claude-work', { preferUrl: 'https://claude.ai' }), g.wc);
  });
  await test('RES-002', 'NO FOCUSED-WINDOW FALLBACK: an unknown agent throws no_window even when something else is focused', () => {
    const focused = { url: 'https://bank.example/' };
    const el = fakeElectron({ windows: [{ title: 'Other [mesh-gemini-default]', url: 'file:///x' }], focused });
    assert.throws(() => createPageResolver({ electron: el }).resolve('mesh-claude-work'), (e) => e.stage === 'no_window');
  });
  await test('RES-003', 'a window with no webview throws no_webview (not the window shell)', () => {
    const el = fakeElectron({ windows: [{ title: 'Clear Glass [a1]', url: 'file:///browser.html' }] });
    assert.throws(() => createPageResolver({ electron: el }).resolve('a1'), (e) => e.stage === 'no_webview');
  });
  await test('RES-004', 'with several webviews it prefers the one on the agent\'s own host', () => {
    const a = { host: 'a1', url: 'https://accounts.google.com/x' }, b = { host: 'a1', url: 'https://chatgpt.com/c/1' };
    const el = fakeElectron({ windows: [{ title: 'Clear Glass [a1]', url: 'file:///browser.html' }], guests: [a, b] });
    assert.strictEqual(createPageResolver({ electron: el }).resolve('a1', { preferUrl: 'https://chatgpt.com' }), b.wc);
  });

  console.log(`\n   ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
