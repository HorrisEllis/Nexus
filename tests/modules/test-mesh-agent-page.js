'use strict';
/**
 * The in-page agent library (clear-glass/src/mesh/page/agent-page.js) driven against fixture "chat sites" in jsdom.
 * This is the real injected script, not a stand-in. What it proves: injection integrity at code-base scale (600 KB,
 * unicode), attachment of bulk content, markdown extraction that KEEPS fenced code, "Continue" handling, blockers,
 * three-valued `sent`, idempotency, and DOM-mapping repair. What it cannot prove: any real site's markup or Electron.
 */
const assert = require('assert');
const fs = require('fs'), path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (_) { console.log('   SKIPPED: jsdom not installed (npm i -D jsdom)'); process.exit(0); }
const SRC = fs.readFileSync(path.join(__dirname, '../../clear-glass/src/mesh/page/agent-page.js'), 'utf8');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`   ${id} ${desc}`); passed++; } catch (e) { console.error(`   ${id} ${desc}\n    ${e.stack}`); failed++; } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const FAST = { pollMs: 15, quietMs: 120, confirmMs: 800, sendWaitMs: 500, firstTokenMs: 1500, stallMs: 900, maxMs: 20000 };

function page(html, url = 'https://chat.test/c/1') {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(SRC);
  return w;
}
// A configurable fake chat site: on send it reads the input, clears it, then "streams" an assistant reply.
function site({ input = 'textarea', reply = '<p>ok</p>', chunks = 3, streamMs = 30, extra = '', onSend, noClear = false, sendId = 'send' } = {}) {
  const box = input === 'textarea' ? '<textarea placeholder="Ask anything"></textarea>' : '<div contenteditable="true" role="textbox" aria-label="Message"></div>';
  const w = page(`<div id="chat"></div>${box}<button id="${sendId}" data-testid="send-button" aria-label="Send message"><svg></svg></button>${extra}`);
  const doc = w.document, el = doc.querySelector(input === 'textarea' ? 'textarea' : '[contenteditable]');
  const got = { sent: [] };
  const val = () => el.value !== undefined && el.tagName === 'TEXTAREA' ? el.value : el.textContent;
  const btn = doc.getElementById(sendId);
  if (btn) btn.addEventListener('click', () => {
    got.sent.push(val());
    if (onSend) return onSend({ w, doc, el, val, got });
    if (!noClear) { if (el.tagName === 'TEXTAREA') el.value = ''; else el.textContent = ''; }
    const node = doc.createElement('div'); node.className = 'msg assistant'; node.setAttribute('data-is-streaming', 'true'); doc.getElementById('chat').appendChild(node);
    const parts = reply.length > chunks ? chunks : 1; let i = 0;
    const step = () => { i++; node.innerHTML = reply.slice(0, Math.ceil(reply.length * i / parts)); if (i < parts) setTimeout(step, streamMs); else node.removeAttribute('data-is-streaming'); };
    setTimeout(step, streamMs);
  });
  return { w, doc, el, got, val };
}
const SEL = { input: 'textarea, [contenteditable="true"]', send: '[data-testid="send-button"]', resp: '.msg.assistant' };
async function job(w, args, opts) {
  const id = args.jobId || 'j-' + Math.random().toString(36).slice(2);
  w.__cgAgent.start({ jobId: id, selectors: SEL, opts: Object.assign({}, FAST, opts || {}), ...args });
  for (let i = 0; i < 1500; i++) { const p = w.__cgAgent.poll(id); if (p.done) return p; await sleep(20); }
  throw new Error('job never finished');
}

