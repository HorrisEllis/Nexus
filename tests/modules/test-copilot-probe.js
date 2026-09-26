'use strict';
/**
 * tests/modules/test-copilot-probe.js — does the probe actually catch anything?
 * UUID: nexus-test-copilot-probe-v1-0000-2026-0819-001
 *
 * §12.2 — "a test that passes trivially proves nothing. Every test must be able
 * to fail." That applies to the probe hardest of all: a diagnostic that reports
 * PASS regardless is worse than no diagnostic, because it is trusted.
 *
 * So every check below runs the real probe against a REAL http server (not a
 * mock — §1.3) deliberately built to be broken in one specific way, and asserts
 * the probe caught that specific thing.
 */
const assert = require('assert');
const http   = require('http');
const path   = require('path');

const P = require(path.join(__dirname, '../probe/copilot-probe.js'));

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

/** A real server. `behave` decides how it is broken. */
function serve(behave) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', d => { body += d; });
      req.on('end', () => behave(req, res, body));
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}
const close = h => new Promise(r => h.srv.close(r));
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

/** A co-pilot that behaves correctly on everything the probe checks. */
function healthy(req, res, body) {
  const p = req.url.split('?')[0];
  if (p === '/health') return json(res, 200, { ok: true, version: '3.5.0', status: 'ready' });
  if (p === '/contract') return json(res, 200, { routes: ['/api/prompt', '/api/sessions', '/api/axioms'] });
  if (p === '/api/prompt/tools') return json(res, 200, { tools: [{ name: 'read_file' }, { name: 'diagnose' }] });
  if (p === '/api/person-model/chain') return json(res, 200, { valid: true, length: 12 });
  if (p === '/api/person-model/review') return json(res, 200, { queue: [] });
  if (['/api/stream', '/events', '/ledger/stream', '/api/channel'].includes(p)) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' }); return res.end(': ok\n\n');
  }
  if (p.startsWith('/api/') || p === '/health') {
    if (req.method === 'POST') {
      try { const b = JSON.parse(body); if (!b.prompt) return json(res, 400, { error: 'prompt is required' }); }
      catch (_) { return json(res, 400, { error: 'malformed JSON body' }); }
      if (body.length > 100000) return json(res, 413, { error: 'body exceeds 100000 byte limit' });
      return json(res, 200, { ok: true });
    }
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'no such route' });
}

