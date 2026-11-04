'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-contract-handshake-routes.test.js — DO0, 0.60.324. Spec: docs/system-doors.spec MOD-DOOR-HANDSHAKE.
 * James, 2026-10-31: "yes do that also" (the 0-routes defect, first of the door phases). The orchestrator's handshake counted
 * contract.routes || contract.channels only; Clear Glass, Copilot, Ollama and Versionium serve their registry (components[], each with its
 * route), so each was reported with 0 routes.
 *
 *   HR-01  every shape counted: routes[], routes{}, channels, components[] (only those with a route), a bare components array
 *   HR-02  a contract in no known shape is 'unknown' with a null count, never 0
 *   HR-03  each system's real contract: the count equals what it really publishes (the four registry-served systems were 0 before)
 *   HR-04  through verifySystem over HTTP: a registry-shaped contract reports its routes and the shape it read
 */
const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '../..');
const H = require(path.join(ROOT, 'orchestrator/lib/contract-handshake.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const old = (c) => (c.routes || c.channels || []).length;   // the count before 0.60.324

(async () => {
  console.log('\n⬡  the handshake counts a contract\'s real routes (DO0)\n');

  await test('HR-01', 'every shape counted, and the shape said', () => {
    assert.deepStrictEqual(H.countRoutes({ routes: ['GET /a', 'POST /b'] }), { count: 2, shape: 'routes' });
    assert.deepStrictEqual(H.countRoutes({ routes: { a: 1, b: 2, c: 3 } }), { count: 3, shape: 'routes' });
    assert.deepStrictEqual(H.countRoutes({ channels: ['x'] }), { count: 1, shape: 'channels' });
    assert.deepStrictEqual(H.countRoutes({ components: [{ route: { method: 'GET', path: '/h' } }, { route: { path: '/x' } }, { name: 'no route' }] }), { count: 2, shape: 'components', malformed: 1 });
    assert.deepStrictEqual(H.countRoutes([{ route: { path: '/h' } }]), { count: 1, shape: 'components', malformed: 0 });
  });

  await test('HR-02', 'no known shape: unknown, null — never 0', () => {
    assert.deepStrictEqual(H.countRoutes({ id: 'x', version: '1' }), { count: null, shape: 'unknown' });
    assert.deepStrictEqual(H.countRoutes(null), { count: null, shape: 'unknown' });
  });

  await test('HR-03', 'each system\'s real contract: the count is what it publishes', () => {
    const rows = [];
    // what /contract serves: interaction-contract.json for most; the registry object for these four (their own /contract handlers)
    for (const s of ['clear-glass', 'copilot', 'ollama', 'versionium']) {
      const c = require(path.join(ROOT, s, 'registry-components.js'));
      const want = c.components.filter(x => x && x.route && x.route.path).length;
      const got = H.countRoutes(c);
      rows.push(`${s} ${old(c)}→${got.count}`);
      assert.ok(want > 0, `${s} publishes routes`);
      assert.strictEqual(old(c), 0, `${s} was 0 before (the defect)`);
      assert.deepStrictEqual([got.count, got.shape], [want, 'components'], s);
    }
    for (const f of fs.readdirSync(ROOT).filter(d => fs.existsSync(path.join(ROOT, d, 'interaction-contract.json')))) {
      const c = JSON.parse(fs.readFileSync(path.join(ROOT, f, 'interaction-contract.json'), 'utf8'));
      const got = H.countRoutes(c);
      assert.strictEqual(got.count, old(c), `${f}: a routes[] contract counts as before`);
      assert.ok(got.count > 0 && got.shape === 'routes', f);
    }
    console.log(`      ${rows.join(' · ')}`);
  });

  await test('HR-04', 'verifySystem over HTTP: a registry-shaped contract reports its routes and shape', async () => {
    const reg = require(path.join(ROOT, 'versionium/registry-components.js'));
    const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(reg)); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    try {
      const e = await H.verifySystem('versionium', '127.0.0.1', srv.address().port, { jaaInsert: null });
      assert.strictEqual(e.trust, H.TRUST.VERIFIED, JSON.stringify(e));
      assert.deepStrictEqual([e.routeCount, e.routeShape], [reg.components.length, 'components']);
    } finally { srv.close(); }
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
