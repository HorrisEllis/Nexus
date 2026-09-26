'use strict';
/**
 * tests/modules/admin-server-routes.test.js — New RAID/Compartments Routes
 * UUID: test-admin-server-routes-v1-0000-5000-0000-000000000001
 *
 * Covers the routes added for "command line tool for ... raid engine,
 * compartments" (James, 2026-06-19):
 *   GET /api/raid/status        — getState() exposed (only /decide existed before)
 *   GET /api/compartments       — list, with ?status= filter and ?limit=
 *   GET /api/compartments/:uuid — single compartment, 404 if missing
 *
 * Calls AdminServer#_handle(req, res) directly with mock req/res objects —
 * no real socket/port needed, since _handle() only touches the method
 * signature (method, url) and res (setHeader/writeHead/end).
 */

const assert = require('assert');
let passed = 0, failed = 0;
const _registry = [];
function test(id, desc, fn) { _registry.push({ id, desc, fn }); }

async function runAll() {
  for (const { id, desc, fn } of _registry) {
    try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
    catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
  }
  process.stdout.write(`\n  admin-server-routes.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

// ── Mock jaaDB (require.cache injection — same technique as case-library.test.js,
// needed because admin-server.js does `const { jaaDB } = require('../memory/jaa-db')`
// at module load time) ──────────────────────────────────────────────────────────
let _store = {};
function resetStore() { _store = { compartments: [], gaps: [] }; }
resetStore();

require.cache[require.resolve('../../cortex/memory/jaa-db')] = {
  id: '../memory/jaa-db', filename: '../memory/jaa-db', loaded: true,
  exports: {
    jaaDB: {
      query: (table, fn = () => true, n = 999) => (_store[table] || []).filter(fn).slice(0, n),
      insert: (t, row) => { (_store[t] = _store[t] || []).push(row); return row; },
      update: (table, uuid, patch) => {
        const row = (_store[table] || []).find(r => r.uuid === uuid);
        if (row) Object.assign(row, patch);
      },
      evict: (table, uuid) => {
        const row = (_store[table] || []).find(r => r.uuid === uuid);
        if (row) row._evicted = true;
      },
    },
    uid: () => 'u' + Math.random().toString(36).slice(2),
  },
};

const { AdminServer } = require('../../cortex/foundation/admin-server.js');

// ── Mock req/res ──────────────────────────────────────────────────────────────

function mockReq(method, url, jsonBody) {
  const listeners = {};
  const req = {
    method, url,
    on: (event, cb) => { (listeners[event] = listeners[event] || []).push(cb); return req; },
  };
  if (jsonBody !== undefined) {
    // Defer emission so _readBody's listeners are attached first.
    setImmediate(() => {
      const buf = Buffer.from(JSON.stringify(jsonBody));
      (listeners['data'] || []).forEach(cb => cb(buf));
      (listeners['end']  || []).forEach(cb => cb());
    });
  } else {
    setImmediate(() => { (listeners['end'] || []).forEach(cb => cb()); });
  }
  return req;
}

function mockRes() {
  const res = {
    _status: null, _headers: null, _body: '',
    setHeader: () => {},
    writeHead: (status, headers) => { res._status = status; res._headers = headers; },
    end: (body) => { res._body = body || ''; },
  };
  return res;
}

async function call(server, method, url, jsonBody) {
  const req = mockReq(method, url, jsonBody);
  const res = mockRes();
  await server._handle(req, res);
  let json = null;
  try { json = JSON.parse(res._body); } catch (_) {}
  return { status: res._status, body: json, raw: res._body };
}

function newServer() {
  return new AdminServer({ port: 3748 });
}

// ── §A: RAID status ────────────────────────────────────────────────────────────

test('A1', '/api/raid/status with no RAID registered → falls through to 404, not a crash', async () => {
  resetStore();
  const server = newServer();
  const r = await call(server, 'GET', '/api/raid/status');
  assert.strictEqual(r.status, 404, 'unregistered _raid should 404 cleanly, not throw');
});

test('A2', '/api/raid/status returns getState() output when RAID is registered', async () => {
  resetStore();
  const server = newServer();
  server._raid = {
    _decide: () => ({}),
    getState: () => ({ version: '6.0.0', health: { x: 'ok' }, weights: { x: 0.5 }, weightCount: 1 }),
  };
  const r = await call(server, 'GET', '/api/raid/status');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.version, '6.0.0');
  assert.strictEqual(r.body.weightCount, 1);
});

test('A3', '/api/raid/status surfaces a 500 with the error message if getState() throws', async () => {
  resetStore();
  const server = newServer();
  server._raid = { _decide: () => ({}), getState: () => { throw new Error('raid state corrupted'); } };
  const r = await call(server, 'GET', '/api/raid/status');
  assert.strictEqual(r.status, 500);
  assert(r.body.error.includes('raid state corrupted'));
});

test('A4', '/api/raid/decide (existing route) is unaffected by the new /status route', async () => {
  resetStore();
  const server = newServer();
  server._raid = {
    _decide: (intent) => ({ chosen: 'claude', reason: 'test' }),
    _health: {}, _weights: new Map(),
    getState: () => ({}),
  };
  const r = await call(server, 'GET', '/api/raid/decide?intent=hello');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.chosen, 'claude');
});

// ── §B: Compartments list ─────────────────────────────────────────────────────

test('B1', '/api/compartments with no rows → empty list, not an error', async () => {
  resetStore();
  const server = newServer();
  const r = await call(server, 'GET', '/api/compartments');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.compartments, []);
  assert.strictEqual(r.body.total, 0);
});

test('B2', '/api/compartments lists existing rows, newest first', async () => {
  resetStore();
  _store.compartments.push({ uuid: 'c1', status: 'PASS', ts: 100 });
  _store.compartments.push({ uuid: 'c2', status: 'PASS', ts: 300 });
  _store.compartments.push({ uuid: 'c3', status: 'FAILED-REWOUND', ts: 200 });
  const server = newServer();
  const r = await call(server, 'GET', '/api/compartments');
  assert.strictEqual(r.body.total, 3);
  assert.deepStrictEqual(r.body.compartments.map(c => c.uuid), ['c2', 'c3', 'c1'], 'should be sorted newest (highest ts) first');
});

test('B3', '/api/compartments?status= filters by status', async () => {
  resetStore();
  _store.compartments.push({ uuid: 'c1', status: 'PASS', ts: 100 });
  _store.compartments.push({ uuid: 'c2', status: 'FAILED-REWOUND', ts: 200 });
  const server = newServer();
  const r = await call(server, 'GET', '/api/compartments?status=PASS');
  assert.strictEqual(r.body.total, 1);
  assert.strictEqual(r.body.compartments[0].uuid, 'c1');
});

test('B4', '/api/compartments?limit= caps the result count', async () => {
  resetStore();
  for (let i = 0; i < 10; i++) _store.compartments.push({ uuid: 'c' + i, status: 'PASS', ts: i });
  const server = newServer();
  const r = await call(server, 'GET', '/api/compartments?limit=3');
  assert.strictEqual(r.body.compartments.length, 3);
});

// ── §C: Compartments single ────────────────────────────────────────────────────

test('C1', '/api/compartments/:uuid returns the matching row', async () => {
  resetStore();
  _store.compartments.push({ uuid: 'abc-123', status: 'PASS', ts: 1, result: { ok: true } });
  const server = newServer();
  const r = await call(server, 'GET', '/api/compartments/abc-123');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.compartment.uuid, 'abc-123');
});

test('C2', '/api/compartments/:uuid returns 404 for an unknown id, not a 500 or a crash', async () => {
  resetStore();
  const server = newServer();
  const r = await call(server, 'GET', '/api/compartments/does-not-exist');
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.body.ok, false);
});

// ── §D: purge (flush-redundancy wiring) ───────────────────────────────────────

test('D1', 'POST /api/purge with no dupes → ok, zero evicted', async () => {
  resetStore();
  const server = newServer();
  const r = await call(server, 'POST', '/api/purge', {});
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.gaps.rowsEvicted, 0);
});

test('D2', 'POST /api/purge actually dedupes gaps through the real flush-redundancy logic', async () => {
  resetStore();
  _store.gaps.push({ uuid: 'g1', type: 'stale_module', path: 'x', status: 'open', attempts: 1, ts: 100 });
  _store.gaps.push({ uuid: 'g2', type: 'stale_module', path: 'x', status: 'open', attempts: 2, ts: 200 });
  const server = newServer();
  const r = await call(server, 'POST', '/api/purge', { dryRun: false });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.gaps.rowsEvicted, 1);
  const canonical = _store.gaps.find(g => g.uuid === 'g1');
  assert.strictEqual(canonical.attempts, 3, 'should be the same merge logic as flush-redundancy.test.js — attempts summed');
});

test('D3', 'POST /api/purge respects dryRun:true — reports but does not evict', async () => {
  resetStore();
  _store.gaps.push({ uuid: 'g1', type: 'x', path: 'y', status: 'open', attempts: 1, ts: 100 });
  _store.gaps.push({ uuid: 'g2', type: 'x', path: 'y', status: 'open', attempts: 1, ts: 200 });
  const server = newServer();
  const r = await call(server, 'POST', '/api/purge', { dryRun: true });
  assert.strictEqual(r.body.dryRun, true);
  assert.strictEqual(r.body.gaps.rowsEvicted, 1, 'summary still reports what would be evicted');
  assert(!_store.gaps.find(g => g.uuid === 'g2')._evicted, 'dry-run must not actually evict');
});

// ── RUN ───────────────────────────────────────────────────────────────────────
runAll();

module.exports = { passed: () => passed, failed: () => failed };
