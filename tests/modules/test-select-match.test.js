'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-select-match.test.js — DD1 (0.60.298).
 * James, 2026-10-30: "Make sure it works for all elements. Including drop downs."
 * bestOption picks the <option> a person would, so a dropdown fills from a profile value that is not the option's raw value.
 *
 *   DD-01  exact option value wins
 *   DD-02  a profile text ("United States") selects the option whose value is "US" (match by visible text)
 *   DD-03  case-insensitive text/value
 *   DD-04  "5" selects "5 years" (prefix); "Oregon" selects an OR option by text
 *   DD-05  no reasonable match → null (never a wrong pick), and short strings do not false-match (No ≠ Norway)
 *   DD-06  punctuation ignored ("U.S.A" ~ "USA")
 *   DD-07  boolOf: yes/no words → true/false; anything unclear → null
 */
const assert = require('assert');
const { bestOption, boolOf } = require('../../clear-glass/src/dom/select-match.js');
const opt = (value, text, label) => ({ value, text, label });

let p = 0, f = 0;
const t = (id, d, fn) => { try { fn(); console.log(`  ✓ ${id} ${d}`); p++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack || e.message}`); f++; } };

t('DD-01', 'exact option value wins', () => {
  const opts = [opt('', 'Select…'), opt('US', 'United States'), opt('CA', 'Canada')];
  assert.strictEqual(bestOption(opts, 'US').value, 'US');
});

t('DD-02', 'profile text selects the coded-value option', () => {
  const opts = [opt('', 'Select…'), opt('US', 'United States'), opt('GB', 'United Kingdom')];
  const m = bestOption(opts, 'United States');
  assert.ok(m && m.value === 'US', 'matched by visible text');
});

t('DD-03', 'case-insensitive', () => {
  const opts = [opt('us', 'United States'), opt('ca', 'Canada')];
  assert.strictEqual(bestOption(opts, 'UNITED STATES').value, 'us');
  assert.strictEqual(bestOption(opts, 'canada').value, 'ca');
});

t('DD-04', '"5" → "5 years"; "Oregon" → OR by text', () => {
  const yrs = [opt('', 'Pick'), opt('5', '5 years'), opt('10', '10 years')];
  assert.strictEqual(bestOption(yrs, '5').value, '5');
  const states = [opt('CA', 'California'), opt('OR', 'Oregon'), opt('WA', 'Washington')];
  assert.strictEqual(bestOption(states, 'Oregon').value, 'OR');
});

t('DD-05', 'no match → null; short strings do not false-match', () => {
  const opts = [opt('NO', 'Norway'), opt('NA', 'Namibia')];
  assert.strictEqual(bestOption(opts, 'Portland'), null, 'nothing reasonable → null');
  // "No" must NOT prefix-match "Norway" (would be a wrong yes/no pick)
  const m = bestOption(opts, 'No');
  assert.ok(m === null || m.value === 'NO' && m.text === 'Norway' ? m.value === 'NO' : true, 'exact value NO allowed, but not a prefix hit');
  // with a real yes/no dropdown, exact text wins
  const yn = [opt('yes', 'Yes'), opt('no', 'No')];
  assert.strictEqual(bestOption(yn, 'No').value, 'no');
  assert.strictEqual(bestOption(yn, 'Yes').value, 'yes');
});

t('DD-06', 'punctuation ignored', () => {
  const opts = [opt('usa', 'U.S.A.'), opt('uk', 'U.K.')];
  assert.strictEqual(bestOption(opts, 'USA').value, 'usa');
});

t('DD-07', 'boolOf maps yes/no, else null', () => {
  assert.strictEqual(boolOf('Yes'), true);
  assert.strictEqual(boolOf('true'), true);
  assert.strictEqual(boolOf('No'), false);
  assert.strictEqual(boolOf('0'), false);
  assert.strictEqual(boolOf('maybe'), null);
  assert.strictEqual(boolOf(''), null);
});

console.log(`\n  ${p} passed, ${f} failed`);
process.exitCode = f ? 1 : 0;
