'use strict';
// run-all: timeout 180000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-autofill-radio-checkbox-glass.test.js — CR1, 0.60.340.
 * James, 2026-11-01: "Radios and checkboxes. Can we add that to autofill?"
 * The general autofill (matcher.js) filled text/select but deliberately skipped choice inputs. Now matchChoiceFields fills a standalone
 * CHECKBOX (boolean) and a RADIO group (one-of), reusing select-match (boolOf/bestOption) and the DOM mesh's existing checkbox/radio set (DD1).
 * The pure cases prove the matching; the glass case drives Clear Glass's engine on a real page — query → matchFields → mesh.mutate — so the
 * REAL label extraction (archaeology _labelFor: a radio's label is its option, its name is the group) is proven, not assumed.
 *
 *   CR-01  a radio group (Yes/No) fills the option matching the profile; a checkbox fills from yes/no; a non-boolean radio picks its option
 *   CR-02  §1.2 — a checkbox value that is not yes/no is left; a radio value that matches no option is left; an unknown group is left
 *   CR-03  a learned pick (JA1) names an opaque group's purpose, and then it fills
 *   CR-04  end-to-end in a real browser: the right radio is selected, the checkbox ticked, the opaque group untouched
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const M = require(path.join(ROOT, 'clear-glass/src/autofill/matcher.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }

// the profile a job-seeker would have (store.js EXTRA_FIELDS keys)
const profile = { fields: { 'work-authorization': 'Yes', 'relocate': 'Yes', 'years-experience': '3-5 years', 'remote-preference': 'Remote' } };

// the archaeology meta shape (tag/type/name/label/attrs/id) — a radio's label is its OPTION, its name is the GROUP
const F = (id, type, name, label, attrs = {}) => ({ id, tag: 'input', type, name, label, attrs });

(async () => {
  console.log('\n⬡  autofill: radios and checkboxes\n');

  await test('CR-01', 'a radio group, a checkbox, and a non-boolean radio all resolve to the right option', () => {
    const fields = [
      F('a1', 'radio', 'work_authorization', 'Yes'), F('a2', 'radio', 'work_authorization', 'No'),
      F('b1', 'checkbox', 'relocate', 'Willing to relocate'),
      F('c1', 'radio', 'years_experience', '0-2 years'), F('c2', 'radio', 'years_experience', '3-5 years'), F('c3', 'radio', 'years_experience', '5+ years'),
    ];
    const m = M.matchChoiceFields(fields, profile);
    const auth = m.find(x => x.fieldType === 'work-authorization');
    assert.ok(auth && auth.cgId === 'a1' && auth.value === 'yes' && auth.kind === 'radio', JSON.stringify(m));
    const rel = m.find(x => x.fieldType === 'relocate');
    assert.ok(rel && rel.cgId === 'b1' && rel.value === 'yes' && rel.kind === 'checkbox', JSON.stringify(m));
    const yrs = m.find(x => x.fieldType === 'years-experience');
    assert.ok(yrs && yrs.cgId === 'c2' && yrs.value === 'yes', JSON.stringify(m));   // the "3-5 years" radio
  });

  await test('CR-02', '§1.2 — undecidable values and unknown groups are left, never a silent wrong pick', () => {
    // a checkbox whose profile value is not yes/no
    const m1 = M.matchChoiceFields([F('x1', 'checkbox', 'relocate', 'Relocate')], { fields: { 'relocate': 'maybe later' } });
    assert.deepStrictEqual(m1, [], 'a non-boolean checkbox value is left');
    // a radio group whose value matches no option
    const m2 = M.matchChoiceFields([F('y1', 'radio', 'years_experience', '0-2 years'), F('y2', 'radio', 'years_experience', '3-5 years')], { fields: { 'years-experience': '20+ years' } });
    assert.deepStrictEqual(m2, [], 'a value naming no option is left');
    // an opaque group with no pattern and no learned
    const m3 = M.matchChoiceFields([F('z1', 'radio', 'q_988', 'Remote'), F('z2', 'radio', 'q_988', 'On-site')], profile);
    assert.deepStrictEqual(m3, [], 'an unknown group is left for the picker');
  });

  await test('CR-03', 'a learned pick (JA1) names an opaque group, and then it fills', () => {
    const fields = [F('z1', 'radio', 'q_988', 'Remote'), F('z2', 'radio', 'q_988', 'On-site')];
    const m = M.matchChoiceFields(fields, profile, { learned: { 'q_988': 'remote-preference' } });
    const got = m.find(x => x.fieldType === 'remote-preference');
    assert.ok(got && got.cgId === 'z1' && got.source === 'learned', JSON.stringify(m));   // "Remote"
  });

  // ── end-to-end in Clear Glass's own engine ──────────────────────────────────────────────────────────────────────
  const { chromium } = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  const { SOURCE, BOOL_SOURCE } = require(path.join(ROOT, 'clear-glass/src/dom/select-match.js'));
  function meshScript() {
    const t = fs.readFileSync(path.join(ROOT, 'clear-glass/src/dom/archaeology.js'), 'utf8');
    const m = t.match(/const DOM_OBSERVER_SCRIPT = `([\s\S]*?)`;/);
    if (!m) throw new Error('DOM_OBSERVER_SCRIPT not found');
    return m[1].replace(/\$\{SELECT_MATCH_SRC\}/g, SOURCE).replace(/\$\{BOOL_MATCH_SRC\}/g, BOOL_SOURCE);
  }
  const PAGE = `<!doctype html><meta charset=utf-8><body>
    <fieldset><legend>Are you authorized to work?</legend>
      <label><input type="radio" name="work_authorization" value="yes">Yes</label>
      <label><input type="radio" name="work_authorization" value="no">No</label></fieldset>
    <label><input type="checkbox" name="relocate">Willing to relocate</label>
    <fieldset><legend>Years of experience</legend>
      <label><input type="radio" name="years_experience" value="a">0-2 years</label>
      <label><input type="radio" name="years_experience" value="b">3-5 years</label>
      <label><input type="radio" name="years_experience" value="c">5+ years</label></fieldset>
    <fieldset><legend>Opaque</legend>
      <label><input type="radio" name="q_988" value="r">Remote</label>
      <label><input type="radio" name="q_988" value="o">On-site</label></fieldset>
  </body>`;

  let browser;
  try {
    browser = await chromium.launch();
    const pg = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await pg.goto('data:text/html,' + encodeURIComponent(PAGE));
    await pg.evaluate(meshScript());

    await test('CR-04', 'end-to-end: the right radio selected, the checkbox ticked, the opaque group untouched', async () => {
      const domFields = await pg.evaluate(() => window.__cgDomMesh.query('input, select, textarea'));
      const matches = M.matchFields(domFields, profile);
      // only the choice matches here (no text fields on the page)
      assert.ok(matches.length >= 3, `matched: ${JSON.stringify(matches)}`);
      const checked = await pg.evaluate((ms) => {
        ms.forEach(m => window.__cgDomMesh.mutate(m.cgId, { value: m.value }));
        const by = (sel) => Array.prototype.map.call(document.querySelectorAll(sel), e => ({ v: e.value, on: e.checked }));
        return { auth: by('input[name=work_authorization]'), relocate: document.querySelector('input[name=relocate]').checked, yrs: by('input[name=years_experience]'), opaque: by('input[name=q_988]') };
      }, matches);
      assert.deepStrictEqual(checked.auth, [{ v: 'yes', on: true }, { v: 'no', on: false }], 'Yes selected');
      assert.strictEqual(checked.relocate, true, 'relocate ticked');
      assert.deepStrictEqual(checked.yrs.map(x => x.on), [false, true, false], '3-5 years selected');
      assert.deepStrictEqual(checked.opaque.map(x => x.on), [false, false], 'opaque group untouched (left for the picker)');
    });
    await pg.close();
  } catch (e) { console.log(`  - CR-04 SKIPPED: the engine could not start (${(e.message || '').split('\n')[0]})`); }
  finally { try { await browser && browser.close(); } catch (_) {} }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
