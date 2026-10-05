'use strict';
/**
 * tests/modules/test-model-door.test.js — CT1 (docs/2026-10-05-code-tab-and-one-router-phasemap.spec), 0.39.346.
 * James: "i feel like it should use copilot regardless, have copilot figure it, and learn from it. failure modes,
 *        dynamically switch models, if its not equipped for the task" · "make sure ollama is all wired into idearium."
 *
 *   MD-01  copilot's door routes by lib/pipeline-routing's policy: each Ollama model its own hop, with backend and model
 *   MD-02  it learns: with enough outcomes for a kind of job, the model that has done it well goes first
 *   MD-03  an outcome is recorded; failures in a row open the provider's breaker and the door skips it; a success closes it
 *   MD-04  a page's ask (the void, the workshop …) goes through the door: a cut answer from one Ollama model moves to
 *          the next, each outcome sent back, the answer says which model gave it
 *   MD-05  the spec build's route walk reports each hop to the door (opts.report) and keeps no second breaker
 *   MD-06  the repo agent in the copilot position takes its provider and model from the door, switches on a cut answer,
 *          and reports each outcome
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const MD = require(path.join(ROOT, 'lib/model-door.js'));
const PR = require(path.join(ROOT, 'lib/pipeline-routing.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}
const resolve = (p) => (p === 'ollama' ? { backend: 'ollama', agent: null } : { backend: 'guardian', agent: p });
const policy = PR.policyFrom({ mode: 'learned', chain: 'ollama,gemini', ollama_models: 'small:3b,big:7b', learn_min_records: 4, breaker_threshold: 2 });

(async () => {
  await test('MD-01', 'each Ollama model its own hop, with backend and model', () => {
    const r = MD.route({ kind: 'page:void', preferAgent: 'ollama', policy, records: [] }, { resolve });
    assert.deepStrictEqual(r.route.map(h => [h.provider, h.backend, h.model]), [['ollama:small:3b', 'ollama', 'small:3b'], ['ollama:big:7b', 'ollama', 'big:7b'], ['gemini', 'guardian', null]]);
    assert.strictEqual(r.kind, 'page:void'); assert.strictEqual(r.by, 'copilot');
  });

  await test('MD-02', 'it learns: what did this kind of job well goes first', () => {
    const recs = [];
    for (let i = 0; i < 4; i++) recs.push({ jobType: 'page:void', provider: 'ollama:small:3b', outcome: 'failed', at: Date.now() });
    for (let i = 0; i < 4; i++) recs.push({ jobType: 'page:void', provider: 'ollama:big:7b', outcome: 'ok', at: Date.now() });
    const r = MD.route({ kind: 'page:void', preferAgent: 'ollama', policy, records: recs }, { resolve });
    assert.strictEqual(r.route[0].provider, 'ollama:big:7b', JSON.stringify(r.route));
    assert.match(r.route[0].why, /learned for page:void/);
  });

  await test('MD-03', 'outcomes recorded; failures open the breaker and the door skips it; a success closes it', () => {
    const p = 'ollama:flaky:1b';
    MD.outcome({ provider: p, kind: 'page:void', ok: false, class: 'timeout', policy });
    const o = MD.outcome({ provider: p, kind: 'page:void', ok: false, class: 'timeout', policy });
    assert.ok(o.breaker.open, 'two failures in a row open it');
    const pol2 = PR.policyFrom({ mode: 'chain', chain: 'ollama:flaky:1b,ollama:big:7b' });
    const r = MD.route({ kind: 'page:void', policy: pol2 }, { resolve });
    assert.ok(r.skipped.some(s => s.provider === p), 'the door skips an open breaker, and says so');
    MD.outcome({ provider: p, kind: 'page:void', ok: true, policy });
    assert.strictEqual(PR.breaker.state(p).open, false);
  });

  await test('MD-04', 'a page asks through the door; a cut answer moves to the next model', async () => {
    const outcomes = [], prompts = [];
    const srv = http.createServer((q, s) => {
      let b = ''; q.on('data', d => b += d); q.on('end', () => {
        const body = b ? JSON.parse(b) : {};
        s.setHeader('content-type', 'application/json');
        if (q.url === '/api/route') return s.end(JSON.stringify(MD.route({ ...body, records: [] }, { resolve })));
        if (q.url === '/api/route/outcome') { outcomes.push(body); return s.end(JSON.stringify(MD.outcome(body))); }
        if (q.url === '/api/prompt') {
          prompts.push(body);
          if (body.model === 'small:3b') return s.end(JSON.stringify({ ok: false, error: 'the reply was truncated mid_sentence' }));
          return s.end(JSON.stringify({ ok: true, text: `answer from ${body.model}` }));
        }
        s.statusCode = 404; s.end('{}');
      });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.COPILOT_URL = `http://127.0.0.1:${srv.address().port}`;
    process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
    const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
    const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
    // the routing policy the pages use, set the way he would in Settings
    const { setConfig } = await import(path.join(ROOT, 'idearium/lib/config.js'));
    quiet(() => { setConfig('routing.mode', 'learned'); setConfig('routing.chain', 'ollama,gemini'); setConfig('routing.ollama_models', 'small:3b,big:7b'); setConfig('repos.default_provider', 'ollama'); });
    const r = await api._agentAskForTest('a new idea', { channel: 'idearium-void', sessionId: 'void-1' });
    await new Promise(r2 => setTimeout(r2, 100));
    srv.close();
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.text, 'answer from big:7b');
    assert.strictEqual(r.by, 'ollama:big:7b'); assert.strictEqual(r.model, 'big:7b');
    assert.deepStrictEqual(r.route.map(t => [t.provider, t.ok, t.class]), [['ollama:small:3b', false, 'truncated'], ['ollama:big:7b', true, null]]);
    assert.deepStrictEqual(prompts.map(p => [p.backend, p.model]), [['ollama', 'small:3b'], ['ollama', 'big:7b']], 'each hop reached Ollama with the model the door chose');
    assert.deepStrictEqual(outcomes.map(o => [o.provider, o.ok, o.kind]), [['ollama:small:3b', false, 'page:void'], ['ollama:big:7b', true, 'page:void']], 'each outcome went back');
  });

  await test('MD-05', 'the build\'s route walk reports each hop to the door, no second breaker', async () => {
    const { dispatchChunkWithVerification } = await import(path.join(ROOT, 'idearium/spec-engine/chunk-dispatch.js'));
    const good = 'The integration layer exposes one route and one event. Every consumer reads the registry first, then calls the contract. Failures are reported loudly on the bus with the provider named. This section is complete and ends cleanly.';
    const fn = async (prompt, o) => (o.model === 'big:7b' ? { ok: true, text: good, agent: 'ollama' } : { ok: false, error: 'the reply was truncated mid_sentence' });
    const reports = [];
    PR.breaker.reset();
    const w = await dispatchChunkWithVerification('Describe the integration points.', { chunkIdx: 1, chunkTitle: 'Integration Points', sectionId: 'integration' }, fn,
      { route: ['ollama:small:3b', 'ollama:big:7b'], policy: PR.policyFrom({ attempts_per_hop: 1 }), report: (h) => reports.push(h) });
    assert.ok(w.ok, JSON.stringify(w).slice(0, 300));
    assert.deepStrictEqual(reports.map(r => [r.provider, r.ok]), [['ollama:small:3b', false], ['ollama:big:7b', true]]);
    assert.ok(reports.every(r => r.jobType === 'build:integration'));
    assert.deepStrictEqual(PR.breaker.all ? Object.keys(PR.breaker.all()).filter(k => /small|big/.test(k)) : [], [], 'reported to the door: no breaker kept here');
  });

  await test('MD-06', 'the repo agent in the copilot position: the door\'s provider and model, a switch on a cut answer, each outcome back', async () => {
    const outcomes = [], prompts = [];
    const srv = http.createServer((q, s) => {
      let b = ''; q.on('data', d => b += d); q.on('end', () => {
        const body = b ? JSON.parse(b) : {};
        s.setHeader('content-type', 'application/json');
        if (q.url === '/api/route') return s.end(JSON.stringify(MD.route({ ...body, policy, records: [] }, { resolve })));
        if (q.url === '/api/route/outcome') { outcomes.push(body); return s.end(JSON.stringify({ ok: true })); }
        if (q.url === '/api/prompt') {
          prompts.push(body);
          if (body.model === 'small:3b') return s.end(JSON.stringify({ ok: false, error: 'the reply was truncated mid_sentence' }));
          return s.end(JSON.stringify({ ok: true, text: `answer from ${body.model}` }));
        }
        s.statusCode = 404; s.end('{}');
      });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${srv.address().port}`;
    // repo-agent reads COPILOT_URL when it loads: a fresh copy for this server
    delete require.cache[require.resolve(path.join(ROOT, 'lib/repo-agent.js'))];
    process.env.COPILOT_URL = url;
    const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
    RA.setRoutingPolicySource(() => policy);
    const fs = require('fs'), os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md06-'));
    const repo = { uuid: `md06-${Date.now()}`, name: 'md06', compartmentId: 'c-md06' };
    const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
    const r = await quiet(() => RA.dispatch({ repo, repoDir: dir, message: 'hello', provider: 'auto', noContext: true }));
    await new Promise(r2 => setTimeout(r2, 150));
    srv.close();
    assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 400));
    assert.strictEqual(r.text, 'answer from big:7b');
    assert.deepStrictEqual(prompts.map(p => [p.backend, p.model]), [['ollama', 'small:3b'], ['ollama', 'big:7b']]);
    assert.strictEqual(r.switchedFrom[0].provider, 'ollama:small:3b'); assert.strictEqual(r.switchedFrom[0].class, 'truncated');
    assert.strictEqual(r.viaCopilot.provider, 'ollama:big:7b');
    assert.deepStrictEqual(outcomes.map(o => [o.provider, o.ok, o.kind]), [['ollama:small:3b', false, 'agent:chat'], ['ollama:big:7b', true, 'agent:chat']]);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
