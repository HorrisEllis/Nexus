'use strict';
// SV-01..07 (0.60.133 IM5/IM6): a system made sovereign — its data in its own store, another system reached through its route.
// James, 2026-10-17: "need to get the systems soveriegn again like we were talking about"
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
require('../../lib/test-sandbox.js').ensure();
const REPO = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const quiet = async (fn) => { const k = { log: console.log, warn: console.warn, info: console.info, error: console.error }; console.log = console.warn = console.info = console.error = () => {}; try { return await fn(); } finally { Object.assign(console, k); } };

test('SV-01 a system\'s own store: its tables come home from cortex\'s once, the rows there are kept, and it is recorded', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-root-'));
  const cdir = path.join(root, 'cortex-mem');
  const { JaaStore } = require('../../lib/jaa-store.js');
  const c = new JaaStore(cdir, {}); c.insert('t_alpha', { uuid: 'a1', v: 1 }); c.insert('t_alpha', { uuid: 'a2', v: 2 }); c.flushAll();
  const keepEnv = { s: process.env.NEXUS_TEST_SANDBOX, j: process.env.JAA_DATA_DIR };
  delete process.env.NEXUS_TEST_SANDBOX; process.env.JAA_DATA_DIR = cdir;
  try {
    delete require.cache[require.resolve('../../lib/system-store.js')];
    const SS = require('../../lib/system-store.js');
    const db = await quiet(async () => SS.openStore('alpha', { root, tables: ['t_alpha'], migrate: [{ table: 't_alpha' }] }));
    assert.strictEqual(db.dir, path.join(root, 'alpha', 'data', 'jaa'));
    assert.deepStrictEqual(db.migrations.map(m => [m.table, m.rows]), [['t_alpha', 2]]);
    assert.strictEqual(db.get('t_alpha', { uuid: 'a2' }).v, 2);
    assert.strictEqual(new JaaStore(cdir, {}).all('t_alpha', {}).length, 2, 'the rows in cortex\'s store are kept');
    delete require.cache[require.resolve('../../lib/system-store.js')];
    const again = await quiet(async () => require('../../lib/system-store.js').openStore('alpha', { root, tables: ['t_alpha'], migrate: [{ table: 't_alpha' }] }));
    assert.ok(again.migrations[0].already && again.query('t_alpha', {}).length === 2, 'brought home once, not twice');
  } finally {
    if (keepEnv.s) process.env.NEXUS_TEST_SANDBOX = keepEnv.s; if (keepEnv.j) process.env.JAA_DATA_DIR = keepEnv.j; else delete process.env.JAA_DATA_DIR;
    delete require.cache[require.resolve('../../lib/system-store.js')];
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('SV-02 in a test, a system\'s store is in the sandbox, never the real tree', () => {
  const SS = require('../../lib/system-store.js');
  assert.ok(SS.storeDir('diagnostic').startsWith(process.env.NEXUS_TEST_SANDBOX), SS.storeDir('diagnostic'));
});
test('SV-03 the healer (diagnostic/healer, 0.60.136) requires nothing in another system\'s folder (lib/ is the kernel, D1)', () => {
  const SB = require('../../lib/system-boundary.js');
  const out = SB.scan({ root: REPO }).crossings.filter(c => c.from.startsWith('diagnostic/healer/') && c.kind !== 'kernel');
  assert.deepStrictEqual(out.map(c => c.to), []);
});
test('SV-04 intelligence offers forge through its contract: the route is owned, declared in its registry, and refuses a bad ask', async () => {
  const reg = require('../../intelligence/registry-components.js');
  const rows = Array.isArray(reg) ? reg : (reg.components || []);
  assert.ok(rows.some(r => r.route && r.route.path === '/api/intelligence/rfr2/forge/patch' && r.route.method === 'POST'), 'declared');
  const { createRoutes } = require('../../intelligence/routes.js');
  const r = createRoutes({ jaaDB: { tail: () => [], query: () => [], count: () => 0, reloadTable() {} }, getField: () => null });
  assert.ok(r.owns('POST', '/api/intelligence/rfr2/forge/patch'));
  const got = [];
  await r.handle('GET', '/api/intelligence/rfr2/forge/patch', new URLSearchParams(), {}, (s, d) => got.push(s));
  await r.handle('POST', '/api/intelligence/rfr2/forge/patch', new URLSearchParams(), { instruction: 'x' }, (s, d) => got.push(s));
  assert.deepStrictEqual(got, [405, 400]);
});
test('SV-05 the healer proposes into diagnostic\'s OWN store and lists from it', async () => {
  const H = require('../../diagnostic/healer/api/index.js');
  const p = await quiet(async () => H.dispatch('propose', { text: 'sovereign probe' }));
  assert.ok(p.ok && p.proposalId, JSON.stringify(p));
  const l = await H.dispatch('list', {});
  assert.ok((l.proposals || l.rows || []).some(x => x.uuid === p.proposalId), JSON.stringify(l).slice(0, 200));
  assert.ok(fs.existsSync(require('../../lib/system-store.js').storeDir('diagnostic')));
});
test('SV-06 the healer reaches forge through the tunnel and intelligence\'s route (a stand-in intelligence on its registered port)', async () => {
  const port = require('../../lib/system-registry.js').get('intelligence').port;
  const H = require('../../diagnostic/healer/api/index.js');
  const p = await quiet(async () => H.dispatch('propose', { text: 'add a comment' }));
  let asked = null;
  const srv = http.createServer((req, res) => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => { asked = { url: req.url, body: JSON.parse(s) }; res.end(JSON.stringify({ ok: true, code: '// patched', hooksDelta: [], provider: 'stand-in', durationMs: 1 })); }); });
  const bound = await new Promise((resolve) => { srv.once('error', () => resolve(false)); srv.listen(port, '127.0.0.1', () => resolve(true)); });
  if (!bound) { console.log(`    (said, not passed silently: port ${port} is in use here, so the round trip was not run)`); return; }
  try {
    const e = await quiet(async () => H.dispatch('evaluate', { id: p.proposalId, targetFile: 'diagnostic/registry-components.js' }));
    assert.ok(asked && asked.url === '/api/intelligence/rfr2/forge/patch' && asked.body.instruction === 'add a comment' && typeof asked.body.src === 'string', JSON.stringify(asked));
    assert.ok(e.ok !== false, JSON.stringify(e).slice(0, 300));
  } finally { srv.close(); }
});
test('SV-07 an unreachable intelligence is said, never faked', async () => {
  const H = require('../../diagnostic/healer/api/index.js');
  const p = await quiet(async () => H.dispatch('propose', { text: 'x' }));
  const e = await quiet(async () => H.dispatch('evaluate', { id: p.proposalId, targetFile: 'diagnostic/registry-components.js' }));
  assert.strictEqual(e.ok, false); assert.ok(/forge/.test(e.error) && /could not be reached|answered/.test(e.error), e.error);
});
test('SV-08 the census: which systems are sovereign, and each blocker named (data / primitive / capability), on the route and the command', async () => {
  const SB = require('../../lib/system-boundary.js');
  assert.deepStrictEqual(['cortex/memory/jaa-db.js', 'lib/nexus/nexus-bus.js', 'intelligence/cfr/field.js'].map(SB.blockerOf), ['data', 'primitive', 'capability']);
  const r = SB.sovereignty({ root: REPO });
  // 0.60.241 RF2: sentinel/ moved into lib/ (the kernel), so it is no system of its own now; components stays sovereign
  assert.ok(r.sovereign.includes('components') && !r.sovereign.includes('sentinel') && !r.sovereign.includes('nexus-healer'), 'nexus-healer and sentinel are no systems of their own now');
  const one = SB.sovereignty({ root: REPO, system: 'versionium' }).systems[0];
  assert.ok(!one.sovereign && one.list && one.list.data.length === one.blockers.data, JSON.stringify(one.blockers));
  const g = await quiet(async () => { const api = await import(path.join(REPO, 'idearium/api/index.js')); return api._route('GET', '/api/system/sovereign?system=components'); });
  const d = g.json.data || g.json;
  assert.strictEqual(g.status, 200); assert.strictEqual(d.systems[0].sovereign, true);
  const { SPEC } = require('../../idearium/cli/route-commands.js');
  assert.strictEqual(SPEC.find(x => x.key === 'system.sovereign').req({ args: ['cos'], flags: {} }).path, '/api/system/sovereign?system=cos');
});

