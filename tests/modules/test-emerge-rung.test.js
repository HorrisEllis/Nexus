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

  await test('ER-07', 'skeleton first (0.60.607, his "the skeleton gaps, it needs to fill. using the dependancy graph"): Nexus writes the fns, the agent fills one body at a time in the order the plan\'s words give, a refused body is fed back, each gap a pillar:gap', async () => {
    const ex = [{ name: 'twice', signature: 'twice(x: num) -> num', does: 'uses inc twice' }, { name: 'inc', signature: 'inc(x: num) -> num', does: 'x plus one' }];
    const s = R.skeletonOf(ex); assert.ok(s && /fn twice\(x: any\): any/.test(s.text) && /fn inc\(x: any\): any/.test(s.text), s && s.text);
    assert.strictEqual(R.skeletonOf([{ name: 'f' }]), null, 'no signature: no skeleton (the whole-module loop, as before)');
    const asked = [];
    const bodies = { inc: ['  if !x { return 0 }', '  return x + 1'], twice: ['  return inc(inc(x))'] }; const n = {};
    const ask = async (msg, { gap }) => { asked.push(gap); n[gap] = (n[gap] || 0) + 1; if (gap === 'inc' && n[gap] === 2) assert.ok(/the lesson from this gap's earlier tries[\s\S]*The fix: Emerge has no ![\s\S]*Refused[\s\S]*unexpected character[\s\S]*if !x/.test(msg), 'the compiler\'s words and the refused body fed back'); return bodies[gap][n[gap] - 1]; };
    const r = await R.createRung({ root: ROOT, tasksDir: fs.mkdtempSync(path.join(os.tmpdir(), 'er07-')), indexRoot: null, ask, expect: async () => ({ ok: true, why: 'stand-in' }) }).build({ file: 'lib/twice.js', exports: ex });
    assert.ok(r.ok && r.skeleton, JSON.stringify(r.tries));
    assert.deepStrictEqual(asked, ['inc', 'inc', 'twice'], 'inc first (twice names it), the refused body asked again');
    assert.ok(r.tries.filter(t => t.gap).every(t => t.gap.missingVariable && t.gap.affectedConstraint), 'every gap a pillar:gap');
    assert.ok(/fn inc\(x: any\): any \{\n  return x \+ 1\n\}/.test(r.source), r.source);
  });

  await test('ER-08', 'each gap its own .gap file, every attempt on disk as it happens; a new run\'s fresh chat is told the lesson of every earlier run (EMB2, his "start a new chat and inject the context, and lesson fix again")', async () => {
    const NE = require(path.join(ROOT, 'lib', 'node-export.js'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'er08-')); const tasks = path.join(dir, 'tasks'); const C = 'repo1/map.P1';
    const ex = [{ name: 'inc', signature: 'inc(x: num) -> num', does: 'x plus one' }];
    const run1 = await R.createRung({ root: ROOT, tasksDir: tasks, indexRoot: dir, maxTries: 2, model: 'stand-in', ask: async () => '  if !x { return 0 }', expect: async () => ({ ok: true }) }).build({ file: 'lib/inc.js', exports: ex, contract: C });
    assert.ok(!run1.ok || !run1.skeleton, 'held after two refused tries');
    assert.strictEqual(run1.gapFiles.length, 1); const g1 = NE.importFromFile(run1.gapFiles[0]);
    assert.ok(g1.type === 'gap' && g1.payload.status === 'held' && g1.payload.attempts.length === 2 && g1.payload.attempts[0].model === 'stand-in', JSON.stringify(g1.payload));
    assert.ok(g1.payload.missingVariable && g1.payload.affectedConstraint, 'a pillar:gap');
    let told = null;
    const run2 = await R.createRung({ root: ROOT, tasksDir: tasks, indexRoot: dir, ask: async (msg) => { if (told === null) told = msg; return '  return x + 1'; }, expect: async () => ({ ok: true }) }).build({ file: 'lib/inc.js', exports: ex, contract: C });
    assert.ok(run2.ok && run2.skeleton, JSON.stringify(run2.tries));
    assert.ok(/tried 2 time\(s\) before[\s\S]*if !x/.test(told), 'the first chat of run 2 knows run 1\'s refusals');
    const g2 = NE.importFromFile(run2.gapFiles[0]).payload;
    assert.ok(g2.status === 'passed' && g2.gate && g2.gate.compiled && g2.attempts.length === 3 && /x \+ 1/.test(g2.body), JSON.stringify(g2));
    assert.ok(path.dirname(run2.gapFiles[0]) === path.join(tasks, 'repo1', 'map.P1'), 'the task\'s folder, named by its contract: ' + run2.gapFiles[0]);
    const listed = R.listGaps({ root: dir, contract: C });
    assert.ok(listed.length === 1 && listed[0].status === 'passed' && listed[0].tries === 3 && listed[0].filePath === run2.gapFiles[0], 'found through Idearium\'s node index: ' + JSON.stringify(listed));
    assert.ok(/x \+ 1/.test(R.listGaps({ root: dir, id: listed[0].id }).body), 'one gap whole, from its file');
    // the server's boot scan, with a gap type folder present: a node indexed from a file in a task folder (here a plain id, which the scan can
    // match to a type-folder path) stays while its file is there, and goes when it is gone
    fs.mkdirSync(path.join(dir, 'idearium', 'data', 'nodes', 'gap'), { recursive: true });
    const NR = require(path.join(ROOT, 'lib', 'node-registry.js')), NI = require(path.join(ROOT, 'lib', 'node-index.js'));
    const plain = path.join(tasks, 'repo1', 'map.P1', 'plain.gap'); fs.writeFileSync(plain, fs.readFileSync(run2.gapFiles[0]));
    const db = NR.storeFor('idearium', { root: dir, fresh: true }); NI.indexNode('gap', { ...NE.importFromFile(plain), id: 'plain' }, plain, db); db.flush();
    NR.createNodeRegistry({ system: 'idearium', root: dir, fresh: true }).scan();
    assert.strictEqual(R.listGaps({ root: dir, id: 'plain' }) !== null && R.listGaps({ root: dir, contract: C }).length, 2, 'a boot scan keeps nodes whose files are in their task folder');
    fs.unlinkSync(plain); NR.createNodeRegistry({ system: 'idearium', root: dir, fresh: true }).scan();
    assert.strictEqual(R.listGaps({ root: dir, id: 'plain' }), null, 'and drops one whose file is gone');
  });

  await test('ER-09', 'the chain (his "each problem with filling the gap becomes the next gap, in the link"): a held gap gets the gap that stops it linked in just before it, filled first, then it passes; each pass tagged in its gate; the learning memory kept', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'er09-')); const tasks = path.join(dir, 'tasks');
    const ex = [{ name: 'rename', signature: 'rename(registry, id, newPath) -> registry', does: 'a new registry with id moved to newPath' }];
    const NE = require(path.join(ROOT, 'lib', 'node-export.js'));
    const MOVED = (xs) => '  var out = []\n  for e in ' + xs + ' {\n    if e.id == id { out = push(out, { id: e.id, path: newPath }) } else { out = push(out, e) }\n  }\n  return out';
    // (1) its own try calls a function that does not exist: that piece becomes the gap in between, named by the try itself
    const asked = []; let n = 0;
    const ask1 = async (msg, { gap, diagnose }) => { asked.push(gap + (diagnose ? '?' : '')); if (gap === 'moved') return MOVED('arg1');
      n++; return n <= 2 || /fn moved\(arg1: any, id: any, newPath: any\)/.test(msg) ? '  return { entries: moved(registry.entries, id, newPath) }' : '  return null'; };
    const r1 = await R.createRung({ root: ROOT, tasksDir: tasks, indexRoot: dir, maxTries: 2, ask: ask1, expect: async () => ({ ok: true }) }).build({ file: 'lib/ren.js', exports: ex, contract: 'r/m.P1' });
    assert.ok(r1.ok, JSON.stringify(r1.tries));
    assert.deepStrictEqual(asked, ['rename', 'rename', 'moved', 'rename'], 'rename twice, then the gap in between, then rename again');
    assert.ok(/fn moved\(arg1: any, id: any, newPath: any\)[\s\S]*fn rename/.test(r1.source), 'linked in just before the gap it unblocks: ' + r1.source);
    const gf = (r, x) => NE.importFromFile(r.gapFiles.find(p => p.endsWith('#' + x + '.gap'))).payload;
    const ren = gf(r1, 'rename'), mov = gf(r1, 'moved');
    assert.ok(ren.status === 'passed' && ren.gate.passed && ren.gate.compiled && ren.unblockedBy[0] === 'moved' && ren.struggle.missing[0] === 'moved', JSON.stringify(ren));
    assert.ok(mov.blocks === 'rename' && mov.namedBy === 'its own try' && mov.gate.compiled, JSON.stringify(mov));
    // (2) nothing to read from its tries: the model is asked once why it is stuck, and the function it names is the gap in between
    let k = 0; const asked2 = [];
    const ask2 = async (msg, { gap, diagnose }) => { asked2.push(gap + (diagnose ? '?' : '')); if (diagnose) return 'fn moved(entries, id, newPath) — the entries with id moved to newPath';
      if (gap === 'moved') return MOVED('entries');
      k++; return k <= 2 ? '  registry.entries = 1\n  return registry' : '  return { entries: moved(registry.entries, id, newPath) }'; };
    const r2 = await R.createRung({ root: ROOT, tasksDir: tasks, indexRoot: dir, maxTries: 2, ask: ask2, expect: async () => ({ ok: true }) }).build({ file: 'lib/ren2.js', exports: ex, contract: 'r/m.P2' });
    assert.ok(r2.ok, JSON.stringify(r2.tries));
    assert.deepStrictEqual(asked2, ['rename', 'rename', 'rename?', 'moved', 'rename'], 'asked why once, then the named piece, then rename');
    assert.ok(r2.tries.some(t => t.stage === 'link' && /moved\(entries, id, newPath\)/.test(t.why)), 'the link said in the run');
    // (3) bounded: a gap that never fills and names nothing stays held, an open loop with its struggle, not forced
    const r3 = await R.createRung({ root: ROOT, tasksDir: tasks, indexRoot: dir, maxTries: 1, ask: async () => '  if !x { return 1 }', expect: async () => ({ ok: true }) }).build({ file: 'lib/ren3.js', exports: ex, contract: 'r/m.P3' });
    assert.ok(!r3.ok && r3.held && gf(r3, 'rename').status === 'held', JSON.stringify(r3));
  });

  await test('ER-10', 'the ladder, smallest model first, and his framework per gate: a gap the small model cannot fill (and names nothing for) goes up, told every earlier try; a failed module test reopens the functions under test with its words and his Section 10 (hostile verification)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'er10-')); const tasks = path.join(dir, 'tasks');
    const ex = [{ name: 'inc', signature: 'inc(x: num) -> num', does: 'x plus one' }];
    const NE = require(path.join(ROOT, 'lib', 'node-export.js'));
    const seenBig = [];
    const ladder = [{ name: 'tiny', ask: async (msg, { diagnose }) => (diagnose ? 'no idea' : '  if !x { return 1 }') },
                    { name: 'big', ask: async (msg) => { seenBig.push(msg); return '  return x + 1'; } }];
    const r = await R.createRung({ root: ROOT, tasksDir: tasks, indexRoot: null, maxTries: 1, ladder, expect: async () => ({ ok: true }) }).build({ file: 'lib/inc.js', exports: ex, contract: 'r/m.L' });
    assert.ok(r.ok && r.tries.some(t => t.stage === 'escalate' && /tiny → big/.test(t.why)), JSON.stringify(r.tries));
    assert.ok(/if !x/.test(seenBig[0]), 'the bigger model is told the small one\'s refused try');
    const g = NE.importFromFile(r.gapFiles[0]).payload;
    assert.ok(g.gate.model === 'big' && g.attempts[0].model === 'tiny' && g.gate.tested, JSON.stringify(g));
    // his framework per gate: the diagnose brief carries his Sections 3 and 4 from his .framework file
    let diag = null;
    // the method is given per gate (resolved by COS from the step's method:), never chosen by the rung: agnostic
    const method = { diagnose: '- Section 3 — Finding the gap: frame first\n- Section 4 — Constraints & deconstruct: zoom in to bedrock', test: '- Section 10 — Hostile verification: attack it' };
    await R.createRung({ root: ROOT, tasksDir: tasks, indexRoot: null, maxTries: 1, method, ask: async (msg, { diagnose }) => { if (diagnose) { diag = msg; return 'nothing'; } return '  if !x { return 1 }'; }, expect: async () => ({ ok: true }) }).build({ file: 'lib/inc2.js', exports: ex, contract: 'r/m.L' });
    assert.ok(/The method:\n- Section 3[\s\S]*Section 4/.test(diag || ''), 'the given method in the diagnose gate');
    let none = null; await R.createRung({ root: ROOT, tasksDir: tasks, indexRoot: null, maxTries: 1, ask: async (msg, { diagnose }) => { if (diagnose) { none = msg; return 'nothing'; } return '  if !x { return 1 }'; }, expect: async () => ({ ok: true }) }).build({ file: 'lib/inc2b.js', exports: ex, contract: 'r/m.L' });
    assert.ok(!/The method:/.test(none || ''), 'no method given, none used: the rung chooses none');
    // a failed module test reopens the gap with its words and his Section 10, once (rounds = 1), then passes
    let calls = 0; const briefs = [];
    const r2 = await R.createRung({ root: ROOT, tasksDir: tasks, indexRoot: null, maxTries: 1, method, ask: async (msg) => { briefs.push(msg); return '  return x + 1'; },
      expect: async () => (++calls === 1 ? { ok: false, why: 'inc(1) == 3 failed' } : { ok: true }) }).build({ file: 'lib/inc3.js', exports: ex, contract: 'r/m.L' });
    assert.ok(r2.ok && r2.tries.some(t => t.stage === 'reopen'), JSON.stringify(r2.tries));
    assert.ok(/The fix: - Section 10 — Hostile verification[\s\S]*the module's test failed: inc\(1\) == 3 failed/.test(briefs[1]), briefs[1]);
    // still failing after its rounds: held, never the whole-module loop
    const r3 = await R.createRung({ root: ROOT, tasksDir: tasks, indexRoot: null, maxTries: 1, ask: async () => '  return x + 1', expect: async () => ({ ok: false, why: 'wrong' }) }).build({ file: 'lib/inc4.js', exports: ex, contract: 'r/m.L' });
    assert.ok(!r3.ok && r3.held && /test failed 2 time/.test(r3.why) && !r3.tries.some(t => t.stage === 'no-code' || t.stage === 'compile'), JSON.stringify(r3));
  });

  await test('ER-11', 'a plan without a model names a new file\'s exports from the phase\'s own words (0.60.617, his "Everything chunked, decomposed"): the skeleton the rung fills', () => {
    const P = require(path.join(ROOT, 'lib', 'phase-plan.js'));
    const does = 'A pure module: autocorrect(body: string) -> { body: string, fixes: list } rewrites what a small model wrote';
    const r = P.derivePlan({ phaseKey: 'EMB3', does, files: ['idearium/lib/autocorrect.js', 'idearium/lib/test/autocorrect.test.js'], codeOf: () => null });
    const src = r.plan.files.find(f => f.path === 'idearium/lib/autocorrect.js'), t = r.plan.files.find(f => f.path.endsWith('.test.js'));
    assert.deepStrictEqual(src.exports.map(e => e.signature), ['autocorrect(body: string) -> { body: string, fixes: list }']);
    assert.ok(R.skeletonOf(src.exports), 'the rung can write its skeleton from it');
    assert.strictEqual(t.exports.length, 0, 'the test file is not given the module\'s exports');
    const two = P.derivePlan({ phaseKey: 'X', does: 'idOf(registry, path) -> string and rename(registry, id, newPath) -> registry', files: ['lib/a.js', 'lib/idOf.js'], codeOf: () => null });
    assert.deepStrictEqual(two.plan.files.find(f => f.path === 'lib/idOf.js').exports.map(e => e.name), ['idOf'], 'with two new files a signature goes to the file of its name');
    assert.strictEqual(two.plan.files.find(f => f.path === 'lib/a.js').exports.length, 0, 'and is never guessed onto another');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
