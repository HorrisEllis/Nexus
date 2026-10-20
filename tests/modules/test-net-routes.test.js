'use strict';
// NR-01..NR-24 (0.60.60): routes + the Snowflake transport, CLI first. Policy precedence and collisions, the PAC it compiles (run in a VM) fails CLOSED,
// the transport host with a fake `tor` (loopback only, empty env, backoff, deliberate stop), the service touching only registered sessions, and the
// agent tool and command refusing to change routes. No real tor/Snowflake/Electron here: the live path is UNVERIFIED (said in status()).
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), path = require('path'), vm = require('vm'), { EventEmitter } = require('events');
const ROOT = path.resolve(__dirname, '..', '..');
const P = require(path.join(ROOT, 'clear-glass/src/net/policy.js'));
const { TransportHost, torrc } = require(path.join(ROOT, 'clear-glass/src/net/transport-host.js'));
const { NetService } = require(path.join(ROOT, 'clear-glass/src/net/service.js'));
const tool = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/net.js'));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n    ')); failed++; } }
const pacRun = (pac, url) => { const ctx = {}; vm.runInNewContext(pac, ctx); const u = new URL(url); return ctx.FindProxyForURL(url, u.hostname); };
const rule = (o) => ({ id: 'r', via: 'transport', match: { origin: 'example.com' }, ...o });
const add = (pol, o) => { const r = P.addRule(pol, o); assert.ok(r.ok, r.error); return r.policy; };
const BRIDGE = 'snowflake 192.0.2.3:80 FINGERPRINT fingerprint=X url=https://broker.example/ front=front.example';

