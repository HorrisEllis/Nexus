'use strict';
// tests/modules/test-phase-actually-builds.test.js — 0.39.355 PB1–PB5 (docs/2026-10-05-cli-data-code-phasemap.spec)
// James: "okay. i clicked on a phase in the phases tab in nexus core to have it built. it needs to actually build it"
// From his log: BL8 went to qwen3-abliterated:0.6b (the derived ladder's lowest rung); the Plan's round 1 failed on 71
// imports broken before anything was built, and the repair sent those unrelated files to a 3b model to rewrite.
//   PB-01  the derived ladder starts at 3b — the 0.6b is left off and said; 0 keeps it; a written ladder is untouched
//   PB-02  a reply that changed no file did not build (fenced code or a write tool that succeeded did)
//   PB-03  a round fails only on what the run broke: the old broken import is known debt, the new one fails
//   PB-04  a require written inside a test's string is text, not an import; an archived file is not checked
//   PB-05  the Nexus tree: run-supervised resolves, erosmancer's old runner is archived; what is left is listed
//   PB-06  wired: the phase build marks a no-change reply incomplete; the prove loop takes a baseline for a Nexus repo
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const PR = require(path.join(ROOT, 'lib/pipeline-routing.js'));
const BV = require(path.join(ROOT, 'lib/build-verify.js'));
const RT = require(path.join(ROOT, 'cos/runtime/run.js'));
const HIS = ['huihui_ai/qwen3-abliterated:0.6b', 'huihui_ai/qwen2.5-coder-abliterate:3b', 'huihui_ai/qwen2.5-coder-abliterate:7b', 'deepseek-coder-v2:16b-lite-instruct-q4_K_M'];

function tmp(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-'));
  for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); }
  return d;
}

