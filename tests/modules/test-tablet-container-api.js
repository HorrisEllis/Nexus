'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-tablet-container-api.js — pins TABLET T2's container
 * shell (docs/nexus-tablet.spec phase T2).
 *
 * T2 gate: "one container per system: API map, DB tables, file tree, live
 * events, real test invocation. Read-only."
 *
 * Four routes on autopilot's status server, same laws as T1 (one endpoint,
 * disk-backed where possible, zero writes to NEXUS state):
 *   GET  /contract-map/:system  → proxy to that system's own /contract
 *   GET  /tables[/:name]        → JAA store, read straight off disk
 *   GET  /files/:system[/...]   → data/<system> subtree listing
 *   POST /run-tests/:system     → spawns THE REAL run-all.js with --filter
 *
 * The test-invocation route deliberately runs the real runner rather than
 * a per-container copy — the spec's own failure-mode list names "per-
 * container tests defined separately from run-all.js" as guaranteed
 * two-truths drift.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const {
  _handleContractProxy, _handleTablesRead, _handleFilesRead, _handleRunTests,
} = require('../../nexus/autopilot.js');

let server, PORT;
const REQ = (method, p) => new Promise((resolve) => {
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method }, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => { try { resolve({ code: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ code: res.statusCode, body: d }); } });
  });
  r.on('error', e => resolve({ error: e.message }));
  r.end();
});

