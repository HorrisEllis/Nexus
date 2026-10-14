'use strict';
/**
 * tests/modules/test-route-eligibility.test.js — RT1 (docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec):
 * a route is eligibility, then preference. lib/route-eligibility.js · lib/model-door.js route.
 * James: "and we have intent routing? that way the complex reasoning can be done by the bigger models or agents. like
 * claude or deepseek?" · "yes we need to get it all working."
 *
 *   RE-01  what a job needs: explicit tools win; a kind names a tool only as a whole segment (map:phase-files names none);
 *          its size from the message, or stated
 *   RE-02  the map's proof: an agent without the browser tool is never routed browser work, whatever its learned score
 *          and even when preferred; the record lists what it rejected and why
 *   RE-03  a packet bigger than an agent's window removes it (Ollama's 16k), the bigger agents keep the job
 *   RE-04  Guardian's readiness removes an agent that cannot answer now; a tab that is not open only goes later
 *   RE-05  nothing eligible → ok:false with every reason, no route (never a silent send to an agent that cannot)
 *   RE-06  the record: reason, alternatives, confidence (untried → low; learned → its rate), fallback, verification
 *   RE-07  the facts are Guardian's: provider nodes state tools and contextTokens, valid against schema.provider, and
 *          they are part of the agent-facts hash Clear Glass's cache is stamped with; a fact not stated never removes
 *   RE-08  wired: copilot passes readiness; the command, the API and the Routing page show the route and its rejections
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const E = require(path.join(ROOT, 'lib/route-eligibility.js'));
const MD = require(path.join(ROOT, 'lib/model-door.js'));
const PR = require(path.join(ROOT, 'lib/pipeline-routing.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}
const resolve = (p) => (p === 'ollama' ? { backend: 'ollama', agent: null } : p === 'copilot' ? { backend: 'copilot', agent: null } : { backend: 'guardian', agent: p });
const policy = PR.policyFrom({ mode: 'learned', chain: 'ollama,gemini,claude,copilot', ollama_models: 'qwen2.5-coder:7b', learn_min_records: 4, breaker_threshold: 50 });
const oks = (kind, provider, n) => Array.from({ length: n }, () => ({ jobType: kind, provider, outcome: 'ok', at: Date.now() }));

(async () => {
  console.log('\ntest-route-eligibility — eligibility, then preference (RT1)');

  await test('RE-01', 'what a job needs', () => {
    assert.deepStrictEqual(E.needsOf({ kind: 'agent:browser' }).tools, ['browser']);
    assert.deepStrictEqual(E.needsOf({ kind: 'map:phase-files' }).tools, [], 'map:phase-files names no tool');
    assert.deepStrictEqual(E.needsOf({ kind: 'build:file.js' }).tools, []);
    assert.deepStrictEqual(E.needsOf({ kind: 'agent:browser', needs: { tools: 'files,shell' } }).tools, ['files', 'shell'], 'explicit wins');
    assert.strictEqual(E.needsOf({ message: 'x'.repeat(350) }).tokens, 100);
    assert.strictEqual(E.needsOf({ message: 'x', needs: { tokens: 5000 } }).tokens, 5000);
  });

  await test('RE-02', 'no browser tool → never routed browser work, whatever its score, even preferred; said in the record', () => {
    const records = [...oks('agent:browser', 'gemini', 12), ...oks('agent:browser', 'ollama:qwen2.5-coder:7b', 12)];
    const r = MD.route({ kind: 'agent:browser', preferAgent: 'gemini', message: 'open the settings page and click save', policy, records }, { resolve });
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepStrictEqual(r.route.map(h => h.provider), ['copilot'], 'only the agent with the browser tool');
    for (const p of ['gemini', 'ollama:qwen2.5-coder:7b', 'claude']) {
      const x = r.record.rejected.find(y => y.provider === p);
      assert.ok(x && x.requirement === 'tools' && /cannot use browser/.test(x.why), `${p} rejected with why`);
    }
    assert.strictEqual(r.record.chosen, 'copilot'); assert.deepStrictEqual(r.record.needs.tools, ['browser']);
    // the same job without the requirement: the learned order stands (preference is untouched by RT1)
    const plain = MD.route({ kind: 'agent:browse-free', preferAgent: 'gemini', policy, records: [] }, { resolve });
    assert.strictEqual(plain.route[0].provider, 'gemini'); assert.strictEqual(plain.rejected.length, 0);
  });

  await test('RE-03', 'a packet bigger than a window removes that agent; the bigger ones keep the job', () => {
    const r = MD.route({ kind: 'agent:reason', policy, needs: { tokens: 60000 }, records: [] }, { resolve });
    const kept = r.route.map(h => h.provider);
    assert.ok(!kept.some(p => p.startsWith('ollama')), 'Ollama (16k) is out');
    assert.ok(kept.includes('claude') && kept.includes('gemini'), JSON.stringify(kept));
    const o = r.record.rejected.find(x => x.provider.startsWith('ollama'));
    assert.ok(o && o.requirement === 'context' && /60000 tokens does not fit its 16384-token window/.test(o.why), JSON.stringify(o));
  });

  await test('RE-04', "Guardian's readiness removes an agent that cannot answer now; a closed tab only goes later", () => {
    const ready = { gemini: { ready: false, why: 'gemini needs a sign-in in its Clear Glass tab (login wall)' }, claude: { ready: true, why: 'claude has no tab yet — it is opened when the job comes' } };
    const r = MD.route({ kind: 'agent:chat', policy, records: [] }, { resolve, ready, tabs: { claude: 'disconnected', gemini: 'connected' } });
    const g = r.record.rejected.find(x => x.provider === 'gemini');
    assert.ok(g && g.requirement === 'availability' && /sign-in/.test(g.why));
    assert.ok(r.route.some(h => h.provider === 'claude'), 'claude stays (its tab is opened when the job comes)');
    assert.ok(/no claude tab open/.test(r.route.find(h => h.provider === 'claude').why), 'and is tried after the agents that have one');
  });

  await test('RE-05', 'nothing eligible → ok:false with every reason, and no route', () => {
    const r = MD.route({ kind: 'agent:chat', policy: PR.policyFrom({ mode: 'learned', chain: 'ollama,gemini' }), needs: { tools: 'shell' }, records: [] }, { resolve });
    assert.strictEqual(r.ok, false); assert.deepStrictEqual(r.route, []);
    assert.match(r.error, /no agent meets this job's requirements/); assert.match(r.error, /gemini: cannot use shell/);
    assert.ok(r.record.rejected.length >= 2);
  });

  await test('RE-06', 'the record: reason, alternatives, confidence, fallback, verification', () => {
    const u = MD.route({ kind: 'agent:chat', policy, records: [] }, { resolve }).record;
    assert.deepStrictEqual([u.confidence.value, u.confidence.low], [null, true]);
    assert.ok(u.reason && u.chosen && u.fallback === u.alternatives[0].provider && /contract-gates/.test(u.verification));
    const recs = [...oks('page:void', 'claude', 6), { jobType: 'page:void', provider: 'claude', outcome: 'failed', at: Date.now() }];
    const l = MD.route({ kind: 'page:void', policy, records: recs }, { resolve }).record;
    assert.strictEqual(l.chosen, 'claude', JSON.stringify(l));
    assert.strictEqual(l.confidence.value, 0.86); assert.strictEqual(l.confidence.low, false); assert.match(l.confidence.basis, /6 ok \/ 1 failed/);
  });

  await test('RE-07', "the facts are Guardian's: stated on its provider nodes, valid, hashed; unstated never removes", () => {
    const S = require(path.join(ROOT, 'lib/node-schemas.js'));
    const NE = require(path.join(ROOT, 'lib/node-export.js'));
    const A = require(path.join(ROOT, 'guardian/lib/agent-facts.js'));
    for (const f of fs.readdirSync(A.dir())) {
      const d = NE.importFromFile(path.join(A.dir(), f));
      assert.ok(Array.isArray(d.payload.tools) && d.payload.tools.every(t => E.TOOLS.includes(t)) && d.payload.contextTokens > 0, f);
      assert.ok(S.checkPayload('provider', d.payload).ok, f);
    }
    const facts = A.facts();
    assert.notStrictEqual(A.hash(facts.providers.map(p => p.id === 'claude' ? { ...p, tools: ['text'] } : p)), facts.hash, 'tools are facts: a change changes the stamp');
    assert.match(E.factsOf('perplexity').source, /Guardian's provider node/);
    const r = E.check([{ provider: 'mystery' }], { tools: ['browser'], tokens: 999999 }, {});
    assert.strictEqual(r.eligible.length, 1); assert.match(r.eligible[0].eligibility, /not stated/);
  });

  await test('RE-08', 'wired: copilot passes readiness; the command, the API and the Routing page show it', () => {
    const srv = fs.readFileSync(path.join(ROOT, 'copilot/server.js'), 'utf8');
    assert.ok(/guardianReady\(\{ url: GD_URL \}\)/.test(srv) && /tabs, ready \}\)/.test(srv), 'copilot asks guardian who is ready');
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(api.includes('out.door = '), 'route.assess returns the door\'s route');
    const CMD = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = (CMD.SPEC || CMD.ROUTES || CMD).find ? (CMD.SPEC || CMD.ROUTES || CMD).find(x => x.key === 'route.assess') : null;
    assert.ok(row && /--tools/.test(row.usage), 'route assess takes --tools/--tokens');
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/settings.html'), 'utf8');
    assert.ok(ui.includes('id="rt-try"') && ui.includes("post('/api/route/assess'"), 'the Routing page: Try a route');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
