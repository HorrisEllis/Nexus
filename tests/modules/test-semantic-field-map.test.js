'use strict';
/**
 * tests/modules/test-semantic-field-map.test.js — SP2 (docs/2026-10-15-capability-specs-and-semantic-page-tree-phasemap.spec):
 * the provider userscripts' field map finds a picked field by its semantic address when its selector breaks.
 * clear-glass/src/page/semantic-tree.js addressScript / preludeSource / roleFits · clear-glass/src/providers/attention.js
 * checkPick · guardian/lib/selector-map.js · guardian/userscript-field-map.js · clear-glass/src/providers/host.js.
 * James (2026-10-15): "alright." (SP2 first, then the gap sweep). His run: Claude's reply not found; ChatGPT's
 * placeholder <p> saved as the send button — class churn and a wrong pick, both of which an address and a role answer.
 *
 *   SF-01  a pick's xpath → its address: the send button, the contenteditable input; a reply's inner <div> → its article
 *   SF-02  a pick whose role does not fit its field is refused, said (send must be a button, input a text box)
 *   SF-03  Guardian's selector map carries the address recorded with the pick
 *   SF-04  with every class renamed, the field map still finds the input, the send button and the LAST reply by address
 *   SF-05  wired: the host injects window.NexusSemantic before the field map; the picker records the address as evidence
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '../..');
const S = require(path.join(ROOT, 'clear-glass/src/page/semantic-tree.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 6).join('\n    ')}`); failed++; }
}
const chat = (cls = 'Zq3') => `<html><head><title>Claude</title></head><body>
  <nav aria-label="Chats"><a href="/c/1" class="${cls}a">Old chat</a></nav>
  <main class="${cls}m">
    <article class="${cls}u"><div class="${cls}t">hello</div></article>
    <article class="${cls}r1"><div class="${cls}x">first reply</div></article>
    <article class="${cls}r2"><div class="${cls}x" id="r2">second reply</div></article>
    <form class="${cls}f"><div contenteditable="true" class="${cls}i" aria-label="Write your prompt"><p class="${cls}p"></p></div>
      <button aria-label="Send message" class="${cls}s"><svg></svg></button></form>
  </main>
</body></html>`;
const page = (html) => new JSDOM(html, { url: 'https://claude.ai/new', runScripts: 'outside-only' });

(async () => {
  console.log('\ntest-semantic-field-map — SP2: picked fields found by address after class churn (0.60.50)');

  await test('SF-01', "a pick's xpath gives its address; a reply's inner div gives its article", async () => {
    const w = page(chat()).window;
    const at = (xp) => w.eval(S.addressScript(xp));
    const send = at('/html[1]/body[1]/main[1]/form[1]/button[1]');
    assert.deepStrictEqual([send.address, send.role, send.exact], ['main › form › button "Send message"', 'button', true]);
    const input = at('/html[1]/body[1]/main[1]/form[1]/div[1]');
    assert.strictEqual(input.role, 'textbox'); assert.ok(/textbox "Write your prompt"$/.test(input.address), input.address);
    const reply = at('//*[@id="r2"]');
    assert.deepStrictEqual([reply.address, reply.role, reply.exact], ['main › article #3', 'article', false], 'the nearest kept container');
    assert.strictEqual(at('//nothing'), null);
  });

  await test('SF-02', 'a pick whose role does not fit its field is refused, with the reason', async () => {
    const CA = require(path.join(ROOT, 'clear-glass/src/providers/attention.js'));
    const placeholder = await CA.checkPick(null, { tag: 'button', selector: 'p.x', matched: 1, anchor: {}, semantic: { address: 'main › form › textbox "Write"', role: 'textbox', exact: true } }, 'send', null);
    assert.ok(!placeholder.selector && /a textbox, not a button/.test(placeholder.why), JSON.stringify(placeholder));
    const wrongInput = await CA.checkPick(null, { tag: 'div', selector: 'div.x', matched: 1, anchor: {}, semantic: { address: 'main › button "Send"', role: 'button', exact: true } }, 'input', null);
    assert.ok(!wrongInput.selector && /not a text box/.test(wrongInput.why));
    const ok = await CA.checkPick(null, { tag: 'button', selector: 'button.s', matched: 1, anchor: {}, semantic: { address: 'main › form › button "Send message"', role: 'button', exact: true } }, 'send', null);
    assert.strictEqual(ok.selector, 'button.s');
    const reply = await CA.checkPick(null, { tag: 'div', selector: 'div.x', matched: 2, anchor: {}, semantic: { address: 'main › article #3', role: 'article', exact: false } }, 'resp', null);
    assert.strictEqual(reply.selector, 'div.x', 'a reply can be anything');
    assert.ok(S.roleFits('input', 'combobox') && !S.roleFits('send', 'link') && S.roleFits('resp', 'article'));
  });

  await test('SF-03', "Guardian's selector map carries the pick's address", async () => {
    const SM = require(path.join(ROOT, 'guardian/lib/selector-map.js'));
    const reg = { get: () => ({ selectors: { input: 'div.i', send: 'button.s', resp: 'div.x' }, selectorHistory: [
      { to: { send: 'button.s' }, source: 'picker', evidence: { anchor: { x: 1 }, semantic: { address: 'main › form › button "Send message"', role: 'button', name: 'Send message', exact: true } } },
      { to: { input: 'div.i' }, source: 'picker', evidence: { semantic: null } }] }) };
    const m = SM.mapFor(reg, 'claude');
    assert.deepStrictEqual(m.semantics.send, { address: 'main › form › button "Send message"', role: 'button', name: 'Send message', exact: true });
    assert.ok(!m.semantics.input, 'no address recorded → none sent');
    assert.ok(m.verified.send && m.anchors.send);
  });

  await test('SF-04', 'every class renamed: input, send and the last reply are still found, by address', async () => {
    const picked = page(chat('Zq3')).window;
    const addr = (xp) => picked.eval(S.addressScript(xp));
    const sems = { input: addr('/html[1]/body[1]/main[1]/form[1]/div[1]'), send: addr('/html[1]/body[1]/main[1]/form[1]/button[1]'), resp: addr('//*[@id="r2"]') };
    const w = page(chat('Kp9')).window;   // the site shipped new class names: every picked selector now misses
    w.eval(S.preludeSource());
    w.eval(fs.readFileSync(path.join(ROOT, 'guardian/userscript-field-map.js'), 'utf8'));
    w.eval(`NexusFields.set('claude', ${JSON.stringify({ selectors: { input: 'div.Zq3i', send: 'button.Zq3s', resp: 'div.Zq3x' }, verified: { input: true, send: true, resp: true }, anchors: {}, semantics: sems })})`);
    assert.strictEqual(w.eval("document.querySelectorAll('button.Zq3s').length"), 0, 'the selector is broken');
    assert.strictEqual(w.eval("NexusFields.find('send') && NexusFields.find('send').getAttribute('aria-label')"), 'Send message');
    assert.strictEqual(w.eval("NexusFields.find('input') && NexusFields.find('input').getAttribute('aria-label')"), 'Write your prompt');
    assert.strictEqual(w.eval("NexusFields.find('resp') && NexusFields.find('resp').textContent.trim()"), 'second reply', 'the last reply');
    assert.strictEqual(w.eval('NexusFields.state().lastHow.send'), 'semantic');
    assert.strictEqual(w.eval("NexusFields.type('hi')"), true, 'type() writes through the address');
    // a page with a new reply: the last one is still the one read
    w.eval("var a=document.createElement('article');a.className='Kp9r3';a.innerHTML='<div>third</div>';document.querySelector('main').insertBefore(a, document.querySelector('form'))");
    assert.strictEqual(w.eval("NexusFields.find('resp').textContent.trim()"), 'third');
    // no address recorded → nothing guessed
    w.eval(`NexusFields.set('claude', ${JSON.stringify({ selectors: { send: 'button.Zq3s' }, verified: { send: true }, anchors: {}, semantics: {} })})`);
    assert.strictEqual(w.eval("NexusFields.find('send')"), null);
  });

  await test('SF-05', 'wired: the host injects NexusSemantic before the field map; the picker records the address', async () => {
    const host = fs.readFileSync(path.join(ROOT, 'clear-glass/src/providers/host.js'), 'utf8');
    const i = host.indexOf("preludeSource()"), j = host.indexOf("'userscript-field-map.js'");
    assert.ok(i > 0 && j > i, 'the semantic prelude comes before the field map');
    const att = fs.readFileSync(path.join(ROOT, 'clear-glass/src/providers/attention.js'), 'utf8');
    assert.ok(/ST\.addressScript\(picked\.xpath\)/.test(att) && /semantic: picked\.semantic \|\| null/.test(att));
    const C = require(path.join(ROOT, 'lib/capability-spec.js'));
    const r = C.check(fs.readFileSync(path.join(ROOT, 'clear-glass/spec/semantic-tree.spec'), 'utf8'), { root: ROOT });
    assert.ok(r.ok, r.reason);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