(async () => {
  console.log('net policy');
  await test('NR-01 no rules: default direct, and no PAC (the session is left alone)', () => {
    const pol = { default: 'direct', rules: [] };
    assert.strictEqual(P.resolve(pol, { url: 'https://a.com/' }).via, 'direct'); assert.strictEqual(P.pacFor(pol, {}, {}), null);
  });
  await test('NR-02 a rule must say who it is for; credentials in a proxy are refused', () => {
    assert.ok(/who it is for/.test(P.validate({ id: 'x', via: 'direct', match: {} }).error));
    assert.ok(/credentials need the encrypted container/.test(P.validate({ id: 'x', via: 'socks5://u:p@h:1', match: { origin: 'a.com' } }).error));
    assert.ok(!P.validate({ id: 'x', via: 'ftp://h:1', match: { origin: 'a.com' } }).ok);
  });
  await test('NR-03 most specific wins: url pattern > provider > origin > caller; macro caller beats all', () => {
    let pol = { default: 'direct', rules: [] };
    pol = add(pol, { id: 'o', via: 'socks5://10.0.0.1:1080', match: { origin: 'example.com' } });
    pol = add(pol, { id: 'p', via: 'block', match: { provider: 'chatgpt' } });
    pol = add(pol, { id: 'u', via: 'transport', match: { urlPattern: 'https://example.com/private/*' } });
    pol = add(pol, { id: 'm', via: 'direct', match: { caller: 'macro:login' } });
    assert.strictEqual(P.resolve(pol, { url: 'https://example.com/a' }).ruleId, 'o');
    assert.strictEqual(P.resolve(pol, { url: 'https://example.com/private/x' }).ruleId, 'u');
    assert.strictEqual(P.resolve(pol, { url: 'https://example.com/private/x', provider: 'chatgpt' }).ruleId, 'u');
    assert.strictEqual(P.resolve(pol, { url: 'https://example.com/private/x', caller: 'macro:login' }).ruleId, 'm');
  });
  await test('NR-04 equally specific, one request could match both, different route => refused at add; a stored conflict compiles CLOSED, never a silent winner', () => {
    const pol = add({ default: 'direct', rules: [] }, { id: 'a', via: 'transport', match: { provider: 'x' } });
    const r = P.addRule(pol, { id: 'b', via: 'direct', match: { provider: 'x' } }); assert.strictEqual(r.ok, false); assert.ok(/collision/.test(r.error));
    assert.ok(P.addRule(pol, { id: 'c', via: 'direct', match: { provider: 'y' } }).ok, 'a different provider is disjoint');
    const bad = { default: 'direct', rules: [...pol.rules, { id: 'b', via: 'direct', match: { provider: 'x' }, protocols: null, onFailure: 'block' }] };
    assert.deepStrictEqual(P.conflicts(bad.rules), [['a', 'b']]);
    const lookup = P.resolve(bad, { url: 'https://q.com/', provider: 'x' }); assert.strictEqual(lookup.ok, false); assert.deepStrictEqual(lookup.ids.sort(), ['a', 'b']);
    assert.strictEqual(pacRun(P.pacFor(bad, { provider: 'x' }, { socksPort: 9150 }), 'https://q.com/'), P.BLACKHOLE);
  });
  await test('NR-05 protocol split: https goes via the transport while ftp is blocked, ws follows the default', () => {
    let pol = { default: 'direct', rules: [] };
    pol = add(pol, { id: 'h', via: 'transport', match: { origin: 'example.com' }, protocols: ['https'] });
    pol = add(pol, { id: 'f', via: 'block', match: { origin: 'example.com' }, protocols: ['ftp'] });
    assert.strictEqual(P.resolve(pol, { url: 'https://example.com/' }).via, 'transport');
    assert.strictEqual(P.resolve(pol, { url: 'ftp://example.com/x' }).via, 'block');
    assert.strictEqual(P.resolve(pol, { url: 'wss://example.com/s' }).via, 'direct');
  });
  await test('NR-06 PAC (run in a VM): routes by origin, localhost stays direct, others follow the default', () => {
    const pol = add({ default: 'direct', rules: [] }, { id: 'o', via: 'transport', match: { origin: 'example.com' } });
    const pac = P.pacFor(pol, {}, { socksPort: 9150 });
    assert.strictEqual(pacRun(pac, 'https://example.com/'), 'SOCKS5 127.0.0.1:9150');
    assert.strictEqual(pacRun(pac, 'https://www.example.com/'), 'SOCKS5 127.0.0.1:9150');
    assert.strictEqual(pacRun(pac, 'https://notexample.com/'), 'DIRECT');
    assert.strictEqual(pacRun(pac, 'http://127.0.0.1:9150/'), 'DIRECT');
  });
  await test('NR-07 FAIL CLOSED: transport down => a closed port, and DIRECT is never offered as a fallback', () => {
    const pol = add({ default: 'direct', rules: [] }, { id: 'o', via: 'transport', match: { origin: 'example.com' } });
    const pac = P.pacFor(pol, {}, { socksPort: null });
    assert.strictEqual(pacRun(pac, 'https://example.com/'), P.BLACKHOLE);
    assert.ok(!/;\s*DIRECT/.test(pac));
    const blk = P.pacFor(add({ default: 'direct', rules: [] }, { id: 'b', via: 'block', match: { origin: 'x.com' } }), {}, {});
    assert.strictEqual(pacRun(blk, 'https://x.com/'), P.BLACKHOLE);
  });
  await test('NR-08 provider and caller rules apply to the sessions they are for, not others', () => {
    const pol = add({ default: 'direct', rules: [] }, { id: 'p', via: 'block', match: { provider: 'chatgpt' } });
    assert.strictEqual(P.pacFor(pol, { provider: 'claude' }, {}), null);
    assert.strictEqual(pacRun(P.pacFor(pol, { provider: 'chatgpt' }, {}), 'https://anything.com/'), P.BLACKHOLE);
  });
  await test('NR-09 a hostile url pattern cannot break out of the PAC', () => {
    const pol = add({ default: 'direct', rules: [] }, { id: 'u', via: 'block', match: { urlPattern: 'https://a.com/"); return "DIRECT"; //*' } });
    const pac = P.pacFor(pol, {}, {}); assert.strictEqual(pacRun(pac, 'https://b.com/'), 'DIRECT'); assert.strictEqual(pacRun(pac, 'https://a.com/x'), 'DIRECT'); // not matched literally: the pattern is data
    assert.doesNotThrow(() => vm.runInNewContext(pac, {}));
  });

  console.log('transport host (fake tor)');
  const mkHost = (over = {}) => {
    const spawned = []; const fsOps = { dirs: [], files: {}, rm: [] };
    const fs = { mkdirSync: (d, o) => fsOps.dirs.push([d, o]), writeFileSync: (f, c, o) => { fsOps.files[f] = { c, o }; }, rmSync: (d) => fsOps.rm.push(d) };
    let port = 9000;
    const timers = []; const clock = { n: 0 };
    const h = new TransportHost({ spawn: (cmd, args, opts) => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = (s) => { c.killed = s; setImmediate(() => c.emit('exit', null, s)); }; spawned.push({ cmd, args, opts, c }); return c; },
      fs, dir: '/data/net', which: (n) => `/usr/bin/${n}`, pickPort: async () => ++port, now: () => ++clock.n, setTimer: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimer: () => {},
      config: { bridgeLine: BRIDGE }, ...over });
    return { h, spawned, fsOps, timers };
  };
  await test('NR-10 start refuses, and says what is missing: tor, snowflake-client, a bridge line', async () => {
    const m = mkHost({ which: () => null, config: {} }); const r = await m.h.start();
    assert.strictEqual(r.ok, false); assert.ok(/tor/.test(r.error) && /snowflake-client/.test(r.error) && /bridge line/.test(r.error)); assert.strictEqual(m.spawned.length, 0);
  });
  await test('NR-11 torrc: loopback ports only, cookie auth, snowflake bridge, data dir; child gets an EMPTY environment', async () => {
    const m = mkHost(); await m.h.start();
    const rc = Object.values(m.fsOps.files)[0].c;
    assert.ok(/SocksPort 127\.0\.0\.1:\d+/.test(rc) && /ControlPort 127\.0\.0\.1:\d+/.test(rc) && /CookieAuthentication 1/.test(rc) && /UseBridges 1/.test(rc) && /ClientTransportPlugin snowflake exec \/usr\/bin\/snowflake-client/.test(rc));
    assert.ok(!/0\.0\.0\.0|HashedControlPassword/.test(rc)); assert.deepStrictEqual(m.spawned[0].opts.env, process.platform === 'linux' ? { LD_LIBRARY_PATH: path.dirname(m.spawned[0].cmd) } : {});   // SF1 0.60.178: on Linux only tor's own folder, for its bundled libraries
    assert.strictEqual(m.fsOps.dirs[0][1].mode, 0o700);
  });
  await test('NR-12 a bridge line that is not Snowflake is rejected', () => { assert.throws(() => torrc({ dataDir: '/d', socksPort: 1, controlPort: 2, snowflakePath: '/s', bridgeLine: 'obfs4 1.2.3.4:5 ABC' }), /snowflake/); });
  await test('NR-13 states follow tor\'s bootstrap lines; socksPort is exposed only when ready', async () => {
    const m = mkHost(); await m.h.start(); const c = m.spawned[0].c;
    c.stdout.emit('data', 'Oct 15 Bootstrapped 45% (loading_status)\n'); assert.deepStrictEqual([m.h.state, m.h.status().socksPort], ['bootstrapping', null]);
    c.stdout.emit('data', 'Bootstrapped 100% (done)\n'); assert.strictEqual(m.h.state, 'ready'); assert.ok(m.h.status().socksPort > 9000);
  });
  await test('NR-14 it dies by itself: state failed, socksPort gone at once, restart with backoff, gives up after the cap', async () => {
    const m = mkHost({ maxRestarts: 2 }); await m.h.start(); m.spawned[0].c.stdout.emit('data', 'Bootstrapped 100%\n');
    m.spawned[0].c.emit('exit', 1, null); assert.strictEqual(m.h.state, 'failed'); assert.strictEqual(m.h.status().socksPort, null); assert.strictEqual(m.timers[0].ms, 1000);
    m.timers[0].f(); await new Promise(r => setImmediate(r)); assert.strictEqual(m.spawned.length, 2);
    m.spawned[1].c.emit('exit', 1, null); assert.strictEqual(m.timers[1].ms, 2000); m.timers[1].f(); await new Promise(r => setImmediate(r));
    m.spawned[2].c.emit('exit', 1, null); assert.ok(/gave up/.test(m.h.error)); assert.strictEqual(m.timers.length, 2);
  });
  await test('NR-15 a deliberate stop kills it, does NOT restart, and wipe removes the data directory', async () => {
    const m = mkHost(); await m.h.start(); const r = await m.h.stop({ wipe: true }); await new Promise(x => setImmediate(x));
    assert.strictEqual(m.spawned[0].c.killed, 'SIGTERM'); assert.strictEqual(m.h.state, 'stopped'); assert.strictEqual(m.timers.length, 0); assert.strictEqual(r.wiped, true); assert.strictEqual(m.fsOps.rm.length, 1);
  });
  await test('NR-16 a wipe that fails is reported, not hidden', async () => {
    const m = mkHost(); m.h.d.fs.rmSync = () => { throw new Error('EBUSY'); }; await m.h.start(); const r = await m.h.stop({ wipe: true });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.wiped, false); assert.ok(/could not be wiped/.test(m.h.error));
  });

  console.log('service');
  const mkSvc = () => { let saved = null; const s = new NetService({ store: { get: () => saved, set: (v) => { saved = v; } }, log: () => {} }); return s; };
  const fakeSes = () => { const calls = []; return { calls, setProxy: async (c) => { calls.push(c); } }; };
  await test('NR-17 no rules: a registered session is never touched', async () => {
    const s = mkSvc(), ses = fakeSes(); const r = await s.register('persist:agent-a', ses, { caller: 'person-tab' });
    assert.strictEqual(r.applied, false); assert.strictEqual(ses.calls.length, 0);
  });
  await test('NR-18 adding a rule applies a PAC to registered sessions; removing the last rule clears it', async () => {
    const s = mkSvc(), ses = fakeSes(); await s.register('persist:agent-a', ses, { caller: 'person-tab' });
    assert.ok(s.addRoute({ id: 'o', via: 'block', match: { origin: 'example.com' } }).ok); await new Promise(r => setImmediate(r));
    assert.strictEqual(ses.calls[0].mode, 'pac_script'); assert.ok(/^data:application\/x-ns-proxy-autoconfig;base64,/.test(ses.calls[0].pacScript));
    s.removeRoute('o'); await new Promise(r => setImmediate(r)); assert.strictEqual(ses.calls[ses.calls.length - 1].mode, 'system');
  });
  await test('NR-19 transport state change re-applies: ready => socks, down => closed', async () => {
    const s = mkSvc(), ses = fakeSes(); const host = new TransportHost({ config: {}, spawn() {}, fs: {}, which: () => null }); s._host = host; host.on('state', () => s.reapplyAll());
    await s.register('persist:agent-a', ses, {}); s.addRoute({ id: 'o', via: 'transport', match: { origin: 'example.com' } }); await new Promise(r => setImmediate(r));
    const decode = (c) => Buffer.from(c.pacScript.split(',')[1], 'base64').toString();
    assert.strictEqual(pacRun(decode(ses.calls[ses.calls.length - 1]), 'https://example.com/'), P.BLACKHOLE);
    host.socksPort = 9150; host._set('ready', { progress: 100 }); await new Promise(r => setImmediate(r));
    assert.strictEqual(pacRun(decode(ses.calls[ses.calls.length - 1]), 'https://example.com/'), 'SOCKS5 127.0.0.1:9150');
    host._set('failed', { error: 'x', socksPort: null }); await new Promise(r => setImmediate(r));
    assert.strictEqual(pacRun(decode(ses.calls[ses.calls.length - 1]), 'https://example.com/'), P.BLACKHOLE);
  });
  await test('NR-20 status never claims Verified (the leak test is not built) and says what is not routed', () => {
    const st = mkSvc().status(); assert.strictEqual(st.verified, false); assert.ok(/NP5/.test(st.verifiedWhy)); assert.ok(/not routed yet/.test(st.note));
  });
  await test('NR-21 setBridge only takes a Snowflake line', () => { const s = mkSvc(); assert.ok(!s.setBridge('obfs4 1.2.3.4:5 X').ok); assert.ok(s.setBridge(BRIDGE).ok); });

  console.log('agents and the command');
  await test('NR-22 the agent tool refuses every action that changes routing, with the reason', async () => {
    for (const a of ['add', 'remove', 'default', 'start', 'stop', 'bridge', 'paths']) { const r = await tool.execute({ action: a }); assert.strictEqual(r.ok, false); assert.ok(/person's act/.test(r.error), a); }
  });
  await test('NR-23 the agent tool reads honestly: not running => ok:false, resolve needs a url', async () => {
    const old = process.env.CLEARGL_IPC_PORT; const r = await tool.execute({ action: 'resolve' }); assert.ok(/needs a url/.test(r.error));
    const r2 = await tool.execute({ action: 'bogus' }); assert.ok(/unknown action/.test(r2.error)); process.env.CLEARGL_IPC_PORT = old;
  });
  await test('NR-24 the `net` command: reads open to agents, changes personOnly, requests map to /cli/net/*', async () => {
    const { SPEC } = await import(path.join(ROOT, 'idearium/cli/route-commands.js')); const row = SPEC.find(r => r.key === 'net'); assert.ok(row);
    const A = (args, flags = {}) => ({ args, flags });
    for (const v of ['add', 'rm', 'default', 'start', 'stop', 'bridge', 'paths']) assert.ok(row.personOnly(A([v])), v);
    for (const v of ['status', 'routes', 'resolve', 'detect', 'test']) assert.strictEqual(row.personOnly(A([v])), null, v);
    const q = row.req(A(['add', 'r1'], { via: 'transport', origin: 'example.com', protocols: 'https,wss', 'on-failure': 'block' }));
    assert.strictEqual(q.path, '/cli/net/routes'); assert.deepStrictEqual(q.body.match, { origin: 'example.com' }); assert.deepStrictEqual(q.body.protocols, ['https', 'wss']);
    assert.strictEqual(row.need(A(['add', 'r1'])), '<id> --via direct|block|transport|socks5://host:port'); assert.strictEqual(row.req(A(['status'])).path, '/cli/net/status');
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
