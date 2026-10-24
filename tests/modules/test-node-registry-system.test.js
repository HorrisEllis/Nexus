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
const sample = NX.importFromFile(path.join(REPO, 'cortex/data/nodes/capability', fs.readdirSync(path.join(REPO, 'cortex/data/nodes/capability'))[0]));
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
  assert.strictEqual(NR.ownsItsDatabase('emerge'), false);
  const r2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-own-'));
  for (const sys of ['cortex', 'emerge']) {
    fs.mkdirSync(path.join(r2, sys), { recursive: true });
    fs.writeFileSync(path.join(r2, sys, 'registry-components.js'), `module.exports = [{ id: '${sys}.ping', namespace: '${sys}', name: 'ping', version: '1.0.0', route: { method: 'GET', path: '/ping' } }];\n`);
  }
  const SN = require('../../lib/system-nodes.js');
  const out = await quiet(async () => SN.sync({ root: r2, agents: false }));
  assert.ok(out.systems.emerge.index && !out.systems.emerge.index.error, 'emerge (no process) is indexed by the sync');
  assert.strictEqual(out.systems.cortex.index, undefined, 'cortex (its own process) is not: its listener is the one writer');
  assert.ok(fs.existsSync(path.join(r2, 'lib/emerge/data/node-index')) && !fs.existsSync(path.join(r2, 'cortex/data/node-index')));
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

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
