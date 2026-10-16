'use strict';
// ST-01..05, AU-01..09 (0.60.90, COSA12/13): COS's settings file and the update policy (off / ask / auto), on real zips and the real store.
// The switch and the process status are faked here (their own tests are test-cos-app-switch / -runtime): what is under test is WHEN COS switches by itself.
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const Zip = require('../../lib/zip.js'), Store = require('../../cos/app/store.js'), St = require('../../cos/app/settings.js'), { Controller } = require('../../cos/app/controller.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log('  ok ' + name); passed++; } catch (e) { console.log('  FAIL ' + name + '\n    ' + String(e.stack || e).split('\n').slice(0, 4).join('\n    ')); failed++; } }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cos-upd-'));
function zip(dir, v) { const t = `nexus-${v}`, f = path.join(dir, t + '.zip'); fs.writeFileSync(f, Zip.create([{ path: `${t}/VERSION`, data: Buffer.from(v + '\n') }, { path: `${t}/package.json`, data: Buffer.from('{}') }, { path: `${t}/nexus/autopilot.js`, data: Buffer.from('//' + v) }])); return f; }
const sha = (f) => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const arrive = (root, dir, v, verified = true) => { const z = zip(dir, v); return Store.importZip(root, z, verified ? { sha256: sha(z) } : {}); };
function ctl(root, { running = false, idle = null, policy = 'auto' } = {}) {
  const calls = []; const rt = { status: async () => ({ running, version: '0.60.68', healthy: true }) };
  const sw = { switchTo: async (r, p, v) => { calls.push([p, v]); const f = path.join(r, 'projects', p, 'state.json'); const st = JSON.parse(fs.readFileSync(f, 'utf8')); const from = st.current || null; st.previous = from; st.current = v; fs.writeFileSync(f, JSON.stringify(st)); return { ok: true, from, to: v }; } };
  const c = new Controller({ root, rt, sw, idle, onEvent: () => {} }); c.calls = calls; if (policy) c.setSetting('update.policy', policy); return c;
}
(async () => {
  await test('ST-01 defaults: policy ask, a normal window; a missing file is not an error', () => { const r = tmp(); const s = St.load(r); assert.strictEqual(s.settings.update.policy, 'ask'); assert.strictEqual(s.settings.window.width, 1000); assert.ok(s.fresh); });
  await test('ST-02 set validates: only off|ask|auto, only a known key; the file survives a reload', () => {
    const r = tmp(); assert.ok(!St.set(r, 'update.policy', 'yolo').ok); assert.match(St.set(r, 'update.policy', 'yolo').error, /off, ask, auto/); assert.match(St.set(r, 'colour', 'red').error, /unknown setting/);
    assert.ok(St.set(r, 'update.policy', 'auto').ok); assert.strictEqual(St.load(r).settings.update.policy, 'auto');
  });
  await test('ST-03 a damaged file is set aside with a warning, defaults used, never a silent reset', () => {
    const r = tmp(); fs.writeFileSync(path.join(r, 'settings.json'), '{not json'); const s = St.load(r); assert.match(s.warning, /not valid JSON/); assert.strictEqual(s.settings.update.policy, 'ask');
    assert.ok(fs.readdirSync(r).some(f => /^settings\.json\.bad-/.test(f)), 'the bad file is kept'); assert.ok(!fs.existsSync(path.join(r, 'settings.json')));
  });
  await test('ST-04 an invalid stored policy falls back and is reported in dropped', () => { const r = tmp(); fs.writeFileSync(path.join(r, 'settings.json'), JSON.stringify({ update: { policy: 'always' } })); const s = St.load(r); assert.strictEqual(s.settings.update.policy, 'ask'); assert.match(s.dropped[0], /always/); });
  await test('ST-05 the window is remembered, clamped, and does not disturb the policy', () => {
    const r = tmp(); St.set(r, 'update.policy', 'off'); const w = St.saveWindow(r, { width: 1234, height: 5, x: 40, y: 50, maximized: true }); assert.strictEqual(w.width, 1234); assert.strictEqual(w.height, 720, 'a silly height falls back'); assert.strictEqual(w.maximized, true);
    assert.strictEqual(St.load(r).settings.update.policy, 'off'); assert.strictEqual(St.load(r).settings.window.x, 40);
  });
  await test('AU-01 policy off: nothing happens by itself', async () => { const r = tmp(), d = tmp(); const c = ctl(r, { policy: 'off' }); const o = await c.applyPolicy(arrive(r, d, '0.60.68')); assert.strictEqual(o.action, 'none'); assert.strictEqual(c.calls.length, 0); });
  await test('AU-02 policy ask: offers, never switches', async () => { const r = tmp(), d = tmp(); const c = ctl(r, { policy: 'ask' }); const o = await c.applyPolicy(arrive(r, d, '0.60.68')); assert.strictEqual(o.action, 'offer'); assert.strictEqual(c.calls.length, 0); });
  await test('AU-03 policy auto, verified, newer, nothing running: switches', async () => {
    const r = tmp(), d = tmp(); const c = ctl(r); const first = await c.applyPolicy(arrive(r, d, '0.60.68')); assert.strictEqual(first.action, 'switched', 'the first install has no current version to protect');
    const o = await c.applyPolicy(arrive(r, d, '0.60.69')); assert.strictEqual(o.action, 'switched'); assert.deepStrictEqual(c.calls[1], ['nexus', '0.60.69']);
  });
  await test('AU-04 auto but the checksum was not found: offers, with the reason', async () => { const r = tmp(), d = tmp(); const c = ctl(r); const o = await c.applyPolicy(arrive(r, d, '0.60.68', false)); assert.strictEqual(o.action, 'offer'); assert.match(o.reason, /no checksum/); assert.strictEqual(c.calls.length, 0); });
  await test('AU-05 auto but not newer than the current: offers, never downgrades by itself', async () => {
    const r = tmp(), d = tmp(); const c = ctl(r); assert.strictEqual((await c.applyPolicy(arrive(r, d, '0.60.69'))).action, 'switched');
    const o = await c.applyPolicy(arrive(r, d, '0.60.65')); assert.strictEqual(o.action, 'offer'); assert.match(o.reason, /not newer/); assert.strictEqual(c.calls.length, 1);
  });
  await test('AU-06 auto, Nexus running: asks the autopilot GET /idle: a Nexus without /idle, a busy one and an unreachable one all WAIT with the reason; an idle one switches', async () => {
    const http = require('http'); let mode = '404';
    const srv = http.createServer((q, r) => { if (q.url !== '/idle' || mode === '404') { r.writeHead(404); return r.end('no'); } r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(mode === 'busy' ? { ok: true, idle: false, reasons: ['2 Guardian jobs in progress (queued, started)'] } : { ok: true, idle: true, reasons: [] })); }).listen(0, '127.0.0.1'); await new Promise(r => srv.on('listening', r)); const port = srv.address().port;
    const r = tmp(), d = tmp(); const c = ctl(r); await c.applyPolicy(arrive(r, d, '0.60.68')); c.rt = { status: async () => ({ running: true, version: '0.60.68', healthy: true, statusPort: port }) };
    let o = await c.applyPolicy(arrive(r, d, '0.60.69')); assert.strictEqual(o.action, 'waiting'); assert.match(o.reason, /has no \/idle yet.*0\.60\.71/); assert.strictEqual(c.calls.length, 1);
    mode = 'busy'; o = (await c.retryWaiting())[0]; assert.strictEqual(o.action, 'waiting'); assert.match(o.reason, /2 Guardian jobs in progress/); assert.strictEqual(c.calls.length, 1);
    mode = 'idle'; o = (await c.retryWaiting())[0]; assert.strictEqual(o.action, 'switched'); assert.strictEqual(c.calls.length, 2); srv.close();
    const r2 = tmp(), d2 = tmp(); const c2 = ctl(r2); await c2.applyPolicy(arrive(r2, d2, '0.60.68')); c2.rt = { status: async () => ({ running: true, version: '0.60.68', healthy: true, statusPort: 1 }) };
    const o2 = await c2.applyPolicy(arrive(r2, d2, '0.60.69')); assert.strictEqual(o2.action, 'waiting'); assert.match(o2.reason, /did not answer \/idle/);
  });
  await test('AU-07 auto with an idle probe: waits while busy, switches once idle (retryWaiting)', async () => {
    const r = tmp(), d = tmp(); let idle = false; const c = ctl(r, { idle: async () => ({ idle, why: idle ? 'idle' : 'a job is running' }) }); await c.applyPolicy(arrive(r, d, '0.60.68')); c.rt = { status: async () => ({ running: true, version: '0.60.68', healthy: true }) };
    const o = await c.applyPolicy(arrive(r, d, '0.60.69')); assert.strictEqual(o.action, 'waiting'); assert.match(o.reason, /a job is running/);
    await c.retryWaiting(); assert.strictEqual(c.calls.length, 1); idle = true; const again = await c.retryWaiting(); assert.strictEqual(again[0].action, 'switched'); assert.strictEqual(c.calls.length, 2); assert.deepStrictEqual((await c.state()).waiting, {});
  });
  await test('AU-08 auto, a failing probe is not idle (it reports the failure, does not switch)', async () => { const r = tmp(), d = tmp(); const c = ctl(r, { idle: async () => { throw new Error('status port refused'); } }); await c.applyPolicy(arrive(r, d, '0.60.68')); c.rt = { status: async () => ({ running: true, version: '0.60.68', healthy: true }) }; const o = await c.applyPolicy(arrive(r, d, '0.60.69')); assert.strictEqual(o.action, 'waiting'); assert.match(o.reason, /status port refused/); });
  await test('AU-09 an already-installed zip or a refused one does nothing', async () => {
    const r = tmp(), d = tmp(); const c = ctl(r); const z = zip(d, '0.60.68'); const a = Store.importZip(r, z, { sha256: sha(z) }); await c.applyPolicy(a); const again = Store.importZip(r, z, { sha256: sha(z) });
    assert.strictEqual((await c.applyPolicy(again)).action, 'none'); assert.strictEqual((await c.applyPolicy({ ok: false, error: 'x' })).action, 'none'); assert.strictEqual(c.calls.length, 1);
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