// 0.60.244 SV0 — James: "i want to get each system soveriegn and inside a cos compartment". Sovereign is his CS_D7 both ways, and a
// require written in a comment is no crossing (intelligence/alk/index.js:122 had counted as one).
test('SV-09 the census tells the truth: a commented require is no crossing; sovereign means both ways; the step on his road', () => {
  const SB = require('../../lib/system-boundary.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sv9-'));
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), t); };
  w('b/x.js', 'module.exports = 1;\n');
  w('a/index.js', "// this used to require('../b/x.js') — a comment, not a crossing\n/* require('../b/x.js') */\nmodule.exports = 0;\n");   // known limit, said: require('…') text inside a string still counts (a real require's argument is a string too)
  w('c/index.js', "module.exports = require('../b/x.js');\n");
  w('lib/k.js', "module.exports = require('../a/index.js');\n");
  w('a/registry-components.js', 'module.exports = [];\n');
  w('b/registry-components.js', 'module.exports = [];\n'); w('b/compartment.json', '{}');
  const by = Object.fromEntries(SB.sovereignty({ root }).systems.map(r => [r.system, r]));
  assert.strictEqual(by.a.out, 0, 'a\'s two mentions of b are a line comment and a block comment');
  assert.ok(!by.a.sovereign && by.a.inFrom.core === 1 && by.a.step === 'crossings', 'core loads a, so a is not sovereign yet');
  assert.ok(!by.b.sovereign && by.b.outClean && by.b.inFrom.systems === 1, 'c loads b: b loads nothing, and still is not sovereign');
  assert.ok(!by.c.sovereign && by.c.out === 1);
  w('c/index.js', 'module.exports = 2;\n');
  const b2 = SB.sovereignty({ root, system: 'b' }).systems[0];
  assert.ok(b2.sovereign && b2.step === 'ready' && b2.registry && b2.compartment, JSON.stringify(b2));
  const c2 = SB.sovereignty({ root, system: 'c' }).systems[0];
  assert.ok(c2.sovereign && c2.step === 'registry', 'c is sovereign; its next step is its registry');
});

