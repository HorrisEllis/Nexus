'use strict';
/**
 * tests/probe/chat-stream-chromium.js — 0.39.278.
 * James: "live streams the dom mutation live to the download manager, that way we don't lose progress. including you
 * expanding elements for your thoughts."
 * Proves guardian/userscript-chat-stream.js in a real page — Clear Glass's own engine — end to end into the REAL chat
 * ledger (clear-glass/src/downloads/chat-ledger.js): the page's POSTs to :7702/cli/downloads/ledger are routed to
 * applyDelta() in this process. The page streams a reply word by word, has a collapsed "Thought process" toggle in the
 * turn, and a "Thinking" model-picker button in the composer that must never be clicked.
 * Usage: node tests/probe/chat-stream-chromium.js   (exit 0 = all pass, 3 = no page engine)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { start } = require('./_glass-probe.js');
const P = start();
process.env.CG_LEDGER_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-probe-'));
const L = require(path.join(P.ROOT, 'clear-glass/src/downloads/chat-ledger.js'));
const PRELUDE = P.read('guardian/userscript-chat-stream.js');

const PAGE = `<!doctype html><html><body>
<main>
  <div class="turn" data-message-author-role="user"><p class="t">write a lock</p></div>
  <div class="turn" data-message-author-role="assistant">
    <button aria-expanded="false" aria-controls="th1" onclick="this.setAttribute('aria-expanded','true');var r=document.getElementById('th1');r.hidden=false;r.textContent='The lock needs a timeout.'">Thought process</button>
    <div id="th1" hidden></div>
    <p class="t" id="reply"></p>
  </div>
  <form><button id="picker" type="button" aria-expanded="false" onclick="window.__pickerOpened=true">Thinking</button></form>
</main></body></html>`;

(async () => {
  const b = await P.glass.chromium.launch();
  const pg = await b.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  let posts = 0;
  await pg.route('https://claude.ai/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  await pg.route('http://127.0.0.1:7702/**', r => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' });
    posts++;
    const out = L.applyDelta(JSON.parse(req.postData() || '{}'));
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(out) });
  });
  await pg.goto('https://claude.ai/chat/probe-1');
  await pg.evaluate(PRELUDE);
  await pg.evaluate(() => {
    window.__gen = true;
    const read = () => ({ chatId: 'probe-1', url: location.href, messages: [...document.querySelectorAll('.turn')].map(el => {
      const isHuman = el.getAttribute('data-message-author-role') === 'user';
      return { role: isHuman ? 'user' : 'assistant', ...window.NexusChatStream.withThinking(el, el.querySelector('.t').innerText, isHuman) };
    }) });
    window.NexusChatStream.start({ provider: 'claude', read, generating: () => window.__gen, agentId: 'probe' });
    const words = 'Here is the lock with a timeout of five seconds and a retry.'.split(' ');
    let i = 0; const r = document.getElementById('reply');
    const grow = () => { r.textContent += (i ? ' ' : '') + words[i++]; if (i < words.length) setTimeout(grow, 60); else setTimeout(() => { window.__gen = false; r.setAttribute('data-is-streaming', 'false'); }, 300); };
    setTimeout(grow, 100);
  });
  await pg.waitForTimeout(700);
  const mid = L.readChat({ chatKey: 'claude:probe-1' });
  P.case('progress is kept while the reply is still streaming (not only when it settles)',
    !!mid && mid.turns[1] && mid.turns[1].text.length > 0 && mid.turns[1].text.length < 60 && mid.generating === true, { mid: mid && mid.turns[1] && mid.turns[1].text });
  await pg.waitForTimeout(1800);
  const c = L.readChat({ chatKey: 'claude:probe-1' });
  const final = await pg.evaluate(() => document.getElementById('reply').innerText);
  P.case('the ledger holds the whole reply, as the page shows it', c && c.turns[1].text === final, { got: c && c.turns[1].text, final });
  P.case('a burst is coalesced: fewer posts than changes', posts >= 2 && posts < 13, { posts, deltas: c && c.deltas });
  P.case('the thinking toggle in the turn was opened and its text kept apart from the reply',
    (await pg.evaluate(() => document.querySelector('[aria-controls="th1"]').getAttribute('aria-expanded'))) === 'true' && c.turns[1].thinking === 'The lock needs a timeout.' && !c.turns[1].text.includes('timeout.' + ' '), { thinking: c && c.turns[1].thinking });
  P.case('the composer\'s "Thinking" button (outside any turn) was never clicked', (await pg.evaluate(() => !window.__pickerOpened)) === true);
  P.case('generating → false reached the ledger', c && c.generating === false);
  P.case('no page errors', errors.length === 0, { errors });
  await b.close();
  try { fs.rmSync(process.env.CG_LEDGER_ROOT, { recursive: true, force: true }); } catch (_) {}
  P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
