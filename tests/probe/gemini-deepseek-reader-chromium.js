'use strict';
/**
 * tests/probe/gemini-deepseek-reader-chromium.js — 0.39.279.
 * James: "can you fix gemini and deepseek." Proves each script's _nexusGetFullChat (extracted from the real file, with
 * _replyText, chatId and findResponseEl) reads BOTH sides of the conversation in page order, keeps the thinking apart
 * from the reply, keeps code fences, and falls back to the last reply alone (partial) on a page without turns.
 * The pages are built to the DOM shapes named in the scripts (<user-query>/<model-response>, .ds-message); the live
 * gemini.google.com / chat.deepseek.com DOM is not reachable from here.
 * Usage: node tests/probe/gemini-deepseek-reader-chromium.js   (exit 0 = all pass, 3 = no page engine)
 */
const { start, extract } = require('./_glass-probe.js');
const P = start();

const GEMINI = `<!doctype html><html><body><main>
<user-query><div class="query-text"><p>write a retry helper</p></div></user-query>
<model-response><model-thoughts><button aria-expanded="true">Show thinking</button><div class="thoughts-content">Backoff should double.</div></model-thoughts>
<message-content><div class="markdown"><p>Here it is:</p><pre><code class="language-js">const retry = 1;</code></pre></div></message-content></model-response>
<user-query><div class="query-text"><p>thanks</p></div></user-query>
<model-response><message-content><div class="markdown"><p>You're welcome.</p></div></message-content></model-response>
</main></body></html>`;

const DEEPSEEK = `<!doctype html><html><body><main>
<div class="ds-message"><div>explain the kernel</div></div>
<div class="ds-message"><div class="ds-think-content">The kernel owns the bus.</div><div class="ds-markdown"><p>The kernel routes every event.</p></div></div>
<div class="ds-message"><div>and the bus?</div></div>
<div class="ds-message"><div class="ds-markdown"><p>The bus carries them.</p></div></div>
</main></body></html>`;

const EMPTY = `<!doctype html><html><body><main><div class="ds-markdown"><p>only a reply</p></div><div class="model-response-text">only a reply</div></main></body></html>`;

function script(provider) {
  const US = P.read(`guardian/userscript-${provider}.js`);
  const extra = provider === 'gemini' ? extract(US, '_gmText') : '';
  return `(() => { const PROVIDER = '${provider}';
    ${extract(US, '_replyText')} ${extract(US, 'chatId')} ${extract(US, 'findResponseEl')} ${extra} ${extract(US, '_nexusGetFullChat')}
    window.__read = _nexusGetFullChat; })()`;
}

(async () => {
  const b = await P.glass.chromium.launch();
  const pg = await b.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  let body = GEMINI;
  await pg.route('https://gemini.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body }));
  await pg.route('https://chat.deepseek.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body }));

  await pg.goto('https://gemini.google.com/app/abc123');
  await pg.evaluate(script('gemini'));
  let c = await pg.evaluate(() => window.__read());
  P.case('gemini: both sides, in page order', JSON.stringify(c.messages.map(m => m.role)) === '["user","assistant","user","assistant"]' && !c.partial, { roles: c.messages.map(m => m.role) });
  P.case('gemini: the question is the user turn', c.messages[0].text === 'write a retry helper', { got: c.messages[0].text });
  P.case('gemini: thinking kept apart, reply keeps its code fence', c.messages[1].thinking === 'Backoff should double.' && /```js\nconst retry = 1;\n```/.test(c.messages[1].text) && !c.messages[1].text.includes('Backoff'), { m: c.messages[1] });
  P.case('gemini: chat id from /app/<id>', c.chatId === 'abc123');

  body = DEEPSEEK;
  await pg.goto('https://chat.deepseek.com/a/chat/s/xyz');
  await pg.evaluate(script('deepseek'));
  c = await pg.evaluate(() => window.__read());
  P.case('deepseek: both sides, in page order', JSON.stringify(c.messages.map(m => m.role)) === '["user","assistant","user","assistant"]' && !c.partial, { roles: c.messages.map(m => m.role) });
  P.case('deepseek: thinking kept apart from the reply', c.messages[1].thinking === 'The kernel owns the bus.' && c.messages[1].text === 'The kernel routes every event.', { m: c.messages[1] });
  P.case('deepseek: the user turns read whole', c.messages[0].text === 'explain the kernel' && c.messages[2].text === 'and the bus?');
  P.case('deepseek: chat id is the session id of /a/chat/s/<id>', c.chatId === 'xyz', { chatId: c.chatId });

  body = EMPTY;
  for (const [prov, url] of [['gemini', 'https://gemini.google.com/app/e1'], ['deepseek', 'https://chat.deepseek.com/a/chat/s/e1']]) {
    await pg.goto(url);
    await pg.evaluate(script(prov));
    c = await pg.evaluate(() => window.__read());
    P.case(`${prov}: no turns on the page → the last reply alone, marked partial`, c.partial === true && c.messages.length === 1 && c.messages[0].text === 'only a reply', { c });
  }
  P.case('no page errors', errors.length === 0, { errors });
  await b.close();
  P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