(async () => {
  await test('PG-001', 'simple round trip: injects, sends, waits for streaming to finish, returns the reply', async () => {
    const s = site({ reply: '<p>Hello world</p>' });
    const r = await job(s.w, { prompt: 'say hi' });
    assert.strictEqual(r.ok, true); assert.strictEqual(r.sent, true); assert.strictEqual(r.text, 'Hello world'); assert.deepStrictEqual(s.got.sent, ['say hi']);
  });

  await test('PG-002', 'CODE BASE SCALE: a 600 KB prompt with unicode arrives byte-for-byte identical', async () => {
    const line = 'function héllo() { return "你好 🚀 — ünïcode"; } // ' + 'x'.repeat(40) + '\n';
    const big = 'Refactor this repo:\n' + line.repeat(Math.ceil(600000 / line.length));
    const s = site({});
    const r = await job(s.w, { prompt: big });
    assert.strictEqual(r.ok, true); assert.strictEqual(s.got.sent[0].length, big.length); assert.strictEqual(s.got.sent[0], big);
  });

  await test('PG-003', 'contenteditable editors: synthetic paste path is used when the editor supports it', async () => {
    const s = site({ input: 'ce' });
    const w = s.w;
    w.DataTransfer = class { constructor() { this.d = {}; } setData(k, v) { this.d[k] = v; } getData(k) { return this.d[k]; } };
    w.ClipboardEvent = class extends w.Event { constructor(t, o) { super(t, o); this.clipboardData = o.clipboardData; } };
    s.el.addEventListener('paste', (e) => { e.preventDefault(); s.el.textContent += e.clipboardData.getData('text/plain'); });
    const r = await job(w, { prompt: 'pasted prompt' });
    assert.strictEqual(r.ok, true); assert.strictEqual(r.via, 'paste'); assert.strictEqual(s.got.sent[0], 'pasted prompt');
  });

  await test('PG-004', 'contenteditable without paste/execCommand falls back and still injects', async () => {
    const s = site({ input: 'ce' });
    const r = await job(s.w, { prompt: 'fallback prompt' });
    assert.strictEqual(r.ok, true); assert.strictEqual(r.via, 'textContent'); assert.strictEqual(s.got.sent[0], 'fallback prompt');
  });

  await test('PG-005', 'BULK CONTENT IS ATTACHED AS A FILE (not typed) when above inlineMax; only the instruction is typed', async () => {
    const attached = [];
    const s = site({ extra: '<input type="file" accept="text/plain,.txt">' });
    const fileInput = s.doc.querySelector('input[type=file]');
    fileInput.addEventListener('change', () => { const f = fileInput.files[0]; attached.push(f); const chip = s.doc.createElement('span'); chip.setAttribute('data-testid', 'file-chip'); chip.textContent = f.name; s.doc.body.appendChild(chip); });
    const content = 'export const a = "é";\n'.repeat(20000);
    const r = await job(s.w, { prompt: 'Review the attached repo', content }, { inlineMax: 1000 });
    assert.strictEqual(r.ok, true); assert.strictEqual(r.via, 'attachment');
    assert.strictEqual(attached.length, 1); assert.ok(/^codebase-.*\.txt$/.test(attached[0].name));
    const text = await new Promise((res) => { const fr = new s.w.FileReader(); fr.onload = () => res(fr.result); fr.readAsText(attached[0]); });
    assert.strictEqual(text, content, 'the attached file must be the exact bulk content');
    assert.strictEqual(s.got.sent[0], 'Review the attached repo', 'only the instruction is typed');
  });

  await test('PG-006', 'no file input available for a huge payload => attach_failed with sent:false (safe to fall back)', async () => {
    const s = site({});
    const r = await job(s.w, { prompt: 'x', content: 'y'.repeat(5000) }, { inlineMax: 100 });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.stage, 'attach_failed'); assert.strictEqual(r.sent, false); assert.strictEqual(s.got.sent.length, 0);
  });

  await test('PG-010', 'CODE FENCES SURVIVE: language, indentation, lists, headings, inline code, tables come back as markdown', async () => {
    const html = '<h2>Plan</h2><p>Use <code>map</code> here:</p><pre><code class="language-python">def f(x):\n    return [i*2 for i in x]\n</code></pre><ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul><table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>';
    const s = site({ reply: html, chunks: 1 });
    const r = await job(s.w, { prompt: 'p' });
    assert.ok(r.text.includes('## Plan'), r.text);
    assert.ok(r.text.includes('```python\ndef f(x):\n    return [i*2 for i in x]\n```'), 'fenced code with language and 4-space indent must be intact:\n' + r.text);
    assert.ok(r.text.includes('`map`') && r.text.includes('- one') && r.text.includes('  - nested') && r.text.includes('| a | b |'));
  });

  await test('PG-011', 'a code block that itself contains ``` gets a longer fence instead of breaking', async () => {
    const s = site({ reply: '<pre><code class="language-md">```js\nlet x = 1\n```\n</code></pre>', chunks: 1 });
    const r = await job(s.w, { prompt: 'p' });
    assert.ok(r.text.startsWith('````md\n```js\nlet x = 1\n```\n````'), r.text);
  });

  await test('PG-012', 'copy/UI buttons inside code blocks are not part of the code', async () => {
    const s = site({ reply: '<pre><button>Copy</button><code class="language-js">const a = 1;</code></pre>', chunks: 1 });
    const r = await job(s.w, { prompt: 'p' });
    assert.ok(r.text.includes('```js\nconst a = 1;\n```') && !/Copy/.test(r.text), r.text);
  });

  await test('PG-020', 'LONG ANSWERS: a "Continue generating" button is clicked and the segments are joined', async () => {
    let clicks = 0;
    const s = site({ onSend: ({ doc, el }) => {
      el.value = '';
      const node = doc.createElement('div'); node.className = 'msg assistant'; doc.getElementById('chat').appendChild(node);
      node.innerHTML = '<p>part one</p>';
      const b = doc.createElement('button'); b.textContent = 'Continue generating'; doc.body.appendChild(b);
      b.addEventListener('click', () => { clicks++; b.remove(); setTimeout(() => { node.innerHTML += '<p>part two</p>'; }, 60); });
    } });
    const r = await job(s.w, { prompt: 'write everything' });
    assert.strictEqual(r.ok, true); assert.strictEqual(clicks, 1); assert.strictEqual(r.continues, 1);
    assert.ok(r.text.includes('part one') && r.text.includes('part two'), r.text);
  });

  await test('PG-021', 'a slow generation is NOT cut off by a short timeout (waits while the stop indicator is up)', async () => {
    const s = site({ reply: '<p>' + 'w'.repeat(30) + '</p>', chunks: 6, streamMs: 250 });
    const r = await job(s.w, { prompt: 'p' }, { quietMs: 100 });
    assert.strictEqual(r.ok, true); assert.ok(r.elapsedMs >= 1000, 'should have waited through the stream: ' + r.elapsedMs); assert.ok(r.text.includes('w'.repeat(30)));
  });

  await test('PG-022', 'stall guard: output that stops growing while "generating" fails as stalled WITH the partial text and sent:true', async () => {
    const s = site({ onSend: ({ doc, el }) => { el.value = ''; const n = doc.createElement('div'); n.className = 'msg assistant'; n.setAttribute('data-is-streaming', 'true'); n.innerHTML = '<p>partial</p>'; doc.getElementById('chat').appendChild(n); } });
    const r = await job(s.w, { prompt: 'p' }, { stallMs: 400 });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.stage, 'stalled'); assert.strictEqual(r.sent, true); assert.strictEqual(r.text, 'partial');
  });

  await test('PG-030', 'login wall => no_login and captcha => captcha, both sent:false, nothing typed', async () => {
    const w = page('<form><input type="password"></form>', 'https://chat.test/login');
    let r = await job(w, { prompt: 'p' }); assert.deepStrictEqual([r.stage, r.sent], ['no_login', false]);
    const w2 = page('<iframe src="https://x/captcha/frame"></iframe><textarea></textarea><button data-testid="send-button"></button>');
    r = await job(w2, { prompt: 'p' }); assert.deepStrictEqual([r.stage, r.sent], ['captcha', false]);
  });

  await test('PG-031', 'selector drift is classified precisely: missing input => input_not_found, missing send => send_not_found (both sent:false)', async () => {
    const s = site({});
    let r = await job(s.w, { prompt: 'p', selectors: { ...SEL, input: '#gone' } }); assert.deepStrictEqual([r.stage, r.sent], ['input_not_found', false]);
    const s2 = site({});
    r = await job(s2.w, { prompt: 'p', selectors: { ...SEL, send: '#gone' } }); assert.deepStrictEqual([r.stage, r.sent], ['send_not_found', false]);
    assert.strictEqual(s2.got.sent.length, 0);
  });

  await test('PG-032', 'clicked send but nothing confirms it => sent:null (AMBIGUOUS: must never be resent)', async () => {
    const s = site({ onSend: () => {} });
    const r = await job(s.w, { prompt: 'p' });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.stage, 'send_unconfirmed'); assert.strictEqual(r.sent, null);
  });

  await test('PG-033', 'response selector matches nothing after a confirmed send => response_not_found with sent:true', async () => {
    const s = site({});
    const r = await job(s.w, { prompt: 'p', selectors: { ...SEL, resp: '.nope' } }, { firstTokenMs: 400 });
    assert.deepStrictEqual([r.ok, r.stage, r.sent], [false, 'response_not_found', true]);
  });

  await test('PG-034', 'rate limit message is recognised (sent:true, stage rate_limited)', async () => {
    const s = site({ reply: '<p>You have reached your message limit. Try again in 3 hours.</p>', chunks: 1 });
    const r = await job(s.w, { prompt: 'p' });
    assert.deepStrictEqual([r.ok, r.stage, r.sent], [false, 'rate_limited', true]);
  });

  await test('PG-040', 'IDEMPOTENT: starting the same jobId twice injects and sends exactly once', async () => {
    const s = site({});
    const a = s.w.__cgAgent.start({ jobId: 'dup', selectors: SEL, prompt: 'once', opts: FAST });
    const b = s.w.__cgAgent.start({ jobId: 'dup', selectors: SEL, prompt: 'once', opts: FAST });
    assert.strictEqual(a.started, true); assert.strictEqual(b.started, false); assert.strictEqual(b.existing, true);
    for (let i = 0; i < 300 && !s.w.__cgAgent.poll('dup').done; i++) await sleep(20);
    assert.deepStrictEqual(s.got.sent, ['once']);
  });

  await test('PG-041', 'read(): after a selector repair the ALREADY-SENT response is re-read without resending', async () => {
    const s = site({ reply: '<p>the answer</p>', chunks: 1 });
    const bad = await job(s.w, { jobId: 'rr', prompt: 'p', selectors: { ...SEL, resp: '.nope' } }, { firstTokenMs: 400 });
    assert.strictEqual(bad.stage, 'response_not_found');
    s.w.__cgAgent.read({ jobId: 'rr', selectors: { resp: '.msg.assistant' } });
    let p; for (let i = 0; i < 300; i++) { p = s.w.__cgAgent.poll('rr'); if (p.done) break; await sleep(20); }
    assert.strictEqual(p.ok, true); assert.strictEqual(p.text, 'the answer'); assert.strictEqual(s.got.sent.length, 1, 'must not resend');
  });

  await test('PG-050', 'automatic DOM mapping finds input/send/response on a page with hashed classes and NO known selectors', async () => {
    const w = page(`<main><div class="sc-a1b2c3"><div data-message-author-role="assistant"><div class="markdown prose"><p>hello</p><pre><code>x</code></pre></div></div></div>
      <form class="f-9f8e7d6c"><div contenteditable="true" role="textbox" aria-label="Message assistant"></div>
      <button aria-label="Attach file" class="x-77aa88bb"><svg></svg></button><button aria-label="Send message" class="y-11223344"><svg></svg></button></form></main>`);
    const m = w.__cgAgent.map(), q = (s) => w.document.querySelector(s);
    assert.strictEqual(q(m.input[0].selector), q('[contenteditable]'), JSON.stringify(m.input[0]));
    assert.strictEqual(q(m.send[0].selector), q('button[aria-label="Send message"]'), JSON.stringify(m.send));
    assert.ok(q(m.resp[0].selector) && q('[data-message-author-role]').contains(q(m.resp[0].selector)), JSON.stringify(m.resp[0]));
    assert.ok(m.input[0].matches >= 1 && m.send[0].matches >= 1);
    assert.ok(!m.send.some(c => /Attach/.test(c.selector) && c.score >= m.send[0].score), 'attach must not outrank send');
  });

  await test('PG-051', 'abort() stops a running job', async () => {
    const s = site({ onSend: ({ doc, el }) => { el.value = ''; const n = doc.createElement('div'); n.className = 'msg assistant'; n.setAttribute('data-is-streaming', 'true'); n.textContent = 'x'; doc.getElementById('chat').appendChild(n); } });
    s.w.__cgAgent.start({ jobId: 'ab', selectors: SEL, prompt: 'p', opts: { ...FAST, stallMs: 60000 } });
    await sleep(400); s.w.__cgAgent.abort('ab'); await sleep(200);
    const p = s.w.__cgAgent.poll('ab'); assert.strictEqual(p.done, true); assert.strictEqual(p.stage, 'aborted');
  });

  console.log(`\n   ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
