'use strict';
/**
 * tests/modules/test-mesh-chat-reload.test.js — 0.60.8
 * James (2026-10-13): "can you have the chaturl logged an reused for agents, unless it is blocked. like i want it to
 * reload using the chat url before it escalates." · "also keeps losing connection to chatgpt."
 *   CR-0x  Clear Glass (dom-transport): the page navigates under a sent job → the chat is reopened at its URL and the
 *          answer read there, never retyped; a sign-in wall is reported as such
 *   LR-0x  Guardian (dispatch-ladder): a sent job with no answer is reloaded once before it goes to a person
 */
const assert = require('assert');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (_) { console.log('   SKIPPED: jsdom not installed'); process.exit(0); }
const { createDomTransport } = require('../../clear-glass/src/mesh/dom-transport');
const { createLadder } = require('../../guardian/lib/dispatch-ladder');
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.log(`  ✗ ${id} ${d}\n    ${e.stack}`); failed++; } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const FAST = { pollMs: 15, quietMs: 120, confirmMs: 800, sendWaitMs: 400, firstTokenMs: 1500, stallMs: 900, inputWaitMs: 300, maxMs: 20000 };
const SEL = { input: 'textarea', send: '[data-testid="send-button"]', resp: '.msg.assistant' };
const page = (html, url) => new JSDOM(`<!doctype html><body>${html}</body>`, { url, runScripts: 'outside-only', pretendToBeVisual: true }).window;

// ChatGPT's new chat: typed at /c/WEB:tmp, the page then moves to /c/real (the job's script is gone) and finishes there
function chatgpt({ after = '<div class="msg assistant"><p>the answer</p></div>', wall = null } = {}) {
  const tab = { loads: [], isLoading: () => false };
  tab.window = page('<div id="chat"></div><textarea placeholder="Ask"></textarea><button data-testid="send-button">send</button>', 'https://chatgpt.com/c/WEB:tmp');
  const ta = tab.window.document.querySelector('textarea');
  tab.typed = [];
  tab.window.document.querySelector('button').addEventListener('click', () => {
    tab.typed.push(ta.value); ta.value = '';
    const n = tab.window.document.createElement('div'); n.className = 'msg assistant'; n.setAttribute('data-is-streaming', 'true'); tab.window.document.getElementById('chat').appendChild(n);
    setTimeout(() => { tab.window = page('<div id="chat"></div>', 'https://chatgpt.com/c/real-id'); }, 200);   // navigated mid-answer
  });
  tab.loadURL = async (url) => { tab.loads.push(url); tab.window = page(wall || `<div id="chat"><div class="msg user">q</div>${after}</div><textarea placeholder="Ask"></textarea>`, url); };
  return tab;
}
const harness = (tab) => createDomTransport({ resolvePage: async () => tab, execJs: async (wc, code) => wc.window.eval(code), pollMs: 15, settleMs: 0 });
async function done(t, id) { for (let i = 0; i < 1500; i++) { const g = t.getJob(id); if (g.status === 'done') return g; await sleep(20); } throw new Error('never finished'); }

