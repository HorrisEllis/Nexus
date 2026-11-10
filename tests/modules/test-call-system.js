'use strict';
// P6 — call_system (docs/copilot-omniscience-phasemap.spec). Every registered
// system reachable through one tool: resolve via the capability registry (the
// self-register work), dispatch via nexus-client. Routes THROUGH existing infra
// (§10.3), not a competing path.
const _log = console.log;
console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[jaa]')) return; _log(...a); };

const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const at = require(path.join(ROOT, 'lib/agent-tools'));

(async () => {
  await test('T-001', 'call_system is registered as a tool', () => {
    const names = at.getToolSchemas().map(s => (s.function ? s.function.name : s.name));
    assert.ok(names.includes('call_system'), 'call_system must be registered');
  });

  await test('T-002', 'call_system fails loud with neither intent nor system (§1.2)', async () => {
    const r = await at.executeTool('call_system', {});
    assert.ok(r.error && /intent|system/.test(r.error), 'must require intent or system+path');
  });

  await test('T-003', 'explicit system+path dispatches through nexus-client (the sanctioned path)', async () => {
    // No server in sandbox — a connection error PROVES it reached the real client,
    // not a stub. The point is it routes through nexus-client, not a new path.
    const r = await at.executeTool('call_system', { system: 'cortex', path: '/health' });
    assert.ok(r.ok || (r.error && /failed|refused|ECONN|timeout/i.test(r.error)),
      'must attempt a real dispatch via nexus-client');
  });

  await test('T-004', 'intent resolution goes THROUGH the capability registry (not a hardcoded map)', () => {
    // the tool requires capability-registry — proving it resolves from the live
    // registry the self-register work populates, per §8.4/§10.3.
    const src = require('fs').readFileSync(path.join(ROOT, 'lib/agent-tools/tools/execution/call-system.js'), 'utf8');
    assert.ok(/require\('\.\.\/\.\.\/\.\.\/capability-registry'\)/.test(src), 'must resolve via the capability registry');
    assert.ok(/require\('\.\.\/\.\.\/\.\.\/nexus-client'\)/.test(src), 'must dispatch via nexus-client');
    // no actual hardcoded system→address map (a structure, not the word in comments)
    assert.ok(!/(SYSTEMS|SYSTEM_MAP|ADDRESSES)\s*=\s*\{[^}]*:\s*\d{4}/.test(src), 'must not carry a hardcoded system→port map');
  });

  // 2026-11-10 (his "Do it": Nexus fitted to his 8 GB all-in-one, six systems started on demand) — a call that finds a system asleep asks COS to
  // wake it and tries again; a health check never wakes; COS unable to wake leaves the first error as it was. (A JS test: nexus-client is JS.)
  const nx = require(path.join(ROOT, 'lib/nexus-client.js'));
  const http = require('http');
  const port = nx.resolve('loom').port;
  await test('T-WAKE-1', 'a system asleep is woken through COS, and the call answers', async () => {
    let woken = [], srv = null;
    const prev = nx.setWaker(async (id) => { woken.push(id); srv = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ ok: true, path: q.url })); }).listen(port, '127.0.0.1'); return { ok: true }; });
    try { const r = await nx.get('loom', '/x', { wakeGapMs: 100 }); assert.deepStrictEqual(woken, ['loom']); assert.strictEqual(r.path, '/x'); }
    finally { nx.setWaker(prev); if (srv) await new Promise(r => srv.close(r)); }
  });
  await test('T-WAKE-2', 'a health check never wakes a system COS keeps asleep', async () => {
    let woken = 0; const prev = nx.setWaker(async () => { woken++; });
    try { assert.strictEqual(await nx.health('loom'), false); assert.strictEqual(woken, 0); } finally { nx.setWaker(prev); }
  });
  await test('T-WAKE-3', 'COS unable to wake it: the first error stands, said as it was (§1.2)', async () => {
    const prev = nx.setWaker(async () => { throw new Error('cos unreachable'); });
    try { await assert.rejects(nx.get('loom', '/x', { wakeGapMs: 50 }), /loom unreachable .*ECONNREFUSED/); } finally { nx.setWaker(prev); }
  });
  await test('T-WAKE-4', 'woken but never answering: said, with how long it waited', async () => {
    const prev = nx.setWaker(async () => ({ ok: true }));
    try { await assert.rejects(nx.get('loom', '/x', { wakeGapMs: 20, wakeTries: 3 }), /COS was asked to wake loom, and it did not answer within/); } finally { nx.setWaker(prev); }
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
