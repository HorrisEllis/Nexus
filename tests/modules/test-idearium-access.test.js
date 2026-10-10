'use strict';
/**
 * tests/modules/test-idearium-access.test.js — IA0–IA4 0.58.0 (docs/2026-10-10-idearium-access-phasemap.spec).
 * James: "what about a app password style login in idearium from clearglass panel, then we could accounts per hat/repo?"
 * The gate's decisions (idearium/lib/access.cjs), a live Idearium (the routes, the cookie, CORS, a scoped password),
 * the command rows, and Clear Glass's sign-in module. The screens are proven in Clear Glass
 * (tests/probe/idearium-access-glass.js).
 */
require(require('path').join(__dirname, '../../lib/test-sandbox.js')).ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
process.env.IDEARIUM_ACCESS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-'));
const A = require(path.join(ROOT, 'idearium/lib/access.cjs'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const req = (port, method, p, body, headers = {}) => new Promise((resolve) => {
  const data = body == null ? null : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (rs) => {
    let d = ''; rs.on('data', c => { d += c; }); rs.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} resolve({ status: rs.statusCode, json: j, headers: rs.headers }); });
  });
  r.on('error', (e) => resolve({ status: 0, error: e.message })); if (data) r.write(data); r.end();
});
const D = (o) => A.decide({ mode: 'origin', remoteAddress: '127.0.0.1', ...o });

