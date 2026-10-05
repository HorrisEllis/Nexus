'use strict';
/**
 * tests/modules/test-checklist-workset.test.js — SB39 (docs/2026-10-05-build-from-the-spec-phasemap.spec).
 * James: "do it. we could use that for more than coding." · "im saying for anything it wants to learn. agnostic tool
 *         for context" · "im not looking to add noise."
 *
 *   CW-01  the working set starts from the checklist: found items' context as the first reads; its synthesis opens
 *          with the checklist and what is still to ask
 *   CW-02  an Ollama run: the first round is not sent the checklist twice; a code read ticks the missing target and the
 *          next round says the checklist is complete
 *   CW-03  data — a record fed into a pipeline: a field present is found, one absent is asked
 *   CW-04  topic — anything: learn() finds what it is in Nexus's own stores (the specs), asks what it cannot find
 *   CW-05  nexus.learn.tool — any agent's handle on it: checklist, the context found, the questions
 *   CW-06  the domain is picked from what is given; a new domain registers and runs through the same engine
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const WS = require(path.join(ROOT, 'copilot/lib/workset.js'));
const TR = require(path.join(ROOT, 'copilot/tool-runtime.js'));
const PB = require(path.join(ROOT, 'lib/repo-prompt-blocks.js'));
const P = require(path.join(ROOT, 'lib/context-prereqs.js'));
const agentTools = require(path.join(ROOT, 'lib/agent-tools/index.js'));
const none = () => [];

const CHECKLIST = [
  { id: 'target', need: 'the code it is about', status: 'missing', ask: 'Which part of the project do you mean?' },
  { id: 'acceptance', need: 'what it should do once changed', status: 'found', source: 'the question', content: 'change backoff so that it waits 2 seconds' },
];

async function main() {
  await test('CW-01', 'seeded from the checklist; the synthesis opens with it and what is left to ask', () => {
    const ws = WS.create({ question: 'change backoff', checklist: CHECKLIST });
    assert.strictEqual(ws.reads.length, 1);
    assert.strictEqual(ws.reads[0].tool, 'checklist');
    assert.match(ws.reads[0].raw, /waits 2 seconds/);
    const s = WS.synthesize(ws);
    assert.match(s, /^✗ the code it is about\n✓ what it should do once changed \(the question\)\nstill missing — ask James: Which part of the project do you mean\?/);
    assert.match(s, /waits 2 seconds/);
  });

  agentTools.registerTool({ name: 'test.find_code.tool', description: 'test', parameters: { type: 'object', properties: {} },
    execute: async () => ({ results: [{ id: 'chunk-b1', at: 'src/retry.js:1-5', kind: 'function', name: 'backoff', summary: 'waits longer after each failed attempt', lines: ['2: for (attempts)'] }] }) });

  await test('CW-02', 'Ollama: no checklist twice in round one; a code read ticks the target; then complete', async () => {
    const prompt = 'PERSONA\n\nWhat this question needs:\n✗ the code it is about\n\nchange backoff';
    const sent = []; let round = 0;
    const loop = await TR.run({ userPrompt: prompt, composed: true, resultTemplate: PB.toolResultTemplate(PB.DEFAULT_BLOCKS), worksetTemplate: PB.worksetTemplate(PB.DEFAULT_BLOCKS),
      question: 'change backoff', checklist: CHECKLIST, maxIterations: 4, context: { agentId: 'cw' },
      dispatch: async (convo) => { sent.push(convo); return { jobId: `j${sent.length}` }; },
      pollJob: async () => { round++; return { text: round === 1 ? '```tool\n{"name": "test.find_code.tool", "arguments": {}}\n```' : 'backoff in src/retry.js — what should it wait?' }; } });
    assert.strictEqual(sent[0], prompt, 'round one is the prompt as it stands');
    assert.match(sent[1], /✓ the code it is about \(read 2\)/);
    assert.match(sent[1], /checklist complete/);
    assert.match(sent[1], /chunk-b1 src\/retry\.js:1-5 function backoff/);
    assert.strictEqual((sent[1].match(/waits 2 seconds/g) || []).length, 1, 'the seed once');
    assert.ok(loop.workset && loop.workset.reads === 2);
  });

  await test('CW-03', 'data: a field present is found, one absent is asked (a record fed into a pipeline)', () => {
    const order = { buyer: { name: 'Ana' }, brief: 'a logo', deadline: '' };
    const r = P.check({ domain: 'data', input: order, memorySearch: none, needs: [
      { id: 'brief', need: 'what the buyer wants', path: 'brief', ask: 'What does the buyer want?' },
      { id: 'deadline', need: 'when it is due', path: 'deadline', ask: 'When is it due?' },
      { id: 'buyer', need: 'who the buyer is', path: 'buyer.name' }] });
    assert.strictEqual(r.domain, 'data');
    assert.deepStrictEqual(r.items.map(i => [i.id, i.status]), [['brief', 'found'], ['deadline', 'missing'], ['buyer', 'found']]);
    assert.deepStrictEqual(r.ask, ['When is it due?']);
    assert.strictEqual(r.complete, false);
    assert.match(r.items[0].content, /what the buyer wants \(brief\): a logo/);
  });

  await test('CW-04', 'topic: learn() finds what a thing is in Nexus\'s own stores; asks what it cannot find', async () => {
    const r = await P.learn({ about: 'shadow negative space reasoning absences gaps', memorySearch: none });
    assert.strictEqual(r.domain, 'topic');
    const what = r.items.find(i => i.id === 'what');
    assert.strictEqual(what.status, 'found', JSON.stringify(what));
    assert.match(what.content, /shadow/i);
    assert.strictEqual(r.items.find(i => i.id === 'before').status, 'found', 'nothing said before is "none yet", not a question');
    for (const i of r.items.filter(x => x.status === 'missing')) assert.ok(r.ask.includes(i.ask), `${i.id} missing but not asked`);
    const nothing = await P.learn({ about: 'zqxv blorptastic wumbler', memorySearch: none });
    assert.ok(nothing.ask.some(q => /What is it/.test(q)), nothing.ask.join(' | '));
  });

  await test('CW-05', 'nexus.learn.tool: the checklist, the context found, the questions', async () => {
    assert.ok(agentTools.TOOLS.has('nexus.learn.tool'));
    const r = await agentTools.executeTool('nexus.learn.tool', { about: 'shadow negative space reasoning absences gaps' }, { context: { agentId: 'cw-agent' } });
    assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 300));
    assert.ok(Array.isArray(r.checklist) && r.checklist[0].startsWith('✓ what it is'), r.checklist.join('\n'));
    assert.ok(r.found.length && r.found[0].context, 'the context comes with it');
    assert.ok(Array.isArray(r.ask));
    const bad = await agentTools.executeTool('nexus.learn.tool', {}, {});
    assert.strictEqual(bad.ok, false);
  });

  await test('CW-06', 'the domain is picked from what is given; a new domain runs through the same engine', async () => {
    assert.strictEqual((await P.learn({ about: 'the order', input: { a: 1 }, needs: [{ id: 'a', path: 'a' }], memorySearch: none })).domain, 'data');
    assert.strictEqual((await P.learn({ about: 'anything at all here', memorySearch: none })).domain, 'topic');
    P.registerDomain({ name: 'cw-test', intentOf: () => 'look', checklistFor: () => [{ id: 'x', need: 'the x', ask: 'What is x?' }, { id: 'y', need: 'the y' }],
      find: (it) => (it.id === 'y' ? { detail: 'here', content: 'y=1' } : null) });
    const r = P.check({ domain: 'cw-test', message: 'q', memorySearch: none });
    assert.deepStrictEqual(r.items.map(i => i.status), ['missing', 'found']);
    assert.deepStrictEqual(r.ask, ['What is x?']);
    assert.ok(P.domains().includes('cw-test'));
    assert.throws(() => P.check({ domain: 'topic', message: 'x' }), /async — use learn\(\)/);
    assert.throws(() => P.check({ domain: 'nope' }), /unknown domain "nope"/);
  });
}

main().then(() => { console.log(`\n  ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); })
  .catch(e => { console.error(e); process.exit(1); });
