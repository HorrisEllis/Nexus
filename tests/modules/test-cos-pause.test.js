'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-pause.test.js — CP5b, 0.60.362. Map: docs/2026-11-01-the-compartment-phasemap.spec CP5b_pause_resume ·
 * Spec: cos/spec/compartment.spec MOD-CP-SUSPEND, MOD-CP-PAUSE.
 * James, 2026-11-01: "the entire sandbox is rewindable/pausable/recordable/branchable/parraelel and benchmarked".
 *   PA-01 suspend.js on a real process tree (a parent and its child): suspended, the OS reads both suspended; resumed, both running
 *   PA-02 the supervisor pauses a fixture: ledger first, the OS reads it suspended, its heartbeat stops, nothing restarts it; resumed, it
 *         beats again from where it was
 *   PA-03 stop while paused: it is resumed so it can stop, and it stops
 *   PA-04 the manager's route: an agent is refused (403); a rule with RAID unreachable is refused, fails closed, said on the ledger; a person pauses
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'cos/manager/suspend.js'));
const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await fn(); if (v) return v; await sleep(100); } return null; };
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

(async () => {
  console.log('\n⏸  pause and resume a compartment (CP5b)\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-pause-'));
  const beatFile = (n) => path.join(dir, `${n}.beat`);
  const beater = path.join(dir, 'beater.js');
  fs.writeFileSync(beater, `let n = 0; setInterval(() => require('fs').writeFileSync(process.argv[2], String(++n)), 100);`);
  const parent = path.join(dir, 'parent.js');
  fs.writeFileSync(parent, `require('child_process').spawn(process.execPath, [${JSON.stringify(beater)}, process.argv[2] + '.child'], { stdio: 'ignore' }); require(${JSON.stringify(beater)});`);
  const read = (f) => { try { return Number(fs.readFileSync(f, 'utf8')) || 0; } catch (_) { return 0; } };
  const mk = (names) => createSupervisor({ root: dir, ledgerFile: path.join(dir, `l-${Math.random()}.jsonl`), log: () => {}, policy: { stopGraceMs: 300 },
    declarations: names.map(n => ({ name: n, system: n, cmd: process.execPath, args: [parent, beatFile(n)] })) });
  const kids = [];

  await test('PA-01', 'a real tree: suspended, the OS reads both suspended; resumed, both running', async () => {
    const c = spawn(process.execPath, [parent, beatFile('raw')], { stdio: 'ignore' }); kids.push(c);
    const t = await until(async () => { const x = await S.tree(c.pid); return x.length >= 2 ? x : null; });
    assert.ok(t && t[0] === c.pid, `the tree: ${JSON.stringify(t)}`);
    const a = await S.suspend(c.pid);
    assert.ok(a.ok && a.os === 'suspended' && a.pids.length >= 2, JSON.stringify(a));
    const n1 = read(beatFile('raw')), m1 = read(beatFile('raw') + '.child'); await sleep(500);
    assert.deepStrictEqual([read(beatFile('raw')), read(beatFile('raw') + '.child')], [n1, m1], 'parent and child both stopped beating');
    const b = await S.resume(c.pid);
    assert.ok(b.ok && b.os === 'running', JSON.stringify(b));
    assert.ok(await until(() => read(beatFile('raw')) > n1 && read(beatFile('raw') + '.child') > m1), 'both beat again');
    for (const p of b.pids.reverse()) { try { process.kill(p); } catch (_) {} }
  });

  const sup = mk(['a', 'b']);
  await test('PA-02', 'the supervisor: ledger first, the OS reads suspended, the beat stops, nothing restarts it; resumed, it beats on', async () => {
    sup.start('a', { by: 'test' }); assert.ok(await until(() => read(beatFile('a')) > 2), 'a beats');
    const pid0 = sup.get('a').pid;
    const v = await sup.pause('a', { by: 'person' });
    assert.strictEqual(v.state, 'paused', JSON.stringify(v)); assert.strictEqual(v.pause.os, 'suspended'); assert.strictEqual(v.pause.by, 'person');
    const led = sup.ledger({ system: 'a' }).map(e => e.kind);
    assert.ok(led.indexOf('pause') >= 0 && led.indexOf('paused') > led.indexOf('pause'), `the ledger before the act: ${led}`);
    const n = read(beatFile('a')); await sleep(600);
    assert.strictEqual(read(beatFile('a')), n, 'its beat stopped');
    assert.strictEqual(sup.get('a').pid, pid0); assert.strictEqual(sup.get('a').state, 'paused', 'nothing restarted it');
    assert.strictEqual((await sup.pause('a', { by: 'person' })).said, 'already paused');
    const r = await sup.resume('a', { by: 'person' });
    assert.ok(r.state === 'up' && !r.pause, JSON.stringify(r));
    assert.ok(await until(() => read(beatFile('a')) > n), 'it beats again'); assert.strictEqual(sup.get('a').pid, pid0, 'the same process, from where it was');
  });

  await test('PA-03', 'stop while paused: resumed so it can stop, and it stops', async () => {
    await sup.pause('a', { by: 'person' });
    sup.stop('a', { by: 'person' });
    assert.ok(await until(() => sup.get('a').state === 'stopped'), `state: ${sup.get('a').state}`);
    assert.ok(sup.ledger({ system: 'a' }).some(e => e.kind === 'resume' && /so it can stop/.test(e.why)));
  });

  await test('PA-04', 'the route: an agent refused; a rule with RAID unreachable refused (fails closed); a person pauses', async () => {
    process.env.CORTEX_PORT = String(await freePort());   // RAID unreachable: nothing listens there
    sup.start('b', { by: 'test' }); assert.ok(await until(() => read(beatFile('b')) > 1));
    const srv = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0, { root: dir });
    const post = (p, body) => new Promise((res) => { const q = http.request({ host: '127.0.0.1', port: srv.address().port, path: p, method: 'POST', headers: { 'Content-Type': 'application/json' } }, (x) => { let t = ''; x.on('data', c => t += c); x.on('end', () => res({ status: x.statusCode, body: JSON.parse(t) })); }); q.end(JSON.stringify(body)); });
    const ag = await post('/api/cos/systems/b/pause', { by: 'agent:copilot' });
    assert.strictEqual(ag.status, 403); assert.ok(/an agent proposes/.test(ag.body.error));
    const rl = await post('/api/cos/systems/b/pause', { by: 'rule:test' });
    assert.strictEqual(rl.status, 403); assert.ok(/RAID did not approve: RAID unreachable/.test(rl.body.error), rl.body.error);
    assert.ok(sup.ledger({ system: 'b' }).some(e => e.kind === 'raid-refused'), 'said on the ledger');
    assert.strictEqual(sup.get('b').state !== 'paused', true, 'not paused');
    const ps = await post('/api/cos/systems/b/pause', { by: 'person' });
    assert.strictEqual(ps.status, 200, JSON.stringify(ps.body)); assert.strictEqual(ps.body.system.state, 'paused');
    const rs = await post('/api/cos/systems/b/resume', { by: 'person' });
    assert.strictEqual(rs.status, 200); assert.strictEqual(rs.body.system.state, 'up');
    srv.close();
  });

  sup.shutdown({ by: 'test' });
  for (const c of kids) { try { c.kill(); } catch (_) {} }
  await sleep(400); fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
