'use strict';
/**
 * tests/modules/test-check-catalogue.test.js — QA1 (docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec): the
 * catalogue runs. lib/check-catalogue.js · lib/checks/ck-230-shadow.js · ck-233-deny.js · ck-248-toolchain.js ·
 * cos/spec/deny-list.spec · contract-gates checkCondition.
 * James: "gates for everything to reduce workload from agents" · "im scared of regression." · "yes start QA1".
 *
 *   QA-01  the catalogue loads (119 checks); runnable ones are marked; a check with no runner is unverifiable, never a pass
 *   QA-02  the map's proof: a contract condition { check: CK-230 } passes on a settled shadow and fails on an open one
 *          (and on one settled with something absent; never declared → unverifiable)
 *   QA-03  CK-233: Nexus's own tree is clean; each planted forbidden thing (the compartment label, Playwright, the
 *          Architect page) turns it red with file:line; comments and except paths are not hits; a repo's own list works
 *   QA-04  CK-233 and the one-off guards it gathers agree (test-no-compartment-label, CG-001b's pattern)
 *   QA-05  CK-248: a planted syntax error in each language fails with its own tool's words; valid files pass; a tool
 *          that is not installed is reported, never passed
 *   QA-06  a contract gate runs them: { check: CK-233 } passes on Nexus; { check: CK-234 } is unverifiable, which GT1
 *          classes as spec (a question, not a retry)
 *   QA-07  wired: the API, the commands, Settings → Checks, run-all
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '../..');
const CC = require(path.join(ROOT, 'lib/check-catalogue.js'));
const S = require(path.join(ROOT, 'lib/shadow.js'));
const CG = require(path.join(ROOT, 'cortex/core/raid/contract-gates.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-qa1-'));
const write = (rel, text) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const cond = (c) => CG.checkCondition(c, { root: ROOT, state: { evidence: {}, gates: {} }, runTest: () => ({ code: 0 }) });

(async () => {
  console.log('\ntest-check-catalogue — the catalogue runs (QA1)');

  await test('QA-01', 'the catalogue loads; runnable ones marked; no runner is never a pass', () => {
    const s = CC.summary();
    assert.strictEqual(s.total, 122);   // 119 + CK-253 versions agree (0.60.34) + CK-254 spec surface (0.60.49) + CK-255 every build through WARP (0.60.67)
    assert.deepStrictEqual(s.runners, ['CK-230', 'CK-233', 'CK-247', 'CK-248', 'CK-253', 'CK-254', 'CK-255']);   // CK-247: 0.60.40 BR2 · CK-255: 0.60.67 WB0
    for (const id of ['CK-230', 'CK-233', 'CK-248']) assert.strictEqual(CC.get(id).runnable, 'runner', id);
    assert.strictEqual(CC.get('CK-060').runnable, 'import-checks');
    const r = CC.run('CK-234');
    assert.deepStrictEqual([r.ok, r.verifiable], [false, false]); assert.match(r.reason, /no runner yet/);
    assert.match(CC.run('CK-999').reason, /not in the catalogue/);
    assert.ok(CC.list({ family: 'shadow' }).length === 3 && CC.list({ runnable: true }).length === s.runnable);
  });

  await test('QA-02', 'the map\'s proof: { check: CK-230 } passes on a settled shadow, fails on an open one', () => quiet(() => {
    const step = `qa1.step.${Date.now()}`;
    const never = cond({ check: 'CK-230', step });
    assert.deepStrictEqual([never.ok, never.verifiable], [false, false]); assert.match(never.reason, /^unverifiable: no qa1\.step/);
    const sh = S.declare({ step, expects: { files: ['lib/a.js', 'lib/b.js'] } });
    const open = cond({ check: 'CK-230', step });
    assert.deepStrictEqual([open.ok, open.verifiable], [false, true]); assert.match(open.reason, /still open — expected lib\/a\.js, lib\/b\.js/);
    S.settle(sh, { files: ['lib/a.js', 'lib/b.js'], events: [] });
    const ok = cond({ check: 'CK-230', step });
    assert.ok(ok.ok, JSON.stringify(ok)); assert.strictEqual(ok.evidence.shadowId, sh.id);
    const sh2 = S.declare({ step, expects: { files: ['lib/a.js', 'lib/c.js'] } });
    S.settle(sh2, { files: ['lib/a.js'], events: [] });
    const half = cond({ check: 'CK-230', step });
    assert.ok(!half.ok && half.verifiable); assert.match(half.reason, /settled with 1 expected thing\(s\) absent — lib\/c\.js/);
    const sh3 = S.declare({ step: `${step}.young`, expects: { files: ['x'] } });
    assert.ok(cond({ check: 'CK-230', step: `${step}.young`, olderThanMs: 60000 }).verifiable === false, 'a shadow younger than its age is not yet a finding');
    S.drop(sh3);
  }));

  await test('QA-03', 'CK-233: Nexus is clean; each planted forbidden thing is found, file:line', () => {
    const clean = CC.run('CK-233');
    assert.ok(clean.ok, clean.reason); assert.deepStrictEqual(clean.evidence.entries, ['compartment-label', 'playwright', 'architect-page']);
    const pw = ['play', 'wright'].join('');   // built, so this file is not itself a hit
    write('repo/clear-glass/src/panel.js', "const label = `compartment · ${kind}`;\n// compartment · ${kind} in a comment is not drawn\n");
    write('repo/tools/probe.js', `const { chromium } = require('${pw}');\n`);
    write('repo/idearium/ui/index.html', '<a href="architect.html">Architect</a>\n<!-- architect.html was here -->\n');
    write('repo/idearium/ui/_archive/architect-old.html', '<a href="architect.html">kept in the archive</a>\n');
    write('repo/data/x.js', `require('${pw}')\n`);
    const r = CC.run('CK-233', { list: path.join(ROOT, 'cos/spec/deny-list.spec') }, { root: path.join(tmp, 'repo') });
    assert.ok(!r.ok && r.verifiable, JSON.stringify(r));
    const at = r.items.map(i => `${i.id}@${i.file}:${i.line}`).sort();
    assert.deepStrictEqual(at, ['architect-page@idearium/ui/index.html:1', 'compartment-label@clear-glass/src/panel.js:1', 'playwright@tools/probe.js:1'], 'comments, _archive and data are not hits');
    write('own/.nexus/deny.yaml', 'deny:\n  - { id: old-api, what: "the v1 client", pattern: "apiV1\\\\(", files: [js], paths: [src] }\n');
    write('own/src/a.js', 'apiV1(1)\n');
    const own = CC.run('CK-233', {}, { root: path.join(tmp, 'own') });
    assert.ok(!own.ok && own.items[0].id === 'old-api' && own.items[0].file === 'src/a.js', JSON.stringify(own));
    const none = CC.run('CK-233', {}, { root: path.join(tmp, 'repo') });
    assert.strictEqual(none.verifiable, false, 'a repo with no list of its own is unverifiable, not clean');
    write('bad/.nexus/deny.yaml', 'deny:\n  - { id: broken, pattern: "(", files: [js] }\n');
    assert.match(CC.run('CK-233', {}, { root: path.join(tmp, 'bad') }).reason, /do not compile — broken/);
  });

  await test('QA-04', 'CK-233 and the one-off guards agree', () => {
    const old = spawnSync(process.execPath, [path.join(ROOT, 'tests/modules/test-no-compartment-label.test.js')], { encoding: 'utf8' });
    assert.strictEqual(old.status, 0, old.stdout);
    assert.ok(CC.run('CK-233', { only: 'compartment-label' }).ok);
    const list = require(path.join(ROOT, 'lib/checks/ck-233-deny.js')).load();
    const oldRx = /compartment\s*(·|&middot;|\\u00b7)\s*\$?\{?[a-z]/i;
    assert.strictEqual(String(new RegExp(list.find(e => e.id === 'compartment-label').pattern, 'i')), String(oldRx), 'the same pattern as test-no-compartment-label');
    const cg = fs.readFileSync(path.join(ROOT, 'tests/modules/test-nexus-atlas-and-glass.test.js'), 'utf8');
    const pwEntry = list.find(e => e.id === 'playwright');
    assert.ok(cg.includes(pwEntry.pattern.replace(/\//g, '\\/')), 'the same pattern as CG-001b');
  });

  await test('QA-05', 'CK-248: each language\'s own tool; a planted error fails, valid passes, a missing tool is said', () => {
    const bad = { 'bad.js': 'const a = ;\n', 'bad.py': 'def f(:\n', 'bad.json': '{"a":}', 'bad.yaml': 'a: [\n', 'bad.sh': 'if then fi\n', 'bad.ts': 'let x: number = ;\n', 'bad.go': 'package main\nfunc {\n', 'bad.c': 'int main( { return 0; }\n' };
    const good = { 'ok.js': 'module.exports = 1;\n', 'ok.py': 'def f():\n    return 1\n', 'ok.json': '{"a":1}', 'ok.yaml': 'a: [1]\n', 'ok.sh': 'if true; then echo; fi\n', 'ok.ts': 'export const x: number = 1;\n', 'ok.go': 'package main\nfunc main() {}\n', 'ok.c': 'int main(void) { return 0; }\n' };
    for (const [f, t] of Object.entries(bad)) write(`tc-bad/${f}`, t);
    for (const [f, t] of Object.entries(good)) write(`tc-ok/${f}`, t);
    const T = require(path.join(ROOT, 'lib/checks/ck-248-toolchain.js'));
    const want = Object.entries(T.LANGS).filter(([, L]) => !L.tool || T.has(L.tool)).map(([l]) => l);
    const r = CC.run('CK-248', { path: path.join(tmp, 'tc-bad') });
    assert.ok(!r.ok && r.verifiable);
    const failedLangs = r.items.filter(i => i.error).map(i => i.lang).sort();
    assert.deepStrictEqual(failedLangs, want.filter(l => Object.keys(bad).some(f => T.LANGS[l].exts.includes(f.split('.').pop()))).sort(), JSON.stringify(r.items));
    assert.ok(r.items.every(i => !i.error || !i.error.includes(tmp)), 'errors name the file, not the machine\'s paths');
    const g = CC.run('CK-248', { path: path.join(tmp, 'tc-ok') });
    assert.ok(g.ok, JSON.stringify(g.items));
    const was = T.LANGS.go.tool; T.LANGS.go.tool = 'no-such-tool-qa1';
    try {
      const m = CC.run('CK-248', { path: path.join(tmp, 'tc-ok') });
      assert.ok(m.items.some(i => i.lang === 'go' && /no-such-tool-qa1 is not installed/.test(i.skipped)), 'said');
      assert.strictEqual(m.evidence.languages.go.checked, 0, 'not counted as checked');
      const only = CC.run('CK-248', { path: path.join(tmp, 'tc-ok'), files: ['ok.go'] });
      assert.deepStrictEqual([only.ok, only.verifiable], [false, false], 'every file skipped → unverifiable, never a pass');
    } finally { T.LANGS.go.tool = was; }
  });

  await test('QA-06', 'a contract gate runs them; a check with no runner is a spec question (GT1)', () => {
    const r = cond({ check: 'CK-233' });
    assert.ok(r.ok && r.verifiable, JSON.stringify(r));
    const u = cond({ check: 'CK-234' });
    assert.deepStrictEqual([u.ok, u.verifiable], [false, false]); assert.match(u.reason, /^unverifiable: CK-234 has no executable check/);
    assert.strictEqual(CG.classifyFailure({ out: { ok: true }, result: { reasons: [u.reason] } }).cls, 'spec');
    const legacy = cond({ check: 'CK-001' });
    assert.ok(legacy.async && legacy.check === 'CK-001', 'import checks keep their own path');
  });

  await test('QA-07', 'wired: API, commands, Settings → Checks, run-all', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(api.includes("['GET',    ['api','checks'],") && api.includes("['api','checks',':id','run']") && api.includes("case 'checks.run'"));
    const CMD = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
    assert.ok(CMD.includes("key: 'checks.list'") && CMD.includes("key: 'checks.run'"));
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/settings.html'), 'utf8');
    assert.ok(ui.includes('function renderChecks') && ui.includes("data-checks=\"1\""));
    assert.ok(fs.readFileSync(path.join(ROOT, 'tests/modules/run-all.js'), 'utf8').includes("'test-check-catalogue.test.js'"));
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
