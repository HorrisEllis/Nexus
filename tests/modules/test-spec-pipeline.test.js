'use strict';
/**
 * tests/modules/test-spec-pipeline.test.js — SF1 + SF2 + SF3 (docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec)
 * James, 2026-10-15: "also need the agents to use the spec compiler? like the yaml. need to inject a framework for
 * generating a .spec file. then need to listen for it to collect it. intent based .inject nodes" · "begin on the
 * pipeline. The speccing, mapping, listener."
 * The agent's reply goes through the REAL lib/repo-inject fromReply and the real idearium RepoLayer; only the model is
 * absent (its reply is written here).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
process.env.NEXUS_INJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-pipe-'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

const PB = require(path.join(ROOT, 'lib/repo-prompt-blocks.js'));
const CP = require(path.join(ROOT, 'lib/context-prereqs.js'));
const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
const SC = require(path.join(ROOT, 'lib/spec-collect.js'));
const GOOD = 'spec:\n  meta:\n    name: ledger\n    version: 0.1.0\n    uuid: ledger-v1\n    purpose: keep entries in order\n  modules:\n    - id: ledger-store\n      description: "appends and reads entries"\n      exports:\n        - "append(entry: Entry) → Receipt"\n        - "read(from: number) → Entry[]"\n  schemas:\n    - id: Entry\n      fields:\n        text: string\n';
const BAD = 'spec:\n  meta:\n    name: ledger\n  modules:\n    - id: ledger-store\n      exports:\n        - append\n';

(async () => {
  await test('SP-01', 'SF1: the request\'s intent — writing a spec is "spec"; asking about one is not', async () => {
    assert.strictEqual(CP.intentOf('write a spec for the ledger'), 'spec');
    assert.strictEqual(CP.intentOf('draft the auth specification'), 'spec');
    assert.strictEqual(CP.intentOf('update spec/ledger.spec with a cursor'), 'spec');
    assert.strictEqual(CP.intentOf('does this match the spec?'), 'explain');
    assert.strictEqual(CP.intentOf('fix the login bug'), 'debug');
  });

  await test('SP-02', 'SF1+SF2: the spec-framework block is sent with a spec request only, through compose (every caller)', async () => {
    const withSpec = RA.compose({ hat: { personaPrompt: 'P' }, message: 'write a spec for the ledger', blocks: PB.DEFAULT_BLOCKS, backend: 'guardian' });
    const without = RA.compose({ hat: { personaPrompt: 'P' }, message: 'fix the ledger bug', blocks: PB.DEFAULT_BLOCKS, backend: 'guardian' });
    assert.ok(withSpec.includes("SPEC COMPILER'S FORMAT"), 'the framework is in a spec request');
    assert.ok(!without.includes("SPEC COMPILER'S FORMAT"), 'and not in any other');
    const off = PB.DEFAULT_BLOCKS.map(b => b.id === 'spec-framework' ? { ...b, enabled: false } : b);
    assert.ok(!RA.compose({ hat: { personaPrompt: 'P' }, message: 'write a spec for x', blocks: off, backend: 'guardian' }).includes("SPEC COMPILER'S FORMAT"), 'switched off in settings: not sent');
    const edited = PB.DEFAULT_BLOCKS.map(b => b.id === 'spec-framework' ? { ...b, text: 'MY OWN FRAMEWORK' } : b);
    assert.ok(RA.compose({ hat: { personaPrompt: 'P' }, message: 'write a spec for x', blocks: edited, backend: 'guardian' }).includes('MY OWN FRAMEWORK'), 'his edit is what is sent');
  });

  await test('SP-03', 'SF2: the framework\'s own example is a spec the compiler can read (it cannot teach a broken shape)', async () => {
    const t = PB.DEFAULT_BLOCKS.find(b => b.id === 'spec-framework').text;
    const y = t.match(/```yaml spec\/<name>\.spec\n([\s\S]*?)```/)[1].replace(/<name>/g, 'ledger').replace(/<module-id>/g, 'ledger-store').replace(/<folder\/file\.js>/g, 'lib/ledger-store.js');
    const v = SC.validate(y);
    assert.ok(v.ok, v.errors.join('; '));
  });

  await test('SP-04', 'SF3: validate says exactly what is missing; a non-compiler .spec (a phasemap) is never judged', async () => {
    assert.ok(SC.validate(GOOD).ok);
    const v = SC.validate(BAD);
    assert.ok(!v.ok);
    for (const want of ['spec.meta.version is required', 'spec.meta.purpose is required', 'spec.meta.uuid is required', 'description is required', 'must read "name(params) → returns"'])
      assert.ok(v.errors.some(e => e.includes(want)), `missing error: ${want}`);
    assert.ok(!SC.isCompilerSpec('docs/x-phasemap.spec', 'phases:\n  A1_x:\n    status: OPEN\n'));
    assert.ok(SC.isCompilerSpec('spec/ledger.spec', '# a comment\nspec:\n  meta: {}\n'));
  });

  await test('SP-05', 'SF3: the format is still the one docs/spec-compiler.spec states', async () => {
    const t = fs.readFileSync(path.join(ROOT, 'docs/spec-compiler.spec'), 'utf8');
    const list = (k) => (t.match(new RegExp(`^\\s+${k}:\\s*\\[([^\\]]*)\\]`, 'm')) || [, ''])[1].split(',').map(s => s.trim()).filter(Boolean);
    assert.deepStrictEqual(list('required_keys'), SC.FORMAT.required);
    assert.deepStrictEqual(list('meta_required'), SC.FORMAT.metaRequired);
    assert.deepStrictEqual(list('module_required'), SC.FORMAT.moduleRequired);
    for (const k of list('optional_keys')) assert.ok(SC.FORMAT.optional.includes(k), `optional key ${k}`);
  });

  // ── the listener, end to end: an agent's reply landing in a real repo ──
  const api = await quiet(() => import(path.join(ROOT, 'idearium', 'api', 'index.js')));
  const layer = api.getRepoLayer();
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  let repo = null;
  for (let i = 0; i < 20 && !(repo && repo.uuid); i++) {
    const r = await quiet(() => layer.ingest({ name: `spec-pipe-${Date.now()}`, source: 'test', files: [{ path: 'README.md', content: '# t\n' }] }));
    if (!(r && r.error && /no spec-engine/.test(r.error))) repo = r && (r.repo || r);
    else await new Promise(res => setTimeout(res, 250));
  }
  const bus = require(path.join(ROOT, 'nexus/nexus-bus.js'));
  const heard = []; bus.on('idearium.spec.collected', (e) => heard.push(e && e.payload !== undefined ? e.payload : e));
  const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-pipe-idx-'));

  await test('SP-06', 'SF3: a valid spec in the reply is collected — its modules and exports on the inject, and announced with its phase', async () => {
    assert.ok(repo && repo.uuid, 'a real repo');
    const fr = await quiet(() => RI.fromReply({ layer, repo, hat: { uuid: 'hat-s', name: 'repo_s' }, text: 'Here it is:\n```yaml spec/ledger.spec\n' + GOOD + '```\n', repoDir: DIR, stage: null, exchange: { ts: Date.now(), phase: 'docs/app-phasemap.spec::SP1_ledger_spec' } }));
    const inj = fr.injects.find(i => i.path === 'spec/ledger.spec');
    assert.ok(inj, `landed: ${JSON.stringify(fr.refused)}`);
    assert.ok(inj.spec && inj.spec.ok, JSON.stringify(inj.spec));
    assert.deepStrictEqual(inj.spec.modules.map(m => [m.id, m.exports]), [['ledger-store', ['append', 'read']]]);
    const ev = heard.find(e => e && (e.path === 'spec/ledger.spec' || (e.data && e.data.path === 'spec/ledger.spec')));
    assert.ok(ev, `idearium.spec.collected heard (${heard.length} events)`);
    assert.strictEqual(inj.spec.phase, 'docs/app-phasemap.spec::SP1_ledger_spec', 'tagged with the phase that asked for it');
    assert.strictEqual((ev.phase || (ev.data && ev.data.phase)), 'docs/app-phasemap.spec::SP1_ledger_spec');
  });

  await test('SP-07', 'SF3: an invalid spec is refused at the gate with what to fix; nothing is proposed', async () => {
    const fr = await quiet(() => RI.fromReply({ layer, repo, hat: { uuid: 'hat-s', name: 'repo_s' }, text: '```yaml spec/broken.spec\n' + BAD + '```\n', repoDir: DIR }));
    assert.ok(!fr.injects.some(i => i.path === 'spec/broken.spec'), 'not proposed');
    const why = fr.refused.map(r => r.reason).join(' ');
    assert.ok(/spec\.meta\.version is required/.test(why) && /name\(params\) → returns/.test(why), why);
  });

  // ── SF4 (0.60.67): a collected spec compiled — T0/T1, zero tokens; every file a proposal, nothing overwritten ──
  await test('SP-08', 'SF4: compile proposes every emitted file as an .inject, writes nothing, never overwrites', async () => {
    await quiet(() => layer.writeFile(repo.uuid, 'package.json', '{"name":"mine"}\n'));
    const r = await quiet(() => SC.compileToProposals({ layer, repo, specPath: 'spec/ledger.spec', content: GOOD }));
    assert.ok(r.ok, r.error);
    assert.ok(r.proposed.some(p => p.path === 'src/modules/ledger-store/ledger-store.ts'), JSON.stringify(r.proposed.map(p => p.path)));
    assert.ok(r.skipped.some(x => x.path === 'package.json' && /never overwrites/.test(x.why)), 'the existing package.json is skipped, said');
    const pf = layer.readFile(repo.uuid, 'package.json');
    assert.strictEqual(pf.content.trim(), '{"name":"mine"}', 'not overwritten');
    const ts = layer.readFile(repo.uuid, 'src/modules/ledger-store/ledger-store.ts');
    assert.ok(!ts || ts.error, 'a proposal is not written until applied');
    const n = RI.get(r.proposed[0].uuid);
    assert.strictEqual(n.status, 'proposed'); assert.strictEqual(n.source.kind, 'compiler');
  });

  await test('SP-09', 'SF4: the route compiles a spec in the repo; a file not in the compiler\'s format is refused', async () => {
    await quiet(() => layer.writeFile(repo.uuid, 'spec/route.spec', GOOD.replace('ledger-store', 'route-store')));
    const ok = await quiet(() => api._route('POST', `/api/repos/${repo.uuid}/specs/compile`, { path: 'spec/route.spec', into: 'gen' }));
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.json).slice(0, 300));
    const d = ok.json.data || ok.json;
    assert.ok(d.proposed.some(p => p.path === 'gen/src/modules/route-store/route-store.ts'), JSON.stringify(d.proposed.map(p => p.path)));
    await quiet(() => layer.writeFile(repo.uuid, 'docs/x-phasemap.spec', 'phases:\n  A1_x:\n    status: OPEN\n'));
    const no = await quiet(() => api._route('POST', `/api/repos/${repo.uuid}/specs/compile`, { path: 'docs/x-phasemap.spec' }));
    assert.strictEqual(no.status, 422);
  });

  await test('SP-10', 'SF4: with specs.compile_on_collect on, a spec that lands is compiled at once (off by default)', async () => {
    assert.strictEqual(SC.compileSetting().on, false, 'off by default');
    SC.setCompileSetting(() => ({ on: true, into: 'auto' }));
    const heardC = []; bus.on('idearium.spec.compiled', (e) => heardC.push(e && e.payload !== undefined ? e.payload : e));
    const fr = await quiet(() => RI.fromReply({ layer, repo, hat: { uuid: 'hat-s', name: 'repo_s' }, text: '```yaml spec/auto.spec\n' + GOOD.replace('ledger-store', 'auto-store') + '```\n', repoDir: DIR }));
    const inj = fr.injects.find(i => i.path === 'spec/auto.spec');
    assert.ok(inj && inj.spec && inj.spec.compiling, JSON.stringify(inj && inj.spec));
    for (let i = 0; i < 40 && !heardC.length; i++) await new Promise(r => setTimeout(r, 100));
    const ev = heardC[0]; const p = ev && (ev.proposed || (ev.data && ev.data.proposed));
    assert.ok(p && p.includes('auto/src/modules/auto-store/auto-store.ts'), JSON.stringify(ev));
    SC.setCompileSetting(() => ({ on: false, into: '' }));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
