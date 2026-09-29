'use strict';
/**
 * tests/modules/test-one-idearium-phases-nodes.test.js — 0.39.271
 * Map: docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec
 *
 * R1 root directory redirect · V1 versionium history newest-n / branch · N1 one bar ·
 * P1 list-form phases (inside phases: only) · P2 the phases model · S1 living spec ·
 * T1–T3 suite, every test, debug reports · C1 copilot contract · X1–X3 nodes.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..');

// silence module chatter so run-all counts only this file's lines
const _log = console.log, _warn = console.warn;
const quiet = (fn) => async (...a) => { console.log = (...x) => { if (!/^\[/.test(String(x[0]))) _log(...x); }; console.warn = () => {}; try { return await fn(...a); } finally { console.log = _log; console.warn = _warn; } };

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await quiet(fn)(); pass++; _log(`  ✓ ${name}`); }
  catch (e) { fail++; _log(`  ✗ ${name}\n      ${String(e && e.stack || e).split('\n').slice(0, 3).join('\n      ')}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const tmp = (pfx) => fs.mkdtempSync(path.join(os.tmpdir(), pfx));
const write = (dir, p, c) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), c); };

(async () => {
  _log('\ntest-one-idearium-phases-nodes\n');

  await t('R1 the orchestrator redirects a top-level UI directory (/idearium/) to /ui/<path>, not 404', () => {
    const src = read('orchestrator/orchestrator.js');
    const i = src.indexOf('§0.39.271 R1');
    assert.ok(i > 0 && src.indexOf("if (top !== 'api')", i) > i, 'redirect sits before the /api-only 404');
    assert.ok(/SYSTEM_UI_NAMES = \['idearium', 'architect'\]/.test(src) && /writeHead\(302, \{ Location: target/.test(src));
  });

  await t('V1 versionium history: ?n= returns the newest n, ?branch= filters; repo lists ask for their own branch', () => {
    const v = read('versionium/routes/versionium.js');
    assert.ok(/nParam\s*\n?\s*\? jaaDB\.query\('versionium_commits', match, 1e6\)\.sort\(\(a, b\) => \(b\.wall/.test(v));
    const api = read('idearium/api/index.js');
    assert.ok((api.match(/&branch=\$\{encodeURIComponent\(snapshotBranch\(/g) || []).length >= 2, 'repo.snapshot.list + nexus-self.versions');
    assert.ok(/branch=\$\{encodeURIComponent\('repo-' \+ repoUuid\)\}&n=1000/.test(api), 'the import baseline check too');
    const orch = read('orchestrator/orchestrator.js');
    assert.ok(/GET\('versionium',`\/api\/versionium\/history\?n=/.test(orch) && /POST\('versionium','\/api\/versionium\/commit'/.test(orch));
  });

  await t('N1 the global bar holds no Create/Build; they live in the repo tab row', () => {
    const html = read('idearium/ui/index.html');
    const bar = html.slice(html.indexOf('<nav class="tabbar"'), html.indexOf('</nav>', html.indexOf('<nav class="tabbar"')));
    assert.ok(!/data-group="create"|data-group="build"/.test(bar));
    const sub = html.slice(html.indexOf('<nav class="repo-subnav"'), html.indexOf('</nav>', html.indexOf('<nav class="repo-subnav"')));
    assert.ok(/data-group="create"/.test(sub) && /data-group="build"/.test(sub) && /data-subtab="phases"/.test(sub));
    assert.ok(!/data-subtab="roadmap"|data-subtab="phasemap"/.test(sub), 'Phasemap + Roadmap are one tab');
  });

  const loom = require(path.join(ROOT, 'loom/scanners/phasemap-map.js'));
  await t('P1 loom reads list-form phases (name, status words, depends_on, closes, files)', () => {
    const txt = `spec:\n  phases:\n    - id: T1\n      name: tar disk\n      status: built\n      closes: [M2]\n      files: [cos/testenv/tar.js]\n    - id: T2\n      name: >-\n        detect\n      status: active\n      depends_on: [T1]\n    - id: T3\n      name: later\n`;
    const p = loom.parsePhasemapText(txt, 'm');
    assert.deepStrictEqual(p.map(x => [x.id, x.status, x.form]), [['T1', 'done', 'list'], ['T2', 'in-progress', 'list'], ['T3', 'pending', 'list']]);
    assert.deepStrictEqual(p[0].closes, ['M2']); assert.deepStrictEqual(p[0].files, ['cos/testenv/tar.js']); assert.strictEqual(p[1].dependsOn, 'T1');
  });
  await t('P1 an `- id:` outside a phases: list is not a phase (the SESSION1 entries: row)', () => {
    const txt = `spec:\n  drift:\n    entries:\n      - id: SESSION1\n        type: coverage\n  phases:\n    - id: A1\n      status: pending\n`;
    assert.deepStrictEqual(loom.parsePhasemapText(txt, 'm').map(x => x.id), ['A1']);
  });
  await t('P1 every phasemap in docs/ still parses; the list-form maps are now visible', () => {
    let lf = 0;
    for (const f of fs.readdirSync(path.join(ROOT, 'docs')).filter(loom.isPhasemapFile)) lf += loom.parsePhasemapText(read(`docs/${f}`), f).filter(p => p.form === 'list').length;
    assert.ok(lf >= 40, `list-form phases found: ${lf}`);
  });

  const { setPhaseStatus } = await import(path.join(ROOT, 'idearium/repo/roadmap.js'));
  const PH = await import(path.join(ROOT, 'idearium/repo/phases.js'));
  await t('P2 a list-form phase status edit round-trips through loom and leaves the other phases alone', () => {
    const txt = `spec:\n  phases:\n    - id: A1\n      name: first\n      status: pending\n    - id: A2\n      name: second\n      status: pending\n      depends_on: [A1]\n`;
    const r = setPhaseStatus({ text: txt, mapName: 'm', phaseId: 'A1', status: 'complete', date: '2026-09-27' });
    const back = loom.parsePhasemapText(r.text, 'm');
    assert.strictEqual(back.find(p => p.id === 'A1').status, 'done'); assert.strictEqual(back.find(p => p.id === 'A2').status, 'pending');
  });
  await t('P2 managerView over an ordinary repo: summary, maps with meta, layers, runs attached, build task composed from the map', () => {
    const dir = tmp('phases-');
    const map = `spec:\n  meta:\n    name: demo\n    release: 1.0\n  missing:\n    - M1 no widget\n  invariants:\n    I1: never lose data\n  phases:\n    W1_widget:\n      status: pending\n      closes: [M1]\n      does: >\n        build the widget\n    W2_docs:\n      status: pending\n      depends_on: [W1]\n`;
    write(dir, 'docs/demo-phasemap.spec', map);
    const repo = { uuid: 'r1', name: 'demo', files: [{ path: 'docs/demo-phasemap.spec' }] };
    const v = PH.managerView({ repo, repoDir: dir, runs: [{ runId: 'x', phaseUuid: 'r1:docs/demo-phasemap.spec:W1_widget', state: 'replied', ts: 1 }] });
    assert.strictEqual(v.scope.source, 'repo'); assert.strictEqual(v.editVia, 'repo-layer');
    assert.strictEqual(v.summary.total, 2); assert.strictEqual(v.maps[0].meta.name, 'demo');
    const w1 = v.phases.find(p => p.phase_key === 'W1_widget');
    assert.ok(w1.ready && w1.runs === 1 && w1.lastRun.state === 'replied' && w1.closes[0] === 'M1');
    assert.ok(v.phases.find(p => p.phase_key === 'W2_docs').blocked_by.length === 1);
    const req = PH.buildRequest({ phase: w1, mapText: map, repo });
    assert.ok(/Build phase W1_widget/.test(req.message) && /M1 no widget/.test(req.message) && /never lose data/.test(req.message));
  });
  await t('P3 a phase build takes the Versionium snapshot before anything is sent, and refuses without one', () => {
    const api = read('idearium/api/index.js');
    const b = api.slice(api.indexOf('async function _phaseBuild('), api.indexOf('// §0.39.271 — one repo snapshot'));
    assert.ok(b.indexOf('_commitRepoSnapshotFor(') > 0 && b.indexOf('_commitRepoSnapshotFor(') < b.indexOf('RA.dispatch('));
    assert.ok(/code: 'NO_SNAPSHOT'/.test(b));
  });

  const LS = await import(path.join(ROOT, 'idearium/repo/living-spec.js'));
  await t('S1 the living spec: the spec folder is listed (phasemaps left out) and one spec parsed into its living parts', async () => {
    const dir = tmp('lspec-');
    write(dir, 'spec/demo.spec', `spec:\n  meta:\n    name: demo\n    version: 1.2.0\n  gaps:\n    G1: no cache\n  version_history:\n    - version: 1.2.0\n      date: 2026-09-27\n      summary: cache\n# ── ADDENDUM 2026-09-27 — drift found\n# the cache moved\n`);
    write(dir, 'spec/demo-phasemap.spec', 'spec:\n  phases: {}\n');
    const repo = { uuid: 'r2', name: 'demo', files: [] };
    const l = await LS.listSpecs({ repo, repoDir: dir });
    assert.deepStrictEqual(l.specs.map(s => s.path), ['spec/demo.spec']); assert.strictEqual(l.primary, 'spec/demo.spec');
    const r = await LS.readSpec({ repo, repoDir: dir, specPath: 'spec/demo.spec' });
    assert.ok(r.parsed.ok && r.parsed.meta.version === '1.2.0' && r.parsed.gaps[0].id === 'G1' && r.parsed.versionHistory.length === 1);
    assert.strictEqual(r.parsed.addenda[0].date, '2026-09-27'); assert.ok(/cache moved/.test(r.parsed.addenda[0].text));
  });
  await t('S1 a spec that is not valid YAML says where, and is still shown', () => {
    const p = LS.parseSpec('spec:\n  meta:\n    name: x\n  bad: [unclosed\n');
    assert.ok(!p.ok && p.error && p.sections.length >= 1);
  });

  const CR = require(path.join(ROOT, 'lib/cos-run.js'));
  const DR = require(path.join(ROOT, 'lib/cos-debug-report.js'));
  await t('T1–T3 a repo\'s own suite runs with no shell, every test runs, and each failure carries a debug report at the failing line', async () => {
    const dir = tmp('suite-');
    write(dir, 'package.json', JSON.stringify({ name: 'demo', scripts: { test: 'node --test' } }));
    write(dir, 'lib/sum.js', 'module.exports = (a, b) => a - b;\n');
    write(dir, 'test/sum.test.js', "const test=require('node:test');const assert=require('node:assert');\nconst sum=require('../lib/sum.js');\ntest('adds',()=>{\n  assert.strictEqual(sum(2,3),5);\n});\n");
    for (let i = 0; i < 45; i++) write(dir, `test/ok${i}.test.js`, "require('node:assert').ok(true)");
    const repo = { uuid: 'demo', name: 'demo' }, compartment = { id: `t-${Date.now()}` };
    const menu = CR.options(repo, dir);
    assert.ok(menu.find(o => o.id === 'test.suite').available);
    assert.strictEqual(menu.find(o => o.id === 'test.all').label, 'Run all tests (46)', 'no 40 cap');
    const s = await CR.run({ repo, repoDir: dir, compartment, option: 'test.suite' });
    assert.ok(s.ok && s.failed === 1 && /not ok|Expected/.test(s.runs[0].debug.error));
    const a = await CR.run({ repo, repoDir: dir, compartment, option: 'test.all' });
    assert.strictEqual(a.runs.length, 46); assert.strictEqual(a.failed, 1); assert.strictEqual(a.report.tests.notRun, 0);
    const f = a.runs.find(r => !r.passed).debug.frames[0];
    assert.strictEqual(f.file, 'test/sum.test.js'); assert.strictEqual(f.line, 4); assert.ok(f.excerpt.find(x => x.at).text.includes('strictEqual'));
  });
  await t('T1 a test script that needs a shell is left to the VM, and says so', () => {
    const dir = tmp('shell-');
    write(dir, 'package.json', JSON.stringify({ scripts: { test: 'jest && eslint .' } }));
    const su = CR.suiteFor({ uuid: 'x' }, dir);
    assert.ok(!su.available && /needs a shell/.test(su.reason));
  });
  await t('T3 debug report reads Python tracebacks and names a missing module', () => {
    const r = DR.report({ passed: false, exitCode: 1, stderr: 'Traceback (most recent call last):\n  File "app/x.py", line 3, in <module>\n    import requests\nModuleNotFoundError: No module named \'requests\'\n' }, { cwd: null });
    assert.ok(r.frames[0].file === 'app/x.py' && r.frames[0].line === 3 && /module does not resolve/.test(r.hint));
  });
  await t('T core says it has no process of its own instead of "no entry to boot"', () => {
    const src = read('lib/cos-run.js');
    assert.ok(/has no process of its own/.test(src) && /repo\.nexusSelf\.system === 'core' \? _nodeScripts\(ROOT\)/.test(src));
  });

  await t('C1 copilot declares what it serves, serves introspect + capability, marks calibrate not served; contract port 3750', () => {
    const reg = require(path.join(ROOT, 'copilot/registry-components.js'));
    const ids = reg.components.map(c => c.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'no duplicate ids');
    for (const id of ['copilot.activity', 'copilot.prompt.resolve', 'copilot.agent.switch', 'copilot.person_model.correct']) assert.ok(ids.includes(id), id);
    assert.strictEqual(reg.components.find(c => c.id === 'copilot.agent.calibrate').served, false);
    const srv = read('copilot/server.js');
    for (const p of ["p === '/api/introspect'", "p === '/api/introspect/retry'", "p === '/api/introspect/health'", "p === '/api/agents/capability'"]) assert.ok(srv.includes(p), p);
    assert.strictEqual(JSON.parse(read('copilot/interaction-contract.json')).ports.http, 3750);
  });

  const SN = require(path.join(ROOT, 'lib/system-nodes.js'));
  await t('X1 every system with a registry or contract gets capability, command and system nodes planned (orchestrator, diagnostic, cortex, idearium included)', () => {
    const dirs = SN.systems().map(s => s.dir);
    for (const d of ['orchestrator', 'diagnostic', 'cortex', 'idearium', 'guardian', 'copilot', 'versionium']) {
      assert.ok(dirs.includes(d), d);
      const p = SN.plan(d);
      assert.ok(p.some(n => n.type === 'system') && p.some(n => n.type === 'command'), `${d} has commands`);
      const keys = p.map(n => `${n.type}/${n.id}`); assert.strictEqual(new Set(keys).size, keys.length, `${d}: one file per node`);
    }
  });
  await t('X1 commands are marked declared / served from the system\'s own dispatch (guardian, ollama, idearium)', () => {
    const g = SN.plan('guardian').filter(n => n.type === 'command');
    assert.ok(g.some(n => n.payload.served === true) && g.every(n => typeof n.payload.declared === 'boolean'));
    assert.ok(SN.plan('idearium').filter(n => n.type === 'command').some(n => n.payload.path === '/api/repos/:uuid/phases' && n.payload.served === true));
    assert.ok(SN.plan('copilot').find(n => n.type === 'command' && n.payload.path === '/api/agents/calibrate').payload.served === false);
  });
  await t('X1 sync is idempotent and archives (never deletes) a generated node whose source is gone', () => {
    const root = tmp('nodes-');
    write(root, 'demo/registry-components.js', "module.exports = { port: 1, components: [{ id: 'demo.a', route: { method: 'GET', path: '/a' } }, { id: 'demo.b', route: { method: 'GET', path: '/b' } }] };");
    const one = SN.sync({ root, agents: false });
    assert.strictEqual(one.systems.demo.written, 5);
    assert.strictEqual(SN.sync({ root, agents: false }).systems.demo.written, 0);
    write(root, 'demo/registry-components.js', "module.exports = { port: 1, components: [{ id: 'demo.a', route: { method: 'GET', path: '/a' } }] };");
    const three = SN.sync({ root, agents: false });
    assert.strictEqual(three.systems.demo.archived, 2);
    assert.strictEqual(fs.readdirSync(path.join(root, 'demo/data/nodes/_archive/capability')).length, 1);
    write(root, 'demo/data/nodes/command/someone-elses.command', require(path.join(ROOT, 'lib/node-export.js')).toYaml(require(path.join(ROOT, 'lib/node-export.js')).wrap('command', 'someone-elses', { method: 'GET', path: '/x' }, { source: 'guardian.command-registry' })));
    SN.sync({ root, agents: false });
    assert.ok(fs.existsSync(path.join(root, 'demo/data/nodes/command/someone-elses.command')), 'a node another writer owns is left alone');
    assert.strictEqual(SN.index({ root }).systems.demo.command, 2);
  });
  await t('X2 guardian hosts hat + agent nodes (agent schema: name, intent, commands, personality) and boots its registry', () => {
    const ap = SN.agentPlan();
    for (const n of ap.nodes.filter(x => x.type === 'agent')) for (const k of ['name', 'intent', 'commands', 'personality']) assert.ok(k in n.payload, k);
    const reg = require(path.join(ROOT, 'guardian/lib/node-registry.js'));
    assert.ok(reg.GUARDIAN_NODE_TYPES.includes('hat') && reg.GUARDIAN_NODE_TYPES.includes('agent'));
    assert.ok(/require\('\.\/lib\/node-registry\.js'\)\.start\(/.test(read('guardian/server.js')));
  });
  await t('X3 the orchestrator serves GET /api/nodes, /api/nodes/:type, /api/nodes/:type/:id and POST /api/nodes/sync', () => {
    const src = read('orchestrator/orchestrator.js');
    assert.ok(/if \(top === 'api' && sub === 'nodes'\)/.test(src) && /SN\.index\(\)/.test(src) && /SN\.list\(/.test(src) && /SN\.get\(/.test(src) && /SN\.sync\(/.test(src));
  });

  _log(`\n${fail ? '✗' : '✓'} one-idearium-phases-nodes: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
