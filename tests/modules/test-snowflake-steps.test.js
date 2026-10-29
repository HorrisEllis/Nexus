'use strict';
/**
 * tests/modules/test-snowflake-steps.test.js — Snowflake as a step in macros and workflows (SN1, 0.60.281)
 * James, 2026-10-29: "also snowflake plugin support to macros and automation."
 *
 *   SF-01  route / unroute this tab's site in core's table; a site routed another way is left and said; only a step's own rule is removed
 *   SF-02  start, wait (starts it when off, then waits for ready), check (is Tor), stop, status; a transport that fails is said
 *   SF-03  refused, and said, when the Snowflake plugin is off; an unknown do is refused with the list
 *   SF-04  the doors: the driver's `net` action (the tab's own address), browser_action `network`, the workflow step "Network (Snowflake)"
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

// a stand-in transport: start → bootstrapping, ready after `after` status reads; or failed
function fakeHost({ after = 2, fail = false } = {}) {
  let s = { state: 'stopped', socksPort: null }, reads = 0; const calls = [];
  return { d: {}, calls, status() { if (s.state === 'bootstrapping' && ++reads >= after) s = fail ? { state: 'failed', error: 'no bridge answered' } : { state: 'ready', socksPort: 9150 }; return s; },
    async start() { calls.push('start'); s = { state: 'bootstrapping' }; reads = 0; return { ok: true }; }, async stop() { calls.push('stop'); s = { state: 'stopped' }; return { ok: true }; } };
}

(async () => {
  console.log('\n⬡  Snowflake as a step in macros and workflows\n');
  const { NetService } = require(CG('src/net/service.js'));
  const { netStep } = require(CG('src/net/step.js'));
  const mk = (over = {}) => {
    let saved = null; const svc = new NetService({ store: { get: () => saved, set: (v) => { saved = v; } }, log: () => {} });
    const host = over.host || fakeHost(); svc._host = host;
    const deps = { service: svc, host, ensureBridge: async () => ({ ok: true }), fetchVia: async () => JSON.stringify({ IsTor: true, IP: '185.1.2.3' }), urlOf: () => 'https://www.fiverr.com/users/x/manage_gigs', sleep: async () => {}, ...over };
    return { svc, host, run: (a) => netStep(deps, a) };
  };

  await test('SF-01', 'route / unroute this tab\'s site; another rule is left and said; only a step\'s own rule removed', async () => {
    const { svc, run } = mk();
    const r = await run({ do: 'route' });
    assert.deepStrictEqual([r.origin, r.via, r.rule, r.changed], ['www.fiverr.com', 'transport', 'macro.www.fiverr.com', true]);
    assert.strictEqual(svc.policy().rules[0].match.origin, 'www.fiverr.com');
    assert.match((await run({ do: 'route' })).why, /already routed this way/);
    svc.addRoute({ id: 'his-rule', via: 'direct', match: { origin: 'upwork.com' } });
    const left = await run({ do: 'route', site: 'https://upwork.com/jobs' });
    assert.ok(!left.changed && /already routed direct by rule "his-rule"; left as it is/.test(left.why), JSON.stringify(left));
    assert.match((await run({ do: 'unroute', site: 'upwork.com' })).why, /routed by rule "his-rule", which a step did not make/);
    assert.strictEqual(svc.policy().rules.length, 2, 'his rule kept');
    assert.ok((await run({ do: 'unroute' })).changed);
    assert.deepStrictEqual(svc.policy().rules.map(x => x.id), ['his-rule']);
    await assert.rejects(mk({ urlOf: () => 'about:blank' }).run({ do: 'route' }), /route needs a site/);
  });

  await test('SF-02', 'start, wait, check, stop, status; a transport that fails is said', async () => {
    const { host, run } = mk();
    assert.strictEqual((await run({ do: 'status' })).transport.state, 'stopped');
    const w = await run({ do: 'wait' });
    assert.deepStrictEqual([w.transport, host.calls], ['ready', ['start']]);
    const c = await run({ do: 'check' });
    assert.deepStrictEqual([c.isTor, c.ip, host.calls.length], [true, '185.1.2.3', 1], 'ready already: not started again');
    assert.strictEqual((await run({ do: 'stop' })).transport, 'stopped');
    assert.strictEqual((await run({ do: 'start' })).transport, 'bootstrapping', 'start does not wait');
    await assert.rejects(mk({ host: fakeHost({ fail: true }) }).run({ do: 'wait' }), /the transport did not come up \(no bridge answered\)/);
    await assert.rejects(mk({ fetchVia: async () => JSON.stringify({ IsTor: false, IP: '1.1.1.1' }) }).run({ do: 'check' }), /says this is not Tor \(ip 1\.1\.1\.1\)/);
    await assert.rejects(mk({ ensureBridge: async () => ({ ok: false, error: 'none found' }) }).run({ do: 'start' }), /no Snowflake bridge \(none found\)/);
    const slow = mk({ host: fakeHost({ after: 1e9 }) });
    await assert.rejects(slow.run({ do: 'wait', timeoutMs: 1 }).catch(async (e) => { throw e; }), /still bootstrapping after 0 s/);
  });

  await test('SF-03', 'refused when the Snowflake plugin is off; an unknown do is refused with the list', async () => {
    const { svc, run } = mk({ pluginOn: () => false });
    await assert.rejects(run({ do: 'route' }), /the Snowflake plugin is off — turn it on in the 🧩 panel/);
    assert.strictEqual(svc.policy().rules.length, 0, 'nothing routed');
    await assert.rejects(mk().run({ do: 'tunnel' }), /do is one of route, unroute, start, stop, wait, check, status/);
  });

  await test('SF-04', 'the doors: driver net (the tab\'s own address), browser_action network, the workflow step', async () => {
    const ClearDriver = require(CG('src/driver/index.js'));
    const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
    d._getWebContents = () => ({ getURL: () => 'https://jobs.acme.io/role/42' });
    await assert.rejects(d.exec({ agentId: 'w', action: 'net', do: 'route' }), /Snowflake is not wired into this driver/);
    const { svc, run } = mk(); let seen = null;
    d.netStep = (args, urlOf) => { seen = urlOf(); return run({ ...args, site: args.site || seen }); };
    const r = await d.exec({ agentId: 'w', action: 'net', do: 'route' });
    assert.deepStrictEqual([seen, r.origin, svc.policy().rules.length], ['https://jobs.acme.io/role/42', 'jobs.acme.io', 1]);
    const src = require('fs').readFileSync(CG('src/ipc/bridge.js'), 'utf8');
    assert.ok(/if \(this\.driver\) this\.driver\.netStep = this\.netStep;/.test(src) && /p\.name === 'snowflake' && p\.state === 'active'/.test(src), 'the bridge hands its service in, gated on the plugin');
    const BA = require(path.join(ROOT, 'lib/agent-tools/tools/browser/browser-action.js'));
    assert.ok(BA.parameters.properties.action.enum.includes('network'));
    assert.match(require('fs').readFileSync(path.join(ROOT, 'lib/agent-tools/tools/browser/browser-action.js'), 'utf8'), /network: 'net',/);
    const S = require(path.join(ROOT, 'lib/automation/steps.js'));
    const b = (S.CATALOGUE || S.catalogue || []).find(s => s.type === 'browser');
    const netDo = b.fields.find(f => f.key === 'netDo');
    assert.ok(netDo && netDo.options.map(o => o.value).join() === 'route,unroute,start,wait,check,stop,status');
    const E = require(path.join(ROOT, 'lib/automation/engine.js'));
    assert.match(require('fs').readFileSync(path.join(ROOT, 'lib/automation/engine.js'), 'utf8'), /case 'network': out = await this\._drive\(wf, page, 'net', \{ do: cfg\.netDo \|\| 'route'/);
    assert.ok(E, 'engine loads');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
