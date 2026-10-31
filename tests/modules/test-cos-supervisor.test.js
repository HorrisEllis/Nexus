'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-supervisor.test.js — MG15b, 0.60.328. Spec: cos/spec/cos-manager.spec MOD-MG-SUPERVISOR, MOD-MG-SERVER.
 * James, 2026-10-31: "lets do the orchastration. that needs to be done completely." · "do it 72% be effecient".
 * Real child processes (a healthy server, a crasher, a port-taken one), a fast policy; the rules are autopilot's.
 *   SV-01 the defaults equal autopilot's constants        SV-05 the memory floor refuses, a critical system's lower floor lets it
 *   SV-02 boot in phase order, each phase waits for health SV-06 on demand: touch starts it, idle stops it
 *   SV-03 a crash restarts with backoff; a loop opens the circuit, the others keep running
 *   SV-04 EADDRINUSE opens the circuit at once            SV-07 the server: routes, an act says who, a second start is a no-op
 *   SV-08 the real tree's 13 declared processes; a Node child gets its heap cap and --expose-gc
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const { createSupervisor, readDeclarations, DEFAULTS } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
const { listen } = require(path.join(ROOT, 'cos/manager/server.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')}`); failed++; } }
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now() + ms; while (Date.now() < t) { if (await fn()) return true; await wait(50); } return false; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-sup-'));
const fx = (n, src) => { const f = path.join(dir, n); fs.writeFileSync(f, src); return f; };
const OK = fx('ok.js', "require('http').createServer((q,s)=>s.end('ok')).listen(Number(process.argv[2]),'127.0.0.1');");
const CRASH = fx('crash.js', 'process.exit(1);');
const ADDR = fx('addr.js', "console.error('Error: listen EADDRINUSE: address already in use'); process.exit(1);");
const port = () => new Promise(r => { const s = http.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const decl = (name, file, extra = {}) => ({ name, system: name, cmd: process.execPath, args: [file, ...(extra.port ? [String(extra.port)] : [])],
  healthUrl: extra.port ? `http://127.0.0.1:${extra.port}/health` : undefined, ...extra });
const FAST = { restart: { backoffMs: [50, 200], factor: 2 }, circuit: { maxRestarts: 3, windowMs: 10000 }, phaseGateMs: 4000, idleMs: 300, idleCheckMs: 100, memBackoffMs: 100, stopGraceMs: 300, stableMs: 60000 };
const sups = [];
const mk = (declarations, extra = {}) => { const s = createSupervisor({ root: dir, declarations, policy: { ...FAST, ...(extra.policy || {}) }, ledgerFile: path.join(dir, `l${sups.length}.jsonl`), log: () => {}, ...extra.opts }); sups.push(s); return s; };

