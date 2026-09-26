'use strict';
/**
 * tests/probe/selector-check-chromium.js — 0.39.262 (was selector-check-chromium.py, v0.39.251).
 * Proves clear-glass/renderer/selector-check.js in a real page — Clear Glass's own engine —
 * on a saved ChatGPT-like page (tests/fixtures/chatgpt-like.html), against the real producer
 * and the real consumer, not copies of them:
 *   producer: the pick's xpath comes from guardian-picker.js's own getXPath(), extracted and run in the page.
 *   consumer: the assigned `resp` selector is read back through userscript-chatgpt.js's own _lastMatch().
 * Cases: reply picked deep inside the latest answer; an OLDER answer (refused); the input box
 * (picked on its inner <p>); the send button (picked on its svg path); a wrong role (refused);
 * a stale pick (refused); and a new reply appended after assignment — the same selector must
 * read the NEW reply, which is the whole point of refusing per-message ids.
 * Usage: node tests/probe/selector-check-chromium.js   (exit 0 = all pass, 3 = no page engine)
 */
const path = require('path');
const { pathToFileURL } = require('url');
const { start, extract } = require('./_glass-probe.js');
const P = start();
const CHECK_SRC = P.read('clear-glass/renderer/selector-check.js');
const GET_XPATH = extract(P.read('clear-glass/renderer/guardian-picker.js'), 'getXPath');
const LAST_MATCH = extract(P.read('guardian/userscript-chatgpt.js'), '_lastMatch');

(async () => {
  const b = await P.glass.chromium.launch();
  const pg = await b.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.goto(pathToFileURL(path.join(P.ROOT, 'tests/fixtures/chatgpt-like.html')).href);
  await pg.evaluate(CHECK_SRC);                                          // as the renderer injects it
  await pg.evaluate(`(() => { window.__getXPath = ${GET_XPATH.trim()}; })()`);   // guardian-picker's own
  await pg.evaluate(`(() => { window.__lastMatch = ${LAST_MATCH.trim()}; })()`); // the userscript's own
  const pick = (css, key) => pg.evaluate(([c, k]) => window.__cgSelectorCheck.check({ xpath: window.__getXPath(document.querySelector(c)), key: k }), [css, key]);
  const readBack = (sel) => pg.evaluate((s) => (window.__lastMatch(s) || {}).innerText || '', sel);

  // xpaths without ids too: strip the fixture's convenience ids so getXPath produces the positional form it produces on real pages
  await pg.evaluate(() => { for (const id of ['old-p', 'new-p', 'new-strong', 'input-p', 'send-path']) { const e = document.getElementById(id); e.dataset.probe = id; e.removeAttribute('id'); } });
  const q = (probe) => `[data-probe="${probe}"]`;

  let r = await pick(q('new-strong'), 'resp');
  const read = r.ok ? await readBack(r.selector) : '';
  P.case('resp: picked <strong> inside the latest answer', !!(r.ok && !(r.selector || '').includes('message-id') && !(r.selector || '').startsWith('#')
    && read.includes('Latest answer, paragraph one.') && read.includes('paragraph two') && !read.includes('Older')),
    { selector: r.selector, matched: r.matched, depth: r.depth, consumerRead: read.slice(0, 80), why: r.why });
  const respSel = r.selector;

  r = await pick(q('old-p'), 'resp');
  P.case('resp: an older answer is refused', !r.ok && (r.why || '').includes('latest answer'), { why: r.why || '', tried: (r.tried || []).length });

  r = await pick(q('input-p'), 'input');
  P.case('input: picked the <p> inside the composer', !!(r.ok && r.selector === '#prompt-textarea' && r.matched === 1), { selector: r.selector, why: r.why });

  r = await pick(q('send-path'), 'send');
  P.case('send: picked the svg path inside the button', !!(r.ok && (r.selector || '').includes('send-button') && r.matched === 1), { selector: r.selector, why: r.why });

  r = await pick(q('send-path'), 'input');
  P.case('wrong role: a button is not an input', !r.ok && (r.why || '').includes('editable'), { why: r.why || '' });

  r = await pg.evaluate(() => window.__cgSelectorCheck.check({ xpath: '/html/body/nope[9]', key: 'resp' }));
  P.case('stale pick is refused', !r.ok && (r.why || '').includes('pick it again'), { why: r.why || '' });

  const gen = await pg.evaluate(() => ['css-9x8k2m', 'css-4kd92z', '0c7d1f2a-4444-4a4b-9c9d-dddddddddddd', ':r1:', 'conversation-turn-12345', 'conversation-turn-6'].map(v => window.__cgSelectorCheck.looksGenerated(v)));
  P.case('generated values are never selector material', gen.every(Boolean), { flags: gen });

  await pg.evaluate(() => {
    const t = document.createElement('article'); t.setAttribute('data-testid', 'conversation-turn-6'); t.className = '_a1b2c3';
    t.innerHTML = '<div data-message-author-role="assistant" data-message-id="0c7d1f2a-6666-4a4b-9c9d-ffffffffffff"><div class="markdown prose w-full"><p>Brand new reply.</p></div></div>';
    document.getElementById('thread').appendChild(t);
  });
  const read2 = respSel ? await readBack(respSel) : '';
  P.case('after a new reply, the same selector reads the NEW reply', read2.trim() === 'Brand new reply.', { consumerRead: read2 });

  // one reply on the page: nothing can match twice, so the pick is accepted but flagged single
  await pg.evaluate(() => { document.querySelectorAll('article').forEach((a, i, all) => { if (i < all.length - 1) a.remove(); }); });
  await pg.evaluate(() => { const p = document.querySelector('[data-testid="conversation-turn-6"] p'); p.dataset.probe = 'only-p'; });
  r = await pick(q('only-p'), 'resp');
  const alts = (r.alternatives || []).map(a => a.selector);
  P.case('one reply on the page: flagged single, every passing candidate offered to choose from',
    !!(r.ok && r.single === true && r.matched === 1 && alts.includes('[data-message-author-role="assistant"]') && alts.includes('div.markdown.prose.w-full') && !alts.some(a => a.includes('conversation-turn'))),
    { alternatives: alts });

  P.case('no page errors', errors.length === 0, { errors });
  await b.close();
  P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
