'use strict';
// 0.60.538 — a step whose system does not answer waits for it, instead of spending its attempts at once.
// His run of the Idearium build, 2026-11-14: Idearium restarted mid-build; "The build landed" failed "fetch failed (after 6 attempts)" in 9.1 s,
// while Idearium took about 13 s to boot.
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
async function t(id, name, fn) { try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); } catch (e) { failed++; console.log(`  ✗ ${id} ${name}: ${e.message}`); } }
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-wait-'));
  const { AutomationEngine } = require(path.join(ROOT, 'cos/automation/engine.js')); const { Pipelines } = require(path.join(ROOT, 'cos/automation/pipeline.js'));
  await t('PW-01', 'a system that comes up 3 s later is waited for: the step passes, its note said why it waited', async () => {
    const port = await freePort(); let srv = null;
    setTimeout(() => { srv = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end('{"ok":true}'); }).listen(port, '127.0.0.1'); }, 3000);
    const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'a') });
    const notes = []; const em = P._emit.bind(P); P._emit = (type, d) => { if (d && d.note) notes.push(d.note); return em(type, d); };
    const c = P.create({ name: 'waits', tasks: [{ id: 'landed', label: 'The build landed', retries: 5, step: { type: 'api', config: { url: `http://127.0.0.1:${port}/x`, method: 'GET' } } }] });
    const t0 = Date.now(); const r = await P.run((c.pipeline || c).id, { wait: true });
    try { assert.strictEqual(r.run.tasks.landed.status, 'done', JSON.stringify(r.run.tasks.landed)); assert.ok(Date.now() - t0 >= 2500, 'it waited');
      assert.ok(notes.some(n => /did not answer; trying again in \d+ s/.test(n)), 'said: ' + notes.join(' | ')); } finally { if (srv) srv.close(); }
  });
  await t('PW-02', 'a step that answers with an error is not waited for (only a system that does not answer is)', async () => {
    const srv = http.createServer((q, r) => { r.statusCode = 500; r.end('{"ok":false}'); }); await new Promise(x => srv.listen(0, '127.0.0.1', x));
    const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'b') });
    const c = P.create({ name: 'fails', tasks: [{ id: 'x', retries: 3, step: { type: 'api', config: { url: `http://127.0.0.1:${srv.address().port}/x`, method: 'GET' } } }] });
    const t0 = Date.now(); const r = await P.run((c.pipeline || c).id, { wait: true }); srv.close();
    assert.strictEqual(r.run.tasks.x.status, 'failed'); assert.ok(Date.now() - t0 < 2000, `no waits: ${Date.now() - t0} ms`);
  });
  await t('PW-03', 'his "an event ledger per step": each step keeps every change in order (running, the wait said, done), saved with the run', async () => {
    const port = await freePort(); let srv = null;
    setTimeout(() => { srv = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end('{"ok":true}'); }).listen(port, '127.0.0.1'); }, 1500);
    const P = new Pipelines(new AutomationEngine({}), { dir: path.join(tmp, 'c') });
    const c = P.create({ name: 'ledger', tasks: [{ id: 's', retries: 3, step: { type: 'api', config: { url: `http://127.0.0.1:${port}/x`, method: 'GET' } } }] });
    const r = await P.run((c.pipeline || c).id, { wait: true }); if (srv) srv.close();
    const ev = r.run.tasks.s.events; assert.ok(Array.isArray(ev) && ev.length >= 3, JSON.stringify(ev));
    assert.strictEqual(ev[0].status, 'running'); assert.ok(ev.some(e => /trying again/.test(e.note || '')), 'the wait is in it'); assert.strictEqual(ev[ev.length - 1].status, 'done');
    assert.ok(ev.every((e, i) => i === 0 || e.at >= ev[i - 1].at), 'in order');
    const saved = P.getRun(r.run.id); assert.deepStrictEqual(saved.tasks.s.events.length, ev.length, 'saved with the run');
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
