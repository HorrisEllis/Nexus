'use strict';
/**
 * tests/modules/test-agent-tools-every-backend.test.js — SB36 (docs/2026-10-05-build-from-the-spec-phasemap.spec).
 * James: "like its not working. the tool. the agents job is to find context. ollama, copilot, guardian agents need to
 *         be able to use the agent tools." · "like they need the tools, all of them."
 *
 * Found: the Ollama tool loop ran as a plain generate (copilot never forwards native tools to the bridge) and its
 * prompt carried no call syntax (tool-syntax was guardian-only), so an Ollama agent could not call a tool at all; a
 * browser agent (ChatGPT) was told "you have real tools", looked in its OWN function list and said they were not there.
 *
 *   AT-01  the prompt every tool-loop backend gets (ollama and guardian) says where the tools run, how to call one,
 *          and lists the code tools; a stored copy of the OLD default is upgraded, a text James wrote is kept
 *   AT-02  Ollama: a reply that WRITES a ```tool block is run — the real idearium.code_search.tool against the real
 *          server on an indexed repo — and the next round carries its result; the final answer comes after it
 *   AT-03  a browser agent (guardian): the same call as the RENDERED page gives it (no backticks: "tool" label, JSON)
 *          runs the same tool; the tab is sent only the result next
 *   AT-04  the code tools read an index made on demand: a repo with sources and no index answers code_search
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');
const PORT = 49900 + Math.floor(Math.random() * 90);
process.env.IDEARIUM_PORT = String(PORT);   // the code tools call this server

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const FILES = {
  'src/upload.js': "const { backoff } = require('./retry.js');\n\n/** send a file, retrying when the network drops */\nfunction sendFile(file) {\n  return backoff(() => post(file), 3);\n}\nfunction post(file) { return file; }\nmodule.exports = { sendFile };\n",
  'src/retry.js': "/** wait longer after each failed attempt */\nfunction backoff(fn, attempts) {\n  for (let i = 0; i < attempts; i++) { try { return fn(); } catch (_) {} }\n  throw new Error('gave up');\n}\nmodule.exports = { backoff };\n",
  'README.md': '# fixture\nA small project that uploads files.\n',
};
async function waitReady(child, ms = 90000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error(`idearium did not report ready in ${ms} ms:\n${buf.slice(-2000)}`)), ms);
    child.stdout.on('data', (d) => { buf += d.toString(); if (buf.includes('Idearium ready')) { clearTimeout(t); resolve(); } });
    child.stderr.on('data', (d) => { buf += d.toString(); });
    child.on('exit', (c) => { clearTimeout(t); reject(new Error(`idearium exited ${c}:\n${buf.slice(-2000)}`)); });
  });
}

