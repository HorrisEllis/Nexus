'use strict';
/**
 * tests/modules/test-agent-reach.js — switching to an agent must mean reaching it.
 * UUID: nexus-test-agent-reach-v1-0000-2026-0819-001
 *
 * §12.2 — every check runs against a REAL http server (not a mock, §1.3)
 * standing in for guardian or the ollama bridge, deliberately in one specific
 * state, and asserts the library reported that state and not a neighbouring one.
 *
 * The distinction under test throughout: unreachable ("the tab is closed") and
 * unknown ("guardian is down so I could not ask") are different facts. v1 of
 * switch_agent had neither, and reported success for both.
 */
const assert = require('assert');
const http   = require('http');
const path   = require('path');

const ROOT  = path.join(__dirname, '../..');
const reach = require(path.join(ROOT, 'lib/agent-reach.js'));

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

function serve(handler) {
  return new Promise(resolve => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}
const close = h => new Promise(r => h.srv.close(r));
const json  = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

/** A guardian with a given provider map. */
const guardianWith = (providers) => (req, res) =>
  req.url === '/providers'
    ? json(res, 200, { ok: true, providers, channels: Object.keys(providers).filter(p => providers[p] === 'connected') })
    : json(res, 404, { error: 'no' });

const ALL_CLOSED = { claude: 'null', chatgpt: 'null', gemini: 'null', perplexity: 'null', ollama: 'null' };
const CHATGPT_UP = { ...ALL_CLOSED, chatgpt: 'connected', claude: 'connected' };

(async () => {
  console.log('\nlib/agent-reach.js — is the agent actually there?\n');

  await test('AR-001', 'a connected NCP tab is reachable', async () => {
    const g = await serve(guardianWith(CHATGPT_UP));
    const r = await reach.reach('chatgpt', { guardian: g.url });
    await close(g);
    assert.strictEqual(r.state, reach.STATE.REACHABLE);
    assert.strictEqual(r.kind, 'ncp');
  });

  await test('AR-002', 'a closed tab is UNREACHABLE, and says which tabs are open', async () => {
    const g = await serve(guardianWith(CHATGPT_UP));
    const r = await reach.reach('gemini', { guardian: g.url });
    await close(g);
    assert.strictEqual(r.state, reach.STATE.UNREACHABLE);
    assert.deepStrictEqual(r.connected.sort(), ['chatgpt', 'claude']);
    assert.match(r.reason, /Clear Glass window is closed|userscript did not load|not registered/);
  });

  await test('AR-003', 'guardian being DOWN is UNKNOWN, never "the tab is closed"', async () => {
    const r = await reach.reach('chatgpt', { guardian: 'http://127.0.0.1:1', timeoutMs: 800 });
    assert.strictEqual(r.state, reach.STATE.UNKNOWN, 'collapsing these two is how a switch lands on a dead tab');
    assert.match(r.reason, /guardian unreachable/);
  });

  await test('AR-004', 'ollama is checked against the BRIDGE, not against NCP', async () => {
    // The bug a naive fix would introduce: refusing a working ollama switch
    // because it has no browser tab.
    const g = await serve(guardianWith(ALL_CLOSED));
    const o = await serve((req, res) => req.url === '/health' ? json(res, 200, { ok: true }) : json(res, 404, {}));
    const r = await reach.reach('ollama', { guardian: g.url, ollama: o.url });
    await close(g); await close(o);
    assert.strictEqual(r.state, reach.STATE.REACHABLE, 'ollama has no tab and never needs one');
    assert.strictEqual(r.kind, 'local');
  });

  await test('AR-005', 'a dead ollama bridge is UNREACHABLE with the port named', async () => {
    const r = await reach.reach('ollama', { ollama: 'http://127.0.0.1:1', timeoutMs: 800 });
    assert.strictEqual(r.state, reach.STATE.UNREACHABLE);
    assert.match(r.reason, /ollama-bridge not answering/);
  });

  await test('AR-006', '"auto" is always reachable — it is a routing decision, not a destination', async () => {
    const r = await reach.reach('auto', { guardian: 'http://127.0.0.1:1' });
    assert.strictEqual(r.state, reach.STATE.REACHABLE);
    assert.strictEqual(r.kind, 'router');
  });

  await test('AR-007', 'an unknown name is UNKNOWN and says to resolve the hat first', async () => {
    const r = await reach.reach('the_auditor', { guardian: 'http://127.0.0.1:1' });
    assert.strictEqual(r.state, reach.STATE.UNKNOWN);
    assert.match(r.reason, /forged hat/);
  });

  await test('AR-008', 'a provider guardian has never heard of is distinguished from a closed one', async () => {
    const g = await serve(guardianWith(CHATGPT_UP));
    const r = await reach.reach('grok', { guardian: g.url });
    await close(g);
    assert.strictEqual(r.state, reach.STATE.UNREACHABLE);
    assert.match(r.reason, /does not know the provider/);
  });

  await test('AR-009', 'guardian answering 200 with junk is UNKNOWN, not reachable', async () => {
    const g = await serve((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>login</html>'); });
    const r = await reach.reach('chatgpt', { guardian: g.url });
    await close(g);
    assert.strictEqual(r.state, reach.STATE.UNKNOWN);
  });

  await test('AR-010', 'all() asks guardian ONCE, not once per provider', async () => {
    let hits = 0;
    const g = await serve((req, res) => { if (req.url === '/providers') hits++; return guardianWith(CHATGPT_UP)(req, res); });
    const o = await serve((req, res) => json(res, 200, { ok: true }));
    await reach.all({ guardian: g.url, ollama: o.url });
    await close(g); await close(o);
    assert.strictEqual(hits, 1, `asked guardian ${hits} times — five NCP providers must cost one call, not five`);
  });

  await test('AR-011', 'with guardian down, all() reports UNKNOWN for every NCP agent, not unreachable', async () => {
    const o = await serve((req, res) => json(res, 200, { ok: true }));
    const a = await reach.all({ guardian: 'http://127.0.0.1:1', ollama: o.url, timeoutMs: 800 });
    await close(o);
    assert.strictEqual(a.guardianReachable, false);
    for (const n of ['claude', 'chatgpt', 'gemini', 'perplexity']) {
      assert.strictEqual(a.agents[n].state, reach.STATE.UNKNOWN, `${n} must be unknown, not unreachable`);
    }
    assert.strictEqual(a.agents.ollama.state, reach.STATE.REACHABLE, 'ollama does not depend on guardian');
  });

  await test('AR-012', 'reach never throws, whatever it is handed', async () => {
    for (const bad of [undefined, null, '', 0, {}, [], 'NOT AN AGENT', '../../etc/passwd']) {
      const r = await reach.reach(bad, { guardian: 'http://127.0.0.1:1', timeoutMs: 500 });
      assert.ok(r && r.state, `no state for ${JSON.stringify(bad)}`);
      assert.ok(Object.values(reach.STATE).includes(r.state));
    }
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed ? 1 : 0;
})();
