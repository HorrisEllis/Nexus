'use strict';
// §0.39.269 — James: "ollama is supposed to have persistent memory, same with the agents using the models ...
// everything is supposed to persist with agents. using the download manager." Pins: any backend's exchange lands in
// the download manager (the .response node + downloads entry via response-sink, the chat index row, chat-logger) under
// the agent that asked; Guardian's own replies are left to Guardian; recall gives an agent its own past work and the
// files built beside it, within a budget; the ollama bridge records every real job (not the self-test, not tool-loop
// rounds, not record:false); the Agent tab's memory block; chunk builds send memory, agentId, hatInPrompt, fileName;
// guardian takes the caller's word that the persona is already in the prompt; copilot's Ollama recalls and files.
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const _root = tmp('mem-root-'), _nodes = tmp('mem-nodes-'), _nd = tmp('mem-nd-'), _jaa = tmp('mem-jaa-'), _id = tmp('mem-id-');
process.env.AGENT_MEMORY_ROOT = _root;
process.env.GUARDIAN_RESPONSE_NODES_DIR = path.join(_nodes, 'nodes', 'response');
process.env.NEXUS_DATA_ROOT = _nd;
process.env.JAA_DATA_DIR = _jaa;
process.env.IDEARIUM_DATA_DIR = _id;
process.env.CLEARGL_IPC_PORT = '1';   // Clear Glass "closed": downloads entries must queue, not vanish
process.on('exit', () => { for (const d of [_root, _nodes, _nd, _jaa, _id]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } });
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
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const AM = require('../../lib/agent-memory.js');
  const IDX = require('../../clear-glass/src/downloads/artifact-chat-index.js');

  await test('M-001', 'an Ollama exchange is recorded in the download manager under the agent that asked, every sink', async () => {
    const r = await AM.record({ agentId: 'repo-r1', provider: 'ollama', model: 'm:3b', prompt: 'write src/kernel/state.js for the music maker',
      response: '```javascript\nmodule.exports = { tempo: 120 };\n```', compartmentId: 'comp-1', repoUuid: 'r1', path: 'src/kernel/state.js', kind: 'chunk' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    // chat index: the same raw shape guardian writes, filed under the agent
    const rows = IDX.queryItems(_root, { agentId: 'repo-r1' });
    assert.strictEqual(rows.length, 1);
    const it = IDX.readItem(_root, rows[0].id);
    assert.strictEqual(it.raw.provider, 'ollama');
    assert.strictEqual(it.raw.declaredFileName, 'src/kernel/state.js');
    assert.strictEqual(it.raw.codeBlockCount, 1);
    // response-sink: the .response node exists, and the downloads entry is queued (Clear Glass closed)
    assert.ok(fs.existsSync(path.join(process.env.GUARDIAN_RESPONSE_NODES_DIR, `${r.jobId}.response`)), '.response node written');
    const pending = path.join(_nodes, 'downloads-pending.jsonl');
    assert.ok(fs.existsSync(pending), 'downloads entry queued for Clear Glass');
    const entry = JSON.parse(fs.readFileSync(pending, 'utf8').trim().split('\n').pop());
    assert.strictEqual(entry.agentId, 'repo-r1');
    assert.strictEqual(entry.compartmentId, 'comp-1');
    assert.strictEqual(entry.kind, 'response');
  });

  await test('M-002', "a guardian agent's reply is not recorded twice — guardian files its own", async () => {
    const r = await AM.record({ agentId: 'repo-r1', provider: 'chatgpt', prompt: 'x', response: 'y' });
    assert.strictEqual(r.skipped, 'guardian records its own replies');
    assert.strictEqual(IDX.queryItems(_root, { agentId: 'repo-r1' }).length, 1);
  });

  await test('M-003', 'recall: the agent\'s own work (ranked by the question), files built beside it, labelled, within budget', async () => {
    await AM.record({ agentId: 'repo-r1', provider: 'ollama', prompt: 'explain the tempo clock', response: 'The tempo clock ticks every beat.' });
    await AM.record({ agentId: 'repo-other', provider: 'ollama', prompt: 'unrelated', response: 'not mine' });
    const siblings = [
      { path: 'src/kernel/state.js', content: "'use strict';\nconst x = 1;\nmodule.exports = { createState, applyNote };\nfunction createState() {}" },
      { path: 'src/kernel/types.js', content: 'export const NOTE_NAMES = [];\nexport function isNote(n) {}' },
    ];
    const m = await AM.recall({ agentId: 'repo-r1', query: 'write src/engine/composition.js using the kernel state', siblings });
    assert.match(m.text, /^\[MEMORY/);
    assert.match(m.text, /What you \(repo-r1\) have done before/);
    assert.match(m.text, /wrote src\/kernel\/state\.js \(1 lines\)/);
    assert.match(m.text, /answered: The tempo clock ticks every beat/);
    assert.ok(!/not mine/.test(m.text), "another agent's memory is not recalled");
    assert.match(m.text, /Files already built in this project/);
    assert.match(m.text, /module\.exports = \{ createState, applyNote \};/);
    assert.match(m.text, /export function isNote/);
    assert.strictEqual(m.sources.exchanges, 2);
    const small = await AM.recall({ agentId: 'repo-r1', query: 'x', siblings, budget: 300 });
    assert.ok(small.chars <= 360, `budget held: ${small.chars}`);
    const none = await AM.recall({ agentId: 'nobody', query: 'x' });
    assert.strictEqual(none.text, '', 'nothing to recall → no block at all');
  });

  await test('M-004', 'the ollama bridge records real jobs — not the self-test, not tool-loop rounds, not record:false', async () => {
    const D = require('../../ollama/lib/dispatch.js');
    const n0 = IDX.queryItems(_root, { agentId: 'copilot' }).length;
    D._remember({ uuid: 'b1', agentId: 'copilot', prompt: 'what is sigma', result: 'Sigma is drift.', intent: 'ask' }, 'm:3b');
    D._remember({ uuid: 'b2', agentId: 'copilot', prompt: 'p', result: 'probe', intent: 'adversarial-probe' }, 'm');
    D._remember({ uuid: 'b3', agentId: 'copilot', prompt: 'p', result: 'round', intent: 'tool-loop' }, 'm');
    D._remember({ uuid: 'b4', agentId: 'copilot', prompt: 'p', result: 'x', intent: 'ask', record: false }, 'm');
    D._remember({ uuid: 'b5', sessionId: 's9', prompt: 'hi', result: 'hello', intent: 'ask' }, 'm');
    await wait(300);
    const rows = IDX.queryItems(_root, { agentId: 'copilot' });
    assert.strictEqual(rows.length - n0, 1, 'only the real job');
    assert.strictEqual(IDX.readItem(_root, rows[0].id).raw.jobId, 'b1');
    assert.strictEqual(IDX.queryItems(_root, { agentId: 'copilot-s9' }).length, 1, 'no agentId → the copilot session remembers it');
  });

  await test('M-005', "the Agent tab's 'memory' block: sent when there is memory, left out when there is none, present for saved block lists", () => {
    const PB = require('../../lib/repo-prompt-blocks.js');
    assert.ok(PB.DEFAULT_BLOCKS.some(b => b.id === 'memory' && b.enabled));
    const withMem = PB.render({ persona: 'P', message: 'Q', memory: '[MEMORY — x]\nstuff\n[END MEMORY]' });
    assert.ok(withMem.used.includes('memory'));
    assert.ok(withMem.text.indexOf('[MEMORY') > withMem.text.indexOf('P') && withMem.text.indexOf('[MEMORY') < withMem.text.indexOf('Q'), 'persona, memory, question');
    const without = PB.render({ persona: 'P', message: 'Q', memory: '' });
    assert.ok(!without.used.includes('memory'));
  });

  // Chunk builds: guardian gets persona → memory → prompt, the agent id, hatInPrompt and the file name
  let got = null;
  const guardian = await fake((req, body, res) => { got = body; res.end('{"ok":true,"jobId":"g1"}'); });
  process.env.GUARDIAN_PORT = String(guardian.address().port);
  const suite = await import('../../idearium/agent-suite/index.js?mem=' + Date.now());

  await test('M-006', 'a chunk build carries memory between the hat and the prompt, and tells guardian who asked and for which file', async () => {
    const hat = { name: 'repo:music', personaPrompt: 'You are the music maker project agent.' };
    const r = await suite.buildChunkWithAgent('Write src/engine/composition.js', { preferAgent: 'chatgpt', hat,
      memory: '[MEMORY — recalled]\n- wrote src/kernel/state.js\n[END MEMORY]', agentId: 'repo-r1', fileName: 'src/engine/composition.js' });
    assert.strictEqual(r.ok, true, r.error);
    const p = got.prompt;
    assert.ok(p.indexOf(hat.personaPrompt) === 0 && p.indexOf('[MEMORY') > 0 && p.indexOf('Write src/engine') > p.indexOf('[END MEMORY]'), p);
    assert.strictEqual(got.agentId, 'repo-r1');
    assert.strictEqual(got.hatInPrompt, 'repo:music');
    assert.strictEqual(got.fileName, 'src/engine/composition.js');
  });
  await close(guardian);

  await test('M-007', "guardian takes the caller's word: a hat already in the prompt gets no guessed second persona", () => {
    const { createJobStore } = require('../../guardian/lib/jobs.js');
    const store = createJobStore();
    const a = store.createJob({ command: 'spec', provider: 'chatgpt', prompt: 'You build, bottom-up. Write the file build it now ' + Date.now(), hatInPrompt: 'the_builder' });
    assert.strictEqual(a.hat && a.hat.personaPrompt, '');
    assert.strictEqual(a.hat.personaInPrompt, true);
    assert.strictEqual(a.hat.name, 'the_builder');
    const b = store.createJob({ command: 'spec', provider: 'chatgpt', prompt: 'build and write the module now ' + Date.now() });
    assert.ok(!b.hat || b.hat.personaInPrompt !== true, 'without the flag, the old guess still applies');
    for (const j of [a, b]) { try { fs.rmSync(path.join(require('../../guardian/lib/jobs.js').JOBS_DIR, `${j.id}.job`), { force: true }); } catch (_) {} }
  });

  await test('M-008', "copilot's own Ollama answer is given its memory first, and the bridge is told whose it is", async () => {
    await AM.record({ agentId: 'copilot', provider: 'ollama', prompt: 'what did we decide about snapshots', response: 'We decided snapshots trigger on drift.' });
    let job = null;
    const bridge = await fake((req, body, res) => {
      if (req.method === 'POST' && req.url === '/api/jobs') { job = body; return res.end('{"ok":true,"jobId":"j1"}'); }
      return res.end(JSON.stringify({ job: { status: 'complete', result: 'Snapshots trigger on drift, as decided.' } }));
    });
    process.env.OLLAMA_URL = `http://127.0.0.1:${bridge.address().port}`;
    delete require.cache[require.resolve('../../copilot/lifeline.js')];
    const L = require('../../copilot/lifeline.js');
    const r = await L.dispatchToOllama('remind me about snapshots', { memory: true, agentId: 'copilot' });
    await close(bridge);
    assert.ok(r && r.ok, JSON.stringify(r));
    assert.strictEqual(job.agentId, 'copilot');
    assert.match(job.prompt, /\[MEMORY/);
    assert.match(job.prompt, /snapshots trigger on drift/);
    assert.ok(job.prompt.endsWith('remind me about snapshots'));
  });

  await test('M-009', "loom: the map's edges are the files' real requires, bootstrap runs it and skips its files in the scan (CLAUDE.md rule 3)", () => {
    const ROOT = path.join(__dirname, '..', '..');
    const { idFor } = require(path.join(ROOT, 'loom/scanners/source-map'));
    const { mapAgentMemory, FILES, CONSUMERS } = require(path.join(ROOT, 'loom/maps/agent-memory-map.js'));
    const byPath = { 'lib/agent-memory.js': ['clear-glass/src/downloads/artifact-chat-index.js', 'guardian/lib/response-sink.js', 'lib/chat-logger.js', 'lib/extract-code.js', 'lib/vector-memory.js', 'lib/agent-providers.js'],
                     'copilot/lib/activity-recall.js': ['lib/ollama-activity.js', 'copilot/adversarial.js', 'lib/scheduler.js', 'lib/triggers.js'] };
    for (const [file, id, req] of FILES) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      for (const dep of byPath[file] || []) {
        const base = path.basename(dep, '.js');
        assert.ok(new RegExp(`require\\('[^']*${base}(\\.js)?'\\)`).test(src), `${file} really requires ${dep}`);
        assert.ok(req.includes(idFor(dep)), `${file} → ${dep} is a wire in the map`);
      }
    }
    // each consumer edge is a real require in that consumer
    for (const [consumer, dep, where] of CONSUMERS) {
      const file = where.split(' ')[0];
      const base = FILES.find(f => f[1] === dep)[0].split('/').pop().replace('.js', '');
      assert.ok(new RegExp(`require\\('[^']*${base}(\\.js)?'\\)`).test(fs.readFileSync(path.join(ROOT, file), 'utf8')), `${file} requires ${base}`);
    }
    const decl = { component: [], hook: [], wire: [] };
    const out = mapAgentMemory({ declare: (k, o) => { decl[k].push(o); return { ok: true }; } });
    assert.strictEqual(out.failures.length, 0);
    assert.strictEqual(decl.component.length, 3);
    assert.ok(decl.wire.length >= 16, `wires: ${decl.wire.length}`);
    assert.ok(decl.component.every(c => /^nexus-loom-map-.*-v1-0000-2026-0927-001$/.test(c.uuid)), 'every component has a UUID (§5.1)');
    const BOOT = fs.readFileSync(path.join(ROOT, 'loom/bootstrap.js'), 'utf8');
    assert.ok(/mapAgentMemory\(driver\)/.test(BOOT) && /maps\/agent-memory-map'\)\.FILES/.test(BOOT));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
