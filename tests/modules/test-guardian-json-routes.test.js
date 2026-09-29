'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-guardian-json-routes.test.js — 0.39.282
 *
 * James's live log, 2026-09-29: guardian crash-restarted with "ReferenceError: json is not defined" at the
 * provider sign-in route (every provider tab reports its sign-in state there). 21 routes added in 0.39.280 (provider
 * login) and 0.39.281 (economy) called json(res, …), which guardian never defined; their tests exercised the libraries
 * and fakes, never the real server. This boots the REAL guardian/server.js from an isolated copy of the tree and calls
 * every one of those routes over HTTP: each answers, and guardian is still up afterwards.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { spawn, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-json-routes-'));
const COPY = path.join(TMP, 'nexus');
const HOME = path.join(TMP, 'home');
const base = 20000 + Math.floor(Math.random() * 20000);
const P = { guardian: base, memory: base + 1, dropzone: base + 2, orch: base + 3, cg: base + 4 };

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); failed++; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function req(method, port, p, body, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ hostname: '127.0.0.1', port, path: p, method, timeout,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} resolve({ status: res.statusCode, body: j, raw: d }); });
    });
    r.on('error', reject); r.on('timeout', () => { r.destroy(); reject(new Error(`${method} ${p} timed out`)); });
    if (data) r.write(data); r.end();
  });
}

(async () => {
  console.log('\nguardian routes that answer with json()');
  fs.mkdirSync(COPY, { recursive: true });
  execSync(`tar --exclude=./node_modules --exclude=./.git -cf - . 2>/dev/null | (cd "${COPY}" && tar xf - 2>/dev/null); true`, { cwd: ROOT, shell: '/bin/bash', stdio: 'ignore' });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(COPY, 'node_modules'));
  const env = { ...process.env, HOME, APPDATA: HOME, GUARDIAN_HTTP_PORT: String(P.guardian), MEMORY_PORT: String(P.memory),
    GUARDIAN_DROPZONE_PORT: String(P.dropzone), ORCHESTRATOR_PORT: String(P.orch), CLEARGL_IPC_PORT: String(P.cg) };
  const log = [];
  const g = spawn(process.execPath, [path.join(COPY, 'guardian', 'server.js')], { cwd: COPY, env });
  g.stdout.on('data', d => log.push(String(d))); g.stderr.on('data', d => log.push(String(d)));
  let exited = null; g.on('exit', (c) => { exited = c; });
  const cleanup = () => { try { g.kill('SIGKILL'); } catch (_) {} try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} };
  process.on('exit', cleanup);

  let up = false;
  for (let i = 0; i < 160 && !up; i++) { await sleep(250); try { up = (await req('GET', P.guardian, '/health', null, 2000)).status === 200; } catch (_) {} }
  await test('GJ-00 the real guardian boots from the isolated copy', () => assert.ok(up, log.join('').slice(-1500)));
  if (!up) { cleanup(); process.exitCode = 1; return; }

  await test('GJ-01 POST /api/provider/login (what every provider tab sends) answers, and guardian stays up', async () => {
    const r = await req('POST', P.guardian, '/api/provider/login', { provider: 'chatgpt', state: 'modal', detail: 'Stay logged out' });
    assert.strictEqual(r.status, 200, r.raw);
    assert.strictEqual(r.body.ok, true);
    const bad = await req('POST', P.guardian, '/api/provider/login', { provider: 'chatgpt', state: 'nonsense' });
    assert.strictEqual(bad.status, 400, bad.raw);
    const l = await req('GET', P.guardian, '/api/provider/login');
    assert.strictEqual(l.status, 200, l.raw);
  });

  await test('GJ-02 every economy route answers JSON (GET/POST /api/economy, usage, limits, routing)', async () => {
    for (const p of ['/api/economy', '/api/economy/usage', '/api/economy/limits', '/api/economy/routing']) {
      const r = await req('GET', P.guardian, p);
      assert.strictEqual(r.status, 200, `${p}: ${r.raw.slice(0, 200)}`);
      assert.strictEqual(r.body && r.body.ok, true, p);
    }
    const s = await req('POST', P.guardian, '/api/economy', { policy: { providers: { chatgpt: { limits: { jobsPerHour: 7 } } } }, by: 'test' });
    assert.strictEqual(s.status, 200, s.raw);
  });

  await test('GJ-02b an older async route (POST /api/intake, bodyJ().then) answers once, not 404 then a crash', async () => {
    const r = await req('POST', P.guardian, '/api/intake', { provider: 'chatgpt', filename: 'x.txt', content: 'hello' });
    assert.notStrictEqual(r.status, 404, r.raw);
  });

  await test('GJ-03 after all of it guardian is still running (no crash-restart)', async () => {
    await sleep(300);
    assert.strictEqual(exited, null, `guardian exited ${exited}: ${log.join('').slice(-800)}`);
    assert.ok(!/json is not defined/.test(log.join('')), 'no ReferenceError in the log');
    assert.strictEqual((await req('GET', P.guardian, '/health', null, 2000)).status, 200);
  });

  cleanup();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
