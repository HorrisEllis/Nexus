'use strict';
// run-all: timeout 240000
/**
 * tests/modules/test-emerge-rung.test.js — EMB1 (0.60.421): Emerge writes the brick (docs/2026-10-17-pieces-not-order-phasemap.spec).
 * James, 2026-11-06: "emerge, we need to get it coding remember. thats why emerge is important, also the test env, using the test file for
 * expectation, the primitive also, then emerge can also verify itself with the compiler." · "also the retry engine for emerge."
 *   ER-01  the brief (Emerge's card, the planned exports, the expectation, the gate's context, the last failure), the code pulled from a reply, the adapter
 *   ER-02  the retry engine: Emerge's compiler error goes into the next try word for word, and the fixed try passes; what lands
 *   ER-03  a missing export, a failed expectation, each carried into the next try; after its tries it stops and says why; no answer stops at once
 *   ER-04  the real build: the planned file required as a plain module, its functions called; a wrong type is said with its line
 *   ER-05  wired into ▶ build: only a NEW planned JS file, only with routing.emerge_first not off, before the JavaScript ladder; a pass is
 *          proposed and stored as a verified primitive; Emerge reached only through its command line
 *   ER-06  the setting: routing.emerge_first prefer (default) | off — in the policy, Idearium's config, the settings screen, the command
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const R = require(path.join(ROOT, 'idearium/lib/emerge-rung.cjs'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const block = (code) => '```eg\n' + code + '\n```';
const CLAMP = 'fn clamp(x: num, lo: num, hi: num): num {\n  if x < lo { return lo }\n  if x > hi { return hi }\n  return x\n}';
const CLAMP_TYPO = CLAMP.replace('return hi', 'return high');
// the expectation, as the shadow would run it: the built files written to a folder, the planned file required, its functions called
const runs = (check) => async ({ file, files }) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ew-'));
  try { for (const [k, v] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, k)), { recursive: true }); fs.writeFileSync(path.join(d, k), v); }
    const m = require(path.join(d, file)); return check(m); }
  catch (e) { return { ok: false, why: e.message }; } finally { fs.rmSync(d, { recursive: true, force: true }); }
};
const scripted = (replies, seen = []) => async (message, { tryNo }) => { seen.push(message); const r = replies[tryNo - 1]; if (r instanceof Error) throw r; return r; };

(async () => {
  console.log('\n⬡  Emerge writes the brick (EMB1)\n');

  await test('ER-01', 'the brief, the code from a reply, the adapter', () => {
    const b = R.brief({ file: 'lib/clamp.js', exports: [{ name: 'clamp' }], expectation: 'assert.strictEqual(clamp(9, 0, 5), 5)', context: 'NEXUS NOTE', feedback: 'main.eg:3:22: error: "high" is not defined' });
    for (const w of ['You write Emerge (.eg)', 'becomes lib/clamp.js', 'top-level functions (they are its exports): clamp', 'clamp(9, 0, 5)', 'NEXUS NOTE', 'YOUR LAST TRY FAILED', '"high" is not defined', '```eg']) assert.ok(b.includes(w), w);
    assert.strictEqual(R.extract('here:\n```eg\nfn a(): num = 1\n```\nthanks'), 'fn a(): num = 1\n');
    assert.strictEqual(R.extract('```\nfn a(): num = 1\n```'), 'fn a(): num = 1\n'); assert.strictEqual(R.extract('no code at all'), null);
    const a = R.adapter('lib/util/clamp.js');
    assert.match(a, /require\('\.\.\/\.\.\/_emerge\/lang\/runtime\.js'\)/); assert.match(a, /require\('\.\/clamp\.eg\.js'\)/);
    assert.match(R.adapter('clamp.js'), /require\('\.\/_emerge\/lang\/runtime\.js'\)/);
  });

  await test('ER-02', 'the retry engine: the compiler\'s error into the next try, word for word; the fix passes; what lands', async () => {
    const seen = [];
    const rung = R.createRung({ root: ROOT, ask: scripted([block(CLAMP_TYPO), block(CLAMP)], seen), expect: runs(m => ({ ok: m.clamp(9, 0, 5) === 5 && m.clamp(-1, 0, 5) === 0, why: 'clamp holds' })) });
    const r = await rung.build({ file: 'lib/util/clamp.js', exports: [{ name: 'clamp' }] });
    assert.ok(r.ok, JSON.stringify(r.tries)); assert.deepStrictEqual(r.tries.map(t => t.stage), ['compile', 'pass']);
    assert.match(r.tries[0].why, /main\.eg:3:\d+: error: "high" is not defined/);
    assert.match(seen[1], /YOUR LAST TRY FAILED[\s\S]*Emerge's compiler said: main\.eg:3:\d+: error: "high" is not defined/);
    const own = Object.keys(r.files).filter(k => !k.startsWith('_emerge/')).sort();
    assert.deepStrictEqual(own, ['lib/util/clamp.eg', 'lib/util/clamp.eg.js', 'lib/util/clamp.js']);
    assert.ok(r.files['_emerge/lang/runtime.js'], 'Emerge\'s runtime lands at the root');
    assert.strictEqual(r.files['lib/util/clamp.eg'], CLAMP + '\n');
  });

  await test('ER-03', 'a missing export and a failed expectation carried; it stops after its tries, saying why; no answer stops', async () => {
    const seen = [];
    const rung = R.createRung({ root: ROOT, maxTries: 3, ask: scripted([block('fn clip(x: num): num = x'), block('fn clamp(x: num, lo: num, hi: num): num = x'), block(CLAMP)], seen),
      expect: runs(m => (m.clamp(9, 0, 5) === 5 ? { ok: true, why: 'ok' } : { ok: false, why: 'clamp(9, 0, 5) should be 5, got ' + m.clamp(9, 0, 5) })) });
    const r = await rung.build({ file: 'clamp.js', exports: ['clamp'] });
    assert.deepStrictEqual(r.tries.map(t => t.stage), ['exports', 'expect', 'pass']);
    assert.match(seen[1], /Missing: clamp — define it as top-level fn/); assert.match(seen[2], /The expectation test said: clamp\(9, 0, 5\) should be 5, got 9/);
    const never = R.createRung({ root: ROOT, maxTries: 2, ask: scripted(['no code here', 'still none']) });
    const n = await never.build({ file: 'x.js' }); assert.strictEqual(n.ok, false); assert.match(n.why, /^no-code: the reply had no Emerge code block$/); assert.strictEqual(n.tries.length, 2);
    const gone = R.createRung({ root: ROOT, ask: scripted([new Error('the agent is down')]) });
    const g = await gone.build({ file: 'x.js' }); assert.deepStrictEqual([g.ok, g.tries.length, g.tries[0].stage], [false, 1, 'no-answer']);
  });

  await test('ER-04', 'the real build: a plain module whose functions run; a wrong type said with its line', async () => {
    let mod = null;
    const rung = R.createRung({ root: ROOT, ask: scripted([block(CLAMP + '\nfn twice(x: num): num = x * 2')]), expect: runs(m => { mod = m; return { ok: m.twice(21) === 42, why: 'twice(21) = 42' }; }) });
    const r = await rung.build({ file: 'math.js', exports: ['clamp', 'twice'] });
    assert.ok(r.ok, JSON.stringify(r.tries)); assert.deepStrictEqual(Object.keys(mod).sort(), ['clamp', 'twice']);
    assert.throws(() => mod.twice('x'), /parameter x of twice must be num/);
  });

  await test('ER-05', 'wired into ▶ build: new JS files only, not when off, before the ladder; proposed and stored verified; Emerge only by its command line', () => {
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const hook = src.indexOf("if (!gate.parent && policy.emergeFirst !== 'off' && /\\.[cm]?js$/.test(f) && vfr && vfr.verdict === 'missing' && order.length)");
    const ladder = src.indexOf('const out = await PRt.climb({ rungs: order, policy,', hook);
    assert.ok(hook > 0 && ladder > hook, 'the Emerge rung runs before the JavaScript ladder');
    assert.ok(/if \(ew\) return ew;/.test(src.slice(hook, ladder)), 'a pass returns the brick; a fall back goes on to the ladder');
    for (const w of ["_require('../lib/emerge-rung.cjs')", "RIp.propose({", "role: 'emerge-rung'", "CSx.markTested({", "state: 'verified'", "state: res.ok ? 'emerge-passed' : 'emerge-fell-back'", 'EXT.run({ root, plan, path: f, overlays:']) assert.ok(src.includes(w), w);
    const rung = fs.readFileSync(path.join(ROOT, 'idearium/lib/emerge-rung.cjs'), 'utf8');
    assert.ok(!/require\([^)]*['"\/]emerge\/emerge\//.test(rung) && !/require\(path\.join\([^)]*'emerge'/.test(rung), 'never requires Emerge\'s files (its system folder, emerge/emerge)');
    assert.match(rung, /\[CLI, cmd, '--source', source/);
  });

  await test('ER-06', 'the setting: policy, config, screen, command', () => {
    const P = require(path.join(ROOT, 'lib/pipeline-routing.js'));
    assert.strictEqual(P.DEFAULTS.emergeFirst, 'prefer'); assert.strictEqual(P.policyFrom({ emerge_first: 'off' }).emergeFirst, 'off'); assert.strictEqual(P.policyFrom({}).emergeFirst, 'prefer');
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/lib/config-core.cjs'), 'utf8'), /emerge_first:\s+\{ default: 'prefer', enum: \['prefer', 'off'\]/);
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/settings.html'), 'utf8');
    assert.match(ui, /routing\.emerge_first/); assert.match(ui, /rtSet\('emerge_first', b\.dataset\.rtEw\)/);
    const row = require(path.join(ROOT, 'idearium/cli/route-commands.js')).SPEC.find(r => r.key === 'system.routing');
    assert.deepStrictEqual(row.req({ args: ['emerge_first', 'off'], flags: {} }).body, { key: 'routing.emerge_first', value: 'off', actor: 'command' });
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
