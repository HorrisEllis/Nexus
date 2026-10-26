'use strict';
/**
 * tests/modules/test-spec-compiler-port.test.js — 0.60.239 EW2/EW3 (docs/2026-10-24-emerge-warp-system-phasemap.spec)
 * James, 2026-10-24: "okay warp and emerge. / spec compiler, ide, and idearium"
 *   SCP-01  provided (the Idearium process): compile / pipeline / t2 are called in-process, with their arguments
 *   SCP-02  not provided: the route is asked (POST /api/compiler/<kind>), and a t2 run's progress is replayed to onProgress in order
 *   SCP-03  Idearium not reachable: said (ok false, why names Idearium and the port), never a silent fallback
 *   SCP-04  the move: the compiler is idearium/spec-compiler; nothing outside Idearium requires it, and emerge/compiler is gone
 */
const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
const P = require(path.join(ROOT, 'lib/spec-compiler-port.js'));

let pass = 0, fail = 0;
async function test(id, name, fn) { try { await fn(); pass++; console.log(`  ✓ ${id} ${name}`); } catch (e) { fail++; console.log(`  ✗ ${id} ${name}\n    ${e.message}`); } }

(async () => {
  console.log('\ntest-spec-compiler-port — the kernel\'s one door to Idearium\'s spec compiler');

  await test('SCP-01', 'provided: called in-process', async () => {
    const seen = [];
    P.provide({ compile: async (...a) => (seen.push(['compile', ...a.slice(0, 2)]), { ok: true, k: 'c' }), pipeline: async (...a) => (seen.push(['pipeline', ...a.slice(0, 2)]), { ok: true, k: 'p' }), t2: async (s, o, opts) => { opts.onProgress(null, 'compiled', '0'); return { ok: true, k: 't' }; } });
    assert.strictEqual(P.via(), 'in-process');
    assert.strictEqual((await P.compile('a.spec', '/tmp/o')).k, 'c');
    assert.strictEqual((await P.pipeline('b.spec', '/tmp/p')).k, 'p');
    const prog = []; assert.strictEqual((await P.t2('c.spec', '/tmp/q', { onProgress: (n, s) => prog.push(s) })).k, 't');
    assert.deepStrictEqual(seen, [['compile', 'a.spec', '/tmp/o'], ['pipeline', 'b.spec', '/tmp/p']]); assert.deepStrictEqual(prog, ['compiled']);
    P.provide(null);
  });

  await test('SCP-02', 'not provided: the route is asked; t2 progress replayed in order', async () => {
    const got = [];
    const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      got.push([req.method, req.url, JSON.parse(b)]);
      const out = req.url.endsWith('/t2') ? { ok: true, result: { ok: true, stage: 'done' }, progress: [{ node: { name: 'A' }, status: 'dispatched' }, { node: null, status: 'compiled', detail: '1 T2 nodes' }] } : { ok: true, emitted: 2 };
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.IDEARIUM_PORT = String(srv.address().port);
    try {
      assert.strictEqual(P.via(), 'route');
      assert.strictEqual((await P.compile('x.spec', 'out', { tier: 1, onProgress: () => {} })).emitted, 2);
      const prog = []; const r = await P.t2('y.spec', 'out2', { provider: 'ollama', onProgress: (n, s, d) => prog.push([n && n.name, s, d]) });
      assert.deepStrictEqual(r, { ok: true, stage: 'done' });
      assert.deepStrictEqual(prog, [['A', 'dispatched', null], [null, 'compiled', '1 T2 nodes']]);
      assert.deepStrictEqual(got.map(g => g[1]), ['/api/compiler/compile', '/api/compiler/t2']);
      assert.deepStrictEqual(got[0][2], { specPath: 'x.spec', outputDir: 'out', opts: { tier: 1 } }, 'onProgress is not sent');
    } finally { srv.close(); delete process.env.IDEARIUM_PORT; }
  });

  await test('SCP-03', 'Idearium not reachable: said, not hidden', async () => {
    const srv = http.createServer(); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port; await new Promise(r => srv.close(r));
    process.env.IDEARIUM_PORT = String(port);
    try { const r = await P.pipeline('z.spec', 'o'); assert.strictEqual(r.ok, false); assert.match(r.error, /Idearium is not reachable on :\d+/); }
    finally { delete process.env.IDEARIUM_PORT; }
  });

  await test('SCP-04', 'the compiler is Idearium\'s; nothing outside Idearium requires it', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'idearium/spec-compiler/compiler/t2-gate.js')) && !fs.existsSync(path.join(ROOT, 'emerge/compiler')));
    const SB = require(path.join(ROOT, 'lib/system-boundary.js'));
    const into = SB.scan({ root: ROOT }).crossings.filter(c => c.to.startsWith('idearium/spec-compiler/') || c.to.startsWith('emerge/compiler/'));
    assert.deepStrictEqual(into.map(c => `${c.from} -> ${c.to}`), []);
  });

  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
