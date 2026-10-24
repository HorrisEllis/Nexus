'use strict';
/**
 * tests/modules/test-raid-port.test.js — 0.60.240 GD1 (docs/2026-10-24-guardian-into-cos-phasemap.spec)
 * James, 2026-10-24: "focus on just decoupling so we can get every system in a cos compartment. maybe start with one at a time? like guardian?"
 *   RP-01  provided (the Cortex process): every call is RAID's own, in-process
 *   RP-02  not provided: Cortex's routes are asked, with the routes' own shapes (feedback takes provider + ok)
 *   RP-03  Cortex down: approval FAILS CLOSED with the reason; decide says it got nothing
 *   RP-04  Guardian loads no RAID: no guardian file requires cortex/core/raid, and its /build no longer names an undefined `raid`
 */
const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
const P = require(path.join(ROOT, 'lib/raid-port.js'));

let pass = 0, fail = 0;
async function test(id, name, fn) { try { await fn(); pass++; console.log(`  ✓ ${id} ${name}`); } catch (e) { fail++; console.log(`  ✗ ${id} ${name}\n    ${e.message}`); } }

(async () => {
  console.log('\ntest-raid-port — RAID reached, never loaded');

  await test('RP-01', 'provided: RAID\'s own, in-process', async () => {
    P.provide({ approveTool: (s, c, o) => ({ approved: o.action === 'chat', reason: 'x' }), decide: () => ({ ok: true, agent: 'ollama' }), outcome: (o) => ({ ok: true, recorded: !!o.agent }), listQueue: ({ n }) => [{ n }] });
    assert.strictEqual(P.via(), 'in-process');
    assert.strictEqual((await P.approveTool('g', 'c', { action: 'chat' })).approved, true);
    assert.strictEqual((await P.decide('hi')).agent, 'ollama');
    assert.strictEqual((await P.outcome({ agent: 'claude', ok: true })).recorded, true);
    assert.deepStrictEqual(await P.listQueue({ n: 7 }), [{ n: 7 }]);
    P.provide(null);
  });

  await test('RP-02', 'not provided: Cortex\'s routes, their own shapes', async () => {
    const got = [];
    const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      got.push([req.method, req.url, b ? JSON.parse(b) : null]);
      const out = req.url.startsWith('/api/raid/approve-tool') ? { ok: true, approved: false, reason: 'constitution denied' }
        : req.url.startsWith('/api/raid/decide') ? { ok: true, agent: 'claude', reason: 'healthiest' }
        : req.url.startsWith('/api/raid/queue') ? { ok: true, contracts: [{ uuid: 'q1', dispatchedJobId: 'j1' }] } : { ok: true, recorded: true };
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.CORTEX_PORT = String(srv.address().port);
    try {
      assert.strictEqual(P.via(), 'route');
      const a = await P.approveTool('guardian.build', 'emerge-compiler', { action: 'build', jaa: { big: 'handle' }, proof: 'p' });
      assert.deepStrictEqual([a.approved, a.reason], [false, 'constitution denied']);
      assert.strictEqual((await P.decide('write a test')).agent, 'claude');
      await P.outcome({ agent: 'gemini', ok: false, ms: 9, transport: 'api' });
      assert.strictEqual((await P.listQueue({ n: 500 })).find(r => r.dispatchedJobId === 'j1').uuid, 'q1');
      assert.deepStrictEqual(got[0], ['POST', '/api/raid/approve-tool', { source: 'guardian.build', command: 'emerge-compiler', opts: { action: 'build', proof: 'p' } }], 'jaa stays behind');
      assert.strictEqual(got[1][1], '/api/raid/decide?intent=write%20a%20test');
      assert.deepStrictEqual(got[2][2], { provider: 'gemini', ok: false, cluster: 'seam', transport: 'api', ms: 9 }, 'the feedback route\'s shape');
      assert.strictEqual(got[3][1], '/api/raid/queue?n=500');
    } finally { srv.close(); delete process.env.CORTEX_PORT; }
  });

  await test('RP-03', 'Cortex down: approval fails closed, said', async () => {
    const srv = http.createServer(); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port; await new Promise(r => srv.close(r));
    process.env.CORTEX_PORT = String(port);
    const warn = console.warn; console.warn = () => {};
    try {
      const a = await P.approveTool('x', 'y', {});
      assert.strictEqual(a.approved, false); assert.match(a.reason, /RAID unreachable: Cortex is not answering on :\d+/);
      const d = await P.decide('z'); assert.ok(!d.agent && /RAID unreachable/.test(d.error));
      assert.deepStrictEqual(await P.listQueue(), []);
    } finally { console.warn = warn; delete process.env.CORTEX_PORT; }
  });

  await test('RP-04', 'Guardian loads no RAID', () => {
    const SB = require(path.join(ROOT, 'lib/system-boundary.js'));
    const raidEdges = SB.scan({ root: ROOT }).crossings.filter(c => c.fromSystem === 'guardian' && c.to.startsWith('cortex/core/raid'));
    assert.deepStrictEqual(raidEdges.map(c => c.from), []);
    const src = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
    const build = src.slice(src.indexOf("url.pathname === '/build'"), src.indexOf("url.pathname === '/build'") + 1500);
    assert.ok(!/\braid\._approveTool/.test(build) && /raid-port\.js'\)\.approveTool\('guardian\.build'/.test(build), '/build asks RAID through the port');
  });

  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
