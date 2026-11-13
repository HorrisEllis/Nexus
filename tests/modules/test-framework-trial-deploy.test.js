'use strict';
/**
 * tests/modules/test-framework-trial-deploy.test.js — AU2: the framework trial deploys itself.
 * Map: docs/2026-10-24-agent-orchestration-phasemap.spec (AU2)
 *
 * James, 2026-10-24: "have that test done automatically." · "that was done by hand in clearglass."
 * Proves the deploy step (collect answers by sending each prompt to an agent) with an INJECTED transport, so the
 * pipeline is verified offline without a live agent. Judging stays blind/human — deploy only collects.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const T = require('../../docs/framework-trial/trial.js');

const DIR = path.join(__dirname, '..', '..', 'docs', 'framework-trial');
const ANS = path.join(DIR, 'answers');
const RUN_OK = 9981, RUN_FAIL = 9982;   // throwaway run numbers, cleaned up below

let passed = 0, failed = 0;
const reg = [];
function test(id, desc, fn) { reg.push({ id, desc, fn }); }

function cleanup() {
  try { for (const p of fs.readdirSync(ANS).filter(d => /^P\d+$/.test(d))) {
    for (const f of fs.readdirSync(path.join(ANS, p))) if (f.includes(`-${RUN_OK}.`) || f.includes(`-${RUN_FAIL}.`)) fs.rmSync(path.join(ANS, p, f));
  } } catch (_) {}
}

test('A1', 'exports deploy, setSend, promptFor, and the problems', () => {
  assert.strictEqual(typeof T.deploy, 'function');
  assert.strictEqual(typeof T.setSend, 'function');
  assert.ok(Array.isArray(T.P) && T.P.length >= 1);
});

test('A2', 'deploy sends every problem×arm to the injected transport and saves the reply in the layout blind reads', async () => {
  const calls = [];
  T.setSend(async (model, prompt) => { calls.push({ model, prompt }); return `REPLY from ${model}`; });
  const r = await T.deploy(['--model', 'mockm', '--arm', 'both', '--run', String(RUN_OK)]);
  assert.strictEqual(r.fail, 0, 'no failures with a good transport');
  assert.strictEqual(r.ok, T.P.length * 2, 'one answer per problem per arm');
  assert.strictEqual(calls.length, T.P.length * 2, 'the transport was called once per cell');
  // a file exists in answers/<P>/<model>-<arm>-<run>.md with the reply
  const f = path.join(ANS, T.P[0].id, `mockm-A-${RUN_OK}.md`);
  assert.ok(fs.existsSync(f), 'answer file written where blind() looks');
  assert.match(fs.readFileSync(f, 'utf8'), /REPLY from mockm/);
  // the prompt carried the arm's instructions (promptFor), not just the bare problem
  assert.ok(calls.some(c => c.prompt.includes(T.P[0].prompt)), 'the problem text is in the prompt');
});

test('A3', 'a provider whose transport throws is reported, not thrown, and nothing is saved for it (§1.2)', async () => {
  T.setSend(async () => { throw new Error('provider down'); });
  const r = await T.deploy(['--model', 'boom', '--arm', 'A', '--run', String(RUN_FAIL)]);
  assert.strictEqual(r.ok, 0);
  assert.strictEqual(r.fail, T.P.length, 'every cell failed, counted');
  assert.ok(r.results.every(x => x.ok === false && /provider down/.test(x.error)), 'each failure carries its reason');
  assert.ok(!fs.existsSync(path.join(ANS, T.P[0].id, `boom-A-${RUN_FAIL}.md`)), 'no file written for a failed send');
});

// 0.60.521 — James, 2026-11-13: "we have ollama now. lets leverage that. test, benchmark, run the trial in the docs folder."
test('A6', 'Ollama end to end through the real transport (a stand-in Ollama over HTTP): one problem by --problem, a file name Windows takes, the benchmark line, and blind keeps it', async () => {
  const os = require('os'), http = require('http');
  const bench = path.join(os.tmpdir(), `trial-bench-${process.pid}.jsonl`); process.env.TRIAL_BENCH_FILE = bench;
  delete require.cache[require.resolve('../../docs/framework-trial/trial.js')];
  const T2 = require('../../docs/framework-trial/trial.js');
  const asked = [];
  const srv = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => { const j = JSON.parse(b); asked.push(j);
    s.setHeader('content-type', 'application/json'); s.end(JSON.stringify({ response: `answer from ${j.model}`, eval_count: 120, eval_duration: 4e9, load_duration: 5e8, prompt_eval_count: 900 })); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); process.env.OLLAMA_URL = `http://127.0.0.1:${srv.address().port}/api/generate`;
  try {
    assert.strictEqual(T2.fileModel('ollama:qwen2.5-coder:7b'), 'ollama_qwen2_5_coder_7b', 'no colon (Windows refuses one in a file name)');
    const r = await T2.deploy(['--model', 'ollama:qwen2.5-coder:7b', '--arm', 'both', '--run', String(RUN_OK), '--problem', 'P2']);
    assert.strictEqual(r.ok, 2, JSON.stringify(r.results)); assert.ok(r.results.every(x => x.p === 'P2'), 'only the problem asked');
    assert.ok(asked.every(a => a.model === 'qwen2.5-coder:7b' && a.stream === false), 'Ollama asked for the model, not streamed');
    const f = path.join(ANS, 'P2', `ollama_qwen2_5_coder_7b-B-${RUN_OK}.md`);
    assert.ok(fs.existsSync(f) && /answer from qwen2.5-coder:7b/.test(fs.readFileSync(f, 'utf8')), 'saved under a safe name');
    const b = T2.bench({ quiet: true }); const m = b.models.find(x => x.model === 'ollama:qwen2.5-coder:7b');
    assert.ok(m && m.ok === 2 && m.tokensPerSec === 30 && m.medianTokens === 120, JSON.stringify(b));
    await assert.rejects(() => T2.deploy(['--model', 'ollama', '--problem', 'P99', '--run', String(RUN_OK)]), /no problem P99/);
    // blind reads the safe name back: the model is the part before -<arm>-<run>
    const key = path.join(DIR, 'key.json'), blindDir = path.join(DIR, 'blind');
    const had = { key: fs.existsSync(key) ? fs.readFileSync(key) : null, blind: fs.existsSync(blindDir) };
    if (!had.blind) {   // only when no real blind set is there to be overwritten
      T2.blind = T2.blind; const keep = console.log; console.log = () => {}; try { require('../../docs/framework-trial/trial.js').blind(); } finally { console.log = keep; }
      const k = JSON.parse(fs.readFileSync(key, 'utf8'));
      assert.ok(Object.values(k).some(v => v.model === 'ollama_qwen2_5_coder_7b' && v.arm === 'B' && v.run === RUN_OK), 'blind kept the Ollama answer');
      fs.rmSync(blindDir, { recursive: true, force: true }); if (had.key) fs.writeFileSync(key, had.key); else fs.rmSync(key, { force: true });
    }
  } finally { srv.close(); delete process.env.OLLAMA_URL; delete process.env.TRIAL_BENCH_FILE; fs.rmSync(bench, { force: true }); }
});

test('A4', 'an empty reply is a failure, not a saved blank answer', async () => {
  T.setSend(async () => '   ');
  const r = await T.deploy(['--model', 'blankm', '--arm', 'A', '--run', String(RUN_FAIL)]);
  assert.strictEqual(r.ok, 0);
  assert.ok(r.results.every(x => /empty reply/.test(x.error)));
});

async function run() {
  const _log = console.log;
  const quiet = async (fn) => { console.log = () => {}; try { return await fn(); } finally { console.log = _log; } };   // silence deploy's per-cell lines
  try {
    for (const { id, desc, fn } of reg) {
      try { await quiet(fn); console.log(`  ✓ ${id} ${desc}`); passed++; }
      catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
    }
  } finally { cleanup(); T.setSend(null); console.log = _log; }
  process.stdout.write(`\n  test-framework-trial-deploy.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}
run();

module.exports = { passed: () => passed, failed: () => failed };
