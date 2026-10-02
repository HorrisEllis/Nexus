'use strict';
/**
 * tests/modules/test-synthesis-declared-value.test.js — EV0 (5), invariant E17: synthesis reads a phase's declared VALUE
 * (docs/2026-10-02-emerge-field-memory-build-phasemap.spec). The score is one more named part of leverage ("declared +N"),
 * added to the structural parts, never replacing them; the cost is the effort (S 2, M 4, L 8, XL 16).
 *
 *   SV-01  valueOf: the YAML object and the one-line text form; out-of-range or missing → null, never a guess
 *   SV-02  the engine: declared adds a named part; a declared cost sets the effort; no value → nothing changes
 *   SV-03  the real maps: the EMERGE map parses as YAML (a status with an unquoted ": " once broke it), its phases carry
 *          their values into synthesis, and the plan's "why" names the declared part
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'intelligence/synthesis/sources.js'));
const E = require(path.join(ROOT, 'intelligence/synthesis/engine.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; } }

console.log('\ntest-synthesis-declared-value — EV0 (5) synthesis reads value:');

test('SV-01', 'valueOf reads the object and the text form; a bad value is null', () => {
  assert.deepStrictEqual(S.valueOf({ score: 4, cost: 'M', for: ['quality'], why: 'w' }), { score: 4, cost: 'M', for: ['quality'], why: 'w' });
  assert.deepStrictEqual(S.valueOf('{ score: 5, cost: XL, for: [income, safety], why: "the shadow" }'), { score: 5, cost: 'XL', for: ['income', 'safety'], why: 'the shadow' });
  for (const bad of [null, '', { score: 0, cost: 'M' }, { score: 6, cost: 'S' }, { score: 3, cost: 'XXL' }, '{ cost: M }']) assert.strictEqual(S.valueOf(bad), null, JSON.stringify(bad));
  const ph = S.phasesFromText(['phases:', '  A1_x:', '    value: { score: 2, cost: L, for: [quality], why: "x" }', '    status: OPEN', '  A2_y:', '    status: OPEN'].join('\n'));
  assert.deepStrictEqual([ph[0].value && ph[0].value.score, ph[1].value], [2, null], 'the text path reads it too');
});

test('SV-02', 'declared is a named part added to the structural ones; a declared cost is the effort', () => {
  // distinct files and words, so the two phases stay two clusters
  const phase = (key, value, file, words) => ({ id: `phase:m#${key}`, source: 'phasemap', kind: 'phase', title: key, detail: words, refs: ['docs/m-phasemap.spec', file], dependsOn: [], meta: { map: 'docs/m-phasemap.spec', key, status: 'OPEN', layer: 'service', ...(value ? { value } : {}) } });
  const r = E.synthesize({ raw: [phase('A1_valued', { score: 4, cost: 'S', for: [], why: null }, 'lib/alpha.js', 'tokenizer counts exact for quotes'), phase('B1_plain', null, 'ui/beta.html', 'render garden beds on a canvas')], maps: [] });
  const a = r.gaps.find(g => g.id.endsWith('#A1_valued')), b = r.gaps.find(g => g.id.endsWith('#B1_plain'));
  assert.strictEqual(a.parts.declared, 2, '0.5 × the score'); assert.ok(!('declared' in b.parts), 'no value, no part');
  const structural = (g) => Object.entries(g.parts).filter(([k]) => k !== 'declared').reduce((n, [, v]) => n + v, 0);
  assert.strictEqual(+(structural(a) + a.parts.declared).toFixed(2), a.score, 'added to, never replacing, the structural score');
  assert.strictEqual(a.effort, 2, 'cost S → effort 2'); assert.notStrictEqual(b.effort, 2);
  const plan = r.plan.find(p => p.id === a.id); assert.match(plan.why, /declared \+2/);
});

test('SV-03', 'the real EMERGE map parses as YAML and its values reach synthesis', () => {
  const file = path.join(ROOT, 'docs/2026-10-02-emerge-field-memory-build-phasemap.spec');
  const doc = require('js-yaml').load(fs.readFileSync(file, 'utf8'));   // throws if a status ever breaks it again
  const phases = doc.spec.phases;
  assert.ok(Object.keys(phases).length > 30);
  const ph = S.phasesFromYaml(doc);
  const withValue = ph.filter(p => p.value);
  assert.ok(withValue.length >= ph.length - 1, `${withValue.length} of ${ph.length} declare a value`);
  assert.deepStrictEqual(ph.find(p => p.key === 'IN1_nexus_as_claude_codes_toolbox').value.score, 5);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
