'use strict';
/**
 * tests/modules/test-gig-all-fields.test.js — every field of the gig, and his site keys when there is friction (GF1–GF4, 0.60.290)
 * James, 2026-10-30: "the fiverr automation. isn't working. like the autofill needs to do all the work it can. like can you fix the autofill
 * to work with all fields, and if you run into friction use the per site keybindings that I proposed."
 *
 *   GF-01  in Clear Glass: the field scripts find the title and the description by their section's words (never the FAQ's box), and never
 *          press Save & Continue
 *   GF-02  every editor page is placed (Overview, Scope & Pricing, Description & FAQ, Requirements, Gallery) and lists its parts; a key may
 *          name the gig part it serves
 *   GF-03  in Clear Glass: the fill types the title, a rich description (an editor that ignores a value set from script), two FAQs and two
 *          buyer questions, each read back; one already shown is not added twice; Save & Continue is never pressed
 *   GF-04  in Clear Glass: a description box the fill cannot find by its words is filled through the key he bound to it (part: description);
 *          with no key bound, the part says how to bind one
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

const HEAD = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px sans-serif;margin:30px} .ed{border:1px solid #888;min-height:60px;padding:6px;width:500px}
section{margin:14px 0} input,textarea{width:400px}</style></head><body><nav>Overview · Pricing · Description &amp; FAQ · Requirements · Gallery</nav>`;
const SAVE = `<button id="save" onclick="window.saved=true">Save &amp; Continue</button>`;
// a rich editor with its own model: it keeps only what arrives as input (typed / inserted), never a textContent written from script
const RICH = (id) => `<div class="ed" id="${id}" contenteditable="true"></div><script>(function(){ var ed = document.getElementById('${id}'); window.model_${id} = '';
  ed.addEventListener('input', function(e){ if (e.inputType && e.inputType !== 'insertFromPaste') window.model_${id} = ed.innerText; });
  new MutationObserver(function(){ if (ed.innerText !== window.model_${id} && !document.activeElement) {} }).observe(ed, { childList: true, characterData: true, subtree: true }); })();</script>`;
const LISTS = `<script>
function adder(btnId, boxesHtml, listId, read){ var b = document.getElementById(btnId); b.onclick = function(){ var f = document.createElement('div'); f.className = 'form'; f.innerHTML = boxesHtml + '<button class="cancel">Cancel</button><button class="add">Add</button>';
  b.parentElement.appendChild(f); f.querySelector('.cancel').onclick = function(){ f.remove(); };
  f.querySelector('.add').onclick = function(){ var li = document.createElement('li'); li.textContent = read(f); document.getElementById(listId).appendChild(li); f.remove(); }; }; }
</script>`;

const PAGES = {
  overview: `${HEAD}<section><h3>Gig title</h3><textarea id="t"></textarea></section><section><h3>Search tags</h3><input id="tag"></section>${SAVE}</body></html>`,
  description: `${HEAD}<h2>Description &amp; FAQ</h2><section><h3>Description</h3><p>Briefly Describe Your Gig</p>${RICH('ed')}</section>
<section><h3>Frequently Asked Questions</h3><ul id="faqs"><li>Do you sign an NDA?</li></ul><button id="addfaq">+ Add FAQ</button></section>${SAVE}${LISTS}
<script>adder('addfaq', '<input placeholder="Add a Question: i.e. Do you translate to English as well?"><textarea placeholder="Add an Answer: i.e. Yes, I also translate from English to Hebrew."></textarea>', 'faqs', function(f){ return f.querySelector('input').value + ' — ' + f.querySelector('textarea').value; });</script></body></html>`,
  requirements: `${HEAD}<h2>Get all the information you need from buyers to get started</h2><ol id="qs"></ol><button id="addq">+ Add New Question</button>${SAVE}${LISTS}
<script>adder('addq', '<textarea placeholder="Request necessary details such as dimensions, brand guidelines, and more."></textarea><select><option>Free Text</option></select>', 'qs', function(f){ return f.querySelector('textarea').value; });</script></body></html>`,
  // the description box under words the fill does not know: only his bound key reaches it
  odd: `${HEAD}<h2>Description &amp; FAQ</h2><section><h3>Tell buyers what you do</h3>${RICH('ed2')}</section><section><h3>Frequently Asked Questions</h3><button>+ Add FAQ</button></section>${SAVE}</body></html>`,
};
const TAB = { overview: 'general', description: 'description', requirements: 'requirements', odd: 'description' };

(async () => {
  console.log('\n⬡  Fiverr: every field of the gig, and his site keys on friction\n');
  const GP = require(CG('src/autofill/gig-pages.js'));
  const GF = require(CG('src/autofill/gig-fields.js'));
  const SK = require(CG('src/shortcuts/site-keys.js'));

  await test('GF-02', 'every editor page is placed and lists its parts; a key may name the gig part it serves', async () => {
    const at = (tab, text) => GP.gigPage({ url: `https://www.fiverr.com/users/x/manage_gigs/a/edit?wizard=0&tab=${tab}`, text }).page;
    assert.strictEqual(at('general', 'Gig title Search tags'), 'overview');
    assert.strictEqual(at('pricing', 'Scope & Pricing Packages BASIC'), 'pricing');
    assert.strictEqual(at('description', 'Description Briefly Describe Your Gig Frequently Asked Questions + Add FAQ'), 'description');
    assert.strictEqual(at('requirements', 'Get all the information you need from buyers + Add New Question'), 'requirements');
    assert.strictEqual(at('gallery', 'Showcase your services in a Gig Gallery'), 'gallery');
    assert.strictEqual(GP.gigPage({ url: 'https://www.fiverr.com/x', text: 'Frequently Asked Questions + Add FAQ' }).page, 'description', 'two of its words without the address');
    assert.strictEqual(GP.gigPage({ url: 'https://www.fiverr.com/x', text: 'hello' }).page, null, 'unknown is said, never guessed');
    assert.deepStrictEqual([GP.PARTS.overview, GP.PARTS.description, GP.PARTS.requirements, GP.PARTS.gallery], [['title', 'category', 'tags'], ['description', 'faq'], ['requirement'], []]);
    assert.strictEqual(GP.valueOf({ title: 'I will build your bot' }, 'title'), 'build your bot', 'the editor shows "I will" itself');
    const b = SK.bind({}, 'https://www.fiverr.com/a', 'Alt+D', { do: 'click', selector: '//div[@id="ed2"]', part: 'description' });
    assert.deepStrictEqual(b.binding, { do: 'click', selector: '//div[@id="ed2"]', part: 'description' });
    assert.deepStrictEqual(SK.forPart(b.map, 'https://www.fiverr.com/other/page', 'description').map(k => k.accel), ['Alt+D']);
    assert.deepStrictEqual(SK.forPart(b.map, 'https://example.com/', 'description'), [], 'only on its own site');
    assert.strictEqual(SK.validate({ do: 'click', selector: 'x', part: 'no spaces allowed' }).ok, false);
  });

  const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(PAGES[req.url.slice(1)] || 'no'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - GF-01/03/04 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
  const KEY = { Enter: ['Enter', 13], Down: ['ArrowDown', 40], Up: ['ArrowUp', 38], A: ['a', 65], Backspace: ['Backspace', 8] };
  function driverOn(page) {
    const ClearDriver = require(CG('src/driver/index.js'));
    const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
    d._getWebContents = () => ({ executeJavaScript: (c) => page._eval(c), getURL: () => base, insertText: (t) => page._send('Input.insertText', { text: t }), sendInputEvent: (e) => {
      if (MAP[e.type]) return page._send('Input.dispatchMouseEvent', { type: MAP[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : (e.button || 'left'), buttons: e.type === 'mouseDown' ? 1 : 0, clickCount: e.type === 'mouseMove' ? 0 : (e.clickCount || 1) });
      if (e.type === 'char') return e.keyCode === 'Enter' ? page._send('Input.dispatchKeyEvent', { type: 'char', text: '\r', key: 'Enter', windowsVirtualKeyCode: 13 }) : page._send('Input.insertText', { text: e.keyCode });
      const k = KEY[e.keyCode] || [e.keyCode, String(e.keyCode).toUpperCase().charCodeAt(0)];
      if (e.type === 'keyDown') return page._send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k[0], code: k[0], windowsVirtualKeyCode: k[1] });
      if (e.type === 'keyUp') return page._send('Input.dispatchKeyEvent', { type: 'keyUp', key: k[0], windowsVirtualKeyCode: k[1] }); } });
    return d;
  }
  const Bridge = require(CG('src/ipc/bridge.js'));
  // the bridge's fill, on a page served here but read as Fiverr's editor at its tab; dom label-matching sees no fields (the editor has none it knows)
  function selfOn(page, which, siteKeys = {}) {
    const d = driverOn(page);
    const url = `https://www.fiverr.com/users/x/manage_gigs/a/edit?wizard=0&tab=${TAB[which]}`;
    return { dom: { handleQuery: async () => [], handleMutate: async () => ({}) }, postEvent: () => {}, _humanCheckGate: async () => ({ pass: true }),
      options: { getSiteKeys: () => siteKeys },
      _gigTags: Bridge.prototype._gigTags, _gigFeatures: Bridge.prototype._gigFeatures, _gigText: Bridge.prototype._gigText,
      _gigList: Bridge.prototype._gigList, _gigSiteKey: Bridge.prototype._gigSiteKey,
      driver: { exec: (a) => (a.action === 'readPage' ? d.exec(a).then(x => ({ ...x, url })) : d.exec({ ...a, ...(a.action === 'type' ? { delay: 5 } : {}) })) } };
  }
  const GIG = { title: 'I will build a custom AI agent for your business', category: 'Programming & Tech', subcategory: 'AI Development', tags: [],
    description: 'I build AI agents that do real work.\nEach one is tested on your data before delivery.', packages: {},
    faq: [{ question: 'Do you sign an NDA?', answer: 'Yes.' }, { question: 'Which models do you use?', answer: 'Claude, GPT or a local model, your choice.' }, { question: 'Can you host it?', answer: 'Yes, on your server or mine.' }],
    requirements: ['What should the agent do, in one sentence?', 'Which tools or accounts must it use?'] };

  if (browser) await test('GF-01', 'in Clear Glass: the title and the description found by their words, never the FAQ box; Save is never pressed', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.goto(base + '/description');
    await page.evaluate(() => document.getElementById('addfaq').click());   // an FAQ form open beside the description
    const r = await page.evaluate(GF.fieldScript('description', GF.SECTIONS.description.re, { exclude: GF.SECTIONS.description.exclude, prefer: 'rich' }));
    assert.deepStrictEqual([r.found, r.kind], [true, 'rich'], JSON.stringify(r));
    assert.strictEqual(await page.evaluate(() => document.querySelector('[data-cg-part="description"]').id), 'ed');
    const s = await page.evaluate(GF.clickButtonScript(/save/i));
    assert.deepStrictEqual([s.clicked, s.why], [false, 'yours to press']);
    assert.strictEqual(await page.evaluate(() => window.saved), undefined);
    await page.goto(base + '/overview');
    const t = await page.evaluate(GF.fieldScript('title', GF.SECTIONS.title.re));
    assert.ok(t.found && t.kind === 'textarea', JSON.stringify(t));
    assert.strictEqual(await page.evaluate(() => document.querySelector('[data-cg-part="title"]').id), 't', 'the title, not the tags box');
    await page.close();
  });

  if (browser) await test('GF-03', 'in Clear Glass: title, rich description, FAQs and buyer questions filled and read back; nothing twice; Save never pressed', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.goto(base + '/overview');
    let r = await Bridge.prototype._gigFill.call(selfOn(page, 'overview'), { gig: { ...GIG, category: '' } });
    assert.strictEqual(r.page, 'overview', JSON.stringify(r).slice(0, 300));
    assert.ok(r.filled.some(f => f.key === 'title'), JSON.stringify(r.notFound));
    assert.strictEqual(await page.evaluate(() => document.getElementById('t').value), 'build a custom AI agent for your business');

    await page.goto(base + '/description');
    r = await Bridge.prototype._gigFill.call(selfOn(page, 'description'), { gig: GIG });
    assert.strictEqual(r.page, 'description', JSON.stringify(r).slice(0, 300));
    assert.ok(r.filled.some(f => f.key === 'description' && /rich/.test(f.source)), JSON.stringify({ filled: r.filled, notFound: r.notFound }));
    const model = await page.evaluate(() => window.model_ed);
    assert.ok(/I build AI agents that do real work\.\n+Each one is tested/.test(model), `the editor's own model holds it (typed, not set): ${JSON.stringify(model)}`);
    assert.deepStrictEqual(r.faqs, { done: [1, 2], already: [0], failed: [] }, JSON.stringify(r.notFound));
    assert.deepStrictEqual(await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#faqs li'), li => li.textContent)),
      ['Do you sign an NDA?', 'Which models do you use? — Claude, GPT or a local model, your choice.', 'Can you host it? — Yes, on your server or mine.']);

    await page.goto(base + '/requirements');
    r = await Bridge.prototype._gigFill.call(selfOn(page, 'requirements'), { gig: GIG });
    assert.deepStrictEqual(r.requirements, { done: [0, 1], already: [], failed: [] }, JSON.stringify(r.notFound));
    assert.deepStrictEqual(await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#qs li'), li => li.textContent)), GIG.requirements);
    // a second fill adds nothing twice
    r = await Bridge.prototype._gigFill.call(selfOn(page, 'requirements'), { gig: GIG });
    assert.deepStrictEqual(r.requirements, { done: [], already: [0, 1], failed: [] });
    // only what is ticked: one question
    await page.goto(base + '/requirements');
    r = await Bridge.prototype._gigFill.call(selfOn(page, 'requirements'), { gig: GIG, only: ['requirement.1'] });
    assert.deepStrictEqual(r.requirements.done, [1]);
    assert.strictEqual(await page.evaluate(() => window.saved), undefined, 'Save & Continue is his');
    await page.close();
  });

  if (browser) await test('GF-04', 'in Clear Glass: friction goes to his key for the part; with none bound, the part says how to bind one', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    await page.goto(base + '/odd');
    const gig = { ...GIG, faq: [] };
    let r = await Bridge.prototype._gigFill.call(selfOn(page, 'odd'), { gig });
    const nf = r.notFound.find(x => x.key === 'description');
    assert.ok(nf && /no text box under the words/.test(nf.why) && /Bind a key, and set "for gig part" to description/.test(nf.why), JSON.stringify(r.notFound));
    const keys = SK.bind({}, 'https://www.fiverr.com/users/x', 'Alt+D', { do: 'click', selector: '//div[@id="ed2"]', part: 'description' }).map;
    r = await Bridge.prototype._gigFill.call(selfOn(page, 'odd', keys), { gig });
    assert.deepStrictEqual(r.siteKeys.map(k => [k.key, k.accel, k.how]), [['description', 'Alt+D', 'typed at the element you bound']], JSON.stringify(r.notFound));
    assert.ok(!r.notFound.some(x => x.key === 'description'));
    assert.ok(/I build AI agents that do real work/.test(await page.evaluate(() => window.model_ed2)), 'typed into the editor he bound');
    await page.close();
  });

  if (browser) await browser.close();
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