(async () => {
  console.log('\n⬡  COS\'s supervisor — autopilot\'s rules, read from what each system declares (MG15b)\n');
  await test('SV-01', "the defaults equal autopilot's constants", () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/nexus/autopilot.retired-0.60.330.js'), 'utf8');
    const c = (n) => Number(eval((new RegExp(`const ${n}\\s*=\\s*([^;\\n]+)`).exec(src) || [])[1].replace(/Number\(process\.env\.\w+ \|\| ([\d.]+)\)/, '$1')));
    assert.deepStrictEqual(DEFAULTS.restart.backoffMs, [c('BACKOFF_BASE_MS'), c('BACKOFF_MAX_MS')]);
    assert.deepStrictEqual([DEFAULTS.stableMs, DEFAULTS.circuit.maxRestarts, DEFAULTS.circuit.windowMs], [c('STABLE_MS'), c('CIRCUIT_MAX_CRASHES'), c('CIRCUIT_WINDOW_MS')]);
    assert.deepStrictEqual([DEFAULTS.criticalHaltPct, DEFAULTS.memBackoffMs, DEFAULTS.maxOldSpaceMB, DEFAULTS.phaseGateMs], [c('CRITICAL_HALT_PCT'), c('MEM_BACKOFF_MS'), c('DEFAULT_MAX_OLD_SPACE_MB'), c('PHASE_GATE_TIMEOUT_MS')]);
    assert.strictEqual(DEFAULTS.bootSet, 'all', 'today\'s behaviour by default (MG_D13)');
  });
  await test('SV-02', 'boot in phase order; each phase waits for its health', async () => {
    const [p1, p2] = [await port(), await port()];
    const s = mk([decl('b', OK, { port: p2, phase: 2 }), decl('a', OK, { port: p1, phase: 1, critical: true }), decl('od', OK, { onDemand: true })]);
    const r = await s.boot({ by: 'boot' });
    assert.deepStrictEqual(r.started, ['a', 'b']); assert.deepStrictEqual(r.skipped.map(x => x.name), ['od']);
    assert.deepStrictEqual(s.ledger().filter(e => e.kind === 'spawn').map(e => e.system), ['a', 'b']);
    assert.ok(await until(() => s.get('b').state === 'up'), s.get('b').state);
    const core = mk([decl('a2', OK, { port: await port(), phase: 1, critical: true }), decl('b2', OK, { phase: 2 })]);
    assert.deepStrictEqual((await core.boot({ set: 'core' })).started, ['a2'], "bootSet 'core' is CS4a");
  });
  await test('SV-03', 'a crash restarts with growing backoff; a loop opens the circuit; the others keep running', async () => {
    const pk = await port();
    const s = mk([decl('crasher', CRASH), decl('keeper', OK, { port: pk })]);
    s.start('keeper'); s.start('crasher');
    assert.ok(await until(() => s.get('crasher').state === 'circuit-open'), s.get('crasher').state);
    const kinds = s.ledger({ system: 'crasher' }).map(e => e.kind);
    assert.deepStrictEqual(kinds.filter(k => k === 'crash').length, 3); assert.ok(kinds.includes('circuit-open'));
    assert.ok(s.get('crasher').restarts.backoffMs > 50, 'the backoff grew');
    assert.ok(await until(() => s.get('keeper').state === 'up'), 'the other system is untouched');
    assert.ok(/circuit open/.test(JSON.stringify((s.start('crasher'), s.ledger({ system: 'crasher' }).slice(-1)))), 'a start is refused until reset');
    s.resetCircuit('crasher', { by: 'person' }); assert.strictEqual(s.get('crasher').circuit.open, false);
  });
  await test('SV-04', 'EADDRINUSE opens the circuit at once', async () => {
    const s = mk([decl('addr', ADDR)]); s.start('addr');
    assert.ok(await until(() => s.get('addr').state === 'circuit-open'));
    assert.strictEqual(s.ledger({ system: 'addr' }).filter(e => e.kind === 'crash').length, 1);
    assert.ok(/EADDRINUSE/.test(s.get('addr').circuit.why));
  });
  await test('SV-05', 'the memory floor refuses; a critical system\'s lower floor lets it start', async () => {
    const s = mk([decl('plain', OK, { port: await port() }), decl('crit', OK, { port: await port(), critical: true })], { opts: { freeMemPct: () => 0.07 } });
    s.start('plain'); s.start('crit');
    assert.strictEqual(s.get('plain').state, 'waiting-memory'); assert.ok(/7\.0% memory free/.test(s.ledger({ system: 'plain' })[0].why));
    assert.ok(['starting', 'up'].includes(s.get('crit').state), s.get('crit').state);
  });
  await test('SV-06', 'on demand: touch starts it, idle stops it', async () => {
    const s = mk([decl('od', OK, { port: await port(), onDemand: true })]);
    s.touch('od'); assert.ok(s.get('od').pid);
    assert.ok(await until(() => s.get('od').state === 'idle', 4000), s.get('od').state);
    assert.ok(s.ledger({ system: 'od' }).some(e => e.kind === 'idle-stop'));
  });
  await test('SV-07', 'the server: its routes; an act says who; a second start is a no-op', async () => {
    const s = mk([decl('w', OK, { port: await port() })]);
    const srv = await listen(s, 0), base = `http://127.0.0.1:${srv.address().port}`;
    const call = (m, p, b) => new Promise((ok) => { const r = http.request(base + p, { method: m, headers: { 'Content-Type': 'application/json' } }, (res) => { let t = ''; res.on('data', c => t += c); res.on('end', () => ok({ code: res.statusCode, body: JSON.parse(t) })); }); if (b) r.write(JSON.stringify(b)); r.end(); });
    try {
      assert.strictEqual((await call('GET', '/api/cos/health')).body.systems, 1);
      assert.strictEqual((await call('POST', '/api/cos/systems/w/start', {})).code, 400, 'no by: refused');
      assert.strictEqual((await call('POST', '/api/cos/systems/w/start', { by: 'person' })).code, 200);
      assert.ok(/already running/.test((await call('POST', '/api/cos/systems/w/start', { by: 'person' })).body.system.said));
      assert.strictEqual((await call('GET', '/api/cos/systems/nope')).code, 404);
      assert.ok((await call('GET', '/api/cos/ledger?system=w')).body.entries.some(e => e.kind === 'spawn' && e.by === 'person'));
    } finally { srv.close(); }
  });
  await test('SV-08', "the real tree's declarations; a Node child's heap cap and --expose-gc", () => {
    assert.strictEqual(readDeclarations(ROOT).length, 13);
    const calls = []; const fake = { pid: 1, on() {}, stdout: null, stderr: null, kill() {} };
    const s = createSupervisor({ root: ROOT, policy: FAST, ledgerFile: path.join(dir, 'real.jsonl'), log: () => {}, freeMemPct: () => 0.9, checkHealth: async () => false, spawnFn: (c, a, o) => { calls.push({ c, a, o }); return fake; } });
    sups.push(s); s.start('cortex');
    assert.deepStrictEqual(calls[0].a.slice(0, 3), ['--expose-gc', '--max-old-space-size=1024', 'cortex/boot.js']); assert.strictEqual(calls[0].o.cwd, ROOT);
  });
  for (const s of sups) try { s.shutdown({ by: 'test' }); } catch (_) {}
  await wait(400);
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
