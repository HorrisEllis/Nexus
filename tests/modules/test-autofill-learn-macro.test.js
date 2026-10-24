'use strict';
/**
 * tests/modules/test-autofill-learn-macro.test.js — JA5 (0.60.232): the pick is also a macro and an automation node.
 * Map: docs/2026-10-19-gig-autofill-and-learn-phasemap.spec JA5_the_pick_is_also_a_macro
 * James, 2026-10-19: "saves to per site settings, and as a macro or automation and updates the autofill." · 2026-10-24: "yes make the
 * macro too."
 *
 *   JA5-01  macroFor: one `type` step per learned field with a selector ({{param}} text, never the value), urlPattern <origin>/*,
 *           params named for macro.js's {{\w+}} (cover-letter → cover_letter), and the fields with no selector listed as left out
 *   JA5-02  the steps pass the REAL macro.js create validation (browser_action's own action enum)
 *   JA5-03  saveMacro replaces the site's macro (macro.js refuses a duplicate name), exports the .macro node, and removes it when empty
 *   JA5-04  on a REAL page in Clear Glass (glass.js) with the real dom mesh: a click on the LABEL resolves to the box, its xpath, and
 *           renderer/selector-check.js gives a selector that matches exactly that box
 *   JA5-05  pickAndLearn keeps the selector per site and saves the macro; Forget drops the selector and rebuilds the macro without it
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const LP = require(CG('src/autofill/learn-pick.js'));
const M = require(CG('src/autofill/matcher.js'));
const { SiteSettingsStore } = require(CG('src/site-settings/store.js'));

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) { try { const r = await fn(); if (r === 'skip') { skipped++; return; } console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }
const memStore = () => { const s = new SiteSettingsStore(); s._persist = () => {}; return s; };
const URL_ = 'https://micro1.ai/apply/123';
// an in-memory macro tool with macro.js's own create rule (a duplicate name is refused) and export's { file }
function fakeMacros() {
  const rows = new Map(); const calls = [];
  return { rows, calls, async execute(a) {
    calls.push(a.action);
    if (a.action === 'get') return rows.has(a.name) ? { ok: true, macro: rows.get(a.name) } : { error: `no macro named "${a.name}"` };
    if (a.action === 'delete') return rows.delete(a.name) ? { ok: true } : { error: 'none' };
    if (a.action === 'create') { if (rows.has(a.name)) return { error: 'already exists' }; rows.set(a.name, a); return { ok: true, macro: a }; }
    if (a.action === 'export') return { ok: true, file: path.join(a.dir, `${a.name}.macro`) };
    return { error: 'unknown' };
  } };
}

(async () => {
  console.log('\n⬡  the pick is also a macro — the site\'s learned fields as macro steps, and a .macro automation node\n');

  await test('JA5-01', 'macroFor: steps with {{param}}, urlPattern, params, and what is left out', () => {
    const s = memStore();
    s.set(URL_, M.learnKey('your code profile'), 'github'); s.set(URL_, LP.SELECTOR_PREFIX + 'your code profile', 'input[aria-label="Your code profile"]');
    s.set(URL_, M.learnKey('why us'), 'cover-letter'); s.set(URL_, LP.SELECTOR_PREFIX + 'why us', '#why');
    s.set(URL_, M.learnKey('q_8f3a2c91'), 'linkedin');   // learned, but no stable selector
    const m = LP.macroFor(s, URL_);
    assert.strictEqual(m.name, 'autofill micro1.ai'); assert.strictEqual(m.urlPattern, 'https://micro1.ai/*');
    assert.deepStrictEqual(m.steps, [
      { action: 'type', data: { selector: '#why', text: '{{cover_letter}}', clearFirst: true } },
      { action: 'type', data: { selector: 'input[aria-label="Your code profile"]', text: '{{github}}', clearFirst: true } }]);
    assert.deepStrictEqual(m.params, ['cover_letter', 'github']); assert.deepStrictEqual(m.left, ['q_8f3a2c91']);
    assert.ok(!JSON.stringify(m).includes('https://github.com'), 'no profile value in the macro');
  });

  await test('JA5-02', 'the steps pass the real macro.js create validation', async () => {
    const MT = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/macro.js'));
    const s = memStore(); s.set(URL_, M.learnKey('your code profile'), 'github'); s.set(URL_, LP.SELECTOR_PREFIX + 'your code profile', '#code');
    const m = LP.macroFor(s, URL_);
    const name = `${m.name} ${process.pid}`;
    const r = await MT.execute({ action: 'create', name, urlPattern: m.urlPattern, steps: m.steps, params: m.params, description: m.description });
    if (r.error && /cortex unavailable/.test(r.error)) { console.log(`  - JA5-02 SKIPPED: ${r.error}`); return 'skip'; }
    assert.ok(r.ok, r.error);
    const got = await MT.execute({ action: 'get', name }); assert.deepStrictEqual(got.macro.steps, m.steps);
    await MT.execute({ action: 'delete', name });
  });

  await test('JA5-03', 'saveMacro replaces, exports the node, and removes an empty macro', async () => {
    const s = memStore(); const mt = fakeMacros(); const dir = path.join(os.tmpdir(), 'ja5-nodes');
    s.set(URL_, M.learnKey('your code profile'), 'github'); s.set(URL_, LP.SELECTOR_PREFIX + 'your code profile', '#code');
    let r = await LP.saveMacro(mt, s, URL_, { nodesDir: dir });
    assert.deepStrictEqual([r.ok, r.name, r.steps, r.node], [true, 'autofill micro1.ai', 1, path.join(dir, 'autofill micro1.ai.macro')]);
    s.set(URL_, M.learnKey('why us'), 'cover-letter'); s.set(URL_, LP.SELECTOR_PREFIX + 'why us', '#why');
    r = await LP.saveMacro(mt, s, URL_, { nodesDir: dir });
    assert.strictEqual(r.ok, true, r.error); assert.strictEqual(mt.rows.get('autofill micro1.ai').steps.length, 2, 'replaced, not refused as a duplicate');
    LP.forgetLearned(s, URL_, 'your code profile'); LP.forgetLearned(s, URL_, 'why us');
    r = await LP.saveMacro(mt, s, URL_, { nodesDir: dir });
    assert.deepStrictEqual([r.ok, r.steps, r.removed], [true, 0, true]); assert.ok(!mt.rows.has('autofill micro1.ai'), 'nothing learned → no macro');
    assert.strictEqual((await LP.saveMacro(null, s, URL_)).ok, false, 'no macro tool: said, not silent');
  });

  await test('JA5-05', 'pickAndLearn keeps the selector and saves the macro; Forget rebuilds it', async () => {
    const s = memStore(); const mt = fakeMacros();
    const box = { id: 'cg-2', tag: 'input', type: 'text', name: 'q_8f3a2c91', label: 'Your code profile', attrs: {}, xpath: '/html[1]/body[1]/form[1]/input[2]' };
    const wc = { getURL: () => URL_, async executeJavaScript(src) {
      if (/pickField/.test(src)) return { xpath: '/html/body/form/label[2]' };
      if (/__cgSelectorCheck/.test(src)) { assert.ok(src.includes('"xpath":"/html[1]/body[1]/form[1]/input[2]"') && src.includes('"key":"input"'), 'checked as an input, at the box'); return { ok: true, selector: 'input[aria-label="Your code profile"]', matched: 1 }; }
      return box; } };
    const dom = { _getWebContents: () => wc, async handleQuery() { return [box]; }, async handleMutate() { return { ok: true }; } };
    const r = await LP.pickAndLearn({ wc, dom, siteSettings: s, fieldType: 'github', pickerSource: 'x', checkerSource: 'y', macroTool: mt, fill: false });
    assert.strictEqual(r.ok, true, r.error); assert.strictEqual(r.selector, 'input[aria-label="Your code profile"]');
    assert.strictEqual(s.get(URL_, LP.SELECTOR_PREFIX + 'your code profile'), 'input[aria-label="Your code profile"]', 'kept per site');
    assert.deepStrictEqual([r.macro.ok, r.macro.name, r.macro.steps], [true, 'autofill micro1.ai', 1]);
    assert.deepStrictEqual(LP.listLearned(s)[0].selector, 'input[aria-label="Your code profile"]');
    LP.forgetLearned(s, URL_, 'your code profile');
    assert.strictEqual(s.get(URL_, LP.SELECTOR_PREFIX + 'your code profile'), undefined, 'the selector goes with it');
    const again = await LP.saveMacro(mt, s, URL_); assert.strictEqual(again.removed, true);
    // a pick whose box has no stable selector: still learned, left out of the macro, and the reason said
    const wc2 = { ...wc, async executeJavaScript(src) { return /pickField/.test(src) ? { xpath: '/x' } : /__cgSelectorCheck/.test(src) ? { ok: false, why: 'no stable selector passed the live check' } : box; } };
    const r2 = await LP.pickAndLearn({ wc: wc2, dom: { ...dom, _getWebContents: () => wc2 }, siteSettings: s, fieldType: 'github', pickerSource: 'x', checkerSource: 'y', macroTool: mt, fill: false });
    assert.strictEqual(r2.ok, true); assert.strictEqual(r2.selectorWhy, 'no stable selector passed the live check');
    assert.deepStrictEqual([r2.macro.steps, r2.macro.left], [0, ['your code profile']]);
  });

  // ── on a real page ──
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - JA5-04 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); skipped++; return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${glass.engine().kind}`);
  try {
    await test('JA5-04', 'a real page: a click on the label resolves to the box; selector-check gives a selector for exactly it', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ja5-page-')); const file = path.join(dir, 'apply.html');
      fs.writeFileSync(file, `<!doctype html><html><body><form>
        <label for="em">Email</label><input id="em" name="email" type="email">
        <label for="q_8f3a2c91">Your code profile</label><input id="q_8f3a2c91" name="q_8f3a2c91" type="text" aria-label="Your code profile">
        <label>Notes<input name="notes" type="text"></label>
        <button type="submit">Apply</button></form></body></html>`);
      const pg = await browser.newPage(); const errors = []; pg.on('pageerror', e => errors.push(e.message));
      await pg.goto(pathToFileURL(file).href);
      const src = fs.readFileSync(CG('src/dom/archaeology.js'), 'utf8'); const a = src.indexOf('const DOM_OBSERVER_SCRIPT = `'); const b = src.indexOf('\n`;', a);
      const MESH = new Function(src.slice(a, b + 3) + '\nreturn DOM_OBSERVER_SCRIPT;')();
      const run = (js) => pg.evaluate((code) => (0, eval)(code), js);
      await run(MESH);
      const rec = await run(LP.resolveScript('/html/body/form/label[2]'));   // the click landed on the label, not the box
      assert.ok(rec && !rec.error, rec && rec.error); assert.strictEqual(rec.name, 'q_8f3a2c91'); assert.strictEqual(rec.label, 'Your code profile');
      assert.strictEqual(rec.xpath, '/html[1]/body[1]/form[1]/input[2]');
      assert.deepStrictEqual(LP.chooseKey(rec, [rec]), { key: 'your code profile', stable: true });
      const chk = await run(LP.selectorScript(fs.readFileSync(CG('renderer/selector-check.js'), 'utf8'), rec.xpath));
      assert.ok(chk.ok, chk.why);
      assert.strictEqual(await run(`document.querySelectorAll(${JSON.stringify(chk.selector)}).length === 1 && document.querySelector(${JSON.stringify(chk.selector)}).name === 'q_8f3a2c91'`), true, `"${chk.selector}" names exactly the box`);
      assert.ok(!/8f3a2c91/.test(chk.selector), `the generated id/name is not used: ${chk.selector}`);
      const wrapped = await run(LP.resolveScript('/html/body/form/label[3]'));   // a wrapping label resolves to the box inside it
      assert.strictEqual(wrapped.name, 'notes');
      const btn = await run(LP.resolveScript('/html/body/form/button'));
      assert.ok(/not a field you type into/.test(btn.error), 'a button is refused with why');
      assert.deepStrictEqual(errors, []); await pg.close();
    });
  } finally { await browser.close(); }
  done();
})();
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }
