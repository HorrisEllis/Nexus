'use strict';
/**
 * tests/modules/test-pillar-conform.test.js — PIL3's foreign harness: Emerge's JS core answers Pillar's cases for pillar:constraint.
 * James, 2026-11-06: "One kernel, merged" · 2026-11-08: "Focus on primitives. Build using emerge right?"
 * JavaScript because it calls Emerge's JS core (emerge/emerge/core/constraint.js), which only JavaScript can call: the harness is the
 * implementation's, never Pillar's (MOD-PIL-CONFORMANCE: "Pillar never runs or loads foreign code"). The cases come from Pillar as data (eg run),
 * the answers go back to Pillar's judge (pillar/conformance/conform.eg), which decides. A failing case is a finding: the core is not edited to pass.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..'), EG = path.join(ROOT, 'emerge/emerge/lang/eg.js'), PIL = path.join(ROOT, 'pillar/conformance/conform.eg');
let p = 0, f = 0;
const t = (id, d, fn) => { try { fn(); console.log(`  ✓ ${id} ${d}`); p++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); f++; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pil-conform-'));
const eg = (src, ...args) => { const file = path.join(tmp, `s${Math.random().toString(36).slice(2)}.eg`); fs.writeFileSync(file, src);
  const r = spawnSync(process.execPath, [EG, 'run', file, ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout; };

console.log('\n⬡  Pillar conformance: Emerge\'s JS core against pillar:constraint (PIL3)\n');
const cases = JSON.parse(eg(`use ${JSON.stringify(PIL)} as P\nprint(json(P.cases_of("pillar:constraint")))\n`));
const { defineConstraint, evaluate } = require(path.join(ROOT, 'emerge/emerge/core/constraint.js'));
const check = (c) => (next) => next[c.field] < c.below;   // the declarative check, in this implementation's terms
const answers = cases.map((c) => {
  try {
    if (c.input.define) { defineConstraint({ ...c.input.define, check: check(c.input.define.check) }); return { id: c.id, got: { defined: true } }; }
    const k = defineConstraint({ ...c.input.constraint, check: check(c.input.constraint.check) });
    return { id: c.id, got: evaluate(k, c.input.next) };
  } catch (e) { return { id: c.id, got: { error: e.message } }; }
});
const ans = path.join(tmp, 'answers.json'); fs.writeFileSync(ans, JSON.stringify(answers));
const r = JSON.parse(eg(`use ${JSON.stringify(PIL)} as P\nprint(json(P.conform("pillar:constraint", parse_json(read_file(args()[0])))))\n`, ans));
const by = Object.fromEntries(r.cases.map(c => [c.id, c]));

t('PC-01', 'every case is answered and judged by Pillar, with its kind', () => {
  assert.strictEqual(r.cases.length, cases.length);
  assert.ok(r.cases.some(c => c.kind === 'boundary') && r.cases.some(c => c.kind === 'adversarial'));
});
t('PC-02', 'the core holds, refuses and opens a gap where the contract says', () => {
  for (const id of ['constraint.holds', 'constraint.violated', 'constraint.at_the_edge', 'constraint.missing_field_is_a_gap', 'constraint.no_id_refused', 'constraint.unknown_type_refused'])
    assert.ok(by[id].ok, `${id}: ${by[id].why}`);
});
t('PC-03', 'FINDING, recorded not hidden: the JS core treats a null field as present, where the contract (and Emerge\'s language) say it is a gap', () => {
  assert.strictEqual(by['constraint.null_field_is_a_gap'].ok, false);
  assert.strictEqual(r.conforming, false, 'not conforming while one case fails');
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  ${p} passed, ${f} failed\n`); process.exitCode = f ? 1 : 0;
