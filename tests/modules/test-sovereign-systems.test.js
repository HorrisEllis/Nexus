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
  assert.deepStrictEqual(['cortex/memory/jaa-db.js', 'nexus/nexus-bus.js', 'intelligence/cfr/field.js'].map(SB.blockerOf), ['data', 'primitive', 'capability']);
  const r = SB.sovereignty({ root: REPO });
  assert.ok(r.sovereign.includes('sentinel') && !r.sovereign.includes('nexus-healer'), 'nexus-healer is no system of its own now');
  const one = SB.sovereignty({ root: REPO, system: 'versionium' }).systems[0];
  assert.ok(!one.sovereign && one.list && one.list.data.length === one.blockers.data, JSON.stringify(one.blockers));
  const g = await quiet(async () => { const api = await import(path.join(REPO, 'idearium/api/index.js')); return api._route('GET', '/api/system/sovereign?system=sentinel'); });
  const d = g.json.data || g.json;
  assert.strictEqual(g.status, 200); assert.strictEqual(d.systems[0].sovereign, true);
  const { SPEC } = require('../../idearium/cli/route-commands.js');
  assert.strictEqual(SPEC.find(x => x.key === 'system.sovereign').req({ args: ['cos'], flags: {} }).path, '/api/system/sovereign?system=cos');
});

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
