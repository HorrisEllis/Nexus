'use strict';
/**
 * tests/modules/test-verify-first.test.js — VF1, CB1, CB2, SM1 (0.60.171)
 * Map: docs/2026-10-19-pipeline-root-causes-phasemap.spec
 * James, 2026-10-19: "need verify first, and everything else to solidify the pipeline. prioritize gemini … specify the axioms,
 * from the docs axioms 3.1 … each agent/provider has its' own model for intent, constraints, learning … interrogate them?"
 *
 *   VF-01  SP5 as it was: lib/title.js trims and its test passes → 'pass', no agent needed; the second check is cached
 *   VF-02  title.js that does not trim → 'fail', and feedback names the failing test with its output
 *   VF-03  no test on disk → 'shallow' (never called done); no file → 'missing'; a file that does not parse → 'fail' on parse
 *   VF-04  a planned export missing → 'fail' on exports, without running the test
 *   CB-01  the brief has Gemini's five parts, the AXIOMS v3.1 ids, the frozen test and what failed
 *   CB-02  routing: gemini first among browser coders by default, first of all with prefer_over all; settings read
 *   SM-01  gemini's seed is its own answer (five needs); observe counts; the interrogation prompt carries model + issue
 *   SM-02  an answer is parsed, kept as 'proposed' (never applied), and James's accept adds its needs to the model
 *   VF-05  the build is wired: verify-first before the coder ladder, the brief composed, preferFirst after the learned order,
 *          an existing test reused instead of written again
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}

const TITLE_OK = `'use strict';\nfunction title(s) {\n  if (typeof s !== 'string') throw new TypeError('title: expected a string, got ' + typeof s);\n  return s.trim();\n}\nmodule.exports = { title };\n`;
const TITLE_BAD = `'use strict';\nfunction title(s) { return s; }\nmodule.exports = { title };\n`;
const TEST = `'use strict';\nconst test = require('node:test');\nconst assert = require('node:assert');\nconst { title } = require('../lib/title.js');\ntest('trims', () => { assert.strictEqual(title(' Looking Glass '), 'Looking Glass'); });\ntest('rejects non-strings', () => { assert.throws(() => title(5), TypeError); });\n`;
const PLAN = { files: [{ path: 'lib/title.js', exports: [{ name: 'title', signature: 'title(s: string) -> string' }], does: 'trims a title' }], order: ['lib/title.js'], conditions: [] };

function repo({ code = TITLE_OK, test = TEST } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-'));
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'lg', version: '0.4.0', scripts: { test: 'node --test' } }));
  fs.mkdirSync(path.join(d, 'lib')); fs.mkdirSync(path.join(d, 'tests'));
  if (code != null) fs.writeFileSync(path.join(d, 'lib/title.js'), code);
  if (test != null) fs.writeFileSync(path.join(d, 'tests/sp5-title.test.js'), test);
  return d;
}

(async () => {
  const VF0 = require(path.join(ROOT, 'lib/verify-first.js'));
  // 0.60.244 SV0: the caller hands verify-first COS's runner (idearium does the same); verify-first no longer reaches into COS
  const RUN = require(path.join(ROOT, 'cos/testenv/index.js')).runTarget;
  const VF = { ...VF0, check: (o) => VF0.check({ runTarget: RUN, ...o }) };
  const CB = require(path.join(ROOT, 'lib/coder-brief.js'));
  const SM = require(path.join(ROOT, 'lib/agent-self-model.js'));
  const PR = require(path.join(ROOT, 'lib/pipeline-routing.js'));

  await test('VF-01', 'SP5 as it was: the existing file passes as it is; checked again from the cache', async () => {
    const d = repo();
    const r = await VF.check({ root: d, file: 'lib/title.js', plan: PLAN, testPath: 'tests/sp5-title.test.js' });
    assert.strictEqual(r.verdict, 'pass', JSON.stringify(r.checks));
    assert.deepStrictEqual(r.checks.map(c => c.name), ['exists', 'parse', 'exports', 'test']);
    const again = await VF.check({ root: d, file: 'lib/title.js', plan: PLAN, testPath: 'tests/sp5-title.test.js' });
    assert.strictEqual(again.cached, true);
    assert.strictEqual(VF.feedback(r), '', 'nothing failed, nothing to brief');
  });

  await test('VF-02', 'a title() that does not trim fails, and the feedback carries the test output', async () => {
    const d = repo({ code: TITLE_BAD });
    const r = await VF.check({ root: d, file: 'lib/title.js', plan: PLAN, testPath: 'tests/sp5-title.test.js' });
    assert.strictEqual(r.verdict, 'fail');
    const fb = VF.feedback(r);
    assert.ok(/test: tests\/sp5-title\.test\.js fails/.test(fb), fb);
    assert.ok(/Looking Glass|trims|rejects/.test(fb), 'the failing assertion is in the brief: ' + fb.slice(0, 300));
  });

  await test('VF-03', 'no test → shallow; no file → missing; unparsable → fail on parse', async () => {
    const d1 = repo({ test: null });
    const s = await VF.check({ root: d1, file: 'lib/title.js', plan: PLAN, testPath: 'tests/sp5-title.test.js' });
    assert.strictEqual(s.verdict, 'shallow'); assert.ok(s.checks.some(c => c.ok === null && /not on disk/.test(c.why)));
    const d2 = repo({ code: null });
    assert.strictEqual((await VF.check({ root: d2, file: 'lib/title.js', plan: PLAN })).verdict, 'missing');
    const d3 = repo({ code: 'module.exports = { title: (s) => s.trim( };' });
    const p = await VF.check({ root: d3, file: 'lib/title.js', plan: PLAN, testPath: 'tests/sp5-title.test.js' });
    assert.strictEqual(p.verdict, 'fail'); assert.ok(p.checks.find(c => c.name === 'parse').ok === false);
    assert.ok(!p.checks.some(c => c.name === 'test' && c.ok === true), 'the test is not run on code that does not parse');
  });

  await test('VF-04', 'a planned export missing fails on exports, and the test is not run', async () => {
    const d = repo({ code: `module.exports = { heading: (s) => s.trim() };\n` });
    let ran = false;
    const r = await VF.check({ root: d, file: 'lib/title.js', plan: PLAN, testPath: 'tests/sp5-title.test.js', runTarget: async () => { ran = true; return { passed: true }; } });
    assert.strictEqual(r.verdict, 'fail'); assert.strictEqual(ran, false);
    assert.ok(/planned exports missing: title/.test(VF.feedback(r)));
  });

  await test('CB-01', 'the brief has the five parts, the axioms, the frozen test and what failed', async () => {
    const d = repo({ code: TITLE_BAD });
    const vf = await VF.check({ root: d, file: 'lib/title.js', plan: PLAN, testPath: 'tests/sp5-title.test.js' });
    const b = CB.compose({ base: 'Write ONE file: lib/title.js', plan: PLAN, file: 'lib/title.js', root: d, existing: TITLE_BAD, vf, testPath: 'tests/sp5-title.test.js' });
    for (const h of ['## 1. Stack and environment', '## 2. Constraints (Nexus AXIOMS v3.1', '## 3. Contract and context', '## 4. Output format', '## 5. Before you answer']) assert.ok(b.includes(h), `missing ${h}`);
    for (const a of ['§1.2', '§1.3', '§0.5', '§8.6', '§5.3', '§12.2']) assert.ok(b.includes(a), `missing axiom ${a}`);
    assert.ok(b.includes("title(' Looking Glass ')"), 'the frozen test is in the brief');
    assert.ok(/What failed when lib\/title\.js was checked/.test(b));
    assert.ok(/CommonJS/.test(b) && /node:test|node --test/.test(b), 'stack read from the repo');
    assert.ok(/Exactly ONE fenced code block/.test(b));
  });

  await test('CB-02', 'gemini first among browser coders; first of all with prefer_over all; read from settings', async () => {
    const rungs = ['ollama:qwen2.5-coder:7b', 'chatgpt', 'claude', 'gemini', 'deepseek'].map(p => ({ provider: p, base: p.split(':')[0] }));
    assert.deepStrictEqual(PR.preferFirst(rungs, PR.DEFAULTS).map(r => r.base), ['ollama', 'gemini', 'chatgpt', 'claude', 'deepseek']);
    assert.deepStrictEqual(PR.preferFirst(rungs, { ...PR.DEFAULTS, preferOver: 'all' }).map(r => r.base)[0], 'gemini');
    assert.deepStrictEqual(PR.preferFirst(rungs, { preferCoder: 'mistral' }), rungs, 'a provider not on the ladder changes nothing');
    const pol = PR.policyFrom({ prefer_coder: 'gemini', prefer_over: 'all' });
    assert.strictEqual(pol.preferCoder, 'gemini'); assert.strictEqual(pol.preferOver, 'all');
  });

  const SMROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-'));
  await test('SM-01', "gemini's seed is its own answer; observe counts; the interrogation prompt carries model and issue", async () => {
    const g = SM.get('gemini', { root: SMROOT });
    assert.strictEqual(g.needs.length, 5); assert.ok(/self-reported/.test(g.needsSource));
    SM.observe('gemini', { jobType: 'phase-build', outcome: 'failed', cls: 'conflict', note: 'title() -> string vs title(" Looking Glass ")' }, { root: SMROOT });
    SM.observe('gemini', { jobType: 'phase-build', outcome: 'ok' }, { root: SMROOT });
    const g2 = SM.get('gemini', { root: SMROOT });
    assert.deepStrictEqual(g2.learned.byJob['phase-build'], { failed: 1, ok: 1 });
    const pr = SM.interrogationPrompt('gemini', { summary: 'SP5_title reached attempt 14 though lib/title.js already passed its test', evidence: 'Your task (step 3, attempt 14): Write ONE file: lib/title.js' }, { root: SMROOT });
    assert.ok(/You are gemini/.test(pr) && /attempt 14/.test(pr) && /root_cause/.test(pr) && /title\(\) -> string/.test(pr));
  });

  await test('SM-02', "an answer is parsed and kept as proposed; James's accept adds its needs", async () => {
    const bad = SM.parseAnswer('I think the brief was unclear.');
    assert.strictEqual(bad.ok, false);
    const ans = SM.parseAnswer('```json\n{"root_cause":"the brief asked for a new file that already existed","your_part":"none","proposed_fix":{"where":"pipeline","what":"check before asking"},"what_you_need_in_briefs":["the existing file and its test result"],"confidence":0.8}\n```');
    assert.strictEqual(ans.ok, true);
    const prop = SM.propose('gemini', ans.answer, { root: SMROOT, issue: { summary: 'SP5 loop' } });
    assert.strictEqual(prop.status, 'proposed');
    assert.ok(!SM.get('gemini', { root: SMROOT }).needs.includes('the existing file and its test result'), 'not applied by itself (§7.2)');
    SM.decide('gemini', prop.id, 'accepted', { root: SMROOT });
    assert.ok(SM.get('gemini', { root: SMROOT }).needs.includes('the existing file and its test result'));
    assert.throws(() => SM.decide('gemini', prop.id, 'maybe', { root: SMROOT }), /accepted or rejected/);
  });

  await test('VF-05', 'the build is wired: verify-first, the brief, gemini preference, an existing test reused', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const iVF = src.indexOf("VF.check({ root: _root, file, plan, testPath: _tp, runTarget:"), iClimb = src.indexOf('attempt: makeAttempt({ msg: _msg');
    assert.ok(iVF > 0 && iClimb > iVF, 'verify-first runs before the coder ladder');
    assert.ok(/if \(vf\.verdict === 'pass'\) \{[\s\S]{0,300}continue;/.test(src), 'a passing file is not sent to an agent');
    assert.ok(src.includes('CB.compose({'), 'the brief is composed');
    assert.ok(src.includes('rungs = PRt.preferFirst(co.rungs, policy)'), 'gemini preference applied after the learned order');
    assert.ok(/existingTest != null\) got = \{ code: existingTest/.test(src), 'an existing test is reused');
    // the contract path (the default build path, routing.contract_build) does the same per brick
    assert.ok(src.includes("vfr = await VF.check({ root, file: f, plan, testPath: tp, runTarget: _require('../../cos/testenv/index.js').runTarget })") && src.includes("agent: 'verify-first'"), 'contract bricks are verified first');
    assert.ok(src.includes('order = PRt.preferFirst(order, policy)') && src.includes('msg: msgV'), 'contract bricks get the brief and the preference');
  });

  await test('RC-07', 'labelled and cut-short files already in a repo are archived, never deleted', async () => {
    const PG = require(path.join(ROOT, 'lib/path-guard.js'));
    const d = repo();
    fs.mkdirSync(path.join(d, 'Gemini said tests'), { recursive: true });
    fs.writeFileSync(path.join(d, 'Gemini said tests', 'sp5-title.test.js'), 'x');
    fs.writeFileSync(path.join(d, 'tests', 'sp5-title.'), 'y');
    const r = PG.repairTree(d, { now: 0 });
    assert.deepStrictEqual(r.moved.map(m => m.from).sort(), ['Gemini said tests', 'tests/sp5-title.']);
    assert.ok(!fs.existsSync(path.join(d, 'Gemini said tests')) && fs.existsSync(path.join(d, 'tests', 'sp5-title.test.js')), 'the real test stays');
    assert.ok(fs.existsSync(path.join(d, r.moved[0].to)), 'archived, not deleted');
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(src.includes("repairTree(_diskDir)"), 'a phase build repairs its repo first');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
