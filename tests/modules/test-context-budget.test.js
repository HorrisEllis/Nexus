'use strict';
/**
 * tests/modules/test-context-budget.test.js — GW24 (docs/2026-10-15-gate-held-work-phasemap.spec)
 * James: "each gate holds the context, which can make tghe agents dumb." · "A brick is a chunk. Like analysis."
 * The gate keeps the dependencies whole; the agent gets a ranked projection cut to one budget, and the cut is said.
 */
const assert = require('assert');
const path = require('path');
const PP = require(path.join(__dirname, '../..', 'lib/phase-plan.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const filler = (n) => Array.from({ length: n }, (_, i) => `const pad${i} = ${i};`).join('\n');
const dep = (file, name, at) => ({ file, code: `${filler(at)}\nfunction ${name}(a, b) {\n  return a + b;\n}\nmodule.exports = { ${name} };\n` });

test('CB-01', 'a needed name defined past line 120 arrives (GA1 cut every dependency at 120 lines)', () => {
  const r = PP.contextNote({ needs: ['add'], deps: [dep('math.js', 'add', 150)] });
  assert.match(r.text, /--- math\.js\nfunction add\(a, b\) \{\n {2}return a \+ b;\n\}/);
  assert.ok(!/pad149/.test(r.text), 'the filler is not sent');
  assert.deepStrictEqual(r.missing, []);
});

test('CB-02', 'six dependencies stay within the budget; what was cut is listed, never silently lost', () => {
  const deps = Array.from({ length: 6 }, (_, i) => ({ file: `d${i}.js`, code: Array.from({ length: 300 }, (_, k) => `function f${i}_${k}(x) { return x; }`).join('\n') + `\nfunction need${i}() {\n  return ${i};\n}\n` }));
  const r = PP.contextNote({ needs: deps.map((_, i) => `need${i}`), deps, budget: 3000 });
  assert.ok(r.chars <= 3000, `${r.chars} chars`);
  for (let i = 0; i < 6; i++) assert.ok(r.text.includes(`function need${i}()`), `need${i}'s definition is first in line`);
  assert.ok(r.dropped.length > 0 && r.dropped.every(d => d.kind === 'signatures'), JSON.stringify(r.dropped));
  assert.match(r.summary, /dropped d\d\.js:signatures/);
});

test('CB-03', 'definitions outrank signatures: a tight budget keeps the definition and drops the surface', () => {
  const big = { file: 'big.js', code: Array.from({ length: 200 }, (_, k) => `function s${k}() {}`).join('\n') + '\nfunction want() {\n  return 1;\n}\n' };
  const r = PP.contextNote({ needs: ['want'], deps: [big], budget: 1200 });
  assert.ok(r.text.includes('function want()'));
  assert.deepStrictEqual(r.dropped.map(d => d.kind), ['signatures']);
});

test('CB-04', 'a name no dependency defines is said (defined nowhere), not invented', () => {
  const r = PP.contextNote({ needs: ['ghost'], deps: [dep('a.js', 'other', 3)] });
  assert.deepStrictEqual(r.missing, ['ghost']);
  assert.match(r.summary, /defined nowhere: ghost/);
});

test('CB-05', 'the budget has a floor: a learned budget smaller than the brief still leaves room for one definition', () => {
  const r = PP.contextNote({ needs: ['add'], deps: [dep('m.js', 'add', 5)], budget: 10 });
  assert.strictEqual(r.budget, PP.LIMITS.contextMin);
  assert.ok(r.text.includes('function add('));
});

// Wiring, read from source (no fixture drives a whole-phase brick on an Ollama rung yet; said in CHANGELOG-0.60.76)
test('CB-06', 'wired: a brick\'s dependency code goes through contextNote with the agent\'s learned budget; a local model gets the whole-phase brick lean', () => {
  const api = require('fs').readFileSync(path.join(__dirname, '../..', 'idearium/api/index.js'), 'utf8');
  assert.ok(api.includes("Boundaries.budget(hops[0] && hops[0].provider, gate.kind || gate.type)"), 'the learned budget of the first agent on the ladder');
  assert.ok(api.includes('PP.contextNote({ needs: assessment.context.needs'), 'the ranked, budgeted projection');
  assert.ok(!/String\(codeOf\(x\.file\)\)\.split\('\\n'\)\.slice\(0, 120\)/.test(api), 'the uncapped 120-lines-per-dependency note is gone');
  assert.ok(api.includes("bare: (rg) => !!(rg && rg.base === 'ollama')"), 'the whole-phase brick is lean on a local model rung');
  assert.ok(api.includes("(typeof bare === 'function' ? bare(rg) : bare)"), 'and the attempt reads it per rung');
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