(async () => {
  console.log('\ntests/probe/copilot-probe.js — can the probe actually fail?\n');

  await test('CPP-001', 'an unreachable co-pilot is ONE loud failure, not thirty', async () => {
    const r = await P.probe({ url: 'http://127.0.0.1:1', adversarial: true });
    assert.strictEqual(r.reachable, false);
    assert.strictEqual(r.findings.length, 1, 'it must stop, not produce a wall of red that all means one thing');
    assert.strictEqual(r.findings[0].verdict, 'FAIL');
    assert.match(P.render(r), /did not answer/);
  });

  await test('CPP-002', 'a healthy co-pilot passes cleanly', async () => {
    const h = await serve(healthy);
    const r = await P.probe({ url: h.url });
    await close(h);
    assert.ok(r.reachable);
    assert.strictEqual(r.fails, 0, JSON.stringify(r.findings.filter(f => f.verdict === 'FAIL'), null, 1));
  });

  await test('CPP-003', 'a 200 /health with an empty body is CAUGHT, not counted as healthy', async () => {
    const h = await serve((req, res) => req.url === '/health' ? json(res, 200, {}) : json(res, 404, {}));
    const r = await P.probe({ url: h.url });
    await close(h);
    const f = r.findings.find(x => x.id === 'CP-001');
    assert.strictEqual(f.verdict, 'FAIL', 'liveness is not health (§12.6)');
    assert.match(f.why, /indistinguishable/);
  });

  await test('CPP-004', 'a route that 404s is reported as unserved, by name', async () => {
    const h = await serve((req, res) => {
      const p = req.url.split('?')[0];
      if (p === '/api/sessions') return json(res, 404, { error: 'gone' });
      return healthy(req, res, '');
    });
    const r = await P.probe({ url: h.url });
    await close(h);
    const f = r.findings.find(x => x.id === 'CP-002');
    assert.strictEqual(f.verdict, 'FAIL');
    assert.match(f.actual, /\/api\/sessions/, 'the failing route must be named, not just counted');
  });

  await test('CPP-005', 'a 200 catch-all is caught — otherwise every route looks served', async () => {
    const h = await serve((req, res) => req.url === '/health' ? json(res, 200, { ok: true, version: '1' }) : json(res, 200, { ok: true }));
    const r = await P.probe({ url: h.url, adversarial: true });
    await close(h);
    const f = r.findings.find(x => x.id === 'CP-A05');
    assert.strictEqual(f.verdict, 'FAIL');
    assert.match(f.why, /meaningless/);
  });

  await test('CPP-006', 'a broken hash chain is caught and called serious', async () => {
    const h = await serve((req, res) => {
      if (req.url === '/api/person-model/chain') return json(res, 200, { valid: false, brokenAt: 7 });
      return healthy(req, res, '');
    });
    const r = await P.probe({ url: h.url });
    await close(h);
    const f = r.findings.find(x => x.id === 'CP-006');
    assert.strictEqual(f.verdict, 'FAIL');
    assert.match(f.why, /append-only/);
  });

  await test('CPP-007', 'a 500 on malformed JSON is caught as a generic-error failure', async () => {
    const h = await serve((req, res, body) => {
      // A real service with no body-parse guard: the throw reaches the top and
      // the framework answers 500. Caught here so the fixture 500s instead of
      // taking the test process down with it.
      if (req.method === 'POST') {
        try { JSON.parse(body); return json(res, 200, { ok: true }); }
        catch (e) { return json(res, 500, { error: 'Internal Server Error' }); }
      }
      return healthy(req, res, body);
    });
    const r = await P.probe({ url: h.url, adversarial: true });
    await close(h);
    const f = r.findings.find(x => x.id === 'CP-A01');
    assert.strictEqual(f.verdict, 'FAIL');
  });

  await test('CPP-008', 'accepting unparseable input with a 200 is the loudest failure of all', async () => {
    const h = await serve((req, res, body) => {
      if (req.method === 'POST') return json(res, 200, { ok: true, accepted: true });
      return healthy(req, res, body);
    });
    const r = await P.probe({ url: h.url, adversarial: true });
    await close(h);
    const f = r.findings.find(x => x.id === 'CP-A01');
    assert.strictEqual(f.verdict, 'FAIL');
    assert.match(f.why, /pretended to work/);
  });

  await test('CPP-009', 'path traversal that actually leaks is caught', async () => {
    const h = await serve((req, res, body) => {
      if (req.url.includes('path=')) { res.writeHead(200); return res.end('root:x:0:0:root:/root:/bin/bash'); }
      return healthy(req, res, body);
    });
    const r = await P.probe({ url: h.url, adversarial: true });
    await close(h);
    const f = r.findings.find(x => x.id === 'CP-A03');
    assert.strictEqual(f.verdict, 'FAIL');
    assert.match(f.actual, /PASSWD/);
  });

  await test('CPP-010', 'a stream that is not an event-stream is caught', async () => {
    const h = await serve((req, res, body) => {
      if (req.url === '/api/stream') return json(res, 200, { not: 'a stream' });
      return healthy(req, res, body);
    });
    const r = await P.probe({ url: h.url });
    await close(h);
    const f = r.findings.find(x => x.id.includes('/api/stream'));
    assert.notStrictEqual(f.verdict, 'PASS');
  });

  await test('CPP-011', 'an empty tool list is caught — a co-pilot that cannot list its tools', async () => {
    const h = await serve((req, res, body) => {
      if (req.url === '/api/prompt/tools') return json(res, 200, { tools: [] });
      return healthy(req, res, body);
    });
    const r = await P.probe({ url: h.url });
    await close(h);
    const f = r.findings.find(x => x.id === 'CP-004');
    assert.strictEqual(f.verdict, 'FAIL');
  });

  await test('CPP-012', 'NO destructive route is ever called, even with --adversarial', async () => {
    const hit = [];
    const h = await serve((req, res, body) => { hit.push(req.url.split('?')[0]); return healthy(req, res, body); });
    await P.probe({ url: h.url, adversarial: true });
    await close(h);
    const destructive = P.ROUTES.DESTRUCTIVE.map(r => r[1]);
    const touched = hit.filter(p => destructive.includes(p));
    assert.deepStrictEqual(touched, [], `the probe called destructive routes: ${touched.join(', ')} — this would delete real person-model state`);
  });

  await test('CPP-013', 'NO costly route is called without --spend', async () => {
    const hit = [];
    const h = await serve((req, res, body) => { hit.push(`${req.method} ${req.url.split('?')[0]}`); return healthy(req, res, body); });
    await P.probe({ url: h.url });   // no adversarial, no spend
    await close(h);
    assert.ok(!hit.some(x => x.startsWith('POST /api/build')), 'a read-only sweep must not trigger a build');
    assert.ok(!hit.some(x => x.startsWith('POST /bridge/deliver')), 'a read-only sweep must not dispatch through Bridge');
  });

  await test('CPP-014', 'destructive routes are REPORTED as unprobed, never silently skipped', async () => {
    const h = await serve(healthy);
    const r = await P.probe({ url: h.url });
    await close(h);
    const f = r.findings.find(x => x.id === 'CP-999');
    assert.ok(f, 'an unprobed route and a forgotten route must not look the same');
    assert.match(f.actual, /person-model\/purge/);
  });

  await test('CPP-015', 'every FAIL and WARN carries expected AND actual (§12.3)', async () => {
    const h = await serve((req, res) => req.url === '/health' ? json(res, 200, {}) : json(res, 404, {}));
    const r = await P.probe({ url: h.url, adversarial: true });
    await close(h);
    for (const f of r.findings.filter(x => x.verdict === 'FAIL' || x.verdict === 'WARN')) {
      assert.ok(f.expected && String(f.expected).length > 3, `${f.id} has no expected`);
      assert.ok(f.actual != null && String(f.actual).length > 0, `${f.id} has no actual`);
    }
  });

  await test('CPP-016', 'concurrency failure under ten trivial reads is caught', async () => {
    let n = 0;
    const h = await serve((req, res, body) => {
      if (req.url === '/health' && ++n > 3) { res.destroy(); return; }
      return healthy(req, res, body);
    });
    const r = await P.probe({ url: h.url, adversarial: true });
    await close(h);
    const f = r.findings.find(x => x.id === 'CP-A06');
    assert.strictEqual(f.verdict, 'FAIL');
    assert.match(f.actual, /\/10/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed ? 1 : 0;
})();
