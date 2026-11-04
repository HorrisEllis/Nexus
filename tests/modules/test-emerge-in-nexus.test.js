'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-emerge-in-nexus.test.js — EAS3: Emerge, from its own GitHub repo, a system in Nexus that COS runs. 0.60.339.
 * James, 2026-11-01: "the github repo not the one in lib already. i want that done now. then i want to start being able to use it."
 * Map: docs/2026-10-31-emerge-as-a-system-phasemap.spec EAS3 (MOD-EAS-NEXUS-PLACE); the compartment map's CP9 (Emerge first).
 *   EN-01 emerge/ matches its lock (github.com/HorrisEllis/emerge at one commit); a one-byte edit fails, naming the file (GATE-EAS3-001)
 *   EN-02 Emerge is declared and registered: its compartment, its wall, :4900, lib/nexus-self/systems.js, the ports table
 *   EN-03 COS's supervisor starts Emerge from emerge/ behind its wall; COS reads its interaction contract through COS's door; an Emerge program checked and run through it; the
 *         wall refused nothing; the lock still holds after the run (GATE-EAS3-002)
 *   EN-04 the command rows build Emerge's calls (agents and a person get the same)
 *   EN-05 0.60.340 — imported into Idearium: repo nexus/emerge, its compartment nexus-self-emerge (the one COS runs, nested under nexus-self),
 *         the repo's tree as on GitHub (docs/learn, bench, the .eg programs, its node definitions in data/nodes), kept across a reload
 */
const assert = require('assert'), fs = require('fs'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'emerge-in-nexus-'));
process.env.NEXUS_SELF_DIR = path.join(TMP, 'self'); process.env.COS_DATA_ROOT = path.join(TMP, 'cos');   // EN-05's import stays in this test's own stores
const L = require(path.join(ROOT, 'scripts/emerge-lock.js'));
const { createSupervisor, readDeclarations } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
let passed = 0, failed = 0, skipped = 0;
async function test(id, d, fn) { try { const r = await fn(); if (r === 'skip') return; console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')}`); failed++; } }
const call = (m, p, b) => new Promise(r => { const d = b ? JSON.stringify(b) : null; const q = http.request({ host: '127.0.0.1', port: 4900, path: p, method: m, timeout: 15000, headers: d ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(d) } : {} }, s => { let t = ''; s.on('data', c => t += c); s.on('end', () => { try { r(JSON.parse(t)); } catch (_) { r({ raw: t }); } }); }); q.on('error', e => r({ err: e.message })); if (d) q.write(d); q.end(); });
const portFree = (p) => new Promise(r => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(p, '127.0.0.1', () => s.close(() => r(true))); });