async function main() {
  const PB = require(path.join(ROOT, 'lib/repo-prompt-blocks.js'));
  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));

  await test('AT-01', 'every tool-loop backend is told where the tools run and how to call one; old defaults upgrade', () => {
    for (const backend of ['ollama', 'guardian']) {
      const r = PB.render({ persona: 'P', blocks: PB.DEFAULT_BLOCKS, message: 'tell me about this project', backend });
      assert.ok(r.used.includes('tool-syntax'), `${backend}: no call syntax (${r.used.join(', ')})`);
      assert.match(r.text, /run in Nexus, not in your built-in tool list/);
      assert.match(r.text, /```tool\n\{"name": "idearium\.code_search\.tool"/);
      const filled = RA.fillListedTools(r.text, 'any-repo');
      assert.match(filled, /Available tools: [^\n]*idearium\.code_search\.tool/, `${backend}: the code tools are not listed`);
    }
    const old = PB.__PREVIOUS_DEFAULTS ? PB.__PREVIOUS_DEFAULTS['tool-syntax'][0] : null;
    assert.ok(old, 'the previous default is kept');
    const u = `at-${Date.now()}`;
    assert.ok(PB.setBlocks(u, [{ id: 'tool-syntax', enabled: true, text: old }]).ok);
    const b = PB.getBlocks(u).find(x => x.id === 'tool-syntax');
    assert.strictEqual(b.edited, false); assert.match(b.text, /built-in tool list/);
    assert.ok(PB.setBlocks(u, [{ id: 'tool-syntax', enabled: true, text: 'MY OWN WORDS {tools}' }]).ok);
    assert.strictEqual(PB.getBlocks(u).find(x => x.id === 'tool-syntax').text, 'MY OWN WORDS {tools}');
  });

  // a repo with its sources on disk and no index — the server indexes it when a tool first reads it
  const se = await import(pathToFileURL(path.join(ROOT, 'idearium/spec-engine/index.js')).href);
  const { RepoLayer } = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/index.js')).href);
  const rl = new RepoLayer({ specEngine: se });
  const made = rl.ingest({ name: 'at-fixture', files: Object.entries(FILES).map(([p, content]) => ({ path: p, content })), source: 'test', noIdea: true });
  assert.ok(made.repo, JSON.stringify(made));
  const repoUuid = made.repo.uuid;
  const mat = rl.materialize(repoUuid); assert.ok(!mat.error, mat.error);
  assert.strictEqual(require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB.flush(), true);

  const child = spawn(process.execPath, ['idearium/api/index.js'], { cwd: ROOT, env: { ...process.env, IDEARIUM_PORT: String(PORT), NEXUS_SELF_AUTOSYNC: '0' } });
  let log = ''; child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
  try {
    await waitReady(child);
    const TR = require(path.join(ROOT, 'copilot/tool-runtime.js'));
    const prompt = RA.fillListedTools(PB.render({ persona: 'P', blocks: PB.DEFAULT_BLOCKS, message: 'where do we retry when the network drops', backend: 'ollama' }).text, repoUuid);
    const context = { repoDir: mat.dir, repoUuid, agentId: 'at-agent' };
    const resultTemplate = PB.toolResultTemplate(PB.DEFAULT_BLOCKS);

    await test('AT-02', 'Ollama: a written ```tool block runs the real code search; the next round carries its result', async () => {
      assert.ok(!fs.existsSync(path.join(mat.dir, 'indexes', 'cards.json')), 'not indexed before the call');
      const seen = [];
      const replies = [
        'I will search first.\n```tool\n{"name": "idearium.code_search.tool", "arguments": {"query": "retry when the network drops"}}\n```',
        'Retries live in src/retry.js backoff().',
      ];
      const loop = await TR.run({ userPrompt: prompt, toolScope: undefined, maxIterations: 4, composed: true, resultTemplate, context,
        dispatch: async (convo) => { seen.push(convo); return { jobId: `j${seen.length}` }; },
        pollJob: async () => ({ text: replies[Math.min(seen.length - 1, replies.length - 1)] }) });
      assert.strictEqual((loop.toolCallLog || []).length, 1, `tool calls: ${JSON.stringify(loop.toolCallLog)}`);
      const call = loop.toolCallLog[0];
      assert.strictEqual(call.name, 'idearium.code_search.tool');
      assert.ok(!(call.result && call.result.error), `the tool failed: ${JSON.stringify(call.result)}\n${log.slice(-1500)}`);
      assert.ok(seen.length >= 2, 'no second round');
      assert.match(seen[1], /\[tool result — idearium\.code_search\.tool\]/);
      assert.match(seen[1], /src\/(retry|upload)\.js/);
      assert.match(loop.text, /backoff/);
    });

    await test('AT-03', 'a browser agent: the rendered call (no backticks) runs the same tool; the tab gets only the result', async () => {
      const sent = [];
      const replies = [
        'Searching the code.\ntool\nCopy code\n{"name": "idearium.code_chunk.tool", "arguments": {"id": "src/retry.js#backoff"}}',
        'backoff() retries fn up to attempts times.',
      ];
      const loop = await TR.runViaAgent('chatgpt', async (p) => { sent.push(p); return { ok: true, text: replies[Math.min(sent.length - 1, 1)] }; },
        prompt, { toolScope: undefined, maxIterations: 4, composed: true, resultTemplate, context });
      assert.strictEqual((loop.toolCallLog || []).length, 1, JSON.stringify(loop.toolCallLog));
      assert.ok(!(loop.toolCallLog[0].result && loop.toolCallLog[0].result.error), JSON.stringify(loop.toolCallLog[0].result));
      assert.strictEqual(sent[0], prompt.split('{tools}').join(''), 'first round is the composed prompt as it stands');
      assert.ok(!sent[1].includes('Your job is to find the context'), 'the tab is not re-sent the prompt');
      assert.match(sent[1], /\[tool result — idearium\.code_chunk\.tool\][\s\S]*function backoff/);
    });

    await test('AT-04', 'the code tools read an index made on demand', () => {
      assert.ok(fs.existsSync(path.join(mat.dir, 'indexes', 'cards.json')), 'the first code tool call indexed the repo');
    });
  } finally { try { child.kill('SIGKILL'); } catch (_) {} }
}

main().then(() => { console.log(`\n  ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); })
  .catch(e => { console.error(e); process.exit(1); });
