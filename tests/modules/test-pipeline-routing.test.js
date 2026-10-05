'use strict';
/**
 * tests/modules/test-pipeline-routing.test.js — 0.39.286 RG1–RG4 (docs/2026-10-01-routing-registry-genesis-phasemap.spec)
 *
 * James: "can we have full options for fallback logic, routing. what could improve stability with the pipeline?"
 *   PR-0x  lib/pipeline-routing.js: modes, chain, block fallback, classify, fallback_on, the breaker
 *   PR-1x  chunk-dispatch walks the route: A down, B down, C answers → C built it, three hops kept; login stops
 *   PR-2x  GET /api/routing and /api/routing/plan through idearium's real router; config routing.*; the wiring
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

(async () => {
  console.log('\ntest-pipeline-routing\n');
  try {
    const PR = require(path.join(ROOT, 'lib/pipeline-routing.js'));
    PR.breaker.reset();
    const pol = PR.policyFrom({ mode: 'chain', chain: 'ollama,gemini,chatgpt,claude', max_hops: 3 });
    const blk = { id: 'api', agent: 'claude', fallback: ['deepseek'] };
    const r1 = PR.plan({ preferAgent: 'chatgpt', block: blk, policy: pol });
    check('PR-01 chain: the chosen agent, the block\'s own fallback, then the chain — de-duplicated, capped at max_hops', r1.route.map(x => x.provider).join() === 'chatgpt,deepseek,ollama' && r1.beyond.join() === 'gemini,claude', JSON.stringify(r1));
    const r2 = PR.plan({ preferAgent: 'chatgpt', policy: PR.policyFrom({ mode: 'local-first', chain: 'gemini' }) });
    const r3 = PR.plan({ preferAgent: 'chatgpt', policy: PR.policyFrom({ mode: 'fixed' }) });
    check('PR-02 local-first puts ollama first; fixed is the chosen agent alone', r2.route[0].provider === 'ollama' && r2.route[1].provider === 'chatgpt' && r3.route.length === 1 && r3.route[0].provider === 'chatgpt');
    const r4 = PR.plan({ preferAgent: 'chatgpt', policy: PR.policyFrom({ mode: 'economy', chain: 'ollama,gemini' }), records: [
      ...Array(30).fill({ jobType: 'build:chunk', provider: 'gemini', outcome: 'ok' }), ...Array(30).fill({ jobType: 'build:chunk', provider: 'chatgpt', outcome: 'failed' })] });
    check('PR-03 economy orders by what has worked (30 ok for gemini, 30 failed for chatgpt)', r4.route[0].provider === 'gemini' && /economy/.test(r4.route[0].why), JSON.stringify(r4.route));
    const r5 = PR.plan({ preferAgent: 'nosuchbot', policy: pol });
    check('PR-04 an unknown provider is skipped with the reason, never silently', r5.skipped.some(s => s.provider === 'nosuchbot' && /not a known provider/.test(s.why)));
    const C = (e) => PR.classify({ ok: false, error: e });
    check('PR-05 classify: login · rate-limit · provider-down (ECONNREFUSED is not "refused") · truncated · timeout · refused · empty',
      C('please log in to continue') === 'login' && C('429 Too Many Requests') === 'rate-limit' && C('connect ECONNREFUSED 127.0.0.1:3749') === 'provider-down'
      && C('exceeded outer wall-clock attempt cap — last check: mid_sentence_end') === 'truncated' && C('request timed out') === 'timeout' && C('I refuse to do that') === 'refused' && C('reply was empty') === 'empty',
      ['please log in', '429 Too Many Requests', 'ECONNREFUSED', 'mid_sentence_end', 'timed out', 'refuse', 'empty'].map(C).join());
    check('PR-06 fallback_on: login never falls through; a class left out stops', !PR.shouldFallback('login', PR.policyFrom({ fallback_on: 'login,empty' })) && PR.shouldFallback('empty', pol) && !PR.shouldFallback('refused', PR.policyFrom({ fallback_on: 'empty' })));
    let t = 1000;
    const bp = PR.policyFrom({ breaker_threshold: 2, breaker_cooldown_ms: 500 });
    PR.breaker.failure('gemini', 'provider-down', bp, t); PR.breaker.failure('gemini', 'provider-down', bp, t);
    const skipped = PR.plan({ preferAgent: 'gemini', policy: PR.policyFrom({ mode: 'chain', chain: 'ollama' }), now: t + 10 });
    const after = PR.plan({ preferAgent: 'gemini', policy: PR.policyFrom({ mode: 'chain', chain: 'ollama' }), now: t + 600 });
    PR.breaker.failure('claude', 'truncated', bp, t); PR.breaker.failure('claude', 'truncated', bp, t);
    check('PR-07 breaker: two failures open it, the plan skips it (with why), it closes after the cooldown; a truncated reply does not count against the provider',
      skipped.route[0].provider === 'ollama' && /breaker open/.test(skipped.skipped[0].why) && after.route[0].provider === 'gemini' && !PR.breaker.state('claude', t).open, JSON.stringify({ skipped, after: after.route }));
    PR.breaker.reset();

    // ── PR-1x the walk ──
    const { dispatchChunkWithVerification } = await import(path.join(ROOT, 'idearium/spec-engine/chunk-dispatch.js'));
    const good = 'The integration layer exposes one route and one event. Every consumer reads the registry first, then calls the contract. Failures are reported loudly on the bus with the provider named. This section is complete and ends cleanly.';
    const calls = [];
    const fn = async (prompt, o) => { calls.push(o.preferAgent || o.agent); if (o.preferAgent === 'claude') return { ok: true, text: good, agent: 'claude' }; return { ok: false, error: o.preferAgent === 'ollama' ? 'connect ECONNREFUSED 127.0.0.1:3749' : 'reply was empty' }; };
    const chunk = { chunkIdx: 1, chunkTitle: 'Integration Points', sectionId: 'integration' };
    const w = await dispatchChunkWithVerification('Describe the integration points of this component in prose.', chunk, fn, { route: ['ollama', 'gemini', 'claude'], policy: PR.policyFrom({ attempts_per_hop: 1 }) });
    check('PR-11 A down, B empty, C answers: built by C, three hops kept with each class and the order', w.ok && w.route && w.route.length === 3 && w.route[0].class === 'provider-down' && w.route[1].class === 'empty' && w.route[2].outcome === 'ok' && w.route[2].provider === 'claude',
      JSON.stringify({ ok: w.ok, err: w.error, route: w.route, calls }));
    PR.breaker.reset();
    const fl = async () => ({ ok: false, error: 'please log in to chatgpt' });
    const w2 = await dispatchChunkWithVerification('x', chunk, fl, { route: ['chatgpt', 'gemini'], policy: PR.policyFrom({ attempts_per_hop: 1 }) });
    check('PR-12 login stops the walk on the first hop (it needs you) and the error names every hop', !w2.ok && w2.route.length === 1 && w2.route[0].class === 'login' && /every route hop failed \(chatgpt: login\)/.test(w2.error), JSON.stringify(w2.route));
    PR.breaker.reset();

    // ── PR-3x learned (0.39.287): Ollama per model, outcomes per chunk type, the learned order ──
    const lp = PR.policyFrom({ chain: 'ollama,gemini', ollama_models: 'qwen2.5-coder:3b,qwen2.5-coder:7b', learn_min_records: 4 });
    const cold = PR.plan({ preferAgent: 'chatgpt', block: { id: 'api' }, policy: lp, records: [] });
    check('PR-31 learned is the default; Ollama becomes one candidate per model; below the evidence threshold it keeps the chain order and says so',
      PR.DEFAULTS.mode === 'learned' && cold.route.map(r => r.provider).join() === 'chatgpt,ollama:qwen2.5-coder:3b,ollama:qwen2.5-coder:7b' && /learning build:api — 0\/4/.test(cold.route[0].why), JSON.stringify(cold.route));
    const recs = [
      ...Array(12).fill({ jobType: 'build:api', provider: 'ollama:qwen2.5-coder:3b', outcome: 'truncated' }),
      ...Array(12).fill({ jobType: 'build:api', provider: 'ollama:qwen2.5-coder:7b', outcome: 'ok' }),
      ...Array(12).fill({ jobType: 'build:api', provider: 'chatgpt', outcome: 'failed' }),
      ...Array(12).fill({ jobType: 'build:file.js', provider: 'ollama:qwen2.5-coder:3b', outcome: 'ok' }),
    ];
    const warm = PR.plan({ preferAgent: 'chatgpt', block: { id: 'api' }, policy: lp, records: recs });
    const fileJs = PR.plan({ chunk: { realPath: 'src/a.js' }, policy: lp, records: recs });
    check('PR-32 with outcomes recorded, the model that works for THIS chunk type goes first (7b for api; 3b for .js files), with why',
      warm.route[0].provider === 'ollama:qwen2.5-coder:7b' && /12 ok \/ 0 failed/.test(warm.route[0].why) && warm.route[1].provider === 'gemini' && warm.route[2].provider === 'chatgpt' && fileJs.jobType === 'build:file.js' && fileJs.route[0].provider === 'ollama:qwen2.5-coder:3b',
      JSON.stringify({ warm: warm.route, js: fileJs.route }));
    const L = PR.learned({ records: recs });
    check('PR-33 learned(): per chunk type, each provider:model ranked by success', L['build:api'][0].provider === 'ollama:qwen2.5-coder:7b' && L['build:api'].some(x => x.provider === 'chatgpt' && x.failed === 12) && L['build:file.js'].length === 1);
    const before = require(path.join(ROOT, 'lib/economy/ledger.js')).records().filter(r => r.jobType === 'build:integration').length;
    const fm = async (prompt, o) => (o.model === 'qwen2.5-coder:7b' ? { ok: true, text: good, agent: 'ollama' } : { ok: false, error: 'reply was empty' });
    const w3 = await dispatchChunkWithVerification('Describe the integration points of this component in prose.', chunk, fm, { route: ['ollama:qwen2.5-coder:3b', 'ollama:qwen2.5-coder:7b'], policy: PR.policyFrom({ attempts_per_hop: 1 }) });
    const after2 = require(path.join(ROOT, 'lib/economy/ledger.js')).records().filter(r => r.jobType === 'build:integration');
    check('PR-34 the walk passes each hop\'s model to the agent and records every hop to the ledger under the chunk type (3b failed, 7b ok)',
      w3.ok && w3.route.length === 2 && w3.route[1].provider === 'ollama:qwen2.5-coder:7b' && after2.length - before === 2
      && after2.some(r => r.provider === 'ollama:qwen2.5-coder:3b' && r.outcome === 'failed') && after2.some(r => r.provider === 'ollama:qwen2.5-coder:7b' && r.outcome === 'ok' && r.model === 'qwen2.5-coder:7b'),
      JSON.stringify({ ok: w3.ok, route: w3.route, n: after2.length - before }));
    PR.breaker.reset();

    // ── PR-2x API, config, wiring ──
    process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
    const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
    let g = await api._route('GET', '/api/routing');
    for (let i = 0; i < 20 && g.status !== 200; i++) { await new Promise(x => setTimeout(x, 250)); g = await api._route('GET', '/api/routing'); }
    const gd = g.json.data || g.json;
    check('PR-21 GET /api/routing: the policy (learned by default), the modes and classes, and a route for every block', g.status === 200 && gd.policy.mode === 'learned' && gd.modes.length === 5 && gd.blocks.length >= 10 && gd.blocks.every(b => Array.isArray(b.route) && b.route.length), JSON.stringify(gd).slice(0, 300));
    const s = await api._route('POST', '/api/config', { key: 'routing.mode', value: 'local-first' });
    const pl = await api._route('GET', '/api/routing/plan?block=api&agent=chatgpt');
    const pd = pl.json.data || pl.json;
    check('PR-22 POST /api/config routing.mode=local-first → the plan follows (ollama first)', s.status === 200 && pl.status === 200 && pd.mode === 'local-first' && pd.route[0].provider === 'ollama', JSON.stringify(pd).slice(0, 200));
    await api._route('POST', '/api/config', { key: 'routing.mode', value: 'learned' });
    check('PR-23 an unknown block is a 404 naming the blocks', (await api._route('GET', '/api/routing/plan?block=nope')).status === 404);
    const idx = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    // §CT1 0.39.347 — the route is planned at copilot's door (/api/route); the local plan() stays as the fallback when copilot is down
    check('PR-24 speceng.build plans the route (copilot\'s door, the local plan as its fallback) and keeps it on the chunk (no hard-coded chatgpt → gemini hop)', /COPILOT_URL\}\/api\/route`, \{ kind: _PR\.jobTypeOf\(chunk\), preferAgent, block:/.test(idx) && /_PR\.plan\(\{ preferAgent, block: _blk, chunk, policy: routingPolicy \}\)/.test(idx) && /se\.recordChunkRoute\(params\.uuid, chunk\.uuid, result\.route\)/.test(idx)
      && !/fallbackAgent = body\.fallbackAgent \|\| \(preferAgent === 'chatgpt' \? 'gemini' : null\)/.test(idx));
    const lr = await api._route('GET', '/api/routing/learned');
    check('PR-26 GET /api/routing/learned: what each provider:model has done per chunk type', lr.status === 200 && (lr.json.data || lr.json).learned && (lr.json.data || lr.json).learned['build:integration'], JSON.stringify(lr.json).slice(0, 200));
    const st = fs.readFileSync(path.join(ROOT, 'idearium/ui/settings.html'), 'utf8');
    check('PR-25 the settings console has Routing & fallback, reading /api/routing and saving routing.*', /async function renderRouting\(\)/.test(st) && /api\('\/api\/routing'\)/.test(st) && /key: `routing\.\$\{key\}`/.test(st));
  } catch (e) { fail++; console.log(`  ✗ crashed: ${e.stack}`); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200);
})();
