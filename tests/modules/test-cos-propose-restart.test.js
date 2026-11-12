'use strict';
// tests/modules/test-cos-propose-restart.test.js — James, 2026-11-12: "Need to be able to propose restarts."
//   PR-01 an agent proposes restarting COS itself: held, nothing restarted; no reason refused; a wrong target refused
//   PR-02 an agent cannot take it; he takes it → COS's own restart runs once, as him
//   PR-03 an agent proposes restarting a system (MG18): held, taken by him
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-propose-')); process.env.COS_MANAGER_DATA = path.join(tmp, 'data');
const req = (port, method, p, body) => new Promise((res, rej) => { const d = body === undefined ? null : Buffer.from(JSON.stringify(body)); const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: d ? { 'Content-Type': 'application/json', 'Content-Length': d.length } : {} }, (r) => { let t = ''; r.on('data', c => t += c); r.on('end', () => res({ status: r.statusCode, body: JSON.parse(t || '{}') })); }); q.on('error', rej); if (d) q.write(d); q.end(); });
(async () => {
  let p = 0, f = 0; const T = async (id, d, fn) => { try { await fn(); console.log(`  ✓ ${id} ${d}`); p++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); f++; } };
  const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
  const sup = createSupervisor({ root: tmp, ledgerFile: path.join(tmp, 'ledger.jsonl'), log: () => {}, declarations: [{ name: 'svc', system: 'svc', cmd: process.execPath, args: ['-e', 'setInterval(()=>{},1e3)'] }] });
  const restarts = [];
  const mgr = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0, { root: ROOT, noPipelineSync: true, restartCos: ({ by }) => { restarts.push(by); return { ok: true, how: 'stand-in' }; } }); const M = mgr.address().port;
  let id;
  await T('PR-01', 'an agent proposes restarting COS itself: held, nothing restarted; no reason refused; a wrong target refused', async () => {
    assert.strictEqual((await req(M, 'POST', '/api/cos/proposals', { verb: 'restart-cos', target: 'cos', by: 'agent:claude' })).status, 400);
    assert.strictEqual((await req(M, 'POST', '/api/cos/proposals', { verb: 'restart-cos', target: 'svc', why: 'new code', by: 'agent:claude' })).status, 400);
    const r = await req(M, 'POST', '/api/cos/proposals', { verb: 'restart-cos', target: 'cos', why: '0.60.489 is not live until COS restarts', by: 'agent:claude' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.proposal.status, 'held'); id = r.body.proposal.id; assert.deepStrictEqual(restarts, []);
    assert.ok((await req(M, 'GET', '/api/cos/proposals?open=1')).body.proposals.some(x => x.id === id && /0\.60\.489/.test(x.why)));
  });
  await T('PR-02', 'an agent cannot take it; he takes it → COS\'s own restart runs once, as him', async () => {
    assert.notStrictEqual((await req(M, 'POST', `/api/cos/proposals/${id}/take`, { by: 'agent:claude' })).status, 200); assert.deepStrictEqual(restarts, []);
    const t = await req(M, 'POST', `/api/cos/proposals/${id}/take`, { by: 'person' }); assert.strictEqual(t.status, 200, JSON.stringify(t.body));
    assert.deepStrictEqual(restarts, ['person']); assert.strictEqual(t.body.proposal.status, 'taken');
  });
  await T('PR-03', 'an agent proposes restarting a system (MG18): held, taken by him', async () => {
    const r = await req(M, 'POST', '/api/cos/proposals', { verb: 'restart', target: 'svc', why: 'its code changed', by: 'agent:claude' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.proposal.status, 'held');
    const t = await req(M, 'POST', `/api/cos/proposals/${r.body.proposal.id}/take`, { by: 'person' }); assert.strictEqual(t.status, 200, JSON.stringify(t.body));
  });
  mgr.close(); sup.shutdown({ by: 'test' }); console.log(`\n  ${p} passed, ${f} failed`); process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
