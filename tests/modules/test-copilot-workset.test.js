'use strict';
/**
 * tests/modules/test-copilot-workset.test.js — SB37 (docs/2026-10-05-build-from-the-spec-phasemap.spec).
 * James: "Find the context one by one, put it in an index, and then synthesize it into, into just what it needs.
 *         Signal to noise." · "Probably just a JSON file."
 *
 *   WS-01  distill keeps what identifies a read and the lines that carry the question's terms; noise is dropped
 *   WS-02  an Ollama run whose reads add up to ~100 KB: every round is sent the prompt + the synthesis — it never grows
 *          past the budget, never loses the question, and keeps the one line that answers it; without the working set
 *          the same run re-sends everything (the old behaviour, measured)
 *   WS-03  the JSON file: every raw read, its signal, the answer — the run's provenance; the loop reports where it is
 *   WS-04  repo-agent sends the 'workset' block and the question to copilot for Ollama only; a browser tab gets neither
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}

const WS = require(path.join(ROOT, 'copilot/lib/workset.js'));
const PB = require(path.join(ROOT, 'lib/repo-prompt-blocks.js'));
const agentTools = require(path.join(ROOT, 'lib/agent-tools/index.js'));
const TR = require(path.join(ROOT, 'copilot/tool-runtime.js'));

// a read that is mostly noise: 400 lines, one of which answers the question
const noisy = (k) => ({ id: `chunk-${k}`, at: `src/part${k}.js:1-400`, kind: 'function', name: `part${k}`, signature: `function part${k}(input)`,
  code: Array.from({ length: 400 }, (_, i) => (k === 3 && i === 217) ? '  const delay = backoff(attempt) * 2; // the upload retry waits longer after each failure'
    : `  const filler_${k}_${i} = compute(${i}) + unrelated_value_${i};`).join('\n') });
agentTools.registerTool({ name: 'test.noisy_chunk.tool', description: 'test', parameters: { type: 'object', properties: { k: { type: 'number' } } },
  execute: async (args) => noisy(args.k) });

const QUESTION = 'how does the upload retry wait after a failure';

async function main() {
  await test('WS-01', 'distill: identity and the lines with the question\'s terms kept, the noise dropped', () => {
    const terms = WS.termsOf(QUESTION);
    assert.ok(terms.includes('upload') && terms.includes('retry') && !terms.includes('the'), terms.join(','));
    const d = WS.distill('idearium.code_chunk.tool', { id: 'chunk-3' }, noisy(3), terms);
    assert.ok(d.signal[0].startsWith('chunk-3 src/part3.js:1-400'), d.signal[0]);
    assert.ok(d.signal.some(l => /function part3\(input\)/.test(l)));
    assert.ok(d.signal.some(l => /upload retry waits longer/.test(l)), 'the answering line is kept');
    assert.ok(!d.signal.some(l => /filler_3_100/.test(l)), 'noise is not');
    assert.ok(d.signal.join('\n').length < 1500, `${d.signal.join('\n').length} chars from ~20 KB`);
    assert.deepStrictEqual(d.ids, ['chunk-3']);
    const s = WS.distill('idearium.code_search.tool', {}, { results: [{ id: 'c1', at: 'src/a.js:1-9', kind: 'function', name: 'retryUpload', summary: 'retries an upload', lines: ['4: retry(upload)'] }] }, terms);
    assert.ok(s.signal.some(l => /^c1 src\/a\.js:1-9 function retryUpload — retries an upload/.test(l)));
    assert.match(WS.distill('x', {}, { error: 'repo not found' }, terms).signal[0], /✗ repo not found/);
    // a small read is sent whole, every line — the agent may need all of it to edit
    const small = { id: 'chunk-s', at: 'src/s.js:1-6', kind: 'function', name: 'tiny', signature: 'function tiny()', code: 'function tiny() {\n  const a = 1;\n  const b = 2;\n  return a + b;\n}' };
    const ds = WS.distill('idearium.code_chunk.tool', {}, small, terms);
    for (const l of ['  const a = 1;', '  const b = 2;', '  return a + b;']) assert.ok(ds.signal.includes(`  ${l}`), `${l} kept`);
  });

  const template = PB.worksetTemplate(PB.DEFAULT_BLOCKS);
  const prompt = `PERSONA: the upload project's agent.\n\n${QUESTION}`;
  const runWith = async (worksetTemplate) => {
    const sent = []; let round = 0;
    const loop = await TR.run({ userPrompt: prompt, composed: true, resultTemplate: PB.toolResultTemplate(PB.DEFAULT_BLOCKS), worksetTemplate, question: QUESTION,
      maxIterations: 8, context: { agentId: 'ws-agent' },
      dispatch: async (convo) => { sent.push(convo); return { jobId: `j${sent.length}` }; },
      pollJob: async () => { round++; return { text: round <= 5 ? `\`\`\`tool\n{"name": "test.noisy_chunk.tool", "arguments": {"k": ${round}}}\n\`\`\`` : 'It waits longer after each failure: backoff(attempt) * 2.' }; } });
    return { loop, sent };
  };

  let withWs = null;
  await test('WS-02', 'five ~20 KB reads: each round is the prompt + the synthesis, within budget, the question and the answer line kept', async () => {
    withWs = await runWith(template);
    const { loop, sent } = withWs;
    assert.strictEqual(loop.toolCallLog.length, 5);
    assert.strictEqual(sent.length, 6);
    for (const [i, c] of sent.entries()) {
      assert.ok(c.startsWith(prompt), `round ${i + 1} lost the prompt`);
      assert.ok(c.length <= prompt.length + WS.DEFAULT_BUDGET + 400, `round ${i + 1}: ${c.length} chars`);
    }
    assert.match(sent[5], /What you have found so far \(5 reads/);
    assert.match(sent[5], /upload retry waits longer after each failure/);
    assert.ok(!/filler_1_100/.test(sent[5]), 'noise is not sent');
    const old = await runWith(null);
    const total = (r) => r.sent.reduce((t, c) => t + c.length, 0);
    assert.ok(old.sent[5].length > 90000, `the old last round: ${old.sent[5].length} chars`);
    console.log(`    · last round ${sent[5].length} chars (was ${old.sent[5].length}); all rounds ${total(withWs)} (was ${total(old)})`);
  });

  await test('WS-03', 'the JSON file holds every raw read, its signal, and the answer; the loop says where it is', () => {
    const w = withWs.loop.workset;
    assert.ok(w && w.file && fs.existsSync(w.file), JSON.stringify(w));
    assert.ok(w.file.startsWith(process.env.COPILOT_WORKSET_DIR), 'the sandbox, not copilot/data');
    const j = JSON.parse(fs.readFileSync(w.file, 'utf8'));
    assert.strictEqual(j.question, QUESTION);
    assert.strictEqual(j.reads.length, 5);
    assert.strictEqual(j.reads[2].raw.code.split('\n').length, 400, 'the raw read is kept whole');
    assert.ok(j.reads[2].signal.some(l => /upload retry/.test(l)));
    assert.match(j.answer, /backoff\(attempt\) \* 2/);
    assert.deepStrictEqual(w.ids.slice(0, 5), ['chunk-1', 'chunk-2', 'chunk-3', 'chunk-4', 'chunk-5']);
  });

  await test('WS-04', 'repo-agent: the workset block and the question go to copilot for Ollama only', async () => {
    const bodies = [];
    const srv = http.createServer((rq, rs) => { let b = ''; rq.on('data', c => b += c); rq.on('end', () => { try { bodies.push(JSON.parse(b)); } catch (_) {} rs.setHeader('content-type', 'application/json'); rs.end(JSON.stringify({ ok: true, text: 'ok', workset: { id: 'ws-x', file: '/x.json', reads: 2 } })); }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.COPILOT_URL = `http://127.0.0.1:${srv.address().port}`;
    delete require.cache[require.resolve(path.join(ROOT, 'lib/repo-agent.js'))];
    const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
    const RH = require(path.join(ROOT, 'lib/repo-hat.js'));
    const repo = { uuid: `ws-${Date.now()}`, name: 'ws', compartmentId: 'c-ws' };
    try {
      const forged = RH.ensureRepoHat({ repo, repoDir: null });
      assert.ok(forged.ok, JSON.stringify(forged.errors));
      const o = await RA.dispatch({ repo, repoDir: null, message: QUESTION, backend: 'ollama', noContext: true });
      const ob = bodies.find(b => b.backend === 'ollama');
      assert.ok(ob && ob.tools, JSON.stringify(bodies).slice(0, 300));
      assert.strictEqual(ob.tools.worksetTemplate, template);
      assert.strictEqual(ob.tools.question, QUESTION);
      assert.deepStrictEqual(o.workset, { id: 'ws-x', file: '/x.json', reads: 2 });
      bodies.length = 0;
      await RA.dispatch({ repo, repoDir: null, message: QUESTION, backend: 'guardian', agent: 'chatgpt', noContext: true, timeoutMs: 5000 });
      const gb = bodies.find(b => b.backend === 'guardian');
      assert.ok(gb && gb.tools && gb.tools.worksetTemplate === null, 'a browser tab keeps its own conversation');
    } finally { srv.close(); }
  });
}

main().then(() => { console.log(`\n  ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); })
  .catch(e => { console.error(e); process.exit(1); });