(async () => {
  server = http.createServer((req, res) => {
    if (req.method === 'GET'  && req.url.startsWith('/contract-map/')) return _handleContractProxy(req, res);
    if (req.method === 'GET'  && req.url.startsWith('/tables'))        return _handleTablesRead(req, res);
    if (req.method === 'GET'  && req.url.startsWith('/files/'))        return _handleFilesRead(req, res);
    if (req.method === 'POST' && req.url.startsWith('/run-tests/'))    return _handleRunTests(req, res);
    res.writeHead(404); res.end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  PORT = server.address().port;

  try {
    await test('T2-001', 'GET /tables lists the real JAA store with per-table row counts', async () => {
      const r = await REQ('GET', '/tables');
      assert.strictEqual(r.code, 200);
      assert.ok(r.body.tables.length > 0, 'real store must have tables');
      const t = r.body.tables.find(x => x.name === 'components');
      assert.ok(t && t.rows > 0, 'components table must report real rows');
      assert.ok(r.body.tables.every(x => 'bytes' in x), 'every table reports size');
    });

    await test('T2-002', 'GET /tables/:name returns real rows, bounded by ?limit', async () => {
      const r = await REQ('GET', '/tables/settings?limit=3');
      assert.strictEqual(r.code, 200);
      assert.ok(r.body.returned <= 3);
      assert.ok(r.body.total >= r.body.returned);
      assert.ok(Array.isArray(r.body.rows));
    });

    await test('T2-003', 'a corrupt table reports rows:-1 rather than being hidden (§1.2) — checked by contract, not by corrupting the live store', async () => {
      const src = fs.readFileSync(path.join(ROOT, 'nexus', 'autopilot.js'), 'utf8');
      assert.ok(/rows = -1/.test(src), 'unparseable tables must surface as -1, never be silently skipped');
    });

    await test('T2-004', 'HOSTILE: table traversal and unknown tables are refused cleanly', async () => {
      assert.strictEqual((await REQ('GET', '/tables/..%2Fpasswd')).code, 400);
      assert.strictEqual((await REQ('GET', '/tables/definitely-not-real')).code, 404);
      assert.strictEqual((await REQ('GET', '/tables/a/b')).code, 400);
    });

    await test('T2-005', 'GET /files/:system walks the real data subtree', async () => {
      const top = await REQ('GET', '/files/guardian');
      assert.strictEqual(top.code, 200);
      assert.ok(top.body.dirs.includes('ledger'), 'data/guardian must list its ledger dir');
      const deep = await REQ('GET', '/files/guardian/ledger/cfr');
      assert.strictEqual(deep.code, 200);
      assert.ok(deep.body.files.some(f => f.name === 'cfr_state.json'), 'subtree walk reaches real files');
    });

    await test('T2-006', 'HOSTILE: file traversal refused; a file path (not dir) gets an honest 400, not a 500', async () => {
      assert.strictEqual((await REQ('GET', '/files/..%2F..%2Fetc')).code, 400);
      assert.strictEqual((await REQ('GET', '/files/%00')).code, 400);
      const notDir = await REQ('GET', '/files/guardian/ledger/cfr/cfr_state.json');
      assert.strictEqual(notDir.code, 400, 'listing a file must be a clear 400 explaining the route boundary');
    });

    await test('T2-007', 'contract proxy: unknown kernel 404s; an unreachable one is a clean 503 carrying the reason — never a crash or a hang', async () => {
      assert.strictEqual((await REQ('GET', '/contract-map/nosuchkernel')).code, 404);
      const down = await REQ('GET', '/contract-map/cortex');
      assert.strictEqual(down.code, 503, 'cortex is not running in the test env — that is a REPORTED fact');
      assert.strictEqual(down.body.ok, false);
      assert.ok(/unreachable/.test(down.body.error));
    });

    await test('T2-008', 'the contract proxy takes its port from the kernel\'s own healthUrl — no second topology map to drift (§5.14)', async () => {
      const src = fs.readFileSync(path.join(ROOT, 'nexus', 'autopilot.js'), 'utf8');
      const fn = src.match(/function _handleContractProxy[\s\S]*?\n\}/)[0];
      assert.ok(/new URL\(kernel\.healthUrl\)/.test(fn), 'port must derive from healthUrl');
      assert.ok(!/\b(3748|3747|7820|9000|4800)\b/.test(fn), 'no hardcoded ports in the proxy');
    });

    await test('T2-009', 'REAL test invocation: POST /run-tests/:system spawns the real run-all.js and parses its true totals', async () => {
      // §RECURSION GUARD — deliberately filters on 'flush-lock', NOT
      // 'tablet'. Once this very suite was registered in run-all.js, a
      // 'tablet' filter matched THIS FILE: the spawned runner ran this
      // test, which spawned another runner, which ran this test... The
      // standalone run passed only because the suite wasn't registered
      // yet — a false green that the full-suite run caught immediately.
      // Any suite that invokes the real runner must filter on a term
      // that cannot match itself.
      const r = await REQ('POST', '/run-tests/flush-lock');
      assert.strictEqual(r.code, 200);
      assert.strictEqual(r.body.failed, 0, `filtered suite must pass: ${r.body.tail}`);
      assert.ok(r.body.passed >= 5, `expected the real flush-lock suite, got ${r.body.passed}`);
      assert.ok(/TOTAL:/.test(r.body.tail), 'tail must carry the real runner output');
    });

    await test('T2-010', 'run-all.js --filter is REAL and selective — the container route cannot be running a parallel test definition', async () => {
      const runner = fs.readFileSync(path.join(ROOT, 'tests/modules/run-all.js'), 'utf8');
      assert.ok(/--filter=/.test(runner), 'the real runner must implement --filter');
      const src = fs.readFileSync(path.join(ROOT, 'nexus', 'autopilot.js'), 'utf8');
      const fn = src.slice(src.indexOf('function _handleRunTests'), src.indexOf('// ── §TABLET T1'));
      assert.ok(/run-all\.js/.test(fn), 'must spawn the real runner');
      assert.ok(/--filter=/.test(fn), 'must pass the filter through');
    });

    await test('T2-011', 'concurrent test runs are refused (409), not allowed to corrupt each other', async () => {
      const src = fs.readFileSync(path.join(ROOT, 'nexus', 'autopilot.js'), 'utf8');
      const fn = src.slice(src.indexOf('function _handleRunTests'), src.indexOf('// ── §TABLET T1'));
      assert.ok(/_testRunActive/.test(fn) && /409/.test(fn), 'must guard against overlapping runs');
    });

    await test('T2-014', 'ARCHITECTURAL: the route refuses to spawn a runner from inside a runner — recursion killed at the class, not per-test', async () => {
      const src = fs.readFileSync(path.join(ROOT, 'nexus', 'autopilot.js'), 'utf8');
      const fn = src.slice(src.indexOf('function _handleRunTests'), src.indexOf('// ── §TABLET T1'));
      assert.ok(/NEXUS_TEST_RUN_DEPTH/.test(fn), 'depth guard must exist');
      assert.ok(/NEXUS_TEST_RUN_DEPTH:\s*'1'/.test(fn), 'spawned runs must be stamped with depth so they cannot spawn further');
      // And prove it LIVE: this very suite runs under the full runner, but
      // the depth var is only set for runs the ROUTE spawns — so assert the
      // refusal path directly by setting it.
      const prev = process.env.NEXUS_TEST_RUN_DEPTH;
      process.env.NEXUS_TEST_RUN_DEPTH = '1';
      try {
        const r = await REQ('POST', '/run-tests/flush-lock');
        assert.strictEqual(r.code, 409, 'must refuse while marked as nested');
        assert.ok(/recursion guard/.test(r.body.error));
      } finally {
        if (prev === undefined) delete process.env.NEXUS_TEST_RUN_DEPTH; else process.env.NEXUS_TEST_RUN_DEPTH = prev;
      }
    });

    await test('T2-012', 'UI LAWS hold after the container view was added: one endpoint, no state, one write verb, real runner, honest empty/down states', async () => {
      const html = fs.readFileSync(path.join(ROOT, 'tablet/index.html'), 'utf8');
      assert.ok(!/374[89]|3750|9000|7705|7820|4800/.test(html), 'zero per-system ports — the connection law');
      assert.ok(!/(localStorage|sessionStorage)\s*[.\[]/.test(html), 'owns no persistent state (§5.12)');
      assert.strictEqual((html.match(/method:\s*'POST'/g) || []).length, 1, 'exactly one write verb: the tests POST');
      assert.ok(/\/run-tests\//.test(html) && !/run-all-tablet|tablet-tests\.js/.test(html), 'invokes the real runner, never a copy');
      assert.ok(/corrupt/.test(html), 'corrupt tables surfaced');
      assert.ok(/system down/.test(html), 'a down system is shown as a fact');
      assert.ok(/no kernels spawned yet/.test(html), 'empty supervision states itself plainly rather than rendering blank');
    });

    await test('T2-013', 'the inline UI script actually parses — a broken page is not a passing feature', async () => {
      const html = fs.readFileSync(path.join(ROOT, 'tablet/index.html'), 'utf8');
      const js = html.match(/<script>([\s\S]*)<\/script>/);
      assert.ok(js, 'inline script must be present');
      new Function(js[1]); // throws on syntax error
    });
  } finally {
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
