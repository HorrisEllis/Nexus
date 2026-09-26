'use strict';
// tests/modules/test-dangling-hooks-and-idearium-load.test.js — 0.39.260.
// James, live on 0.39.259:
//   "can we fix some of these dangling hooks"      — 545 dangling-hook GAP lines per boot
//   "imported my mastermind project and now idearium isn't running properly"
//                                                  — 1364-file import, idearium OFFLINE, next boot halted at phase 3
//   "should not show online at 9000, thats not useful"
//                                                  — the Idearium UI said "connected" through :9000 with :4800 dead
//
//   DH-0xx  wire-integrity: require-graph hooks are counted, contract hooks still raised, stale gaps close
//   DH-1xx  loom registry: an unchanged file is not re-parsed; stale/imported records can be pruned
//   DH-2xx  scanner: an imported user repo under idearium/repo/repos is not mapped as Nexus source
//   IM-0xx  RepoLayer.materialize parses the manifest once, not once per file
//   UI-0xx  "online" means idearium itself answered, not the orchestrator in front of it
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('vm');

const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dangling-idearium-test-'));
process.env.JAA_DATA_DIR = path.join(TMP, 'jaa');
process.env.IDEARIUM_DATA_DIR = path.join(TMP, 'idearium');
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

const hook = (id, component_id, type, direction) => ({ id, component_id, type, direction });

