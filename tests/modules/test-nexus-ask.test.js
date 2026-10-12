'use strict';
/**
 * tests/modules/test-nexus-ask.test.js — 0.59.11. James: "okay. now. make it useful like; hooked into copilot so you can
 * talk to nexus". Map: docs/2026-10-10-copilot-talk-to-nexus-phasemap.spec (TN1–TN3).
 * Plain words that mean a Nexus command run it, no model; a command's answer is the row's own printed text.
 */
const assert = require('assert');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const A = require(path.join(ROOT, 'copilot/lib/nexus-ask.js'));
const LC = require(path.join(ROOT, 'lib/listener-commands.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack}`); failed++; } }

(async () => {
  const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
  const row = (k) => RC.SPEC.find(r => r.key === k);

  await test('NA-01', 'TN1: a row\'s own printer, as plain text — no colour codes, the terminal\'s words; console is restored', async () => {
    const log = console.log;
    const t = RC.renderText(row('perf'), { report: { level: 'ok', reasons: [], current: { system: { totalMem: 17e9, freeMem: 3.3e9, freeMemPct: 0.19, cpuPct: 0.12 } } } });
    assert.match(t, /^ok\n\s+memory\s+3\.1GB free of 15\.8GB/);
    assert.match(t, /cpu\s+12%/);
    assert.ok(!/\x1b\[/.test(t), 'no ANSI');
    assert.strictEqual(console.log, log);
    assert.strictEqual(RC.renderText({ print: () => { throw new Error('x'); } }, {}), null, 'a printer that throws gives null');
    assert.strictEqual(console.log, log, 'restored after a throw too');
  });

  await test('NA-02', 'TN1: a watched chat / listener answer uses the printed text before the JSON', () => {
    assert.strictEqual(LC.summary({ line: 'perf', text: 'ok\n  memory 3.1GB free', result: { report: {} } }), 'nexus> perf\nok\n  memory 3.1GB free');
  });

  await test('NA-03', 'TN2: plain words reach the right row and flags', async () => {
    const cases = {
      "what's unbuilt?": 'census --limit 10 --specs unbuilt',
      'which specs are partial': 'census --limit 10 --specs partial',
      'how many phases are open?': 'census --limit 10 --verdict open',
      'show me contradicted phases': 'census --limit 10 --verdict contradicted',
      "what's left": 'census --limit 10 --verdict open',
      'which models are loaded?': 'models',
      "how's memory?": 'perf',
      'cpu usage': 'perf',
      "what's been happening": 'activity --limit 15',
      'what failed': 'activity --limit 15 --status failed',
      'which systems are up': 'nerve',
      'how big is the store': 'store',
      'what did I pick': 'picks',
      'who am i': 'access',
      'what did ollama say': 'ollama tape',
      'what is each window doing': 'field windows',
      'idea: a gig that builds booking sites': 'dump "a gig that builds booking sites"',
    };
    for (const [q, line] of Object.entries(cases)) { const m = await A.match(q); assert.ok(m, q); assert.strictEqual(m.line, line, q); }
  });

  await test('NA-04', 'TN2: ordinary talk reaches no command — it goes to the model as before', async () => {
    for (const q of ['hello', 'help me with jobs', 'tell me about this page', 'visit bing.com', 'what do you see', 'i want to go to bed',
      'write me a cover letter for this job', 'what can you do', 'open indeed.com and find remote support jobs', 'what is my model of james',
      'nexus> census', '/help', `${'how is memory '.repeat(30)}?`]) assert.strictEqual(await A.match(q), null, q);
  });

  await test('NA-05', 'TN2: answer() runs the row through the command tool and says the command he can type', async () => {
    const calls = [];
    const tool = { execute: async (i, ctx) => { calls.push([i, ctx]); return { command: 'census', text: '1232 phases: 563 shelf', result: {} }; } };
    const r = await A.answer("what's unbuilt?", { tool });
    assert.deepStrictEqual(calls[0][0], { action: 'run', command: 'census', args: [], flags: { limit: 10, specs: 'unbuilt' } });
    assert.strictEqual(calls[0][1].agent, 'copilot');
    assert.strictEqual(r.text, '⌘ Nexus · census\n1232 phases: 563 shelf\n— nexus> census --limit 10 --specs unbuilt');
    const no = await A.answer('who am i', { tool: { execute: async () => ({ refused: true, reason: 'that is the person\'s' }) } });
    assert.ok(/✗ that is the person's/.test(no.text) && no.refused && !no.ok);
    assert.strictEqual(await A.answer('hello', { tool }), null);
  });

  await test('NA-06', 'TN3: in the pane, "what\'s unbuilt?" is answered by Nexus — the model is never asked', async () => {
    const prompts = [];
    const cop = await new Promise(res => { const s = http.createServer((q, rs) => { prompts.push(1); rs.end(JSON.stringify({ text: 'model' })); }); s.listen(0, '127.0.0.1', () => res(s)); });
    const CoPilotBridge = require(path.join(ROOT, 'clear-glass/src/copilot/bridge.js'));
    const settings = (v) => ({ get: () => v, copilotDirectUrl: (p) => `http://127.0.0.1:${cop.address().port}${p}`, guardianDirectUrl: (p) => `http://127.0.0.1:1${p}`, ollamaDirectUrl: (p) => `http://127.0.0.1:1${p}` });
    const b = new CoPilotBridge({ sse: { emit: () => {} }, apiSettings: settings({ copilotRemember: false }) });
    b._liveToolsPrompt = async () => '';
    b._nexusAsk = { answer: (m, o) => A.answer(m, { ...o, tool: { execute: async () => ({ text: '78 unbuilt' }) } }) };
    const r = await b.send({ message: "what's unbuilt?", agentId: 'w1', domContext: {} });
    assert.strictEqual(r.route.modelUsed, 'nexus');
    assert.match(r.text, /^⌘ Nexus · census\n78 unbuilt/);
    assert.strictEqual(prompts.length, 0);
    const off = new CoPilotBridge({ sse: { emit: () => {} }, apiSettings: settings({ copilotRemember: false, copilotNexusAsk: false }) });
    off._liveToolsPrompt = async () => ''; off._nexusAsk = b._nexusAsk;
    await off.send({ message: "what's unbuilt?", agentId: 'w1', domContext: {} });
    assert.strictEqual(prompts.length, 1, 'copilotNexusAsk: false → the model, as before');
    cop.close();
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
