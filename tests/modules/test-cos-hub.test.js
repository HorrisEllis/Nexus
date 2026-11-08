'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-hub.test.js — OC8a, 0.60.446. Map: docs/2026-11-01-orchestration-console-phasemap.spec OC8 (OC8a), AE_D4 · Spec:
 * docs/orchestration-console.spec MOD-OC-HUB, MOD-OC-HUB-PAGE.
 * James, 2026-11-08: "queues, contracts, dag, it should all be there, waiting to be wired in." · "yes, pick the structural solution."
 *   HB-01 a slot is wired only when its owner answered just now (stand-in Cortex, Idearium, Clear Glass on their own addresses)
 *   HB-02 an owner down is said (down, with the reason); a route the owner refuses is said (refused, with the status); never wired
 *   HB-03 the slots with no route yet are waiting and name the phase that wires them; COS's own slots answer in process
 *   HB-04 GET /api/cos/hub through the manager; the Hub page in Clear Glass through the real cockpit shows each slot and its state
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const req = (port, method, p) => new Promise((res) => { const q = http.request({ host: '127.0.0.1', port, path: p, method }, (x) => { let t = ''; x.on('data', c => t += c); x.on('end', () => res({ status: x.statusCode, body: JSON.parse(t || '{}') })); }); q.end(); });
const stand = async (answers) => { const hits = []; const s = http.createServer((q, r) => { hits.push(`${q.method} ${q.url}`); const code = answers[q.url.split('?')[0]] || 404; r.statusCode = code; r.end('{}'); });
  await new Promise(r => s.listen(0, '127.0.0.1', r)); return { s, hits, url: `http://127.0.0.1:${s.address().port}/health` }; };

(async () => {
  console.log('\n⇢  COS the hub (OC8a)\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-hub-'));
  const cortex = await stand({ '/api/raid/health': 200, '/api/raid/queue': 200 });
  const idearium = await stand({ '/api/automation': 200 });   // /api/phases/next not served: refused
  const dead = await freePort();
  const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
  const decl = (name, healthUrl) => ({ name, system: name, cmd: process.execPath, args: ['-e', ''], healthUrl });
  const sup = createSupervisor({ root: dir, ledgerFile: path.join(dir, 'ledger.jsonl'), log: () => {}, declarations: [
    decl('cortex', cortex.url), decl('idearium', idearium.url), decl('clear-glass', `http://127.0.0.1:${dead}/health`)] });
  const H = require(path.join(ROOT, 'cos/manager/hub.js'));
  const hub = H.createHub(sup, { timeoutMs: 1500 });
  const r = await hub.read(); const by = Object.fromEntries(r.slots.map(s => [s.id, s]));

  await test('HB-01', 'wired only when the owner answered just now', () => {
    for (const id of ['raid', 'contracts', 'automation']) assert.strictEqual(by[id].state, 'wired', `${id}: ${JSON.stringify(by[id])}`);
    assert.ok(cortex.hits.includes('GET /api/raid/health') && cortex.hits.some(h => h.startsWith('GET /api/raid/queue')), cortex.hits.join());
    assert.ok(idearium.hits.includes('GET /api/automation'));
  });
  await test('HB-02', 'an owner down is said; a refused route is said; neither is wired', () => {
    assert.strictEqual(by.pipelines.state, 'down'); assert.match(by.pipelines.why, /clear-glass did not answer: ECONNREFUSED/);
    assert.strictEqual(by.dag.state, 'refused'); assert.match(by.dag.why, /answered 404/);
    assert.strictEqual(r.down, 2);
  });
  await test('HB-03', 'waiting slots name their phase; COS\'s own slots answer', () => {
    for (const [id, ph] of [['agents', 'OC4b'], ['dag-per-input', 'RQ14'], ['context', 'RQ7'], ['gaps', 'RQ8'], ['hypotheses', 'RQ16'], ['experiments', 'RQ15']]) {
      assert.strictEqual(by[id].state, 'waiting', id); assert.ok(by[id].why.includes(ph), by[id].why); }
    assert.strictEqual(by.tasks.state, 'wired'); assert.strictEqual(by.queues.state, 'wired');
    assert.strictEqual(r.slots.length, H.SLOTS.length); assert.strictEqual(r.wired + r.waiting + r.down, r.slots.length);
  });
  const mgr = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0, { root: dir }); const mp = mgr.address().port;
  const cp = await freePort();
  const cockpit = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: cp, manager: `http://127.0.0.1:${mp}` });
  await new Promise(x => cockpit.listen(cp, '127.0.0.1', x));
  await test('HB-04', 'the route; the Hub page in Clear Glass through the real cockpit', async () => {
    const g = await req(mp, 'GET', '/api/cos/hub'); assert.strictEqual(g.status, 200); assert.strictEqual(g.body.slots.length, H.SLOTS.length);
    assert.strictEqual(g.body.slots.find(s => s.id === 'raid').state, 'wired');
    const viaCockpit = await req(cp, 'GET', '/api/cos/hub'); assert.strictEqual(viaCockpit.status, 200, 'the cockpit forwards it (in the contract)');
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - HB-04 page part SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return; }
    try {
      const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
      await page.goto(`http://127.0.0.1:${cp}/hub/index.html`);
      let rows = []; for (let k = 0; k < 60 && rows.length < H.SLOTS.length; k++) { await new Promise(x => setTimeout(x, 200)); rows = await page.evaluate(() => [...document.querySelectorAll('.hub-row')].map(e => [e.dataset.slot, e.dataset.state])); }
      if (process.env.HB_SHOTS) await page.screenshot({ path: path.join(process.env.HB_SHOTS, 'cos-hub.png'), fullPage: true });
      const m = Object.fromEntries(rows); assert.strictEqual(rows.length, H.SLOTS.length, JSON.stringify(rows));
      assert.strictEqual(m.raid, 'wired'); assert.strictEqual(m.pipelines, 'down'); assert.strictEqual(m.experiments, 'waiting');
      assert.match(await page.evaluate(() => document.getElementById('hub-sum').textContent), /wired · \d+ waiting · \d+ down/);
    } finally { await browser.close(); }
  });
  cockpit.close(); mgr.close(); cortex.s.close(); idearium.s.close(); sup.shutdown({ by: 'test' }); fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exit(failed ? 1 : 0);
})();