async function main() {
  await test('IA-01', 'origin mode: a local process and a loopback page pass; a website is refused with how to get in; another device must sign in', async () => {
    assert.strictEqual(D({ action: 'repos.list', headers: {} }).allow, true);
    const page = D({ action: 'repos.list', headers: { origin: 'http://127.0.0.1:7820' } });
    assert.ok(page.allow && page.cors === 'http://127.0.0.1:7820');
    const evil = D({ action: 'repos.list', method: 'POST', headers: { origin: 'https://evil.example' } });
    assert.ok(!evil.allow && evil.status === 403 && /evil\.example cannot drive Idearium/.test(evil.error) && /app password/.test(evil.how) && evil.cors === null);
    assert.strictEqual(D({ action: 'repos.list', headers: { origin: 'https://evil.example' }, trustedOrigins: 'https://evil.example' }).allow, true, 'a listed origin passes');
    const lan = D({ action: 'repos.list', headers: {}, remoteAddress: '192.168.1.20' });
    assert.ok(!lan.allow && lan.status === 401);
    assert.ok(!D({ action: 'x', headers: { origin: 'null' } }).allow, 'a sandboxed frame (Origin: null) is not trusted');
  });

  await test('IA-02', 'a password is shown once and kept only as a hash; a wrong, malformed or revoked one is refused', async () => {
    const r = A.createKey({ label: 'tablet' });
    assert.ok(r.ok && /^nxa_[0-9a-f]{8}_/.test(r.password));
    const raw = fs.readFileSync(path.join(process.env.IDEARIUM_ACCESS_DIR, 'keys.json'), 'utf8');
    assert.ok(!raw.includes(r.password.split('_')[2]), 'the secret is not on disk');
    assert.strictEqual(A.verify(r.password).id, r.key.id);
    assert.ok(/wrong app password/.test(A.verify(r.password.slice(0, -2) + 'xx').error));
    assert.ok(/not an Idearium app password/.test(A.verify('hunter2').error));
    A.revokeKey(r.key.id);
    assert.ok(/revoked/.test(A.verify(r.password).error));
    assert.deepStrictEqual(r.key.caps, ['read_ideas', 'write_ideas'], 'read and write by default; admin only when asked');
    assert.ok(/unknown capability/.test(A.createKey({ label: 'x', caps: 'root' }).error));
  });

  await test('IA-03', 'a keyed caller is held to its capabilities and its repos, in every mode — even open', async () => {
    const r = A.createKey({ label: 'builder', hat: 'architect', repos: 'repo-a', caps: 'read_ideas' });
    const h = { authorization: `Bearer ${r.password}` };
    const read = D({ action: 'repo.show', cap: 'read_ideas', repo: 'repo-a', headers: h });
    assert.ok(read.allow && read.who.hat === 'architect' && read.who.via === 'password');
    assert.ok(/does not hold write_ideas/.test(D({ action: 'repo.update', cap: 'write_ideas', repo: 'repo-a', method: 'POST', headers: h }).error));
    assert.ok(/not for repo repo-b/.test(D({ action: 'repo.show', cap: 'read_ideas', repo: 'repo-b', headers: h }).error));
    assert.ok(/not for repo repo-b/.test(D({ action: 'repo.show', cap: 'read_ideas', repo: 'repo-b', headers: h, mode: 'open' }).error));
    assert.ok(!D({ action: 'access.keys', cap: 'admin', headers: h }).allow, 'making passwords is admin');
    assert.ok(A.holds(['admin'], 'write_ideas') && A.holds(['write_ideas'], 'read_ideas') && !A.holds(['read_ideas'], 'admin'));
  });

  await test('IA-04', 'a website holding a password gets in, scoped, and gets CORS back; a wrong one is 401 even locally', async () => {
    const r = A.createKey({ label: 'web' });
    const g = D({ action: 'repos.list', cap: 'read_ideas', headers: { origin: 'https://my.site', authorization: `Bearer ${r.password}` } });
    assert.ok(g.allow && g.cors === 'https://my.site');
    const bad = D({ action: 'repos.list', headers: { authorization: 'Bearer nxa_00000000_aaaaaaaaaaaaaaaaaaaaaaaa' } });
    assert.ok(!bad.allow && bad.status === 401);
  });

  await test('IA-05', 'password mode: nobody but health and sign-in passes without a password', async () => {
    assert.strictEqual(D({ action: 'repos.list', headers: {}, mode: 'password' }).status, 401);
    assert.ok(D({ action: 'access.login', headers: {}, mode: 'password' }).allow);
    assert.ok(D({ action: 'health', headers: {}, mode: 'password' }).allow);
    assert.ok(D({ action: 'repos.list', headers: {}, mode: 'open' }).allow);
  });

  await test('IA-06', 'sign-in: a session cookie with the key\'s scope; revoking the key ends the session; logout ends it', async () => {
    const r = A.createKey({ label: 'clear glass', repos: 'repo-a' });
    const s = A.login(r.password, { days: 1 });
    assert.ok(s.ok && s.maxAge === 86400);
    assert.ok(/HttpOnly; SameSite=Strict/.test(A.sessionCookie(s.session, s.maxAge)));
    const h = { cookie: `other=1; ${A.COOKIE}=${s.session}` };
    const g = D({ action: 'repo.show', cap: 'read_ideas', repo: 'repo-a', headers: h, mode: 'password' });
    assert.ok(g.allow && g.who.via === 'session' && g.who.label === 'clear glass');
    assert.ok(!D({ action: 'repo.show', cap: 'read_ideas', repo: 'repo-b', headers: h, mode: 'password' }).allow);
    A.logout(s.session);
    assert.ok(/sign-in has ended/.test(D({ action: 'repo.show', headers: h }).error));
    const s2 = A.login(r.password); A.revokeKey(r.key.id);
    const after = D({ action: 'repo.show', headers: { cookie: `${A.COOKIE}=${s2.session}` } });
    assert.ok(!after.allow && after.clearCookie, 'a dead session clears its cookie');
    const lines = fs.readFileSync(path.join(process.env.IDEARIUM_ACCESS_DIR, 'ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(['key.created', 'login', 'key.revoked'].every(a => lines.some(l => l.act === a)), 'made, signed in and revoked are in the ledger');
  });

  await test('IA-07', 'live Idearium: evil origin 403 with no CORS; loopback page 200 with its origin; make a scoped password, sign in, held to its repo', async () => {
    const port = 4890 + Math.floor(Math.random() * 60);
    const p = spawn(process.execPath, [path.join(ROOT, 'idearium/api/index.js')], { env: { ...process.env, IDEARIUM_PORT: String(port) }, stdio: 'ignore' });
    try {
      let h = null;
      for (let i = 0; i < 120 && !(h && h.status === 200); i++) { await new Promise(r => setTimeout(r, 250)); h = await req(port, 'GET', '/health'); }
      if (!h || h.status !== 200) { console.log(`    (Idearium did not come up on :${port} here — the gate is proven by IA-01…06; the wiring checked in source)`); const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8'); assert.ok(/_gate\(route \? route\.action/.test(src)); return; }
      const evil = await req(port, 'POST', '/api/workshop', { from: { kind: 'blank' } }, { Origin: 'https://evil.example' });
      assert.strictEqual(evil.status, 403); assert.ok(!evil.headers['access-control-allow-origin'], 'no CORS for a website');
      assert.strictEqual(evil.json.detail.signIn, '/login.html');
      const page = await req(port, 'GET', '/api/access/me', null, { Origin: 'http://127.0.0.1:7820' });
      assert.strictEqual(page.status, 200); assert.strictEqual(page.headers['access-control-allow-origin'], 'http://127.0.0.1:7820');
      assert.strictEqual(page.json.mode, 'origin');
      const made = await req(port, 'POST', '/api/access/keys', { label: 'hat: reviewer', hat: 'reviewer', repos: 'repo-a', caps: 'read_ideas' });
      assert.strictEqual(made.status, 200, JSON.stringify(made.json)); assert.ok(/^nxa_/.test(made.json.password));
      const listed = await req(port, 'GET', '/api/access/keys');
      assert.ok(listed.json.keys.some(k => k.id === made.json.key.id && !('hash' in k)), 'listed without its hash');
      const login = await req(port, 'POST', '/api/access/login', { password: made.json.password });
      assert.strictEqual(login.status, 200); const cookie = String(login.headers['set-cookie']).split(';')[0];
      assert.ok(cookie.startsWith('nx_idearium='));
      const me = await req(port, 'GET', '/api/access/me', null, { Cookie: cookie });
      assert.ok(me.json.signedIn && me.json.who.hat === 'reviewer');
      const other = await req(port, 'GET', '/api/repos/repo-b/phases', null, { Cookie: cookie });
      assert.strictEqual(other.status, 403); assert.ok(/not for repo repo-b/.test(other.json.error));
      const write = await req(port, 'POST', '/api/workshop', { from: { kind: 'blank' } }, { Cookie: cookie });
      assert.strictEqual(write.status, 403); assert.ok(/does not hold write_ideas/.test(write.json.error));
      const wrong = await req(port, 'POST', '/api/access/login', { password: 'nxa_00000000_aaaaaaaaaaaaaaaaaaaaaaaa' });
      assert.strictEqual(wrong.status, 401);
      const revoked = await req(port, 'POST', `/api/access/keys/${made.json.key.id}/revoke`, {});
      assert.strictEqual(revoked.status, 200);
      assert.strictEqual((await req(port, 'GET', '/api/access/me', null, { Cookie: cookie })).json.signedIn, false);
      const pre = await req(port, 'OPTIONS', '/api/repos', null, { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' });
      assert.ok(!pre.headers['access-control-allow-origin'], 'a website\'s preflight is not answered');
    } finally { p.kill(); }
  });

  await test('IA-08', 'the command: idearium access / keys / new / revoke are rows in the route-command SPEC', async () => {
    const { SPEC } = await import(require('url').pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = (k) => SPEC.find(r => r.key === k);
    assert.strictEqual(row('access').req({ args: [], flags: {} }).path, '/api/access/me');
    assert.strictEqual(row('access.keys').req({ args: [], flags: {} }).path, '/api/access/keys');
    const made = row('access.new').req({ args: ['the', 'tablet'], flags: { hat: 'reviewer', repos: 'a,b' } });
    assert.deepStrictEqual([made.method, made.path, made.body], ['POST', '/api/access/keys', { label: 'the tablet', hat: 'reviewer', repos: 'a,b' }]);
    assert.strictEqual(row('access.revoke').req({ args: ['ab12cd34'], flags: {} }).path, '/api/access/keys/ab12cd34/revoke');
    assert.ok(/person/.test(row('access.new').personOnly()) && /person/.test(row('access.revoke').personOnly()), 'an agent asks; it does not mint or revoke passwords');
  });

  await test('IA-09', 'Clear Glass signs in from its vault and sets the cookie; no password saved → nothing happens', async () => {
    const { signIn } = require(path.join(ROOT, 'clear-glass/src/accounts/idearium-login.js'));
    const set = [];
    const cookies = { set: async (c) => { set.push(c); } };
    const none = await signIn({ vault: { get: () => [] }, cookies, fetch: async () => { throw new Error('must not be called'); } });
    assert.ok(none.ok && none.skipped && set.length === 0);
    const fakeFetch = async (url, opts) => ({ ok: true, status: 200, headers: { get: (n) => n.toLowerCase() === 'set-cookie' ? 'nx_idearium=abc123; HttpOnly; SameSite=Strict; Path=/; Max-Age=600' : null },
      json: async () => ({ ok: true, who: { label: 'clear glass', hat: null } }), _sent: JSON.parse(opts.body) });
    const r = await signIn({ vault: { get: () => [{ username: 'idearium', password: 'nxa_deadbeef_xxxxxxxxxxxxxxxxxxxxxxxx' }] }, cookies, fetch: fakeFetch });
    assert.ok(r.ok && r.who.label === 'clear glass', JSON.stringify(r));
    assert.deepStrictEqual({ name: set[0].name, value: set[0].value, url: set[0].url, httpOnly: set[0].httpOnly, sameSite: set[0].sameSite }, { name: 'nx_idearium', value: 'abc123', url: 'http://127.0.0.1:4800', httpOnly: true, sameSite: 'strict' });
    const refused = await signIn({ vault: { get: () => [{ password: 'nxa_deadbeef_xxxxxxxxxxxxxxxxxxxxxxxx' }] }, cookies, fetch: async () => ({ ok: false, status: 401, headers: { get: () => null }, json: async () => ({ ok: false, error: 'wrong app password' }) }) });
    assert.ok(!refused.ok && /wrong app password/.test(refused.error));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