// 0.60.250 SV1 (census only) — which system writes and reads which table of the shared store; evidence, never a decision
test('SV-10 the table census: writers and readers per table, the owner the evidence names, contested said, a constant read, a comment not', async () => {
  const SB = require('../../lib/system-boundary.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sv10-'));
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), t); };
  w('cortex/memory/jaa-db.js', 'module.exports = {};\n');
  w('a/x.js', "const { jaaDB } = require('../cortex/memory/jaa-db');\nconst T = 'a_runs';\njaaDB.insert(T, {});\njaaDB.insert('shared', {});\n// jaaDB.insert('ghost', {})\n");
  w('b/y.js', "const db = require('../cortex/memory/jaa-db.js').jaaDB;\ndb.query('a_runs');\ndb.upsert('shared', {});\n");
  w('lib/k.js', "const { jaaDB } = require('../cortex/memory/jaa-db');\njaaDB.update('core_only', {}, {});\n");
  const r = SB.tables({ root }); const by = Object.fromEntries(r.tables.map(t => [t.table, t]));
  assert.deepStrictEqual([by.a_runs.status, by.a_runs.owner, by.a_runs.readers], ['one writer', 'a', ['b']], 'a table named by a constant is read');
  assert.deepStrictEqual([by.shared.status, by.shared.owner, by.shared.writers], ['contested', null, ['a', 'b']], 'two writers: contested, no owner guessed');
  assert.deepStrictEqual([by.core_only.status, by.core_only.owner], ['only core writes', null]);
  assert.ok(!by.ghost, 'a call in a comment is not counted');
  assert.strictEqual(SB.tables({ root, system: 'b' }).tables.length, 2);
  const { SPEC } = require('../../idearium/cli/route-commands.js');
  assert.strictEqual(SPEC.find(x => x.key === 'system.tables').req({ args: ['loom'], flags: {} }).path, '/api/system/tables?system=loom');
  const g = await quiet(async () => { const api = await import(path.join(REPO, 'idearium/api/index.js')); return api._route('GET', '/api/system/tables?system=loom'); });
  const d = g.json.data || g.json;
  assert.strictEqual(g.status, 200); assert.ok(d.ok && Array.isArray(d.tables) && d.summary.tables > 0, JSON.stringify(d).slice(0, 200));
});

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
