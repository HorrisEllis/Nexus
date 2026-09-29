'use strict';
// §0.39.267 — James: "i want to be able to talk to copilot and ask what its been up to. agents tab in idearium is
// meant to build chunks, entire code bases. the agent hat is meant to be agnostic, ollama/guardian/copilot."
// Pins: one provider list; a chunk build wears its hat on every backend (copilot resolves first, nothing sent when it
// can't); WARP carries the hat through its cascade; RAID's intent check reads the worn hat; per-chunk pin/unpin;
// a spec with no repo wears the_builder; copilot answers "what have you been up to" from records; the self-test
// makes one Ollama call per run.
const fs = require('fs');
const os = require('os');
const path = require('path');
const _data = fs.mkdtempSync(path.join(os.tmpdir(), 'hat-agn-'));
const _jaa  = fs.mkdtempSync(path.join(os.tmpdir(), 'hat-agn-jaa-'));
const _nd   = fs.mkdtempSync(path.join(os.tmpdir(), 'hat-agn-nd-'));
process.env.IDEARIUM_DATA_DIR = _data;
process.env.JAA_DATA_DIR = _jaa;
process.env.NEXUS_DATA_ROOT = _nd;
process.on('exit', () => { for (const d of [_data, _jaa, _nd]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } });
// CLAUDE.md — "silence [jaa]-style logs or the runner miscounts": module chatter is dropped, the test's own lines kept.
const _log = console.log;
console.log = (...a) => { if (/^\[(jaa|chat-logger|ollama|guardian|hat-seed|hat-forge|spec-engine|idearium|IdeaOS|cortex-listeners|vector-memory|component-ledger|ledger|raid|repo-hat|hat)\b/i.test(String(a[0] || ''))) return; _log(...a); };
const assert = require('assert');
const http = require('http');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

function fake(handler) {
  return new Promise(r => {
    const s = http.createServer((req, res) => {
      let b = ''; req.on('data', d => b += d);
      req.on('end', () => { res.setHeader('Content-Type', 'application/json'); handler(req, b ? JSON.parse(b) : null, res); });
    });
    s.listen(0, '127.0.0.1', () => r(s));
  });
}
const close = s => new Promise(r => s.close(r));
const HAT = { name: 'repo:demo', personaPrompt: 'You are the demo project\'s own agent. Stay inside it.' };

async function main() {
  const P = require('../../lib/agent-providers.js');

  await test('H-001', 'one provider list: copilot, ollama, then every guardian agent on disk; aliases fold', () => {
    const all = P.all();
    assert.deepStrictEqual(all.slice(0, 2), ['copilot', 'ollama']);
    for (const g of ['chatgpt', 'claude', 'gemini', 'perplexity', 'deepseek']) assert.ok(all.includes(g), g);
    assert.ok(!all.includes('memory') && !all.includes('nexus-wake') && !all.includes('chat-stream'), 'non-agent userscripts are not agents');
    assert.strictEqual(P.normalize('Mistral'), 'ollama');
    assert.strictEqual(P.normalize('auto'), 'copilot');
    assert.strictEqual(P.backendOf('gemini'), 'guardian');
  });

  // Guardian + copilot fakes. Ports are read at module load, so each scenario imports a fresh agent-suite.
  let guardianGot = [];
  const guardian = await fake((req, body, res) => { guardianGot.push({ url: req.url, body }); res.end('{"ok":true,"jobId":"job-1"}'); });
  let resolveTo = { ok: true, backend: 'guardian', agent: 'gemini' };
  const copilot = await fake((req, body, res) => {
    if (req.url === '/api/prompt/resolve') return res.end(JSON.stringify(resolveTo));
    res.statusCode = 404; res.end('{}');
  });
  let ollamaGot = [];
  const ollama = await fake((req, body, res) => {
    ollamaGot.push({ url: req.url, body });
    if (req.url === '/api/generate') {
      if (body && body.stream) { res.setHeader('Content-Type', 'application/x-ndjson'); return res.end(JSON.stringify({ response: 'built by ollama', done: false }) + '\n' + JSON.stringify({ response: '', done: true }) + '\n'); }
      return res.end(JSON.stringify({ response: 'built by ollama', done: true }));
    }
    res.end('{}');
  });
  process.env.GUARDIAN_PORT = String(guardian.address().port);
  process.env.COPILOT_URL = `http://127.0.0.1:${copilot.address().port}`;
  process.env.OLLAMA_HOST = `http://127.0.0.1:${ollama.address().port}`;
  process.env.OLLAMA_PORT = String(ollama.address().port);
  delete require.cache[require.resolve('../../lib/agent-providers.js')];
  const suite = await import('../../idearium/agent-suite/index.js?hat=' + Date.now());

  await test('H-002', 'a guardian build wears the hat: persona on top of the chunk prompt, exact provider', async () => {
    guardianGot = [];
    const r = await suite.buildChunkWithAgent('write lib/a.js', { preferAgent: 'perplexity', hat: HAT });
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.agent, 'perplexity');
    assert.strictEqual(r.hat, 'repo:demo');
    assert.strictEqual(guardianGot[0].body.provider, 'perplexity');
    assert.ok(guardianGot[0].body.prompt.startsWith(HAT.personaPrompt), 'persona first');
    assert.ok(guardianGot[0].body.prompt.endsWith('write lib/a.js'), 'chunk prompt kept');
  });

  await test('H-003', "'copilot' asks copilot where to go, sends there wearing the same hat, and reports the real provider", async () => {
    guardianGot = []; resolveTo = { ok: true, backend: 'guardian', agent: 'gemini' };
    const r = await suite.buildChunkWithAgent('write lib/b.js', { preferAgent: 'copilot', hat: HAT });
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.agent, 'gemini', 'provenance is the model that answered, not "copilot"');
    assert.strictEqual(r.via, 'copilot');
    assert.strictEqual(guardianGot[0].body.provider, 'gemini');
    assert.ok(guardianGot[0].body.prompt.startsWith(HAT.personaPrompt));
  });

  await test('H-004', "'copilot' resolving to ollama: the hat goes into the system prompt, the repo's model is used", async () => {
    ollamaGot = []; resolveTo = { ok: true, backend: 'ollama' };
    const r = await suite.buildChunkWithAgent('write lib/c.js', { preferAgent: 'auto', hat: HAT, model: 'huihui_ai/qwen2.5-coder-abliterate:3b' });
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.agent, 'ollama');
    const gen = ollamaGot.find(x => x.url === '/api/generate');
    assert.ok(gen, 'ollama was called');
    assert.strictEqual(gen.body.model, 'huihui_ai/qwen2.5-coder-abliterate:3b');
    const sent = gen.body.system ? `${gen.body.system}\n${gen.body.prompt}` : gen.body.prompt;
    assert.ok(sent.includes(HAT.personaPrompt), 'persona reached ollama');
  });

  await test('H-005', "copilot unreachable: nothing is sent anywhere, and the error says why", async () => {
    guardianGot = []; ollamaGot = [];
    const saved = process.env.COPILOT_URL;
    process.env.COPILOT_URL = 'http://127.0.0.1:1';
    delete require.cache[require.resolve('../../lib/agent-providers.js')];
    const r = await suite.buildChunkWithAgent('x', { preferAgent: 'copilot', hat: HAT });
    process.env.COPILOT_URL = saved;
    delete require.cache[require.resolve('../../lib/agent-providers.js')];
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /copilot/);
    assert.strictEqual(guardianGot.length + ollamaGot.length, 0);
  });

  await test('H-006', 'an unknown agent is refused by name, never redirected', async () => {
    const r = await suite.buildChunkWithAgent('x', { preferAgent: 'bard' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /unknown agent "bard"/);
  });

  await test('H-007', 'WARP: preferred copilot/perplexity is honoured and every cascade attempt carries the hat and model', async () => {
    const { providersFor } = require('../../lib/seam/adapters/warp-cascade.js');
    assert.strictEqual(providersFor({ preferredProvider: 'perplexity' })[0], 'perplexity');
    assert.strictEqual(providersFor({ preferredProvider: 'copilot' })[0], 'copilot');
    assert.strictEqual(providersFor({ preferredProvider: 'mistral' })[0], 'ollama');
    const calls = [];
    const fakeAs = { buildChunkWithAgent: async (prompt, o) => { calls.push(o); return { ok: true, text: 'content for ' + prompt.slice(0, 10) }; } };
    const { createWarpChunkDispatch } = await import('../../idearium/spec-engine/warp-build-dispatch.js');
    const dispatch = createWarpChunkDispatch(fakeAs, {});
    const r = await dispatch('unique prompt ' + Date.now(), { preferAgent: 'copilot', hat: HAT, model: 'm:3b', chunkTitle: 't' });
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(calls[0].preferAgent, 'copilot');
    assert.strictEqual(calls[0].hat, HAT);
    assert.strictEqual(calls[0].model, 'm:3b');
  });

  await close(guardian); await close(copilot); await close(ollama);

  await test('H-008', "RAID's intent check reads the worn hat, whoever wears it; with no hat, the old agent rule stands", () => {
    require('../../lib/hat-seed.js').seedHats();
    const { checkAgentIntentContract } = require('../../lib/agent-intent-contract.js');
    // No hat that names ollama allows 'forge' (the_builder allows it but names only claude/chatgpt): refused.
    assert.strictEqual(checkAgentIntentContract('ollama', 'forge').ok, false);
    // Worn by ollama, the_builder's own intents decide: it may forge.
    const builder = require('../../lib/hat-forge.js').bySeedKey('the_builder');
    assert.ok(builder, 'the_builder is seeded');
    const ok = checkAgentIntentContract('ollama', 'forge', { hat: builder.uuid || builder.name });
    assert.strictEqual(ok.ok, true, ok.reason);
    assert.strictEqual(ok.matchedHat, builder.name);
    // …and its intents still bind: the_builder may not 'officiate', on any backend.
    assert.strictEqual(checkAgentIntentContract('chatgpt', 'officiate', { hat: builder.name }).ok, false);
    // a hat that isn't live is refused, not treated as unrestricted
    assert.strictEqual(checkAgentIntentContract('ollama', 'build', { hat: 'no-such-hat' }).ok, false);
  });

  await test('H-009', 'per-chunk agent: a hand pick is pinned and normalised, "" un-pins, unknown names are refused', async () => {
    const se = await import('../../idearium/spec-engine/index.js');
    const m = se.createSpec({ name: 'hat-pin-demo', description: 'd' });
    const c = m.chunks[0];
    const a = se.setChunkAgent(m.uuid, c.uuid, 'Mistral');
    assert.strictEqual(a.agent, 'ollama'); assert.strictEqual(a.agentPinned, true);
    const b = se.setChunkAgent(m.uuid, c.uuid, 'copilot');
    assert.strictEqual(b.agent, 'copilot');
    const u = se.setChunkAgent(m.uuid, c.uuid, '');
    assert.strictEqual(u.agentPinned, false);
    assert.throws(() => se.setChunkAgent(m.uuid, c.uuid, 'bard'), /unknown agent/);
  });

  await test('H-010', 'a spec with no repo is built wearing the_builder; the provider is left to the chunk', async () => {
    const api = await import('../../idearium/api/index.js');
    const who = api._buildIdentity('not-a-repo-spec');
    assert.strictEqual(who.repoUuid, null);
    assert.strictEqual(who.hatSource, 'builder');
    assert.strictEqual(who.hat.name, 'the_builder');
    assert.ok(who.hat.personaPrompt.length > 0);
    assert.strictEqual(who.provider, null);
  });

  await test('H-011', 'copilot answers "what have you been up to" from its records, not a model', async () => {
    const OA = require('../../lib/ollama-activity.js');
    const before = OA.tail(1000).length;
    for (let i = 0; i < 3; i++) OA.record({ caller: `bridge job ${'abcdef0' + i} (adversarial-probe)`, op: 'generate', model: 'm:3b', promptChars: 1200, ms: 2000, ok: true });
    OA.record({ caller: 'tool ollama_generate', op: 'generate', model: 'm:3b', promptChars: 50, ms: 500, ok: false, error: 'timeout' });
    const intuition = require('../../copilot/intuition.js');
    const r = await intuition.answer('hey, what have you been up to?', {}, [{ type: 'a.b' }]);
    assert.strictEqual(r.intent, 'activity');
    assert.strictEqual(r.modelUsed, 'data-only');
    assert.match(r.text, new RegExp(`Ollama: ${before + 4} calls`));
    assert.match(r.text, /bridge job \(adversarial-probe\): 3×/);
    assert.match(r.text, /tool ollama_generate: 1× · 500ms · 1 failed/);
    const o = await intuition.answer("what's ollama been doing in the last hour", {}, []);
    assert.ok(!/Questions:/.test(o.text), 'the ollama question gets only the ollama part');
    const other = await intuition.answer('what have you done to my file', {}, []);
    assert.notStrictEqual(other && other.intent, 'activity', 'an ordinary question is not an activity question');
  });

  await test('H-012', 'the self-test makes one Ollama call per run and defaults to every 10 minutes', async () => {
    const analysis = require('../../copilot/analysis.js');
    let n = 0; const orig = analysis.answer;
    analysis.answer = async () => { n++; return { text: 'all systems online' }; };
    delete require.cache[require.resolve('../../copilot/adversarial.js')];
    const adv = require('../../copilot/adversarial.js');
    const r = await adv.run([]);
    analysis.answer = orig;
    assert.strictEqual(n, 1);
    assert.strictEqual(adv.INTERVAL_MS, 600000);
    assert.strictEqual(r.hostile.every(h => h.safe), true, JSON.stringify(r.hostile));
  });

  await test('H-013', "a reply read as rendered text (ChatGPT's 'JavaScript' header, no fences) still yields its code", () => {
    const E = require('../../lib/extract-code.js');
    const captured = "JavaScript\n/**\n * Core state and invariants for the music maker.\n */\n\nconst { validate } = require('jsonschema');\n";
    const r = E.extractCode(captured);
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.ext, '.js');
    assert.ok(r.code.startsWith('/**') && r.unfenced === true);
    assert.strictEqual(E.extractCode('JavaScript\nCopy code\nconst a = 1;').code, 'const a = 1;');
    assert.strictEqual(E.extractCode('Here is some prose, no code.').ok, false);
    assert.strictEqual(E.extractCode('javascript is great\nconst a = 1').ok, false, 'a sentence is not a label');
  });

  await test('H-014', 'a retry after a code-less reply says so, instead of "no response was received"', () => {
    const q = require('../../lib/seam/queue.js');
    const C = q.QueueCompartment || Object.values(q).find(v => typeof v === 'function' && v.prototype && v.prototype.buildRetryPrompt);
    const o = Object.create(C.prototype);
    o._lastRetryWasWatchdog = true; o.builtPrompt = 'PROMPT';
    o.stallReason = 'chatgpt: chatgpt did not return usable code: extractCode: no fenced code block found in the response';
    const t = o.buildRetryPrompt();
    assert.match(t, /your last reply arrived, but no code block could be read/);
    assert.ok(!/no response was received/.test(t));
    o.stallReason = 'socket hang up';
    assert.match(o.buildRetryPrompt(), /connection interrupted/);
  });

  await test('H-015', 'userscripts read replies with fences put back (every provider)', () => {
    for (const p of ['chatgpt', 'claude', 'gemini', 'deepseek', 'perplexity']) {
      const src = fs.readFileSync(path.join(__dirname, '../../guardian/userscript-' + p + '.js'), 'utf8');
      assert.ok(/function _replyText\(el\)/.test(src), p + ' has _replyText');
      assert.ok(/const _baseText = _baseEl \? _replyText\(_baseEl\)/.test(src), p + ' baseline uses it');
      assert.ok(!/const text = \(el\.innerText \|\| el\.textContent \|\| ''\)\.trim\(\);/.test(src), p + ' has no raw innerText reply read left');
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