(async () => {
  console.log('\n⬡  Emerge, from its own repo, a system COS runs (EAS3)\n');
  let sup = null;
  try {
    await test('EN-01', 'emerge/ matches its lock; a one-byte edit fails, naming the file', () => {
      const r = L.check(); assert.ok(r.ok, JSON.stringify(r)); assert.ok(r.files > 300, 'the whole repo, docs/ and bench/ with it'); assert.match(r.commit, /^[0-9a-f]{40}$/);
      const node = L.readNode(); assert.strictEqual(node.type, 'cos'); assert.strictEqual(node.payload.repo.url, 'https://github.com/HorrisEllis/emerge');
      assert.ok(!fs.existsSync(path.join(ROOT, 'emerge/compartment.json')) && !fs.existsSync(path.join(ROOT, 'emerge/EMERGE.lock.json')), 'no .json: the .cos node is the declaration and the lock');
      const f = path.join(ROOT, 'emerge/emerge/cli.js'), orig = fs.readFileSync(f);
      try { fs.appendFileSync(f, ' '); const bad = L.check(); assert.deepStrictEqual(bad.changed, ['emerge/cli.js']); } finally { fs.writeFileSync(f, orig); }
      assert.ok(L.check().ok);
    });
    await test('EN-02', 'declared and registered: its compartment, its wall, :4900, systems.js, the ports table', () => {
      const d = readDeclarations(ROOT).find(x => x.name === 'emerge');
      assert.ok(d && d.compartment === 'nexus-self-emerge' && d.boundary.mode === 'enforce' && /:4900\/health$/.test(d.healthUrl), JSON.stringify(d));
      assert.ok(d.args[0].endsWith(path.join('emerge', 'emerge', 'server.js')));
      const sys = require(path.join(ROOT, 'lib/nexus-self/systems.js')); const S = (sys.SYSTEMS || []).find(x => x.name === 'emerge');
      assert.ok(S && S.port === 4900 && S.entry === 'emerge/emerge/server.js', 'lib/nexus-self/systems.js names Emerge');
      assert.strictEqual(require(path.join(ROOT, 'orchestrator/orchestrator.config.json')).ports.emerge, 4900);
    });
    await test('EN-03', 'COS starts Emerge behind its wall; a program checked and run through its door; the lock holds after', async () => {
      if (!(await portFree(4900))) { console.log('  - EN-03 SKIPPED: :4900 is in use here (an Emerge is running?)'); skipped++; return 'skip'; }
      sup = createSupervisor({ root: ROOT, ledgerFile: path.join(require('os').tmpdir(), `emerge-test-${process.pid}.jsonl`), log: () => {}, declarations: [readDeclarations(ROOT).find(x => x.name === 'emerge')] });
      sup.start('emerge', { by: 'test' });
      let h = null; for (let i = 0; i < 60 && !(h && h.ok); i++) { h = await call('GET', '/health'); if (!(h && h.ok)) await new Promise(r => setTimeout(r, 300)); }
      assert.ok(h && h.ok && h.system === 'emerge', JSON.stringify(h));
      const src = fs.readFileSync(path.join(ROOT, 'emerge/emerge/lang/examples/hello.eg'), 'utf8');
      const chk = await call('POST', '/lang/check', { source: src }); assert.ok(chk.ok, JSON.stringify(chk));
      const run = await call('POST', '/lang/run', { source: src }); assert.ok(run.ok && /hello from Emerge, 6 letters/.test(run.stdout) && /fizzbuzz/.test(run.stdout), JSON.stringify(run).slice(0, 300));
      const led = sup.ledger({ system: 'emerge' });
      assert.ok(led.some(e => e.kind === 'spawn' && /in compartment nexus-self-emerge, behind its wall/.test(e.why)));
      assert.deepStrictEqual(led.filter(e => e.kind === 'wall').map(e => e.why), [], 'the wall refused something');
      assert.ok(L.check().ok, 'running Emerge changed a locked file');
      // COS reaches Emerge through its interaction contract: COS's door asks Emerge's /contract (MG_D19: a compartment's controls come from it)
      const srv = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0);
      try {
        const cm = await new Promise(r => http.get({ host: '127.0.0.1', port: srv.address().port, path: '/contract-map/emerge' }, s => { let t = ''; s.on('data', c => t += c); s.on('end', () => r(JSON.parse(t))); }));
        assert.strictEqual(cm.id, 'emerge'); const routes = (cm.resources || []).map(x => `${x.method} ${x.path}`);
        for (const r of ['POST /lang/run', 'POST /lang/check', 'GET /status', 'POST /handoffs']) assert.ok(routes.includes(r), `${r} in Emerge's contract as COS reads it`);
      } finally { srv.close(); }
    });
    await test('EN-04', 'the command rows build Emerge\'s calls', () => {
      const RC = require(path.join(ROOT, 'idearium/cli/route-commands.js')); const rows = (RC.SPEC || RC.ROWS || []);
      const row = (k) => rows.find(r => r.key === k); assert.ok(row('emerge.status') && row('emerge.lang') && row('emerge.modules'));
      const run = row('emerge.lang').req({ args: ['run', path.join(ROOT, 'emerge/emerge/lang/examples/hello.eg')], flags: {} });
      assert.strictEqual(run.path, '/api/emerge-system/lang/run'); assert.match(run.body.source, /hello from \{name\}/);
      const say = row('emerge.lang').req({ args: ['say', 'make', 'a', 'compiler'], flags: {} }); assert.deepStrictEqual(say.body, { sentence: 'make a compiler' });
    });
    await test('EN-05', 'imported into Idearium: nested repo, the same compartment COS runs, the repo\'s tree, kept across a reload', async () => {
      const { pathToFileURL } = require('url'); const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
      const se = await import(pathToFileURL(path.join(ROOT, 'idearium/spec-engine/index.js')).href);
      const { RepoLayer } = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/index.js')).href);
      const NS = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/nexus-self.js')).href);
      const rl = new RepoLayer({ specEngine: se }); const comps = NS.ensureCompartments();
      const c = comps.children.emerge; assert.ok(c && c.name === 'nexus-self-emerge' && c.parentId === comps.parent.id, JSON.stringify(comps.errors));
      assert.strictEqual(c.name, readDeclarations(ROOT).find(x => x.name === 'emerge').compartment, 'the compartment COS runs Emerge in');
      await quiet(() => NS.sync(rl, se, { only: ['emerge'], liveRoot: ROOT }));
      const repo = rl.list().find(r => r.nexusSelf && r.nexusSelf.system === 'emerge');
      assert.ok(repo && repo.name === 'nexus/emerge' && repo.compartmentId === c.id, 'one repo, one compartment');
      const paths = new Set((repo.files || []).map(f => f.path));
      for (const p of ['emerge/emerge/server.js', 'emerge/emerge/lang/examples/hello.eg', 'emerge/emerge/data/nodes/route/emerge.lang.run.route', 'emerge/docs/learn/0-the-idea.md', 'emerge/bench/chunks', 'emerge/emerge.cos'])
        assert.ok([...paths].some(x => x === p || x.startsWith(p + '/') || (p.endsWith('.md') && x.startsWith('emerge/docs/learn/'))), `${p} in the repo`);
      assert.ok(![...paths].some(x => /emerge\/emerge\/data\/(ledger|node-index)\//.test(x)), 'its run state stays its own');
      assert.ok(paths.size > 330, `${paths.size} files`);
      const again = new RepoLayer({ specEngine: se }).list().find(r => r.uuid === repo.uuid); assert.ok(again, 'kept across a reload');
    });
  } finally { if (sup) sup.shutdown({ by: 'test' }); await new Promise(r => setTimeout(r, 1200)); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
