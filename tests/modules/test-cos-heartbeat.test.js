'use strict';
/**
 * tests/modules/test-cos-heartbeat.test.js — PR6 slice a (docs/2026-10-05-announce-pulse-repair-phasemap.spec, addendum 2026-11-13)
 * James, 2026-11-13: "get the heartbeat done and polling disabled" · "orchastrator needs to migrate to the superviser" · "the heartbeat
 * optimizes nexus since when systems arent needed they dont need to be polled."
 *
 *   HB-01  a system that declares its heartbeat is up at its first beat; COS never asks its /health
 *   HB-02  a beat that does not come is said once (pulse-missed); the next beat clears it (pulse-recovered)
 *   HB-03  a system COS stopped is asleep: its silence is not a miss
 *   HB-04  a beat from an id no declaration names is not taken (known: false)
 *   HB-05  lib/pulse.js sends its beat and its registration to COS (COS_MANAGER_PORT), whatever orchPort the caller passes
 *   HB-06  COS's route hears the beat and passes it on to the Orchestrator
 *   HB-07  COS's shell and overview take usage from the stream, not a 5 s timer; the usage route answers from the last sample
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')}`); failed++; } }
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now() + ms; while (Date.now() < t) { if (await fn()) return true; await wait(50); } return false; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-hb-'));
const IDLE = path.join(dir, 'idle.js'); fs.writeFileSync(IDLE, 'setInterval(() => {}, 1000);\n');
const port = () => new Promise(r => { const s = http.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const FAST = { restart: { backoffMs: [50, 200], factor: 2 }, circuit: { maxRestarts: 3, windowMs: 10000 }, phaseGateMs: 4000, memBackoffMs: 100, stopGraceMs: 300, stableMs: 60000 };
const sups = [];
const mk = (declarations, health) => { const s = createSupervisor({ root: dir, declarations, policy: FAST, ledgerFile: path.join(dir, `l${sups.length}.jsonl`), log: () => {},
  freeMemPct: () => 0.5, checkHealth: async () => { health.n++; return true; } }); sups.push(s); return s; };
const ledger = (s, name) => s.ledger({ system: name });

(async () => {
  console.log('\n♥  COS hears each system\'s beat; nothing polls (PR6 slice a)\n');

  await test('HB-01', 'a system that declares its heartbeat is up at its first beat; COS never asks its /health', async () => {
    const h = { n: 0 };
    const s = mk([{ name: 'alpha', system: 'alpha', cmd: process.execPath, args: [IDLE], healthUrl: 'http://127.0.0.1:1/health', heartbeat: 'alpha-id' }], h);
    s.start('alpha', { by: 'person' });
    await wait(300);
    assert.strictEqual(s.get('alpha').state, 'starting');
    const r = s.beat({ systemId: 'alpha-id', intervalMs: 10000, seq: 1 });
    assert.deepStrictEqual(r, { known: true, name: 'alpha' });
    assert.strictEqual(s.get('alpha').state, 'up');
    assert.strictEqual(h.n, 0, 'no /health request');
    assert.ok(ledger(s, 'alpha').some(e => e.kind === 'pulse' && /first beat/.test(e.why)));
    s.stop('alpha', { by: 'person' });
  });

  await test('HB-02', 'a beat that does not come is said once; the next beat clears it', async () => {
    const h = { n: 0 };
    const s = mk([{ name: 'beta', system: 'beta', cmd: process.execPath, args: [IDLE], heartbeat: 'beta' }], h);
    s.start('beta', { by: 'person' }); await wait(200);
    s.beat({ systemId: 'beta', intervalMs: 1000 });   // expects the next within 1 × 1.5 + 5 = 6.5 s
    assert.ok(await until(() => ledger(s, 'beta').some(e => e.kind === 'pulse-missed'), 9000), 'pulse-missed said');
    await wait(500);
    assert.strictEqual(ledger(s, 'beta').filter(e => e.kind === 'pulse-missed').length, 1, 'said once');
    s.beat({ systemId: 'beta', intervalMs: 1000 });
    assert.ok(ledger(s, 'beta').some(e => e.kind === 'pulse-recovered'));
    s.stop('beta', { by: 'person' });
  });

  await test('HB-03', 'a system COS stopped is asleep: its silence is not a miss', async () => {
    const h = { n: 0 };
    const s = mk([{ name: 'gamma', system: 'gamma', cmd: process.execPath, args: [IDLE], heartbeat: 'gamma' }], h);
    s.start('gamma', { by: 'person' }); await wait(200);
    s.beat({ systemId: 'gamma', intervalMs: 1000 });
    s.stop('gamma', { by: 'person' });
    await wait(7500);
    assert.ok(!ledger(s, 'gamma').some(e => e.kind === 'pulse-missed'), JSON.stringify(ledger(s, 'gamma').map(e => e.kind)));
  });

  await test('HB-04', 'a beat from an id no declaration names is not taken', () => {
    const s = mk([{ name: 'delta', system: 'delta', cmd: process.execPath, args: [IDLE], heartbeat: 'delta' }], { n: 0 });
    assert.deepStrictEqual(s.beat({ systemId: 'nobody' }), { known: false, name: null });
  });

  await test('HB-05', 'lib/pulse.js sends its beat and its registration to COS, whatever orchPort the caller passes', async () => {
    const got = [];
    const srv = http.createServer((q, r) => { let b = ''; q.on('data', c => b += c); q.on('end', () => { got.push({ path: q.url, body: b }); r.end('{"ok":true}'); }); });
    const p = await new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
    const keep = process.env.COS_MANAGER_PORT; process.env.COS_MANAGER_PORT = String(p);
    delete require.cache[require.resolve(path.join(ROOT, 'lib/pulse.js'))];
    const { createPulse } = require(path.join(ROOT, 'lib/pulse.js'));
    const pulse = createPulse({ systemId: 'hb-test', port: 1234, orchPort: 1, intervalMs: 60000, log: () => {} });
    const ok = await until(() => got.some(g => g.path === '/api/cos/heartbeat') && got.some(g => g.path === '/api/cos/register'), 4000);
    pulse.stop(); srv.close(); if (keep === undefined) delete process.env.COS_MANAGER_PORT; else process.env.COS_MANAGER_PORT = keep;
    assert.ok(ok, JSON.stringify(got.map(g => g.path)));
    assert.strictEqual(JSON.parse(got.find(g => g.path === '/api/cos/heartbeat').body).systemId, 'hb-test');
  });

  await test('HB-06', 'COS\'s route hears the beat and passes it on to the Orchestrator', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'cos/manager/server.js'), 'utf8');
    assert.ok(/p === '\/api\/cos\/heartbeat' \|\| p === '\/api\/cos\/register'/.test(src));
    assert.ok(/sup\.beat\(body\)/.test(src) && /_onward\(p\.endsWith\('heartbeat'\) \? '\/api\/heartbeat' : '\/api\/register', rawBody\)/.test(src));
  });

  await test('HB-07', 'the shell and the overview take usage from the stream; the usage route answers from the last sample', () => {
    const shell = fs.readFileSync(path.join(ROOT, 'cos/ui/shell/page.js'), 'utf8'), ov = fs.readFileSync(path.join(ROOT, 'cos/ui/overview/page.js'), 'utf8');
    const srv = fs.readFileSync(path.join(ROOT, 'cos/manager/server.js'), 'utf8');
    assert.ok(!/setInterval\(refreshTop/.test(shell) && /addEventListener\('cos\.usage'/.test(shell));
    assert.ok(!/setInterval\(loadUsage/.test(ov) && /COS\.on\('cos\.usage'/.test(ov));
    assert.ok(/resources\.last\(\)/.test(srv) && /onSample: \(u\) => broadcast\('cos\.usage'/.test(srv));
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'cos/manager/contract.json'), 'utf8'));
    assert.ok(c.pages.find(p => p.id === 'overview').listens.includes('cos.usage'));
  });

  for (const s of sups) { try { await s.shutdown(); } catch (_) {} }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