async function main() {
  const WI = require('../../diagnostic/wire-integrity');

  // A slice of the real graph from James's log: a test file's require-graph
  // hook, a root file's export, and three named contract hooks.
  const graph = {
    nodes: [
      hook('nexus.tests.modules.test-foo.import', 'nexus.tests.modules.test-foo', 'direct', 'in'),
      hook('nexus.lib.cos-bridge.export', 'nexus.lib.cos-bridge', 'direct', 'out'),
      hook('nexus.lib.ico.export', 'nexus.lib.ico', 'direct', 'out'),
      hook('nexus.lib.ledger.import', 'nexus.lib.ledger', 'direct', 'in'),
      hook('copilot.prompt.reply', 'copilot.prompt', 'api', 'out'),
      hook('loom.hook.declare', 'nexus.loom', 'callto', 'in'),
      hook('copilot.prompt.in', 'copilot.prompt', 'api', 'in'),
      hook('guardian.job.dispatch.complete', 'guardian.job.dispatch', 'api', 'out'),
      hook('ollama.jobs.receive', 'ollama.jobs', 'callto', 'in'),
    ],
    edges: [
      { from: 'nexus.lib.ico.export', to: 'nexus.lib.ledger.import' },
      { from: 'guardian.job.dispatch.complete', to: 'ollama.jobs.receive' },
    ],
  };

  await test('DH-001', 'require-graph .import/.export hooks without a wire are counted, never raised', () => {
    const cls = WI.classify(graph);
    const ids = cls.dangling.map(n => n.id);
    assert.ok(!ids.includes('nexus.tests.modules.test-foo.import'), 'a test file requiring things is not a dangling contract');
    assert.ok(!ids.includes('nexus.lib.cos-bridge.export'), 'a root file nothing requires is not a dangling contract');
    assert.strictEqual(cls.derivedUnwired, 2);
  });

  await test('DH-002', 'named contract hooks keep the original rules (out with no listener, in with no caller)', () => {
    const ids = WI.classify(graph).dangling.map(n => n.id).sort();
    assert.deepStrictEqual(ids, ['copilot.prompt.reply', 'loom.hook.declare']);
    assert.ok(!ids.includes('copilot.prompt.in'), 'an api in-hook is an external entry point (unchanged §CORRECTED 2026-07-11 rule)');
  });

  await test('DH-003', 'a wired hook is not dangling in either direction', () => {
    const ids = WI.classify(graph).dangling.map(n => n.id);
    for (const id of ['nexus.lib.ico.export', 'nexus.lib.ledger.import', 'guardian.job.dispatch.complete', 'ollama.jobs.receive']) {
      assert.ok(!ids.includes(id), id);
    }
  });

  await test('DH-004', 'closeReason: a persisted gap closes when its hook is gone, derived, or wired — and stays when still dangling', () => {
    const cls = WI.classify(graph);
    assert.strictEqual(WI.closeReason('nexus.idearium.repo.repos.nexus-id-repo-86be3284.mm9.tests.run-userscript.test.import', cls), 'hook no longer in the loom registry');
    assert.match(WI.closeReason('nexus.tests.modules.test-foo.import', cls), /require-graph/);
    assert.strictEqual(WI.closeReason('guardian.job.dispatch.complete', cls), 'hook is now wired');
    assert.strictEqual(WI.closeReason('copilot.prompt.reply', cls), null);
  });

  await test('DH-005', 'isDerivedHook matches only <component_id>.import|.export of type direct', () => {
    assert.ok(WI.isDerivedHook(hook('a.b.import', 'a.b', 'direct', 'in')));
    assert.ok(!WI.isDerivedHook(hook('a.b.import', 'a.b', 'api', 'in')));
    assert.ok(!WI.isDerivedHook(hook('a.b.export', 'a.c', 'direct', 'out')), 'component id must match');
    assert.ok(!WI.isDerivedHook(hook('a.b.reply', 'a.b', 'direct', 'out')));
  });

  await test('DH-006', 'gap-field.resolve closes an open dangling-hook gap, and it is not re-hydrated', () => {
    const gapField = require('../../lib/gap-field');
    const r = gapField.report({ type: 'dangling-hook', body: 'x', source: 'nexus.tests.modules.test-foo', meta: { hookId: 'nexus.tests.modules.test-foo.import', direction: 'in' } });
    assert.ok(r.created);
    const openBefore = gapField.openGaps({ domain: 'system', limit: 10000 }).filter(g => g.meta && g.meta.hookId === 'nexus.tests.modules.test-foo.import');
    assert.strictEqual(openBefore.length, 1);
    assert.strictEqual(gapField.resolve(r.gap.uuid, 'require-graph hook'), true);
    const openAfter = gapField.openGaps({ domain: 'system', limit: 10000 }).filter(g => g.meta && g.meta.hookId === 'nexus.tests.modules.test-foo.import');
    assert.strictEqual(openAfter.length, 0, 'the diagnostic hydrates openGaps() at boot — a resolved row must not come back');
    assert.strictEqual(gapField.resolve(r.gap.uuid, 'again'), false, 'resolving twice is a no-op');
  });

  await test('DH-007', 'the diagnostic uses the classifier and closes gaps (wired, not just present)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'diagnostic/nexus-diagnostic.js'), 'utf8');
    assert.match(src, /WireIntegrity\.classify\(graph\)/);
    assert.match(src, /WireIntegrity\.closeReason\(g\.hookId, cls\)/);
    assert.match(src, /gapField\.resolve\(u, why\)/);
  });

  // ── DH-1xx loom registry ────────────────────────────────────────────────
  const { LoomRegistry } = require('../../loom/schema/registry');
  const regDir = path.join(TMP, 'loom');

  await test('DH-101', 'has() does not re-parse registry.json when the file is unchanged', () => {
    const reg = new LoomRegistry({ dataDir: regDir });
    reg.add('component', { id: 'c1', uuid: 'u1' });
    const origParse = JSON.parse;
    let parses = 0;
    JSON.parse = function (...a) { parses++; return origParse.apply(this, a); };
    try { for (let i = 0; i < 200; i++) reg.has('component', 'c1'); }
    finally { JSON.parse = origParse; }
    assert.strictEqual(parses, 0, `${parses} parses for 200 reads of an unchanged file`);
  });

  await test('DH-102', 'a write by another instance (another process) is still seen on the next read', () => {
    const a = new LoomRegistry({ dataDir: regDir });
    const b = new LoomRegistry({ dataDir: regDir });
    assert.ok(!a.has('component', 'c2'));
    b.add('component', { id: 'c2', uuid: 'u2', padding: 'x'.repeat(10) });
    assert.ok(a.has('component', 'c2'), 'instance a must see instance b\'s write (§FIX 2026-07-02 kept)');
  });

  await test('DH-103', 'removeWhere prunes matching records in one persist and returns counts', () => {
    const reg = new LoomRegistry({ dataDir: regDir });
    reg.add('component', { id: 'nexus.idearium.repo.repos.r1.a', uuid: 'nexus-loom-scan-x' });
    reg.add('hook', { id: 'nexus.idearium.repo.repos.r1.a.import', component_id: 'nexus.idearium.repo.repos.r1.a', type: 'direct', direction: 'in', uuid: 'h' });
    const n = reg.removeWhere((kind, rec) =>
      (kind === 'component' && rec.id.startsWith('nexus.idearium.repo.repos.')) ||
      (kind === 'hook' && String(rec.component_id).startsWith('nexus.idearium.repo.repos.')));
    assert.strictEqual(n.component, 1);
    assert.strictEqual(n.hook, 1);
    const fresh = new LoomRegistry({ dataDir: regDir });
    assert.ok(!fresh.has('component', 'nexus.idearium.repo.repos.r1.a'), 'persisted');
    assert.ok(fresh.has('component', 'c1'), 'everything else kept');
  });

  await test('DH-104', 'bootstrap prunes only scanner-owned or excluded-path records, and orphaned wires', () => {
    const src = fs.readFileSync(path.join(ROOT, 'loom/bootstrap.js'), 'utf8');
    assert.match(src, /c\.uuid\.startsWith\('nexus-loom-scan-'\) && !live\.has\(c\.id\)/);
    assert.match(src, /kind === 'wire' && \(!hooksLeft\[rec\.from_hook_id\] \|\| !hooksLeft\[rec\.to_hook_id\]\)/);
  });

  // ── DH-2xx scanner ──────────────────────────────────────────────────────
  await test('DH-201', 'an imported repo under idearium/repo/repos/ is not scanned as Nexus source', () => {
    const sm = require('../../loom/scanners/source-map');
    assert.ok(sm.SKIP_PATHS.has('idearium/repo/repos'));
    assert.ok(sm.skippedIdPrefixes().includes('nexus.idearium.repo.repos.'));
    const dir = path.join(ROOT, 'idearium/repo/repos/__dh201_probe__/mm9/tests');
    const made = !fs.existsSync(path.join(ROOT, 'idearium/repo/repos/__dh201_probe__'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'run-userscript.test.js'), "require('./h.js');\n");
    fs.writeFileSync(path.join(dir, 'h.js'), 'module.exports = 1;\n');
    try {
      const { FILES } = sm.scanTree();
      const leaked = FILES.filter(f => f[0].startsWith('idearium/repo/repos/'));
      assert.strictEqual(leaked.length, 0, `mapped as Nexus source: ${leaked.slice(0, 3).map(f => f[0]).join(', ')}`);
      assert.ok(FILES.some(f => f[0] === 'idearium/repo/index.js'), 'the real idearium/repo code is still scanned');
    } finally {
      if (made) fs.rmSync(path.join(ROOT, 'idearium/repo/repos/__dh201_probe__'), { recursive: true, force: true });
    }
  });

  // ── IM-0xx RepoLayer.materialize ────────────────────────────────────────
  const se = await import('../../idearium/spec-engine/index.js');
  const { RepoLayer } = await import('../../idearium/repo/index.js');
  const mkFiles = (n) => Array.from({ length: n }, (_, i) => ({
    path: `mm9/d${i % 13}/f-${i}.js`,
    content: `// file ${i}\n` + 'const line = 1;\n'.repeat(60 + (i % 7) * 30),
  }));

  let repoUuid, specUuid, rl;
  await test('IM-001', 'materialize() reads the manifest once, not once per file', () => {
    const m = se.ingestFilesAsSpec({ name: 'im-001', files: mkFiles(300) });
    specUuid = m.uuid;
    let loads = 0;
    const counting = new Proxy(se, { get(t, k) { if (k === 'loadSpec') return (u) => { loads++; return t.loadSpec(u); }; return t[k]; } });
    rl = new RepoLayer({ specEngine: counting });
    const r = rl.ingest({ name: 'im-001', specUuid, source: 'spec.reconcile' });
    assert.ok(!r.error, r.error);
    repoUuid = r.repo.uuid;
    loads = 0;
    const mat = rl.materialize(repoUuid);
    assert.ok(mat.ok, mat.error);
    assert.strictEqual(mat.written, 300);
    assert.ok(loads <= 2, `${loads} full manifest parses for one 300-file materialize — the per-file readFile() round trip is back`);
  });

  await test('IM-002', 'materialized files carry the exact chunk content at their real paths', () => {
    const mat = rl.materialize(repoUuid);
    for (const i of [0, 7, 150, 299]) {
      const f = mkFiles(300)[i];
      const onDisk = fs.readFileSync(path.join(mat.dir, f.path), 'utf8');
      const viaRead = rl.readFile(repoUuid, f.path);
      assert.strictEqual(onDisk, viaRead.content, `${f.path} differs from readFile()`);
    }
  });

  await test('IM-003', 'a 1364-file spec→repo adoption (the MASTERMIND size) finishes well inside the 30 s phase-3 gate', () => {
    const m = se.ingestFilesAsSpec({ name: 'im-003', files: mkFiles(1364) });
    const layer = new RepoLayer({ specEngine: se });
    const t0 = Date.now();
    const r = layer.ingest({ name: 'im-003', specUuid: m.uuid, source: 'spec.reconcile' });
    const ms = Date.now() - t0;
    assert.ok(!r.error, r.error);
    assert.ok(ms < 10000, `adoption took ${ms} ms (0.39.259: quadratic — 11.5 s at 500 files)`);
  });

  // ── UI-0xx idearium health ──────────────────────────────────────────────
  const appSrc = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
  const fnSrc = appSrc.match(/async function _ideariumAlive\(base\) \{[\s\S]*?\n\}/);

  async function alive(status, body) {
    const ctx = { fetchTimeout: async () => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error('no json'); return body; } }) };
    vm.createContext(ctx);
    vm.runInContext(fnSrc[0] + '\nthis._ideariumAlive = _ideariumAlive;', ctx);
    return ctx._ideariumAlive('http://127.0.0.1:9000/api/idearium');
  }

  await test('UI-001', 'the orchestrator\'s 200 {ok:false, "Idearium timeout"} is NOT online (the screenshot case)', async () => {
    assert.ok(fnSrc, '_ideariumAlive not found in idearium/ui/js/app.js');
    assert.strictEqual(await alive(200, { ok: false, error: 'Idearium timeout' }), false);
    assert.strictEqual(await alive(503, { ok: false, error: 'Idearium timeout' }), false);
    assert.strictEqual(await alive(200, undefined), false, 'a non-JSON 200 (any other server) is not idearium');
  });

  await test('UI-002', 'idearium\'s own health body is online, direct or through the proxy', async () => {
    assert.strictEqual(await alive(200, { ok: true, version: '4.8.0', snr: 0.5, uptime: 12 }), true);
  });

  await test('UI-003', 'the UI re-proves health on a timer and names idearium, not "nexus · :9000"', () => {
    assert.match(appSrc, /function _startHealthWatch\(\)/);
    assert.match(appSrc, /setInterval\(async \(\) => \{[\s\S]{0,200}_ideariumAlive\(API_BASE\)/);
    assert.ok(!/`nexus · \$\{base/.test(appSrc), 'old label still present');
    assert.match(appSrc, /idearium · online/);
  });

  await test('UI-004', 'the orchestrator proxies idearium /health with idearium\'s real status (503 when down)', () => {
    const orch = fs.readFileSync(path.join(ROOT, 'orchestrator/orchestrator.js'), 'utf8');
    assert.match(orch, /action==='health'\)\s+\{ const h = await GET\('idearium','\/health'\); return json\(res, h && h\.ok === true \? 200 : 503, h\); \}/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
