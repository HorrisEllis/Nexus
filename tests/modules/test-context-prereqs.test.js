'use strict';
/**
 * tests/modules/test-context-prereqs.test.js — SB38 (docs/2026-10-05-build-from-the-spec-phasemap.spec).
 * James: "predetermine what context is needed. So make like prerequisites. Then uh, use those as a checklist for
 *         context." · "the prerequisites, the questions, right? That way, then if it can't, if it can't find context,
 *         then it'll, it'll just ask me the rest, or reference the past conversations"
 *
 * On a repo indexed by the real import pipeline:
 *   PQ-01  intent from the question's words: explain · change · debug · build
 *   PQ-02  an explain question: its code, what it uses and what uses it — checked off from the index, nothing asked
 *   PQ-03  a change question that does not say what it should do asks James; one that says it is checked off
 *   PQ-04  an answer James gave in an earlier conversation (the real agent-memory store) is found there (↺), not asked;
 *          another project's agent's conversation is never taken as an answer about this one
 *   PQ-05  nothing in the code or past conversations: asked, never guessed — and each absence recorded as a gap
 *   PQ-06  in the prompt: the editable 'prereqs' block, before the question, with the ? lines; off = not sent
 *   PQ-07  the dispatch sends it and reports the checklist (ctx.prereqs)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const FILES = {
  'src/upload.js': "const { backoff } = require('./retry.js');\n\n/** send a file, retrying when the network drops */\nfunction sendFile(file) {\n  return backoff(() => post(file), 3);\n}\nfunction post(file) { return file; }\nmodule.exports = { sendFile };\n",
  'src/retry.js': "/** wait longer after each failed attempt */\nfunction backoff(fn, attempts) {\n  for (let i = 0; i < attempts; i++) { try { return fn(); } catch (_) {} }\n  throw new Error('gave up');\n}\nmodule.exports = { backoff };\n",
  'test/retry.test.js': "const { backoff } = require('../src/retry.js');\nconst assert = require('assert');\nassert.strictEqual(backoff(() => 1, 3), 1);\n",
  'README.md': '# fixture\nA small project that uploads files.\n',
};
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

