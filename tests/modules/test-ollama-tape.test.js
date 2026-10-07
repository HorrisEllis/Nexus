'use strict';
/**
 * tests/modules/test-ollama-tape.test.js — §0.43.0 OR1–OR3: every Ollama call a frame; a run's frames its macro; the
 * cassette answers a recorded run with Ollama stopped. A fake Ollama (real HTTP, Ollama's own reply shapes) on a free port.
 * James: "can we use the rewind engine on ollama? like record ollamas process as a macro?" · "do it. tell me what that would do"
 */
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
process.env.NEXUS_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'tape-'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack.split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

(async () => {
  console.log('\n⬡  OR — the Ollama tape\n');
  const seen = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      const body = JSON.parse(b || '{}'); seen.push(body);
      const n = seen.length;
      if (req.url === '/api/generate') {
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        res.write(JSON.stringify({ response: `answer ${n} ` }) + '\n');
        res.end(JSON.stringify({ response: `to ${body.prompt}`, done: true, done_reason: 'stop', eval_count: 12, eval_duration: 400e6, load_duration: 900e6, total_duration: 1500e6, prompt_eval_count: 30 }) + '\n');
      } else if (req.url === '/api/chat') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: { content: `chat ${n}`, tool_calls: [{ function: { name: 'nexus.read', arguments: { path: 'a' } } }] }, done: true, eval_count: 5, eval_duration: 100e6 }));
      } else { res.writeHead(404); res.end('{}'); }
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  process.env.OLLAMA_HOST = `127.0.0.1:${srv.address().port}`;
  const OC = require(path.join(ROOT, 'ollama/lib/ollama-client.js'));
  const RT = require(path.join(ROOT, 'ollama/ollama-runtime.js'));
  const Tape = require(path.join(ROOT, 'lib/ollama-tape.js'));
  const RAct = require(path.join(ROOT, 'lib/repo-activity.js'));
  const stream = (o) => new Promise((res, rej) => { let t = ''; RT.streamGenerate(o, (x) => { t += x; }, () => res(t), rej); });

  let run, live = {};
  await test('OR-01', 'every call through the door is a frame: seed set, prompt and answer stored once, Ollama\'s timings read', async () => {
    await quiet(() => RAct.run({ repoUuid: 'r-tape', hat: 'tape-agent', kind: 'chat', message: 'tape' }, async () => {
      run = RAct.current().id;
      live.a = await OC.callOllamaRaw('m1', 'hello', 64, 5000, 'test.gen', { system: 'be brief' });
      live.b = await OC.callOllamaRaw('m1', 'hello', 64, 5000, 'test.gen', { system: 'be brief' });
      live.c = await OC.callOllamaChatWithTools('m2', [{ role: 'user', content: 'read a' }], [{ type: 'function', function: { name: 'nexus.read' } }], 5000, 'test.chat');
      live.d = await stream({ model: 'm3', prompt: 'stream me', system: 'sys', caller: 'test.stream' });
      return { ok: true };
    }));
    assert.ok(seen.slice(0, 4).every(b => b.options && Number.isInteger(b.options.seed)), 'a call went out without a seed');
    const fr = Tape.frames({ run });
    assert.strictEqual(fr.length, 4);
    assert.deepStrictEqual(fr.map(f => f.op), ['generate', 'generate', 'chat+tools', 'stream']);
    assert.ok(fr.every(f => f.hat === 'tape-agent' && f.task === run));
    assert.strictEqual(fr[0].prompt, fr[1].prompt, 'the same prompt is one blob');
    assert.strictEqual(Tape.readBlob(fr[0].answer), live.a);
    assert.deepStrictEqual(fr[0].timings, { totalMs: 1500, loadMs: 900, promptTokens: 30, promptMs: null, evalTokens: 12, evalMs: 400, tokensPerSec: 30 });
    assert.strictEqual(fr[2].toolCalls[0].name, 'nexus.read');
  });

  await test('OR-02', "a run's frames are its macro: what was asked and answered, step by step", async () => {
    const m = Tape.macro(run);
    assert.strictEqual(m.length, 4);
    assert.strictEqual(m[0].prompt, 'hello'); assert.strictEqual(m[0].system, 'be brief'); assert.strictEqual(m[0].answer, live.a);
    assert.strictEqual(m[3].answer, live.d);
  });

  await test('OR-03', 'the cassette: with Ollama stopped, the recorded run answers exactly as it did', async () => {
    await new Promise(r => srv.close(r));
    process.env.NEXUS_OLLAMA_REPLAY = run;
    const n = seen.length;
    const a = await quiet(() => OC.callOllamaRaw('m1', 'hello', 64, 5000, 'test.gen', { system: 'be brief' }));
    const c = await quiet(() => OC.callOllamaChatWithTools('m2', [{ role: 'user', content: 'read a' }], [{ type: 'function', function: { name: 'nexus.read' } }], 5000, 'test.chat'));
    const d = await quiet(() => stream({ model: 'm3', prompt: 'stream me', system: 'sys', caller: 'test.stream' }));
    assert.strictEqual(seen.length, n, 'a replayed call reached Ollama');
    assert.strictEqual(a, live.b); assert.strictEqual(JSON.stringify(c), JSON.stringify(live.c)); assert.strictEqual(d, live.d);
  });

  await test('OR-04', 'a call the run never made is refused and said — never invented', async () => {
    await assert.rejects(() => quiet(() => OC.callOllamaRaw('m1', 'something new', 64, 2000, 'test.gen', {})), /not in the cassette/);
    await assert.rejects(() => stream({ model: 'm3', prompt: 'new', caller: 'test.stream' }), /not in the cassette/);
    delete process.env.NEXUS_OLLAMA_REPLAY;
  });

  await test('OR-05', 'the one door: no module outside the client calls /api/generate except the standalone fallbacks (said in place)', async () => {
    const hits = [];
    for (const f of ['idearium/agent-suite/index.js', 'loom/agent-suite/index.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const iDoor = src.indexOf('ollama/lib/ollama-client.js'), iDirect = src.indexOf("path: '/api/generate'");
      if (iDirect >= 0 && !(iDoor >= 0 && iDoor < iDirect)) hits.push(f);
    }
    assert.deepStrictEqual(hits, []);
  });

  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
