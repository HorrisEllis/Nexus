'use strict';
/**
 * tests/probe/transcript-push-chromium.js — 0.39.263 (was transcript-push-chromium.py, 0.39.254/255).
 * The userscript's §TRANSCRIPT block in a real page — Clear Glass's own engine — on the
 * ChatGPT-like fixture at a real chat URL: the block, chatId, _nexusGetFullChat and
 * _isGenerating are extracted from guardian/userscript-chatgpt.js; only ncpPost is stubbed
 * (it records what would reach guardian). Settle/max-wait are shortened to 400 ms / 2.5 s.
 * Usage: node tests/probe/transcript-push-chromium.js   (exit 0 = all pass, 3 = no page engine)
 */
const { start, extract } = require('./_glass-probe.js');
const P = start();
const US = P.read('guardian/userscript-chatgpt.js');
const FIXTURE = P.read('tests/fixtures/chatgpt-like.html');

const m = /\/\/ §TRANSCRIPT 0\.39\.254[\s\S]*?else setTimeout\(_nexusTranscriptStart, 1500\);\n\}\n/.exec(US);
if (!m) { console.error('could not extract the §TRANSCRIPT block'); process.exit(1); }
const BLOCK = m[0].replace('_TX_SETTLE_MS = 5000', '_TX_SETTLE_MS = 400').replace('_TX_MAX_WAIT_MS = 60000', '_TX_MAX_WAIT_MS = 2500');
if (!BLOCK.includes('_TX_SETTLE_MS = 400') || !BLOCK.includes('_TX_MAX_WAIT_MS = 2500')) { console.error('the settle constants changed shape'); process.exit(1); }

const SCRIPT = `(() => {
  const PROVIDER = 'chatgpt', MY_TAB = 'tab-1', NEXUS_AGENT_ID = 'repo-probe', NCP_RESULT = 'http://127.0.0.1:7820/result';
  window.__posts = []; window.__guardianUp = true;
  async function ncpPost(url, data) { window.__posts.push(JSON.parse(JSON.stringify(data))); return window.__guardianUp ? { ok: true } : null; }
  ${extract(US, 'chatId')}
  ${extract(US, '_replyText')}
  ${extract(US, '_nexusGetFullChat')}
  ${extract(US, '_isGenerating')}
  ${BLOCK}
  window.__chatId = chatId;
})()`;

const URL = 'https://chatgpt.com/c/WEB:b4b1d92a-9efa-4f95-b2b9-84996b88ce74';
const fixture = (r) => r.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE });

