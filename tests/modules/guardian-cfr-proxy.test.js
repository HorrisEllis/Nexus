'use strict';
/**
 * tests/modules/guardian-cfr-proxy.test.js
 * Tests for the two routes added to guardian/server.js (2026-06-29):
 *   GET  /api/guardian/cfr/state  → proxies to cortex:3748/cfr/field
 *   POST /api/guardian/cfr/event  → proxies to cortex:3748/api/event
 *
 * These tests spin up a real http server that mimics guardian's exact
 * handler logic in isolation — no mocks, no stubs — exercising the
 * failure modes that matter operationally: cortex offline, bad body,
 * and successful passthrough. The behavior that matters is not "does
 * the route exist" but "does it fail the right way when things go wrong."
 */

const http   = require('http');
const assert = require('assert');
let passed = 0, failed = 0;

function test(desc, fn) {
  try { fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}
async function testAsync(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function bodyJ(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch(e) { reject(e); } });
    req.on('error', reject);
  });
}

function request(method, path, body, port) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port, path, method,
      headers: { 'Content-Type': 'application/json', ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
      timeout: 3000,
    };
    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch(_) { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── The exact handler logic from guardian/server.js, extracted for isolation
function makeGuardianHandler(cortexPort) {
  return function handler(req, res) {
    const url = new URL(req.url, `http://127.0.0.1`);
    const method = req.method;

    if (method === 'GET' && url.pathname === '/api/guardian/cfr/state') {
      const req2 = http.request({ hostname: '127.0.0.1', port: cortexPort, path: '/cfr/field', method: 'GET', timeout: 1000 }, r => {
        let buf = ''; r.on('data', c => buf += c);
        r.on('end', () => { res.writeHead(r.statusCode || 200, { 'Content-Type': 'application/json' }); res.end(buf); });
      });
      req2.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'cortex unreachable' })); });
      req2.on('timeout', () => req2.destroy());
      req2.end();
      return;
    }

    if (method === 'POST' && url.pathname === '/api/guardian/cfr/event') {
      bodyJ(req).then(body => {
        const payload = JSON.stringify(body);
        const req2 = http.request({ hostname: '127.0.0.1', port: cortexPort, path: '/api/event', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 1000 }, r => {
          let buf = ''; r.on('data', c => buf += c);
          r.on('end', () => { res.writeHead(r.statusCode || 200, { 'Content-Type': 'application/json' }); res.end(buf); });
        });
        req2.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'cortex unreachable' })); });
        req2.on('timeout', () => req2.destroy());
        req2.write(payload); req2.end();
      }).catch(() => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'invalid JSON body' })); });
      return;
    }

    res.writeHead(404); res.end('{}');
  };
}

(async () => {
  // ── Fake cortex that responds correctly ────────────────────────────────────
  const FAKE_CORTEX_PORT = 47380;
  const GUARDIAN_PORT    = 47381;
  const DEAD_CORTEX_PORT = 47399; // nothing listens here
  const DEAD_GD_PORT     = 47383; // guardian that talks to the dead cortex

  const fakeCortex = http.createServer((req, res) => {
    if (req.url === '/cfr/field') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sigma: 0.12, coherence: 0.88, friction: 0.04, entropy: 0.08, regime: 'stable' }));
    } else if (req.url === '/api/event' && req.method === 'POST') {
      let b = ''; req.on('data', c => b += c);
      req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, id: 'evt-test-001' })); });
    } else { res.writeHead(404); res.end('{}'); }
  });

  const guardianLive = http.createServer(makeGuardianHandler(FAKE_CORTEX_PORT));
  const guardianDead = http.createServer(makeGuardianHandler(DEAD_CORTEX_PORT));

  await Promise.all([
    new Promise(r => fakeCortex.listen(FAKE_CORTEX_PORT, r)),
    new Promise(r => guardianLive.listen(GUARDIAN_PORT, r)),
    new Promise(r => guardianDead.listen(DEAD_GD_PORT, r)),
  ]);

  // ── GET /api/guardian/cfr/state ────────────────────────────────────────────
  await testAsync('GCP-01 cfr/state: proxies sigma from cortex correctly', async () => {
    const r = await request('GET', '/api/guardian/cfr/state', null, GUARDIAN_PORT);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    assert.strictEqual(typeof r.body.sigma, 'number', 'sigma must be a number');
    assert.strictEqual(r.body.regime, 'stable');
  });

  await testAsync('GCP-02 cfr/state: 502 with "cortex unreachable" when cortex is offline', async () => {
    const r = await request('GET', '/api/guardian/cfr/state', null, DEAD_GD_PORT);
    assert.strictEqual(r.status, 502);
    assert.strictEqual(r.body.ok, false);
    assert.ok(r.body.error.includes('cortex unreachable'), `expected "cortex unreachable", got "${r.body.error}"`);
  });

  // ── POST /api/guardian/cfr/event ──────────────────────────────────────────
  await testAsync('GCP-03 cfr/event: passes event to cortex and returns its response', async () => {
    const r = await request('POST', '/api/guardian/cfr/event', { type: 'ui.tile.click', source: 'test', causedBy: null }, GUARDIAN_PORT);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    assert.ok(r.body.id, 'response must carry an event id from cortex');
  });

  await testAsync('GCP-04 cfr/event: 502 when cortex is offline', async () => {
    const r = await request('POST', '/api/guardian/cfr/event', { type: 'test' }, DEAD_GD_PORT);
    assert.strictEqual(r.status, 502);
    assert.strictEqual(r.body.ok, false);
  });

  await testAsync('GCP-05 cfr/event: 400 on malformed JSON body — not a crash', async () => {
    const r = await new Promise(resolve => {
      const req = http.request({ hostname: '127.0.0.1', port: GUARDIAN_PORT, path: '/api/guardian/cfr/event', method: 'POST',
        headers: { 'Content-Type': 'application/json' }, timeout: 3000 }, res => {
        let buf = ''; res.on('data', c => buf += c);
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); } catch(_) { resolve({ status: res.statusCode }); } });
      });
      req.on('error', e => resolve({ status: 0, error: e.message }));
      req.write('{not valid json');
      req.end();
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.ok, false);
  });

  await testAsync('GCP-06 causedBy field forwarded — not stripped by the proxy', async () => {
    let receivedBody = null;
    const caughtCortex = http.createServer((req, res) => {
      let b = ''; req.on('data', c => b += c);
      req.on('end', () => { receivedBody = JSON.parse(b); res.writeHead(200); res.end(JSON.stringify({ ok: true, id: 'x' })); });
    });
    const CATCH_PORT = FAKE_CORTEX_PORT + 10;
    await new Promise(r => caughtCortex.listen(CATCH_PORT, r));
    const caughtGuardian = http.createServer(makeGuardianHandler(CATCH_PORT));
    const CATCH_GD_PORT = GUARDIAN_PORT + 10;
    await new Promise(r => caughtGuardian.listen(CATCH_GD_PORT, r));
    await request('POST', '/api/guardian/cfr/event', { type: 'ui.click', causedBy: 'evt-parent-001' }, CATCH_GD_PORT);
    assert.strictEqual(receivedBody?.causedBy, 'evt-parent-001', 'causedBy must survive the proxy hop unchanged');
    caughtCortex.close(); caughtGuardian.close();
  });

  fakeCortex.close(); guardianLive.close(); guardianDead.close();

  console.log(`\n  guardian-cfr-proxy: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