async function main() {
  const pipeline = await import(path.join(ROOT, 'idearium/repo/import-pipeline.js'));
  const lazy = await import(path.join(ROOT, 'idearium/repo/verify-lazy.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prereqs-'));
  for (const [f, t] of Object.entries(FILES)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); }
  const repo = { uuid: `pq-${Date.now()}`, name: 'fixture', compartmentId: 'c-pq', files: Object.keys(FILES).map(p => ({ path: p })) };
  await quiet(() => pipeline.runImportPipeline(repo, dir, { runtimeProof: false }));
  await require(path.join(ROOT, 'lib/work-queue.js')).get(lazy.QUEUE_NAME).drain();
  const P = require(path.join(ROOT, 'lib/context-prereqs.js'));
  const none = () => [];   // no past conversations (PQ-02/03/05 must not depend on what this machine remembers)

  await test('PQ-01', 'intent from the question\'s words', () => {
    assert.strictEqual(P.intentOf('how does the upload retry work'), 'explain');
    assert.strictEqual(P.intentOf('change backoff to wait longer'), 'change');
    assert.strictEqual(P.intentOf('why does the upload fail with ECONNRESET'), 'debug');
    assert.strictEqual(P.intentOf('build a new download manager'), 'build');
  });

  await test('PQ-02', 'explain: the code, what it uses, what uses it — from the index, nothing asked', () => {
    const r = P.check({ repoDir: dir, message: 'how does sendFile retry when the network drops', memorySearch: none });
    assert.strictEqual(r.intent, 'explain');
    assert.strictEqual(r.target.file, 'src/upload.js', JSON.stringify(r.target));
    assert.deepStrictEqual(r.items.map(i => [i.id, i.status, i.source]), [['target', 'found', 'index'], ['uses', 'found', 'index'], ['used-by', 'found', 'index']]);
    assert.match(r.items[1].detail, /backoff/);
    assert.deepStrictEqual(r.ask, []);
    assert.ok(r.lines.every(l => l.startsWith('✓')), r.lines.join('\n'));
  });

  await test('PQ-03', 'change: what it should do is asked when the question does not say it, checked off when it does', () => {
    const vague = P.check({ repoDir: dir, message: 'change backoff in the retry', memorySearch: none });
    assert.strictEqual(vague.intent, 'change');
    const acc = vague.items.find(i => i.id === 'acceptance');
    assert.strictEqual(acc.status, 'missing');
    assert.ok(vague.ask.some(q => /What should it do once it is changed/.test(q)), vague.ask.join(' | '));
    assert.ok(vague.lines.some(l => l.startsWith('? What should it do')));
    const tests = vague.items.find(i => i.id === 'tests');
    assert.strictEqual(tests.status, 'found');
    const said = P.check({ repoDir: dir, message: 'change backoff in the retry so that it waits 2 seconds between attempts', memorySearch: none });
    assert.strictEqual(said.items.find(i => i.id === 'acceptance').status, 'found');
    assert.deepStrictEqual(said.ask, []);
  });

  await test('PQ-04', 'an answer from an earlier conversation is found there, not asked again', async () => {
    const AM = require(path.join(ROOT, 'lib/agent-memory.js'));
    const agentId = 'repo-pq-memory';
    const r0 = await quiet(() => AM.record({ agentId, provider: 'ollama', prompt: 'what should backoff do once it is changed',
      response: 'James said: backoff must wait 2 seconds between attempts and give up after 5.', kind: 'chat' }));
    assert.ok(r0.ok, JSON.stringify(r0));
    const r = P.check({ repoDir: dir, message: 'change backoff in the retry', agentId });
    const acc = r.items.find(i => i.id === 'acceptance');
    assert.strictEqual(acc.status, 'remembered', JSON.stringify(acc));
    assert.match(acc.detail, /2 seconds/);
    assert.ok(!r.ask.some(q => /What should it do/.test(q)), 'not asked again');
    assert.ok(r.lines.some(l => l.startsWith('↺')));
    const other = P.check({ repoDir: dir, message: 'change backoff in the retry', agentId: 'repo-some-other-project' });
    assert.strictEqual(other.items.find(i => i.id === 'acceptance').status, 'missing', 'another agent\'s conversation is not this repo\'s answer');
  });

  await test('PQ-05', 'nothing in the code or past conversations: asked, never guessed, each absence a gap', () => {
    const r = P.check({ repoDir: dir, message: 'zzqx frobnicator quuxwidget', memorySearch: none, record: true });
    assert.strictEqual(r.items[0].status, 'missing');
    assert.ok(r.ask.some(q => /Which part of the project do you mean/.test(q)), r.ask.join(' | '));
    assert.ok(r.shadow && !r.shadow.error, JSON.stringify(r.shadow));
    assert.ok(r.shadow.absent.includes('target'), JSON.stringify(r.shadow));
    assert.ok(r.shadow.gaps >= 1);
  });

  const PB = require(path.join(ROOT, 'lib/repo-prompt-blocks.js'));
  await test('PQ-06', 'the editable prereqs block, before the question, with the ? lines; off = not sent', () => {
    const r = P.check({ repoDir: dir, message: 'change backoff in the retry', memorySearch: none });
    const out = PB.render({ persona: 'P', blocks: PB.DEFAULT_BLOCKS, message: 'change backoff in the retry', prereqs: r.lines.join('\n'), backend: 'ollama' });
    assert.ok(out.used.includes('prereqs'));
    assert.ok(out.used.indexOf('prereqs') < out.used.indexOf('question'));
    assert.match(out.text, /What this question needs \(✓ found/);
    assert.match(out.text, /\? What should it do once it is changed/);
    assert.match(out.text, /do not guess it — ask James/);
    const off = PB.DEFAULT_BLOCKS.map(b => b.id === 'prereqs' ? { ...b, enabled: false } : b);
    assert.ok(!PB.render({ persona: 'P', blocks: off, message: 'q', prereqs: 'x' }).used.includes('prereqs'));
    assert.ok(!PB.render({ persona: 'P', blocks: PB.DEFAULT_BLOCKS, message: 'q' }).used.includes('prereqs'), 'no checklist, no block');
  });

  await test('PQ-07', 'the dispatch sends the checklist and reports it', async () => {
    const bodies = [];
    const srv = http.createServer((rq, rs) => { let b = ''; rq.on('data', c => b += c); rq.on('end', () => { try { bodies.push(JSON.parse(b)); } catch (_) {} rs.setHeader('content-type', 'application/json'); rs.end(JSON.stringify({ ok: true, text: 'What should it do once it is changed?' })); }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.COPILOT_URL = `http://127.0.0.1:${srv.address().port}`;
    delete require.cache[require.resolve(path.join(ROOT, 'lib/repo-agent.js'))];
    const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
    const RH = require(path.join(ROOT, 'lib/repo-hat.js'));
    try {
      assert.ok(RH.ensureRepoHat({ repo, repoDir: dir }).ok);
      const o = await quiet(() => RA.dispatch({ repo, repoDir: dir, message: 'change backoff in the retry', backend: 'ollama' }));
      const b = bodies.find(x => x.backend === 'ollama');
      assert.ok(b, 'nothing reached copilot');
      assert.match(b.prompt, /What this question needs/);
      assert.match(b.prompt, /✓ the code it is about: backoff \(src\/retry\.js/);
      assert.match(b.prompt, /\? What should it do once it is changed/);
      assert.ok(o.context && o.context.prereqs, JSON.stringify(o).slice(0, 400));
      assert.strictEqual(o.context.prereqs.intent, 'change');
      assert.ok(o.context.prereqs.items.some(i => i.id === 'acceptance' && i.status !== 'found'));
    } finally { srv.close(); }
  });
}

main().then(() => { console.log(`\n  ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); })
  .catch(e => { console.error(e); process.exit(1); });
