'use strict';
// ST-01..07 (0.60.128 DB13 + DB14): his lib/system-registry.js as the tunnel — routes, commands, toasts, heartbeat over routes.
// James, 2026-10-17: "integrate the system-registry.js as the tunnel or drawbridge? then through that access the command line
// interface, and routes in the api and toasts, the heartbeat system for status of the system using routes?"
const assert = require('assert'), path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const SYS = require('../../lib/system-registry.js');
const { SPEC } = require('../../idearium/cli/route-commands.js');
let passed = 0, failed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const quiet = async (fn) => { const k = { log: console.log, warn: console.warn, info: console.info, error: console.error }; console.log = console.warn = console.info = console.error = () => {}; try { return await fn(); } finally { Object.assign(console, k); } };

test('ST-01 build/get/list stay as they were (his 2026-09-06 runtime registry): the tunnel is added beside them', () => {
  const b = SYS.build();
  assert.ok(b.systemCount >= 10 && Array.isArray(b.systems) && Array.isArray(b.driftWarnings));
  assert.ok(SYS.get('idearium') && SYS.get('idearium').port);
});
test('ST-02 a system\'s folder: its own name, or its first word when that is not another system (ollama-bridge → ollama, intelligence-consumer → none)', () => {
  assert.strictEqual(SYS.folderOf('idearium'), 'idearium');
  assert.strictEqual(SYS.folderOf('ollama-bridge'), 'ollama');
  assert.strictEqual(SYS.folderOf('intelligence-consumer'), null);
});
test('ST-03 the tunnel: where it runs, the routes its registry declares, and the commands that reach them', () => {
  const t = SYS.tunnel('idearium', { commands: SPEC });
  assert.ok(t.ok && t.runtime.port && t.registry.file === 'idearium/registry-components.js');
  assert.ok(t.routes.length > 0 && t.commands.length > 0);
  for (const c of t.commands) assert.ok(t.routes.some(r => `${r.method} ${r.path}` === c.route), c.route);
});
test('ST-04 what is missing is said: no registry, no toasts declared, no compartment', () => {
  const d = SYS.tunnel('orchestrator', { commands: SPEC });   // 0.60.136: diagnostic has a registry now
  assert.ok(d.ok && d.registry === null);
  assert.ok(d.said.some(x => /no registry-components\.js/.test(x)));
  assert.ok(d.said.some(x => /no toasts/.test(x)));
  assert.strictEqual(SYS.tunnel('nope').ok, false);
});
test('ST-05 the CLI\'s negative space: commands that reach no route any registry declares are counted and named', () => {
  const T = SYS.tunnels({ commands: SPEC });
  assert.strictEqual(T.commands.through_a_declared_route + T.commands.undeclared.length <= T.commands.total, true);
  assert.ok(T.commands.undeclared.length > 0 && T.commands.through_a_declared_route > 0);
});
test('ST-06 heartbeat over the health route: up, degraded (bad answer or slow), down, unknown', async () => {
  const ok = await SYS.heartbeat('idearium', { fetch: async () => ({ ok: true, status: 200 }) });
  assert.strictEqual(ok.status, 'up');
  const bad = await SYS.heartbeat('idearium', { fetch: async () => ({ ok: false, status: 503 }) });
  assert.deepStrictEqual([bad.status, bad.code], ['degraded', 503]);
  const slow = await SYS.heartbeat('idearium', { fetch: () => new Promise(r => setTimeout(() => r({ ok: true, status: 200 }), 1100)), timeoutMs: 3000 });
  assert.strictEqual(slow.status, 'degraded'); assert.ok(/slow/.test(slow.why));
  const down = await SYS.heartbeat('idearium', { fetch: async () => { const e = new Error('x'); e.cause = { code: 'ECONNREFUSED' }; throw e; } });
  assert.strictEqual(down.status, 'down'); assert.ok(/ECONNREFUSED/.test(down.why));
  const none = await SYS.heartbeat('not-a-system');
  assert.deepStrictEqual([none.status, none.why], ['unknown', 'not in the registry']);
});
test('ST-07 the routes are served and the command rows reach them', async () => {
  const g = await quiet(async () => { const api = await import(path.join(REPO, 'idearium/api/index.js')); return [await api._route('GET', '/api/system/tunnel'), await api._route('GET', '/api/system/tunnel/cortex'), await api._route('GET', '/api/system/heartbeat'), await api._route('GET', '/api/system/tunnel/nope')]; });
  const [all, one, hb, miss] = g.map(x => ({ s: x.status, d: x.json.data || x.json }));
  assert.strictEqual(all.s, 200); assert.ok(all.d.systems.length >= 10 && all.d.commands.total > 0);
  assert.strictEqual(one.s, 200); assert.strictEqual(one.d.name, 'cortex'); assert.ok(['up', 'degraded', 'down', 'unknown'].includes(one.d.heartbeat.status));
  assert.strictEqual(hb.s, 200); assert.strictEqual(hb.d.systems.length, SYS.list().length);
  assert.strictEqual(miss.s, 404);
  const row = (k) => SPEC.find(r => r.key === k);
  assert.strictEqual(row('system.tunnel').req({ args: [], flags: {} }).path, '/api/system/tunnel');
  assert.strictEqual(row('system.tunnel').req({ args: ['cortex'], flags: {} }).path, '/api/system/tunnel/cortex');
  assert.strictEqual(row('system.heartbeat').req({ args: [], flags: {} }).path, '/api/system/heartbeat');
});

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
