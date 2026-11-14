'use strict';
// 0.60.543 — a pipeline step that needs a system starts it. His run, 2026-11-14: 3 of 13 systems up, Idearium down; the Idearium build pipeline
// could only fail. Resolving nexus://<system> touches it (busy: not idled mid-step) and, when it is down, COS starts it; the step waits for it.
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
async function t(id, n, f) { try { await f(); passed++; console.log(`  ✓ ${id} ${n}`); } catch (e) { failed++; console.log(`  ✗ ${id} ${n}: ${e.message}`); } }
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const req = (port, method, p, body) => new Promise((res) => { const data = body === undefined ? null : Buffer.from(JSON.stringify(body)); const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, (x) => { let s = ''; x.on('data', c => s += c); x.on('end', () => res({ status: x.statusCode, body: JSON.parse(s || '{}') })); }); if (data) q.write(data); q.end(); });
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-start-'));
  const sp = await freePort();
  // a system that is declared but not started: a tiny server COS can start
  const script = `require('http').createServer((q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify({ok:true,at:q.url}))}).listen(${sp},'127.0.0.1')`;
  const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
  const sup = createSupervisor({ root: dir, ledgerFile: path.join(dir, 'ledger.jsonl'), log: () => {}, declarations: [{ name: 'sleeper', system: 'sleeper', cmd: process.execPath, args: ['-e', script], healthUrl: `http://127.0.0.1:${sp}/health` }] });
  const mgr = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0, { root: dir }); const mp = mgr.address().port;
  await t('PS-01', 'a step on nexus://sleeper, with sleeper down: COS starts it (by pipeline) and the step passes', async () => {
    assert.ok(!sup.get('sleeper').pid, 'down before the run');
    const c = (await req(mp, 'POST', '/api/cos/automation/pipelines', { name: 'needs sleeper', by: 'person', tasks: [{ id: 'ask', retries: 5, step: { type: 'api', config: { url: 'nexus://sleeper/api/hello', method: 'GET' } } }] })).body;
    const id = (c.pipeline || c).id; assert.ok(id, JSON.stringify(c));
    const r = (await req(mp, 'POST', `/api/cos/automation/pipelines/${id}/run`, { by: 'person', wait: true })).body;
    let run = r.run; for (let k = 0; k < 60 && !(run && ['ok', 'failed'].includes(run.status)); k++) { await new Promise(x => setTimeout(x, 500)); run = (await req(mp, 'GET', `/api/cos/automation/pipeline-runs/${r.runId}`)).body.run; }
    assert.strictEqual(run.status, 'ok', JSON.stringify(run && run.tasks));
    assert.ok(sup.get('sleeper').pid, 'running now');
    const led = fs.readFileSync(path.join(dir, 'ledger.jsonl'), 'utf8'); assert.match(led, /"by":"pipeline"/, 'started by pipeline, in the ledger');
  });
  mgr.close(); sup.shutdown({ by: 'test' }); setTimeout(() => { fs.rmSync(dir, { recursive: true, force: true }); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); }, 500);
})();
