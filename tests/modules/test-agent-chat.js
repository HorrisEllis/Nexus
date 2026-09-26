'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// tests/modules/test-agent-chat.js
//
// The tests that matter are the ones about what this module REFUSES to
// conclude. Reading another agent's chat is easy; not mistaking an agent's
// self-assessment for verification is the whole point.
// ─────────────────────────────────────────────────────────────────────────────

const assert = require('assert');
const http   = require('http');
const path   = require('path');
const ROOT   = path.join(__dirname, '..', '..');
const AC     = require(path.join(ROOT, 'lib', 'agent-chat'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { passed++; console.log(`  \u2713 ${id} ${name}`); })
    .catch(e => { failed++; console.log(`  \u2717 ${id} ${name}\n    ${e.message}`); });
}

(async () => {
  console.log('\n\u2550\u2550 AGENT-CHAT \u2014 read any agent, verify through the gate \u2550\u2550\n');

  // ── Wake word ─────────────────────────────────────────────────────────────
  await test('AC-001', '"Hey nexus, ..." addresses NEXUS and extracts the ask', () => {
    for (const s of ['Hey nexus, what is in the gap field?', 'hey nexus: run the tests', 'Ok nexus, status']) {
      const r = AC.parseWake(s);
      assert.strictEqual(r.addressed, true, `not addressed: ${s}`);
      assert.ok(r.ask && r.ask.length > 2);
    }
    assert.strictEqual(AC.parseWake('Hey nexus, what is in the gap field?').ask, 'what is in the gap field?');
  });

  await test('AC-002', 'ordinary text is NOT hijacked \u2014 the host model keeps it', () => {
    for (const s of ['can you explain nexus to me', 'hey, what about nexus?', 'nexus is a system', '']) {
      assert.strictEqual(AC.parseWake(s).addressed, false, `wrongly hijacked: "${s}"`);
    }
  });

  await test('AC-003', 'a wake word with no request is ignored, not sent as an empty prompt', () => {
    const r = AC.parseWake('hey nexus,   ');
    assert.strictEqual(r.addressed, false);
  });

  // ── Unread vs empty ───────────────────────────────────────────────────────
  await test('AC-004', '\u00a71.2 an unreachable guardian is NOT "no agents"', async () => {
    const prev = process.env.GUARDIAN_URL;
    process.env.GUARDIAN_URL = 'http://127.0.0.1:1';
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agent-chat'))];
    const A = require(path.join(ROOT, 'lib', 'agent-chat'));
    const r = await A.listAgents();
    assert.strictEqual(r.ok, false);
    assert.ok(r.note && /NOT the same as/.test(r.note), 'the unread/empty distinction must be stated on the payload');
    if (prev) process.env.GUARDIAN_URL = prev; else delete process.env.GUARDIAN_URL;
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agent-chat'))];
  });

  await test('AC-005', 'an unread live-DOM read carries a note distinguishing it from an empty one', async () => {
    const prev = process.env.GUARDIAN_URL;
    process.env.GUARDIAN_URL = 'http://127.0.0.1:1';
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agent-chat'))];
    const A = require(path.join(ROOT, 'lib', 'agent-chat'));
    const r = await A.readLiveDom('chatgpt');
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(r.chunks, []);
    assert.ok(/unread, not empty/.test(r.note));
    if (prev) process.env.GUARDIAN_URL = prev; else delete process.env.GUARDIAN_URL;
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agent-chat'))];
  });

  await test('AC-006', 'REAL: a live guardian DOM map becomes typed chunks, markup discarded', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ nodes: [
        { tag: 'P',   text: 'here is the fix', role: 'assistant' },
        { tag: 'PRE', text: 'const x = 1;', lang: 'javascript', role: 'assistant' },
        { tag: 'IMG', src: 'https://x/y.png', alt: 'diagram' },
        { tag: 'P',   text: '   ' },
      ] }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const prev = process.env.GUARDIAN_URL;
    process.env.GUARDIAN_URL = `http://127.0.0.1:${server.address().port}`;
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agent-chat'))];
    const A = require(path.join(ROOT, 'lib', 'agent-chat'));
    try {
      const r = await A.readLiveDom('chatgpt');
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.chunks.length, 3, 'the whitespace-only node must be dropped');
      const code = r.chunks.find(c => c.kind === 'code');
      assert.strictEqual(code.text, 'const x = 1;');
      assert.strictEqual(code.lang, 'javascript');
      const only = await A.readCode('chatgpt');
      assert.ok(only.chunks.every(c => c.kind === 'code'));
    } finally {
      server.close();
      if (prev) process.env.GUARDIAN_URL = prev; else delete process.env.GUARDIAN_URL;
      delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agent-chat'))];
    }
  });

  // ── Loop safety ───────────────────────────────────────────────────────────
  // §UPDATED 2026-08-22 — ask()'s real contract changed in the merge that
  // added converse(): hops (not trail), a cycle check (hops.includes) AND
  // a count check (hops.length >= maxHops), failure shape is
  // {ok:false, error, hops} — no refused/note/trail[].failed. Rewritten to
  // match the real, current behavior, not the old shape.
  await test('AC-006b', '§BUGFIX 2026-08-27: REAL guardian /providers shape (objects, not arrays) reports live agents correctly', async () => {
    // James, live: guardian's boot log showed 4 providers NCP-connected,
    // but listAgents() always reported none live. Root cause: guardian's
    // REAL /providers response is two objects keyed by provider name
    // (`providers: {name: 'connected'|'null'}`, `channels: {name: {tabId,
    // lastHeartbeat}}`) — never an array, never `.providers` as an array
    // of objects. The old code's `.map()` on that object threw, and the
    // catch silently turned it into a generic ok:false every time. This
    // pins the fix against guardian's actual, real response shape (see
    // guardian/server.js's GET /providers and guardian/lib/ncp.js's
    // getProviders()/isConnected()), not a hypothetical one.
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        providers: { claude: 'null', chatgpt: 'connected', gemini: 'connected', perplexity: 'connected', ollama: 'null' },
        channels: {
          chatgpt:    { tabId: 'tab-chatgpt',    lastHeartbeat: Date.now() },
          gemini:     { tabId: 'tab-gemini',     lastHeartbeat: Date.now() },
          perplexity: { tabId: 'tab-perplexity', lastHeartbeat: Date.now() },
        },
      }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const prev = process.env.GUARDIAN_URL;
    process.env.GUARDIAN_URL = `http://127.0.0.1:${server.address().port}`;
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agent-chat'))];
    const A = require(path.join(ROOT, 'lib', 'agent-chat'));
    try {
      const r = await A.listAgents();
      assert.strictEqual(r.ok, true, 'a reachable guardian with real connected providers must report ok:true');
      const live = r.agents.filter(a => a.state === 'live').map(a => a.provider).sort();
      assert.deepStrictEqual(live, ['chatgpt', 'gemini', 'perplexity'], `expected the 3 connected providers live, got: ${JSON.stringify(live)}`);
      const claude = r.agents.find(a => a.provider === 'claude');
      assert.strictEqual(claude.state, 'registered-not-connected', 'claude is known but not connected in this fixture');
      const chatgpt = r.agents.find(a => a.provider === 'chatgpt');
      assert.strictEqual(chatgpt.tabId, 'tab-chatgpt');
    } finally {
      server.close();
      if (prev) process.env.GUARDIAN_URL = prev; else delete process.env.GUARDIAN_URL;
      delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agent-chat'))];
    }
  });

  await test('AC-007', 'THE HOP CAP: a chain already at maxHops is refused', async () => {
    const hops = Array.from({ length: AC.DEFAULT_MAX_HOPS }, (_, i) => `agent${i}`);
    const r = await AC.ask('chatgpt', 'go', { hops, from: 'claude' });
    assert.strictEqual(r.ok, false);
    assert.ok(/hop cap/.test(r.error), `expected a hop-cap error, got: ${r.error}`);
    assert.ok(Array.isArray(r.hops), 'the hops chain must be ATTACHED — a bounded loop that says nothing is half-solved');
  });

  await test('AC-007b', 'THE HOP CAP: a provider already in the chain (a real cycle) is refused even under maxHops', async () => {
    const r = await AC.ask('chatgpt', 'go', { hops: ['claude', 'chatgpt'], from: 'claude' });
    assert.strictEqual(r.ok, false);
    assert.ok(/already in this chain/.test(r.error), `expected a cycle-specific error, got: ${r.error}`);
  });

  await test('AC-008', 'a hop under the cap is attempted, and a miss is stated not silent', async () => {
    const prev = process.env.GUARDIAN_URL;
    process.env.GUARDIAN_URL = 'http://127.0.0.1:1';
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agent-chat'))];
    const A = require(path.join(ROOT, 'lib', 'agent-chat'));
    const r = await A.ask('chatgpt', 'hello', { from: 'claude' });
    assert.strictEqual(r.ok, false);
    assert.ok(!/hop cap/.test(r.error), 'this was a reachability failure, not a loop refusal');
    assert.ok(Array.isArray(r.hops), 'the hops chain must be attached even on a dispatch failure');
    if (prev) process.env.GUARDIAN_URL = prev; else delete process.env.GUARDIAN_URL;
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agent-chat'))];
  });

  // ── THE ONE THAT MATTERS ──────────────────────────────────────────────────
  await test('AC-009', 'NO GATE RAN \u2192 UNVERIFIED, and unverified NEVER reads as approved', async () => {
    const v = await AC.checkAgainstSystem('some output', { intent: 'build', action: 'nonexistent-action-xyz' });
    if (v.verified === true) throw new Error('a pass was reported \u2014 check which gate actually ran');
    if (v.verified === null) {
      assert.ok(/UNVERIFIED/.test(v.reason), 'the reason must say unverified in words');
      assert.ok(v.actionable, 'and say what to do about it');
    }
  });

  await test('AC-010', 'AN AGENT CANNOT ACCEPT ITSELF \u2014 the verdict is IDENTICAL whatever it claims (\u00a7IP-5)', async () => {
    // The invariant, tested directly: run the SAME output through the SAME
    // gates twice, once with the agent claiming success and once claiming
    // failure. `verified` must be byte-identical both times. If an agent's
    // self-assessment can move the verdict by even one field, the gate is
    // decorative and the loop is an echo chamber.
    //
    // (The first version of this test asserted a boolean against a boolean
    // EXPRESSION and was meaningless \u2014 it passed or failed for reasons
    // unrelated to the property. Rewritten to test the actual invariant.)
    const claimsTrue  = await AC.checkAgainstSystem('output', { intent: 'build', agentClaim: true });
    const claimsFalse = await AC.checkAgainstSystem('output', { intent: 'build', agentClaim: false });

    assert.strictEqual(claimsTrue.verified, claimsFalse.verified,
      'the agent\u2019s claim changed the verdict \u2014 the gate is decorative');
    assert.strictEqual(claimsTrue.reason, claimsFalse.reason,
      'the claim changed the stated reason');

    assert.strictEqual(claimsTrue.claimed, true,  'the claim is still RECORDED...');
    assert.strictEqual(claimsFalse.claimed, false, '...on both paths');
    assert.ok('agreement' in claimsTrue && 'agreement' in claimsFalse,
      'and remains comparable against the verdict');
  });

  await test('AC-011', 'DISAGREEMENT IS SURFACED \u2014 the most useful signal is never averaged away', async () => {
    const v = await AC.checkAgainstSystem('output', { intent: 'build', agentClaim: true });
    if (v.verified === false && v.claimed === true) {
      assert.strictEqual(v.agreement, false);
      assert.ok(/gate\u2019s reason|gate's reason/.test(v.actionable),
        'when an agent asserts success the gate refused, the next prompt must be the GATE\u2019s reason');
    } else {
      assert.ok('agreement' in v, 'the comparison must exist even when they agree');
    }
  });

  await test('AC-012', 'every gate failure is recorded as UNRUN, never as passed', async () => {
    const v = await AC.checkAgainstSystem('x', { intent: 'build' });
    for (const [name, g] of Object.entries(v.gates)) {
      if (g && g.ran === false) {
        assert.ok(g.note || g.error, `gate '${name}' reported unrun with no reason`);
        assert.notStrictEqual(g.pass, true, `gate '${name}' was unrun but marked pass`);
      }
    }
  });

  await test('AC-013', 'iterate() HALTS on an unverifiable gate rather than spinning', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: 'here is my confident answer' }));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const prev = process.env.GUARDIAN_URL;
    process.env.GUARDIAN_URL = `http://127.0.0.1:${server.address().port}`;
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agent-chat'))];
    const A = require(path.join(ROOT, 'lib', 'agent-chat'));
    try {
      const r = await A.iterate({ provider: 'chatgpt', prompt: 'build it', intent: 'build', maxRounds: 3 });
      assert.strictEqual(r.ok, false, 'an unverifiable loop must not report success');
      assert.ok(r.rounds.length >= 1);
      assert.ok(r.reason, 'and must say why it stopped');
      assert.ok(r.rounds.length <= 3, 'the round cap must hold');
    } finally {
      server.close();
      if (prev) process.env.GUARDIAN_URL = prev; else delete process.env.GUARDIAN_URL;
      delete require.cache[require.resolve(path.join(ROOT, 'lib', 'agent-chat'))];
    }
  });

  await test('AC-014', 'health() states the wake word and hop cap \u2014 discoverable, not folklore', () => {
    const h = AC.health();
    assert.ok(h.wakeWord && /hey nexus/i.test(h.wakeWord));
    assert.strictEqual(typeof h.defaultMaxHops, 'number');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
