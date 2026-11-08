'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-deploy.test.js — OC4a, 0.60.445. Map: docs/2026-11-01-orchestration-console-phasemap.spec OC4 · Spec:
 * docs/orchestration-console.spec MOD-OC-DEPLOY, MOD-OC-DEPLOY-PAGE.
 * James, 2026-11-08: "Also the automation is to deploy agents to systems." · "can we do that? 0c4? then back to emerge."
 *   DP-01 his deploy of a task: taken in the same click, run on the target system's own route, done with its status; every step on the ledger
 *   DP-02 an agent's deploy is held; nothing runs until he takes it; an agent cannot recall
 *   DP-03 refused, said: an undeclared system (404), a task that is not a route call (400); the target down → failed with the error
 *   DP-04 an agent or a pipeline deployment is recorded, "no runner yet (OC4b)"
 *   DP-05 the routes through the manager, and the Deployments page in Clear Glass through the real cockpit: deploy, see it done
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const until = async (fn, ms = 5000) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 50)); } return null; };
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const req = (port, method, p, body) => new Promise((res) => { const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json' } }, (x) => { let t = ''; x.on('data', c => t += c); x.on('end', () => res({ status: x.statusCode, body: JSON.parse(t || '{}') })); }); q.end(body ? JSON.stringify(body) : undefined); });

(async () => {
  console.log('\n⇢  deploy to any system (OC4a)\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-deploy-'));
  const hits = [];
  const target = http.createServer((q, r) => { hits.push(`${q.method} ${q.url}`); r.setHeader('Content-Type', 'application/json'); if (q.url === '/boom') { r.statusCode = 500; return r.end('{"ok":false}'); } r.end(JSON.stringify({ ok: true, did: q.url })); });
  await new Promise(r => target.listen(0, '127.0.0.1', r)); const tp = target.address().port;
  const deadPort = await freePort();
  const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
  const sup = createSupervisor({ root: dir, ledgerFile: path.join(dir, 'ledger.jsonl'), log: () => {}, declarations: [
    { name: 'fixture', system: 'fixture', cmd: process.execPath, args: ['-e', ''], healthUrl: `http://127.0.0.1:${tp}/health` },
    { name: 'dead', system: 'dead', cmd: process.execPath, args: ['-e', ''], healthUrl: `http://127.0.0.1:${deadPort}/health` }] });
  const { createProposals } = require(path.join(ROOT, 'cos/manager/proposals.js'));
  const proposals = createProposals(sup);
  const D = require(path.join(ROOT, 'cos/manager/deploy.js')).createDeploy(sup, proposals);
  const task = (ref) => ({ kind: 'task', task: { do: { kind: 'command', ref } } });

  await test('DP-01', 'his task: taken at once, run on the target\'s route, done with its status; the ledger has every step', async () => {
    const r = D.propose({ what: task('GET /work'), system: 'fixture', by: 'person', why: 'test' });
    assert.strictEqual(r.proposal.status, 'taken'); assert.ok(['running', 'done'].includes(r.deployment.state), r.deployment.state);
    const done = await until(() => { const d = D.get(r.deployment.id); return d.state === 'done' ? d : null; });
    assert.ok(done, JSON.stringify(D.get(r.deployment.id))); assert.strictEqual(done.result.status, 200); assert.match(done.result.reply, /"did":"\/work"/);
    assert.ok(hits.includes('GET /work'), 'called on the target system');
    const kinds = sup.ledger({ system: 'fixture' }).map(e => e.kind);
    for (const k of ['proposal-held', 'proposal-taken', 'deploy', 'deploy-done']) assert.ok(kinds.includes(k), `${k} in ${kinds}`);
  });
  await test('DP-02', 'an agent\'s deploy is held; nothing runs until he takes it; an agent cannot recall', async () => {
    const before = hits.length;
    const r = D.propose({ what: task('POST /job'), system: 'fixture', by: 'agent:copilot', why: 'agent wants a job run' });
    assert.strictEqual(r.proposal.status, 'held'); assert.strictEqual(r.deployment, undefined);
    await new Promise(x => setTimeout(x, 200)); assert.strictEqual(hits.length, before, 'nothing ran');
    const t = proposals.take(r.proposal.id, { by: 'person' });
    await until(() => hits.includes('POST /job')); assert.ok(hits.includes('POST /job'));
    assert.throws(() => D.recall(t.result.id, { by: 'agent:copilot' }), /a person's or a rule's/);
  });
  await test('DP-03', 'refused, said: undeclared (404), not a route call (400); the target down → failed with the error', async () => {
    assert.throws(() => D.propose({ what: task('GET /x'), system: 'nowhere', by: 'person', why: 't' }), /nowhere/);
    assert.throws(() => D.propose({ what: task('rm -rf /'), system: 'fixture', by: 'person', why: 't' }), (e) => e.code === 400 && /route call/.test(e.message));
    const r = D.propose({ what: task('GET /work'), system: 'dead', by: 'person', why: 't' });
    const f = await until(() => { const d = D.get(r.deployment.id); return d.state === 'failed' ? d : null; });
    assert.ok(f && /ECONNREFUSED/.test(f.error), JSON.stringify(D.get(r.deployment.id)));
    const b = D.propose({ what: task('GET /boom'), system: 'fixture', by: 'person', why: 't' });
    const bf = await until(() => { const d = D.get(b.deployment.id); return d.state === 'failed' ? d : null; }); assert.strictEqual(bf.result.status, 500);
  });
  await test('DP-04', 'an agent or a pipeline deployment is recorded, "no runner yet (OC4b)"', () => {
    for (const kind of ['agent', 'pipeline']) { const r = D.propose({ what: { kind, ref: 'the_builder' }, system: 'fixture', by: 'person', why: 't' });
      assert.strictEqual(r.deployment.state, 'taken'); assert.match(r.deployment.note, /no runner yet .* \(OC4b\)/); }
  });
  const mgr = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0, { root: dir }); const mp = mgr.address().port;
  const cp = await freePort();
  const cockpit = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: cp, manager: `http://127.0.0.1:${mp}` });
  await new Promise(r => cockpit.listen(cp, '127.0.0.1', r));
  await test('DP-05', 'the routes; the Deployments page in Clear Glass through the real cockpit: deploy, see it done', async () => {
    const g = await req(mp, 'GET', '/api/cos/deployments?system=fixture'); assert.strictEqual(g.status, 200); assert.ok(g.body.deployments.length >= 4);
    const bad = await req(mp, 'POST', '/api/cos/deploy', { what: task('nope'), system: 'fixture', by: 'person' }); assert.strictEqual(bad.status, 400);
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - DP-05 page part SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return; }
    try {
      const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
      await page.goto(`http://127.0.0.1:${cp}/deployments/index.html`);
      let n = 0; for (let k = 0; k < 50 && !n; k++) { await new Promise(r => setTimeout(r, 200)); n = await page.evaluate(() => document.querySelectorAll('#dp-system option').length); }
      assert.ok(n >= 1, 'systems listed');
      await page.evaluate(() => { document.getElementById('dp-system').value = 'fixture'; document.getElementById('dp-ref').value = '/from-the-page'; document.getElementById('dp-form').requestSubmit(); });
      let done = false; for (let k = 0; k < 50 && !done; k++) { await new Promise(r => setTimeout(r, 200)); done = await page.evaluate(() => [...document.querySelectorAll('.dp-row')].some(r => /\/from-the-page/.test(r.textContent) && /done/.test(r.textContent))); }
      if (process.env.DP_SHOTS) await page.screenshot({ path: path.join(process.env.DP_SHOTS, 'cos-deployments.png'), fullPage: true });
      assert.ok(done, `the page: ${await page.evaluate(() => document.body.innerText.slice(0, 400))}`); assert.ok(hits.includes('GET /from-the-page'));
    } finally { await browser.close(); }
  });
  cockpit.close(); mgr.close(); target.close(); sup.shutdown({ by: 'test' }); fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exit(failed ? 1 : 0);
})();