(async () => {
  await test('PB-01', 'the derived ladder starts at 3b; the 0.6b is left off and said; 0 keeps it; a written ladder is untouched', () => {
    const L = PR.ladder(PR.policyFrom({ chain: 'ollama,claude' }), { installed: HIS });
    assert.strictEqual(L.rungs[0].model, 'huihui_ai/qwen2.5-coder-abliterate:3b');
    assert.deepStrictEqual(L.rungs.map(r => r.provider).slice(-1), ['claude'], 'then the agents');
    assert.deepStrictEqual(L.below, ['huihui_ai/qwen3-abliterated:0.6b']);
    assert.match(L.from, /left off, smaller than 3b: huihui_ai\/qwen3-abliterated:0\.6b/);
    assert.strictEqual(PR.ladder(PR.policyFrom({ min_build_b: 0 }), { installed: HIS }).rungs[0].model, 'huihui_ai/qwen3-abliterated:0.6b', '0 keeps every model');
    assert.strictEqual(PR.ladder(PR.policyFrom({ min_build_b: 7 }), { installed: HIS }).rungs[0].model, 'huihui_ai/qwen2.5-coder-abliterate:7b');
    assert.strictEqual(PR.ladder(PR.policyFrom({}), { installed: ['llama3.2:latest'] }).rungs[0].model, 'llama3.2:latest', 'an unsized model stays');
    assert.strictEqual(PR.ladder(PR.policyFrom({ escalation: 'ollama:q:0.6b > claude' })).rungs[0].model, 'q:0.6b', 'written exactly as written');
    const C = require(path.join(ROOT, 'idearium/lib/config-core.cjs'));
    const schema = C.SCHEMA || C.schema || C.CONFIG_SCHEMA || null;
    const src = fs.readFileSync(path.join(ROOT, 'idearium/lib/config-core.cjs'), 'utf8');
    assert.match(src, /min_build_b:\s*\{ default: 3, min: 0, max: 1000, copilot_writable: true, type: 'number' \}/, schema ? 'declared' : 'declared in the schema source');
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/ui/settings.html'), 'utf8'), /row\('min_build_b'/, 'in Settings → Routing');
  });

  await test('PB-02', 'a reply that changed no file did not build; fenced code or a write tool that succeeded did', () => {
    assert.strictEqual(PR.changedAnything({ ok: true, text: 'I would move the files like so…' }), false);
    assert.strictEqual(PR.changedAnything({ ok: true, injects: { injects: [] }, toolCalls: [{ name: 'idearium.code_read.tool' }] }), false, 'reading is not building');
    assert.strictEqual(PR.changedAnything({ ok: true, toolCalls: [{ name: 'idearium.code_edit.tool', ok: false, error: 'no such file' }] }), false, 'a failed edit');
    assert.strictEqual(PR.changedAnything({ ok: true, injects: { injects: [{ path: 'docs/README.md' }] } }), true);
    assert.strictEqual(PR.changedAnything({ ok: true, toolCalls: [{ name: 'idearium.code_write.tool', ok: true }] }), true);
    assert.ok(PR.shouldEscalate('incomplete', PR.policyFrom({})), 'incomplete climbs');
  });

  await test('PB-03', 'a round fails only on what the run broke: the old broken import is known debt, the new one fails', async () => {
    // a temp dir has no COS compartment, so verify's deps step cannot run there; the real import checker is run
    // directly and its report shaped exactly as verify shapes it (lib/build-verify.js step 2)
    const check = (dir) => {
      const failures = RT.resolveDeps(dir).brokenRelative.map(b => ({ file: b.file, kind: 'import', error: `imports '${b.specifier}', which does not exist in this project — create that file or fix the path` }));
      const byFile = {}; for (const f of failures) (byFile[f.file] = byFile[f.file] || []).push(f);
      return { verdict: failures.length ? 'failed' : 'parses', why: '', failures, byFile, checks: { tests: { ran: false } } };
    };
    const dir = tmp({ 'old.js': "require('./gone.js');\n", 'ok.js': 'module.exports = 1;\n' });
    const v0 = check(dir);
    assert.strictEqual(v0.verdict, 'failed'); assert.strictEqual(v0.failures.length, 1);
    const base = BV.baselineOf(v0);
    // the run builds new.js, which imports a file that does not exist either
    fs.writeFileSync(path.join(dir, 'new.js'), "require('./also-gone.js');\n");
    const v1 = BV.against(check(dir), base, { built: ['new.js'] });
    assert.strictEqual(v1.verdict, 'failed');
    assert.deepStrictEqual(v1.failures.map(f => f.file), ['new.js'], 'only what this run broke');
    assert.deepStrictEqual(Object.keys(v1.byFile), ['new.js'], 'only new.js goes back to an agent');
    assert.deepStrictEqual(v1.known.map(f => f.file), ['old.js']);
    assert.match(v1.why, /1 older failure\(s\) in 1 file\(s\) this run did not touch — known debt/);
    // the run fixes its own file: nothing it built fails; the old debt does not fail the round
    fs.writeFileSync(path.join(dir, 'new.js'), 'module.exports = 2;\n');
    const v2 = BV.against(check(dir), base, { built: ['new.js'] });
    assert.strictEqual(v2.verdict, 'parses', 'not failed, not inflated to proven (the tests were skipped)');
    assert.match(v2.why, /^nothing this run built fails/);
    // a file this run rebuilt is its own, even when it was already failing
    const v3 = BV.against(check(dir), base, { built: ['old.js'] });
    assert.strictEqual(v3.verdict, 'failed'); assert.deepStrictEqual(v3.failures.map(f => f.file), ['old.js']);
    assert.deepStrictEqual(BV.against(v0, new Set()).known, [], 'no baseline: every failure counts');
  });

  await test('PB-04', 'a require written inside a string is text, not an import; an archived file is not checked', () => {
    const dir = tmp({
      'fixture.test.js': "const files = { 'src/a.js': \"const k = require('./kernel');\" };\nconst t = 'import x from \"../lib/sum\"';\nrequire('./real-missing');\n",
      'esm.mjs': "import a from './nope.mjs';\nexport { b } from './nope2.mjs';\nconst c = await import('./nope3.mjs');\nconst s = \"see import('./not-me.mjs')\";\n",
      '_archive/old.js': "require('./long-gone');\n",
    });
    const r = RT.resolveDeps(dir);
    assert.deepStrictEqual(r.brokenRelative.map(b => `${b.file} → ${b.specifier}`).sort(), [
      'esm.mjs → ./nope.mjs', 'esm.mjs → ./nope2.mjs', 'esm.mjs → ./nope3.mjs', 'fixture.test.js → ./real-missing',
    ]);
  });

  await test('PB-05', 'the Nexus tree: run-supervised resolves, erosmancer\'s old runner is archived; what is left is listed', () => {
    const files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    const r = RT.resolveDeps(ROOT, { files });
    const broken = r.brokenRelative.map(b => b.file);
    assert.ok(!broken.includes('cli/run-supervised.js'), 'cli/run-supervised.js resolves');
    assert.ok(!broken.some(f => f.startsWith('erosmancer/')), 'no erosmancer broken import');
    assert.ok(fs.existsSync(path.join(ROOT, 'erosmancer/erosmancer-os/tests/_archive/run.js')), 'kept (§0.3)');
    // what is left: test suites of modules that are gone — already crashing in run-all; his call, listed in the map
    const left = new Set(broken);
    for (const f of left) assert.ok(/^tests\//.test(f), `only tests are left: ${f}`);
    assert.ok(r.brokenRelative.length <= 15, `${r.brokenRelative.length} left (was 71)`);
  });

  await test('PB-06', 'wired: a no-change reply is incomplete; the prove loop takes a baseline for a Nexus repo and shows the debt', () => {
    const A = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.match(A, /if \(state === 'replied' && !PRt\.changedAnything\(r\)\) \{ state = 'incomplete'; unchanged = true; \}/);
    assert.match(A, /debt: debt \|\| \(repo\.nexusSelf \? 'baseline' : 'repair'\)/);
    assert.match(A, /const v = BV\.against\(await _verifyRepo\(repo\), baseline, \{ built: \[\.\.\.builtFiles\] \}\);/);
    assert.match(A, /if \(run\.debt === 'baseline'\) \{\s*try \{ const b0 = await _verifyRepo/);
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8'), /known debt: \$\{rr\.known\} older failure\(s\)/);
  });

  console.log(`\nphase-actually-builds: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
