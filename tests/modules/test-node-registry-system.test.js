'use strict';
// NR-01..08 (0.60.130 P33a): any system reads, writes and manages its nodes — its own database per node index, with all the history.
// James, 2026-10-17: "each system, reads, writes, and manages its nodes. each system has a database for each index of nodes with
// all the history. listener, schemas for all the  node types, the database."
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
require('../../lib/test-sandbox.js').ensure();
const REPO = path.resolve(__dirname, '..', '..');
const NR = require('../../lib/node-registry.js');
const NX = require('../../lib/node-export.js');
let passed = 0, failed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const quiet = async (fn) => { const k = { log: console.log, warn: console.warn, info: console.info, error: console.error }; console.log = console.warn = console.info = console.error = () => {}; try { return await fn(); } finally { Object.assign(console, k); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-root-'));
const capDir = path.join(root, 'alpha', 'data', 'nodes', 'capability');
const sample = NX.importFromFile(path.join(REPO, 'cortex/data/nodes/capability', fs.readdirSync(path.join(REPO, 'cortex/data/nodes/capability')).filter(f => f.endsWith('.capability')).sort()[0]));
const write = (id, extra = {}) => NX.exportToFile('capability', id, { ...sample.payload, id, ...extra }, { system: 'alpha', context: 'test', source: 'test' }, capDir);
let reg;

test('NR-01 a system\'s nodes are indexed into ITS OWN database (<system>/data/node-index), one table per node index and one for its history', async () => {
  write('alpha.one'); write('alpha.two');
  reg = await quiet(async () => NR.createNodeRegistry({ system: 'alpha', root }));
  const r = await quiet(async () => reg.scan());
  assert.strictEqual(r.types.capability.indexed, 2);
  const st = reg.stats();
  assert.strictEqual(st.store, path.join('alpha', 'data', 'node-index'));
  assert.deepStrictEqual(st.types.capability, { files: 2, indexed: 2, history: 2 });
  assert.ok(fs.existsSync(path.join(root, 'alpha/data/node-index')));
});
test('NR-02 a rescan records nothing new: the history holds changes, not re-reads', async () => {
  const r = await quiet(async () => reg.scan());
  assert.deepStrictEqual([r.indexed, r.unchanged], [0, 2]);
  assert.strictEqual(reg.history('capability', 'alpha.one').length, 1);
});
test('NR-03 a change is a new history entry; the index holds the new content', async () => {
  write('alpha.one', { description: 'changed by the test' });
  await quiet(async () => reg.scan());
  assert.deepStrictEqual(reg.history('capability', 'alpha.one').map(h => h.action), ['added', 'changed']);
  assert.strictEqual(reg.get('capability', 'alpha.one').payload.description, 'changed by the test');
});
test('NR-04 a node removed while nothing listened: the next scan catches up, and the history says it was removed', async () => {
  fs.unlinkSync(path.join(capDir, 'alpha.two.capability'));
  const r = await quiet(async () => reg.scan());
  assert.strictEqual(r.removed, 1);
  assert.strictEqual(reg.get('capability', 'alpha.two'), null);
  assert.deepStrictEqual(reg.history('capability', 'alpha.two').map(h => h.action), ['added', 'deleted']);
});
test('NR-05 a node that fails its schema is refused and says why (and is recorded in the folder ledger)', async () => {
  NX.exportToFile('capability', 'alpha.bad', { nothing: true }, { system: 'alpha' }, capDir);
  const r = await quiet(async () => reg.scan());
  const bad = r.invalid.find(x => x.file === 'alpha.bad.capability');
  assert.ok(bad && /fails schema\.capability/.test(bad.why), JSON.stringify(r.invalid));
  assert.ok(fs.readFileSync(path.join(capDir, '_ledger.jsonl'), 'utf8').includes('"schema_invalid"'));
  fs.unlinkSync(path.join(capDir, 'alpha.bad.capability'));
});
test('NR-06 the listener: a node dropped in goes live without a rescan, and <system>.node.added is emitted', async () => {
  const events = [];
  const live = await quiet(async () => NR.createNodeRegistry({ system: 'alpha', root, bus: { emit: (e, d) => events.push([e, d.id]) } }));
  const s = await quiet(async () => live.start());
  assert.ok(s.listening >= 1);
  write('alpha.three');
  for (let i = 0; i < 40 && !live.get('capability', 'alpha.three'); i++) await wait(50);
  live.stop();
  assert.ok(live.get('capability', 'alpha.three'), 'indexed by the listener');
  assert.ok(events.some(([e, id]) => e === 'alpha.node.added' && id === 'alpha.three'), JSON.stringify(events));
});
test('NR-07 the store is the kernel\'s: lib/jaa-store.js, and guardian/jaa-store.js is the same module (moved, not copied)', () => {
  assert.strictEqual(require('../../guardian/jaa-store.js'), require('../../lib/jaa-store.js'));
  assert.ok(/moved to lib\/jaa-store\.js/.test(fs.readFileSync(path.join(REPO, 'guardian/jaa-store.js'), 'utf8')));
});
test('NR-08 the route and command: GET /api/system/nodes/:system answers per type; an unknown system is 404', async () => {
  const g = await quiet(async () => { const api = await import(path.join(REPO, 'idearium/api/index.js')); return [await api._route('GET', '/api/system/nodes/no-such-system'), await api._route('GET', '/api/system/nodes/cortex')]; });
  assert.strictEqual(g[0].status, 404);
  const d = g[1].json.data || g[1].json;
  assert.strictEqual(g[1].status, 200); assert.ok(d.types && d.types.capability && d.types.capability.files > 0, JSON.stringify(d).slice(0, 200));
  if (!d.store) assert.ok(!fs.existsSync(path.join(REPO, 'cortex/data/node-index')), 'a read creates no database');
  const { SPEC } = require('../../idearium/cli/route-commands.js');
  const row = SPEC.find(r => r.key === 'system.nodes');
  assert.strictEqual(row.req({ args: ['cortex', 'capability', 'cortex.health'], flags: {} }).path, '/api/system/nodes/cortex?type=capability&id=cortex.health');
});
test('NR-09 P33b: every system with its own process starts its own listener at boot, with its bus where it has one', () => {
  const wired = { 'orchestrator/orchestrator.js': 'orchestrator', 'cortex/boot.js': 'cortex', 'guardian/server.js': 'guardian', 'idearium/api/index.js': 'idearium',
    'architect/service.js': 'architect', 'diagnostic/nexus-diagnostic.js': 'diagnostic', 'intelligence/server.js': 'intelligence', 'ollama/server.js': 'ollama',
    'versionium/server.js': 'versionium', 'copilot/server.js': 'copilot', 'loom/server.js': 'loom', 'clear-glass/src/main/index.js': 'clear-glass' };
  for (const [f, sys] of Object.entries(wired)) assert.ok(fs.readFileSync(path.join(REPO, f), 'utf8').includes(`startForSystem('${sys}'`), `${f} starts ${sys}'s node registry`);
  assert.ok(!/require\('\.\/lib\/node-registry\.js'\)\.start\(/.test(fs.readFileSync(path.join(REPO, 'guardian/server.js'), 'utf8')), 'guardian no longer starts its old registry');
});
test('NR-10 one writer per database (N8): a system with its own process owns its database; the boot sync leaves it alone', async () => {
  assert.strictEqual(NR.ownsItsDatabase('cortex'), true);
  // every registered system has its own process since Emerge's server (:4900); a folder the registry does not list stands for one without
  assert.strictEqual(NR.ownsItsDatabase('loner'), false);
  const r2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-own-'));
  for (const sys of ['cortex', 'loner']) {
    fs.mkdirSync(path.join(r2, sys), { recursive: true });
    fs.writeFileSync(path.join(r2, sys, 'registry-components.js'), `module.exports = [{ id: '${sys}.ping', namespace: '${sys}', name: 'ping', version: '1.0.0', route: { method: 'GET', path: '/ping' } }];\n`);
  }
  const SN = require('../../lib/system-nodes.js');
  const out = await quiet(async () => SN.sync({ root: r2, agents: false }));
  assert.ok(out.systems.loner && out.systems.loner.index && !out.systems.loner.index.error, 'loner (no process) is indexed by the sync');
  assert.strictEqual(out.systems.cortex.index, undefined, 'cortex (its own process) is not: its listener is the one writer');
  assert.ok(fs.existsSync(path.join(r2, 'loner/data/node-index')) && !fs.existsSync(path.join(r2, 'cortex/data/node-index')));
  fs.rmSync(r2, { recursive: true, force: true });
});
test('NR-11 startForSystem: skipped in a test process (the real tree is not touched) and says why; forced, it starts and listens', async () => {
  const h = NR.startForSystem('alpha', { root });
  assert.ok(h.skipped && /test process/.test(h.skipped));
  const lines = [];
  const f = NR.startForSystem('alpha', { root, force: true, delayMs: 0, log: (m) => lines.push(m) });
  for (let i = 0; i < 40 && !f.started; i++) await wait(25);
  f.stop();
  assert.ok(f.started, JSON.stringify({ lines, error: f.error }));
  assert.ok(/\[alpha\] node registry: .* listening on \d+ type folder/.test(lines[0]) && /no bus/.test(lines[0]), lines[0]);
});

// RC2 2026-11-17 — James: "yes fix the boot stall too". His log: Idearium silent 92 s at boot while scan() read 14,309 node files in one
// synchronous loop. scanAsync is the same scan in time slices: the same result, and the event loop gets its turn between slices.
test('NR-13 RC2 2026-11-17: the boot scan yields (scanAsync gives scan()\'s result and the loop runs while it indexes); startForSystem uses it', async () => {
  const r4 = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-boot-'));
  const dir = path.join(r4, 'gamma', 'data', 'nodes', 'capability');
  fs.mkdirSync(dir, { recursive: true });
  const N = 800;
  await quiet(async () => { for (let i = 0; i < N; i++) NX.exportToFile('capability', `gamma.c${i}`, { ...sample.payload, id: `gamma.c${i}` }, { system: 'gamma', context: 'test', source: 'test' }, dir); });
  const a = NR.createNodeRegistry({ system: 'gamma', root: r4, fresh: true });
  let turns = 0; const tick = setInterval(() => turns++, 1);
  const ra = await quiet(async () => a.scanAsync({ sliceMs: 5 }));
  clearInterval(tick);
  assert.strictEqual(ra.indexed, N, JSON.stringify(ra.types));
  assert.ok(turns > 0, 'timers ran while the scan indexed');
  const rb = await quiet(async () => a.scan());   // the straight-through driver, over the same files: all unchanged now
  assert.strictEqual(rb.unchanged, N);
  const ra2 = await quiet(async () => a.scanAsync());
  assert.strictEqual(ra2.unchanged, N, 'the sliced scan agrees with the straight one');
  assert.ok(/await handle\.registry\.startAsync\(\)/.test(fs.readFileSync(path.join(REPO, 'lib/node-registry.js'), 'utf8')), 'startForSystem runs the yielding scan');
  a.stop(); fs.rmSync(r4, { recursive: true, force: true });
});

// RC2 2026-11-17 — the dead rows: a removed node leaves the live index for an append-only archive (nothing lost, §0.3); the dead rows
// earlier versions left in the live table are moved there by the next scan. Measured before: 3,000 live nodes replaced 8 times → 24,000 rows.
test('NR-14 RC2 2026-11-17: a removed node leaves the live index for the archive; old soft-deleted rows are moved there by the next scan; the history still says removed', async () => {
  const NI = require('../../lib/node-index.js');
  const r5 = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-dead-'));
  const dir = path.join(r5, 'eta', 'data', 'nodes', 'capability');
  fs.mkdirSync(dir, { recursive: true });
  const w = (id) => NX.exportToFile('capability', id, { ...sample.payload, id }, { system: 'eta', context: 'test', source: 'test' }, dir);
  await quiet(async () => { for (let i = 0; i < 20; i++) w(`eta.c${i}`); });
  const reg5 = NR.createNodeRegistry({ system: 'eta', root: r5, fresh: true });
  await quiet(async () => reg5.scan());
  // an old version's leftovers: soft-deleted rows sitting in the live table
  for (let i = 0; i < 5; i++) reg5.store.upsert('nodes_capability', { id: `eta.old${i}`, type: 'capability', payload: {}, _deleted: true, deletedAt: 1 }, 'id');
  for (let i = 0; i < 10; i++) fs.unlinkSync(path.join(dir, `eta.c${i}.capability`));
  const r = await quiet(async () => reg5.scanAsync());
  assert.strictEqual(r.removed, 10);
  assert.strictEqual(r.archived, 5, 'the 5 old soft-deleted rows were moved to the archive');
  const live = reg5.store.query('nodes_capability', () => true);
  assert.strictEqual(live.length, 10, `only the 10 live nodes stay in the live index (got ${live.length})`);
  assert.ok(live.every(x => !x._deleted));
  const arch = fs.readFileSync(path.join(r5, 'eta', 'data', 'node-index', 'archive', 'nodes_capability.deleted.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.strictEqual(arch.length, 15, 'the 10 removed and the 5 old rows are all in the archive, none lost');
  assert.ok(arch.every(x => x._deleted && x.deletedAt));
  assert.ok(reg5.history('capability', 'eta.c0').some(h => h.action === 'deleted'), 'the ledger still records the removal');
  reg5.stop(); fs.rmSync(r5, { recursive: true, force: true });
});

test('NR-12 RC2 2026-11-15: a burst of node files folds the store once, not once per file (the event loop stays free), and every row is kept', async () => {
  const r3 = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-burst-'));
  const dir = path.join(r3, 'beta', 'data', 'nodes', 'capability');
  fs.mkdirSync(dir, { recursive: true });
  const reg3 = await quiet(async () => { const x = NR.createNodeRegistry({ system: 'beta', root: r3, fresh: true }); x.start(); return x; });
  let lag = 0, last = Date.now();
  const lv = setInterval(() => { const n = Date.now(); lag = Math.max(lag, n - last - 20); last = n; }, 20);
  const N = 600;
  await quiet(async () => {
    for (let i = 0; i < N; i++) {
      NX.exportToFile('capability', `beta.c${i}`, { ...sample.payload, id: `beta.c${i}` }, { system: 'beta', context: 'test', source: 'test' }, dir);
      if (i % 50 === 0) await wait(5);
    }
    await wait(2500);
    reg3.stop();
  });
  clearInterval(lv);
  const fresh = NR.storeFor('beta', { root: r3, fresh: true });
  assert.strictEqual(fresh.count('nodes_capability'), N, 'every node indexed and on disk');
  assert.ok(lag < 1000, `the event loop was held ${lag} ms (a fold per file holds it seconds)`);
  fs.rmSync(r3, { recursive: true, force: true });
});

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
