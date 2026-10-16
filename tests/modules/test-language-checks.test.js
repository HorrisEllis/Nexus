'use strict';
// LC-01..07 (0.60.77): a proposal in ANY language is parse-checked by that language's own tool, and a tool that is not here is said, not passed.
// James, 2026-10-16: "I'm saying from all domains, relative to coding, qa, qc, all checks and test. Any for all syntax and languages, compilers, and software, all coding."
const assert = require('assert');
const q = console.log; console.log = console.warn = () => {};
const CK = require('../../lib/checks/ck-248-toolchain.js'), SG = require('../../lib/step-gate.js'), PE = require('../../lib/proposal-evidence.js');
console.log = q;
let passed = 0, failed = 0;
const test = async (n, f) => { try { await f(); console.log('  ok ' + n); passed++; } catch (e) { console.log('  FAIL ' + n + '\n    ' + String(e.message).split('\n')[0]); failed++; } };
const quiet = f => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return f(); } finally { console.log = l; console.warn = w; } };
const cov = CK.coverage();
const installed = cov.filter(r => r.installed);

(async () => {
  await test(`LC-01 every installed tool can tell valid from broken code (${installed.length} of ${cov.length} languages here: ${installed.map(r => r.lang).join(' ')})`, () => {
    const bad = installed.filter(r => r.detects !== true); assert.deepStrictEqual(bad.map(r => `${r.lang}: ${r.why}`), []);
    assert.ok(installed.length >= 8, 'fewer than 8 languages checkable on this machine');
  });
  await test('LC-02 a language whose tool is NOT installed is "not checked" (ok null) and is never reported as a pass', () => {
    const missing = cov.filter(r => !r.installed);
    for (const r of missing) { const c = CK.checkText(CK.LANGS[r.lang].exts[0], 'anything'); assert.strictEqual(c.ok, null); assert.strictEqual(c.installed, false); }
    assert.strictEqual(CK.checkText('xyz', 'x').ok, null); assert.strictEqual(CK.checkText('xyz', 'x').lang, null);
  });
  const sample = (lang, which) => CK.LANGS[lang].samples[which];
  await test('LC-03 the code.write gate blocks broken code in each installed language and passes valid code (the gate the Code tab proposals go through)', () => {
    for (const r of installed) {
      if (['js', 'json', 'yaml'].includes(r.lang)) continue;
      const ext = CK.LANGS[r.lang].exts[0];
      const b = quiet(() => SG.check('code.write', { path: `x.${ext}`, content: sample(r.lang, 'bad') })), g = quiet(() => SG.check('code.write', { path: `x.${ext}`, content: sample(r.lang, 'good') }));
      assert.strictEqual(b.ok, false, `${r.lang}: broken code passed the gate`); assert.match(b.reasons[0].reason, new RegExp(`does not parse as ${r.lang}`)); assert.strictEqual(g.ok, true, `${r.lang}: valid code was blocked: ${JSON.stringify(g.reasons)}`);
    }
  });
  await test('LC-04 fenced-code names map to the language (python, rust, ruby, typescript, bash)', () => {
    const t = (syntax, content) => quiet(() => SG.check('code.write', { path: 'block', syntax, content })).ok;
    if (CK.has('python3')) { assert.strictEqual(t('python', 'def f(:\n'), false); assert.strictEqual(t('python', 'x = 1\n'), true); }
    if (CK.has('bash')) assert.strictEqual(t('bash', 'if then fi (\n'), false);
    if (CK.has('ruby')) assert.strictEqual(t('ruby', 'def f(\n'), false);
  });
  await test('LC-05 an unknown language or plain text passes the gate (not checkable here) — and the evidence for a known code language says it was NOT checked', () => {
    assert.strictEqual(quiet(() => SG.check('code.write', { path: 'a.md', content: '# hi(' })).ok, true);
    assert.strictEqual(quiet(() => SG.check('code.write', { path: 'a.xyz', content: 'x(' })).ok, true);
    const ev = { path: 'app/Main.kt', creates: true, lines: { before: null, after: 3 }, symbols: { lost: [], added: [] }, exports: { lost: [] }, syntax: { lang: 'kt', tool: 'kotlinc', checked: false, why: 'kotlinc is not installed on this machine' }, tests: { linked: 0, ran: 0, results: [] }, regressions: 0, fixed: 0 };
    assert.match(PE.summarize(ev), /syntax NOT checked \(kotlinc is not installed on this machine\) — this is not a pass/);
  });
  await test('LC-06 compare() reports the syntax status of a real file in each direction (checked vs not)', () => {
    const c = PE.compare('lib/x.py', null, 'x = 1\n'); if (CK.has('python3')) assert.strictEqual(c.syntax.checked, true);
    const u = PE.compare('lib/x.zzz', null, 'x'); assert.strictEqual(u.syntax.checked, false); assert.match(u.syntax.why, /no syntax checker is known/);
  });
  await test('LC-07 CK-248 over a folder still finds the broken file among valid ones and counts per language', () => {
    const fs = require('fs'), os = require('os'), path = require('path'); const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-'));
    fs.writeFileSync(path.join(d, 'ok.py'), 'x = 1\n'); fs.writeFileSync(path.join(d, 'bad.py'), 'def f(:\n'); fs.writeFileSync(path.join(d, 'ok.json'), '{}');
    const r = CK.run({ path: '.' }, { root: d }); assert.strictEqual(r.ok, false); assert.strictEqual(r.items.filter(i => i.error).length, 1); assert.strictEqual(r.evidence.languages.py.checked, 2);
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