(async () => {
  const b = await P.glass.chromium.launch();
  const pg = await b.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.route('https://chatgpt.com/**', fixture);
  await pg.goto(URL);
  await pg.evaluate(SCRIPT);
  const posts = () => pg.evaluate(() => window.__posts);
  const wait = (ms) => pg.waitForTimeout(ms);
  const append = (role, text) => pg.evaluate(([r, t]) => { const d = document.createElement('div'); d.setAttribute('data-message-author-role', r); d.textContent = t; document.querySelector('main').appendChild(d); }, [role, text]);
  const poke = () => pg.evaluate(() => { const s = document.createElement('span'); document.querySelector('main').appendChild(s); });

  const cid = await pg.evaluate(() => window.__chatId());
  P.case('chat id keeps the WEB: prefix', cid === 'WEB:b4b1d92a-9efa-4f95-b2b9-84996b88ce74', { chatId: cid });

  await wait(1500 + 900);   // the block starts 1500 ms after load, then settles
  let ps = await posts();
  P.case('one push after the chat settles', ps.length === 1 && ps[0].type === 'GUARDIAN_TRANSCRIPT' && ps[0].agentId === 'repo-probe'
    && ps[0].chat.chatId.startsWith('WEB:') && ps[0].chat.messages.length === 4 && ps[0].chat.settled === true && ps[0].chat.generating === false,
    { n: ps.length, messages: ps[0] ? ps[0].chat.messages.length : null });

  await pg.evaluate(() => {
    const d = document.createElement('div'); d.setAttribute('data-message-author-role', 'assistant');
    document.querySelector('main').appendChild(d);
    let n = 0; window.__stream = setInterval(() => { d.textContent = 'streamed reply ' + 'x'.repeat(++n); if (n >= 15) clearInterval(window.__stream); }, 100);
  });
  await wait(1200);
  const during = (await posts()).length;
  await wait(1200);
  ps = await posts();
  const last = ps.length ? ps[ps.length - 1].chat.messages.slice(-1)[0].text : '';
  P.case('no push while a reply streams, one with the final text after', during === 1 && ps.length === 2 && last.endsWith('x'.repeat(15)), { during, after: ps.length, last_len: last.length });

  await pg.evaluate(() => {
    const pnl = document.createElement('div'); pnl.id = 'panel'; document.body.appendChild(pnl);
    let k = 0; window.__tick = setInterval(() => { pnl.textContent = 'tick ' + (++k); }, 100);
    const d = document.createElement('div'); d.setAttribute('data-message-author-role', 'user'); d.textContent = 'third question';
    document.querySelector('main').appendChild(d);
  });
  await wait(1200);
  ps = await posts();
  P.case('a ticking panel outside <main> does not stop the chat settling', ps.length === 3 && ps[2].chat.messages.slice(-1)[0].text === 'third question', { n: ps.length });
  await pg.evaluate(() => clearInterval(window.__tick));

  await pg.evaluate(() => { const s = document.createElement('span'); document.querySelector('main').appendChild(s); s.remove(); });
  await wait(1000);
  ps = await posts();
  P.case('an unchanged transcript is not re-sent', ps.length === 3, { n: ps.length });

  await pg.evaluate(() => { window.__guardianUp = false; });
  await append('assistant', 'reply while guardian is down');
  await wait(1000);
  const nDown = (await posts()).length;
  await pg.evaluate(() => { window.__guardianUp = true; }); await poke();
  await wait(1000);
  const nUp = (await posts()).length;
  await poke();
  await wait(1000);
  const nAfter = (await posts()).length;
  P.case('guardian down: re-sent on the next settle, and not after it answers', nDown === 4 && nUp === 5 && nAfter === 5, { down: nDown, up: nUp, after: nAfter });

  await pg.evaluate(() => {
    const d = document.createElement('div'); d.setAttribute('data-message-author-role', 'assistant'); document.querySelector('main').appendChild(d);
    let n = 0; window.__busy = setInterval(() => { d.textContent = 'never quiet ' + (++n); }, 100);
  });
  await wait(3200);
  const nBusy = (await posts()).length;
  await pg.evaluate(() => clearInterval(window.__busy));
  const forced = (await posts()).slice(5).map(x => x.chat.settled);
  P.case('a page that never goes quiet is still sent by the max wait, marked settled: false (0.39.255)', nBusy >= 6 && forced.length && forced[0] === false, { n: nBusy, settled: forced });

  await wait(900);
  const before = (await posts()).length;
  await pg.evaluate(() => { const s = document.createElement('span'); s.setAttribute('data-is-streaming', 'true'); s.id = 'gen'; document.querySelector('main').appendChild(s); });
  await wait(1000);
  ps = await posts();
  const genPost = ps.length > before ? ps[ps.length - 1].chat : null;
  await pg.evaluate(() => document.getElementById('gen').remove());
  await wait(1000);
  ps = await posts();
  const afterPost = ps.length ? ps[ps.length - 1].chat : null;
  P.case('generating is reported, and the same text is re-sent once it stops (0.39.255)',
    genPost !== null && genPost.generating === true && afterPost.generating === false && afterPost.settled === true && ps.length === before + 2, { before, n: ps.length });

  const pg2 = await b.newPage();
  await pg2.route('https://chatgpt.com/**', fixture);
  await pg2.goto('https://chatgpt.com/');
  await pg2.evaluate(SCRIPT);
  await pg2.waitForTimeout(2600);
  const n2 = await pg2.evaluate(() => window.__posts.length);
  P.case("a new chat with no id ('home') is never sent", n2 === 0, { n: n2 });

  P.case('no page errors', errors.length === 0, { errors });
  await b.close();
  P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
