'use strict';
// run-all: timeout 180000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-dropdown-fill-glass.test.js — DD1 verified in a REAL browser (glass.js), 0.60.316.
 * James, 2026-10-30: "the drop down menus still aren't working, like get it fixed, loop and iterate until you can verify …
 * expand the autofill completely to include all the relevant elements."
 *
 * The unit test (test-select-match) proves the matcher; THIS drives Clear Glass's engine on a real page and checks the DOM
 * mesh's mutate actually selects the option, ticks the checkbox, types the text/textarea/contenteditable — the end the user sees.
 *
 *   GD-01  a <select> fills from a profile value that is not the option's raw value ("United States" -> the US option)
 *   GD-02  a <select> by exact value, and by visible text with different casing
 *   GD-03  a checkbox ticks from "Yes" / unticks from "No"
 *   GD-04  a radio in a group is selected by its value
 *   GD-05  a text input and a textarea fill (and dispatch input/change for a framework)
 *   GD-06  a contenteditable fills
 *   GD-07  a <select> with no matching option is REFUSED with a reason (no silent wrong pick)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { chromium } = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
const { SOURCE, BOOL_SOURCE } = require(path.join(ROOT, 'clear-glass/src/dom/select-match.js'));

// Reconstruct the exact in-page DOM mesh script (archaeology.js DOM_OBSERVER_SCRIPT with the matchers interpolated).
function meshScript() {
  const t = fs.readFileSync(path.join(ROOT, 'clear-glass/src/dom/archaeology.js'), 'utf8');
  const m = t.match(/const DOM_OBSERVER_SCRIPT = `([\s\S]*?)`;/);
  if (!m) throw new Error('DOM_OBSERVER_SCRIPT not found');
  return m[1].replace(/\$\{SELECT_MATCH_SRC\}/g, SOURCE).replace(/\$\{BOOL_MATCH_SRC\}/g, BOOL_SOURCE);
}

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }

const PAGE = `<!doctype html><meta charset=utf-8><body>
  <select id="country"><option value="">Choose…</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="CA">Canada</option></select>
  <select id="years"><option value="">Pick</option><option value="1">1 year</option><option value="5">5 years</option><option value="10">10 years</option></select>
  <input id="name" type="text">
  <textarea id="bio"></textarea>
  <input id="auth" type="checkbox">
  <label><input type="radio" name="g" value="remote" id="r_remote">Remote</label>
  <label><input type="radio" name="g" value="onsite" id="r_onsite">On-site</label>
  <div id="rich" contenteditable="true"></div>
</body>`;

// drive the mesh in-page: assign cgIds (query), then mutate the element matching a CSS id, return the mutate result + read-back
async function fill(pg, cssId, value) {
  return pg.evaluate(({ cssId, value }) => {
    window.__cgDomMesh.query('input, select, textarea, [contenteditable]');   // assigns __cgId to every field
    const el = document.getElementById(cssId);
    const r = window.__cgDomMesh.mutate(el.__cgId, { value });
    const read = el.tagName === 'SELECT' ? { value: el.value, text: (el.options[el.selectedIndex] || {}).text }
      : el.type === 'checkbox' || el.type === 'radio' ? { checked: el.checked }
      : el.isContentEditable ? { text: el.textContent } : { value: el.value };
    return { r, read };
  }, { cssId, value });
}

(async () => {
  console.log('\n⬡  dropdown / element fill — driven in Clear Glass on a real page\n');
  let browser;
  try {
    browser = await chromium.launch();
    const pg = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const SCRIPT = meshScript();
    await pg.goto('data:text/html,' + encodeURIComponent(PAGE));
    await pg.evaluate(SCRIPT);   // install the DOM mesh (as Clear Glass injects it on every page)

    await test('GD-01', 'a <select> fills from a profile value, not the option value ("United States" -> US)', async () => {
      const { r, read } = await fill(pg, 'country', 'United States');
      assert.ok(r.ok, r.error); assert.strictEqual(read.value, 'US'); assert.strictEqual(read.text, 'United States');
    });
    await test('GD-02', 'exact value, and visible text with different casing', async () => {
      let o = await fill(pg, 'country', 'CA'); assert.strictEqual(o.read.value, 'CA');
      o = await fill(pg, 'country', 'united kingdom'); assert.strictEqual(o.read.value, 'GB', 'case-insensitive text');
      o = await fill(pg, 'years', '5'); assert.strictEqual(o.read.value, '5', '"5" -> "5 years"');
    });
    await test('GD-03', 'a checkbox ticks from "Yes" / unticks from "No"', async () => {
      let o = await fill(pg, 'auth', 'Yes'); assert.strictEqual(o.read.checked, true);
      o = await fill(pg, 'auth', 'No'); assert.strictEqual(o.read.checked, false);
    });
    await test('GD-04', 'a radio is selected by its value', async () => {
      const o = await fill(pg, 'r_remote', 'remote'); assert.strictEqual(o.read.checked, true);
    });
    await test('GD-05', 'a text input and a textarea fill', async () => {
      let o = await fill(pg, 'name', 'James Brooks'); assert.strictEqual(o.read.value, 'James Brooks');
      o = await fill(pg, 'bio', 'I build systems'); assert.strictEqual(o.read.value, 'I build systems');
    });
    await test('GD-06', 'a contenteditable fills', async () => {
      const o = await fill(pg, 'rich', 'hello world'); assert.strictEqual(o.read.text, 'hello world');
    });
    await test('GD-07', 'a <select> with no match is refused with a reason', async () => {
      const { r } = await fill(pg, 'country', 'Atlantis');
      assert.ok(!r.ok && /no option matches/.test(r.error || ''), 'refused, not a silent wrong pick');
    });

    await pg.close();
  } catch (e) { console.error('  ✗ harness error:', e.stack || e.message); failed++; }
  finally { try { await browser.close(); } catch (_) {} }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();

const assert = require('assert');
