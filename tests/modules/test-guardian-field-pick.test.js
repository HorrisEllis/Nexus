'use strict';
/**
 * tests/modules/test-guardian-field-pick.test.js — 0.60.71: the provider attention panel's picks use the Guardian picker,
 * so the person can walk the page one element at a time. clear-glass/renderer/guardian-picker.js pickField ·
 * clear-glass/src/providers/attention.js guardianPickScript / describeScript / checkPick.
 * James (2026-10-16): "when its asking me to pick the inputs or response, or what ever. its needs to use the guardian
 * picker so i can traverse through the elements one at a time."
 *
 *   GF-01  click the placeholder <p> (the wrong element his run once saved), walk ↑ to the input and → to the send
 *          button with the arrow keys, Enter: the promise gives the button's xpath; the field popup said what each step was
 *   GF-02  the element settled on is described the way a pick is (selector, matched, anchor) and passes the send check
 *          and the role check; the input it passed through is a textbox
 *   GF-03  Esc cancels the pick; the popup's ↑ PARENT button walks too; CANCEL resolves cancelled
 *   GF-04  without the host's flag the picker still starts in its own callto mode (the context-menu path is unchanged)
 *   GF-05  wired: the panel's pick goes through the Guardian picker first and says when it falls back to the one-click one
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '../..');
const A = require(path.join(ROOT, 'clear-glass/src/providers/attention.js'));
const ST = require(path.join(ROOT, 'clear-glass/src/page/semantic-tree.js'));
const SRC = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/guardian-picker.js'), 'utf8');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 6).join('\n    ')}`); failed++; }
}
const PAGE = `<html><body><main><form>
  <div contenteditable="true" aria-label="Write your prompt"><p class="placeholder" data-placeholder="Ask anything"></p></div>
  <button aria-label="Send message"><svg></svg></button>
</form></main></body></html>`;
const page = () => {
  const w = new JSDOM(PAGE, { url: 'https://claude.ai/new', runScripts: 'outside-only', pretendToBeVisual: true }).window;
  w.document.elementsFromPoint = () => [];
  return w;
};
const key = (w, k) => w.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const down = (w, el) => el.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
const same = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);   // the page's objects come from its own realm
const what = (w) => w.document.getElementById('__g-field-what').textContent;

(async () => {
  console.log('\ntest-guardian-field-pick — picks walk the page one element at a time (0.60.71)');
  let settled = null, w1 = null;

  await test('GF-01', 'click the placeholder, ↑ to the input, → to the send button, Enter', async () => {
    const w = w1 = page();
    const pending = w.eval(A.guardianPickScript('send', SRC));
    assert.ok(/PICK THE SEND BUTTON/.test(w.document.getElementById('__g-esc').textContent), 'the banner names the field');
    down(w, w.document.querySelector('p.placeholder'));
    const popup = w.document.getElementById('__g-popup');
    assert.ok(popup.classList.contains('show') && popup.classList.contains('field-mode'), 'the field popup is open');
    assert.ok(/^<p>/.test(what(w)), what(w));
    key(w, 'ArrowUp');
    assert.ok(/^<div> · textbox · "Write your prompt"/.test(what(w)), what(w));
    key(w, 'ArrowRight');
    assert.ok(/^<button> · button · "Send message"/.test(what(w)), what(w));
    key(w, 'Enter');
    settled = await pending;
    assert.ok(settled && settled.xpath && settled.traversed, JSON.stringify(settled));
    assert.ok(!popup.classList.contains('show'), 'the popup closes');
  });

  await test('GF-02', 'the settled element is described like a pick and passes the send and role checks', async () => {
    const d = w1.eval(A.describeScript(settled.xpath, 'send'));
    same([d.tag, d.selector, d.matched], ['button', 'button[aria-label="Send message"]', 1]);
    assert.ok(d.anchor && typeof d.anchor.rx === 'number');
    d.semantic = w1.eval(ST.addressScript(d.xpath));
    assert.strictEqual(d.semantic.role, 'button');
    const c = await A.checkPick(null, d, 'send', null);
    assert.strictEqual(c.selector, 'button[aria-label="Send message"]', JSON.stringify(c));
  });

  await test('GF-03', 'Esc cancels; ↑ PARENT walks; CANCEL resolves cancelled', async () => {
    const w = page();
    let p = w.eval(A.guardianPickScript('input', SRC));
    key(w, 'Escape');
    same(await p, { cancelled: true }, 'Esc while hovering');
    p = w.eval(A.guardianPickScript('input', SRC));
    down(w, w.document.querySelector('p.placeholder'));
    w.document.getElementById('__g-zoom-parent').click();
    assert.ok(/textbox/.test(what(w)), what(w));
    w.document.getElementById('__g-field-cancel').click();
    same(await p, { cancelled: true });
    p = w.eval(A.guardianPickScript('input', SRC));
    down(w, w.document.querySelector('p.placeholder'));
    key(w, 'Escape');
    same(await p, { cancelled: true }, 'Esc with the popup open');
  });

  await test('GF-04', 'without the flag the picker starts in its own callto mode', async () => {
    const w = page();
    w.eval(SRC);
    down(w, w.document.querySelector('button'));
    const popup = w.document.getElementById('__g-popup');
    assert.ok(popup.classList.contains('show') && !popup.classList.contains('field-mode'));
    assert.strictEqual(w.document.getElementById('__g-popup-title').textContent, '◈ GENERATE CALLTO');
  });

  await test('GF-05', 'wired: the Guardian picker first, the one-click picker only as a said fallback', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'clear-glass/src/providers/attention.js'), 'utf8');
    const i = src.indexOf('guardianPickScript(act.key, gp)'), j = src.indexOf('pickerScript(act.key), true)');
    assert.ok(i > 0 && j > i, 'Guardian first');
    assert.ok(/the one-click picker is used/.test(src));
    assert.ok(typeof A.guardianPickScript === 'function' && typeof A.describeScript === 'function');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50).unref();
})();