(async () => {
  console.log('\ntest-mesh-chat-reload\n');
  await test('CR-01', 'the page navigates under a sent job: the chat is reopened at the URL it was last seen at and the answer read there — typed once, never again', async () => {
    const tab = chatgpt(); const t = harness(tab);
    t.send({ jobId: 'j1', agentId: 'a', provider: 'chatgpt', prompt: 'hello', selectors: SEL, opts: FAST });
    const g = await done(t, 'j1');
    assert.strictEqual(g.result.ok, true, JSON.stringify(g.result));
    assert.strictEqual(g.result.text, 'the answer');
    assert.strictEqual(g.result.via, 'reloaded');
    assert.deepStrictEqual(tab.typed, ['hello'], 'never retyped');
    assert.strictEqual(tab.loads.length, 1, 'reloaded once');
  });
  await test('CR-02', 'blocked (the chat reopens on a sign-in page): reported as no_login with the chat URL — a person is needed, no second reload', async () => {
    const tab = chatgpt({ wall: '<form><input type="password"></form>' }); const t = harness(tab);
    t.send({ jobId: 'j2', agentId: 'a', provider: 'chatgpt', prompt: 'hello', selectors: SEL, opts: FAST });
    const g = await done(t, 'j2');
    assert.strictEqual(g.result.ok, false); assert.strictEqual(g.result.stage, 'no_login'); assert.strictEqual(g.result.sent, true);
    assert.strictEqual(tab.loads.length, 1); assert.deepStrictEqual(tab.typed, ['hello']);
  });

  // the ladder, with a fake mesh: the send loses the answer; read({reload}) is the reload
  const reg = { get: () => ({ selectors: SEL }), resolveAccount: () => 'acc', recordOutcome() {}, recordRepair: (p, s) => ({ selectors: s }) };
  await test('LR-01', 'a sent job with no answer is reloaded once at its chat URL before a person is asked; the answer completes the job', async () => {
    const calls = [];
    const mesh = { send: async () => ({ ok: false, sent: true, stage: 'page_navigated', chatUrl: 'https://chatgpt.com/c/real-id' }),
      read: async (a) => { calls.push(a); return { ok: true, text: 'found it', chatUrl: a.chatUrl }; }, diagnose: async () => ({ ok: false }) };
    const L = createLadder({ registry: reg, mesh, picker: null, mode: () => 'mesh-first' });
    const r = await L.attempt({ id: 'J1', provider: 'chatgpt', prompt: 'p' });
    assert.strictEqual(r.kind, 'complete'); assert.strictEqual(r.text, 'found it');
    assert.strictEqual(calls.length, 1); assert.strictEqual(calls[0].reload, true); assert.strictEqual(calls[0].chatUrl, 'https://chatgpt.com/c/real-id');
    assert.ok(r.trail.some(t => t.tier === 'mesh-reload'));
  });
  await test('LR-02', 'reloaded and blocked: the person is asked with the real reason (no_login), not "no response"', async () => {
    const mesh = { send: async () => ({ ok: false, sent: true, stage: 'timeout' }), read: async () => ({ ok: false, sent: true, stage: 'no_login' }), diagnose: async () => ({ ok: false }) };
    const r = await createLadder({ registry: reg, mesh, picker: null, mode: () => 'mesh-first' }).attempt({ id: 'J2', provider: 'chatgpt', prompt: 'p', chatUrl: 'https://chatgpt.com/c/x' });
    assert.strictEqual(r.kind, 'user'); assert.strictEqual(r.reason, 'no_login');
  });
  await test('LR-03', 'reloaded and still nothing: the person is asked, as before; a captcha before sending is not reloaded', async () => {
    let reads = 0;
    const mesh = { send: async () => ({ ok: false, sent: true, stage: 'timeout' }), read: async () => { reads++; return { ok: false, sent: true, stage: 'response_not_found' }; }, diagnose: async () => ({ ok: false }) };
    const r = await createLadder({ registry: reg, mesh, picker: null, mode: () => 'mesh-first' }).attempt({ id: 'J3', provider: 'chatgpt', prompt: 'p' });
    assert.strictEqual(r.kind, 'user'); assert.strictEqual(r.reason, 'sent_no_response'); assert.strictEqual(reads, 1);
    reads = 0;
    const m2 = { send: async () => ({ ok: false, sent: false, stage: 'captcha' }), read: async () => { reads++; return { ok: true }; }, diagnose: async () => ({ ok: false }) };
    const r2 = await createLadder({ registry: reg, mesh: m2, picker: null, mode: () => 'mesh-first' }).attempt({ id: 'J4', provider: 'chatgpt', prompt: 'p' });
    assert.strictEqual(r2.kind, 'user'); assert.strictEqual(r2.reason, 'captcha'); assert.strictEqual(reads, 0);
  });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
