'use strict';
// tests/modules/test-prove-loop.test.js — 0.39.291, master phasemap PV1–PV3 (GL1).
// James: "Conrinue it first. Make sure it's enterprise grade. Let's finish what idearium needs, then I'll record it" ·
// "gate, verify, check, if failed, send back and fix it, then back through."
//
// The real idearium server, a real code spec and repo, a real COS compartment — and a fake Ollama standing in for the
// model. The fake writes lib/sum.js WRONG the first time (a - b) and only writes it right when its prompt carries the
// repair block (the exact failure). So the run can only end proven if the whole loop works: build → verify (the test
// fails in COS) → the failure attributed to lib/sum.js → sent back with actual/expected → rebuilt → verified.
//
//   PL-01  POST /api/repos/:uuid/prove starts a run; GET follows it to the end
//   PL-02  round 1 fails, attributed to lib/sum.js (not the test), and lib/sum.js is sent back
//   PL-03  the repair prompt carried the exact failure (actual -1, expected 5) and the file as it was
//   PL-04  round 2 is proven; the run's verdict is proven in 2 rounds; the rounds are recorded (idearium_proof_runs)
//   PL-05  the chunk keeps its repair in repairHistory; the failed version is never reused (component store)
//   PL-06  POST /api/repos/:uuid/verify on the fixed repo → proven; on a repo whose spec builds documents → refused
//   PL-07  (0.39.308) the model receives each file's build context (lib/build-context.js): BUILDS ON, USED BY
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '../..');
const PORT = 48000 + Math.floor(Math.random() * 1500);

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ hostname: '127.0.0.1', port: PORT, path: p, method, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }, timeout: 30000 }, (res) => {
      let b = ''; res.on('data', d => b += d); res.on('end', () => { try { resolve({ status: res.statusCode, ...JSON.parse(b) }); } catch (e) { reject(new Error(`bad JSON (${res.statusCode}): ${b.slice(0, 200)}`)); } });
    });
    r.on('error', reject); r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    if (data) r.write(data); r.end();
  });
}

// ── the fake model ──
const PROMPTS = [];
const SUM_WRONG = 'module.exports = function sum(a, b) {\n  return a - b;\n};\n';
const SUM_RIGHT = 'module.exports = function sum(a, b) {\n  return a + b;\n};\n';
const TEST = 'const assert = require("node:assert");\nconst sum = require("../lib/sum");\nassert.strictEqual(sum(2, 3), 5);\nassert.strictEqual(sum(-1, 1), 0);\nconsole.log("sum ok");\n';
function answerFor(prompt) {
  const m = String(prompt).match(/^Write the complete file `([^`]+)`/m);   // the task line itself, not the memory block that quotes earlier asks
  const file = m ? m[1] : null;
  if (file === 'lib/sum.js') return /THIS FILE FAILED VERIFICATION/.test(prompt) ? SUM_RIGHT : SUM_WRONG;
  if (file === 'test/sum.test.js') return TEST;
  if (file === 'package.json') return '{\n  "name": "sum-demo",\n  "version": "1.0.0",\n  "main": "lib/sum.js"\n}\n';
  return 'module.exports = {};\n';
}
const fence = (file, body) => `\`\`\`${/\.json$/.test(file || '') ? 'json' : 'js'}\n${body}\`\`\`\n`;
function fakeOllama() {
  const srv = http.createServer((rq, rs) => {
    let b = ''; rq.on('data', c => b += c);
    rq.on('end', () => {
      let body = {}; try { body = b ? JSON.parse(b) : {}; } catch (_) {}
      if (rq.url.startsWith('/api/tags')) { rs.writeHead(200, { 'Content-Type': 'application/json' }); return rs.end(JSON.stringify({ models: [{ name: 'fake:1b', model: 'fake:1b' }] })); }
      if (rq.url.startsWith('/api/generate') || rq.url.startsWith('/api/chat')) {
        const prompt = body.prompt || (body.messages || []).map(m => m.content).join('\n');
        PROMPTS.push(prompt);
        const m = String(prompt).match(/^Write the complete file `([^`]+)`/m);   // the task line itself, not the memory block that quotes earlier asks
        const text = fence(m && m[1], answerFor(prompt));
        rs.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        if (rq.url.startsWith('/api/chat')) rs.end(JSON.stringify({ message: { role: 'assistant', content: text }, done: true, done_reason: 'stop' }) + '\n');
        else if (body.stream === false) rs.end(JSON.stringify({ response: text, done: true, done_reason: 'stop' }));
        else { rs.write(JSON.stringify({ response: text }) + '\n'); rs.end(JSON.stringify({ response: '', done: true, done_reason: 'stop' }) + '\n'); }
        return;
      }
      rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end('{}');
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

async function waitReady(child, ms = 90000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`idearium did not report ready in ${ms} ms:\n${buf.slice(-2000)}`)), ms);
    let buf = '';
    const on = (d) => { buf += d.toString(); if (buf.includes('Idearium ready')) { clearTimeout(t); resolve(); } };
    child.stdout.on('data', on); child.stderr.on('data', (d) => { buf += d.toString(); });
    child.on('exit', (c) => { clearTimeout(t); reject(new Error(`idearium exited ${c}:\n${buf.slice(-2000)}`)); });
  });
}

async function main() {
  const ollama = await fakeOllama();
  process.env.OLLAMA_HOST = `127.0.0.1:${ollama.address().port}`;
  process.env.OLLAMA_PORT = String(ollama.address().port);

  // the code spec + its repo + its COS compartment, made in this sandbox before the server reads it
  const se = await import(pathToFileURL(path.join(ROOT, 'idearium/spec-engine/index.js')).href);
  const { RepoLayer } = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/index.js')).href);
  const manifest = se.createFileTreeSpec({ name: 'sum-demo', description: 'adds two numbers', agent: 'ollama',
    plan: { planSource: 'test', files: [
      { path: 'package.json', layer: 'runtime', purpose: 'the package' },
      { path: 'lib/sum.js', layer: 'kernel', purpose: 'sum(a, b) returns a + b' },
      { path: 'test/sum.test.js', layer: 'test', purpose: 'proves sum' },
    ] } });
  const CB = require(path.join(ROOT, 'lib/cos-bridge.js'));
  const comp = CB.createCompartment({ name: CB.uniqueName('prove-test'), purpose: 'proof run test', networkIsolated: true });
  assert.ok(comp.ok, JSON.stringify(comp));
  const rl = new RepoLayer({ specEngine: se });
  const made = rl.ingest({ name: 'sum-demo', specUuid: manifest.uuid, source: 'spec.codegen', compartmentId: comp.compartment.id });
  assert.ok(made.repo, JSON.stringify(made));
  const repoUuid = made.repo.uuid;
  // the repo's agent is Ollama (the fake)
  try { require(path.join(ROOT, 'lib/repo-agent.js')).setProvider(repoUuid, 'ollama'); } catch (_) {}
  // a repo whose spec builds documents, not files (PL-06)
  const doc = se.createSpec({ name: 'just-a-doc' });
  const docRepo = rl.ingest({ name: 'doc-repo', specUuid: doc.uuid, source: 'test' });
  // the store debounces its writes; the server is another process and reads the disk — flush before it starts
  assert.strictEqual(require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB.flush(), true);

  const child = spawn(process.execPath, ['idearium/api/index.js'], { cwd: ROOT, env: { ...process.env, IDEARIUM_PORT: String(PORT), IDEARIUM_PROVE_CHUNK_WAIT_MS: '60000' } });
  let log = ''; child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
  const stop = () => { try { child.kill('SIGKILL'); } catch (_) {} try { ollama.close(); } catch (_) {} };
  try {
    await waitReady(child);
    let final = null;
    await test('PL-01', 'POST …/prove starts a run; GET follows it to the end', async () => {
      const s = await req('POST', `/api/repos/${repoUuid}/prove`, { rounds: 3 });
      assert.strictEqual(s.ok, true, JSON.stringify(s)); assert.strictEqual(s.started, true);
      const until = Date.now() + 240000;
      while (Date.now() < until) {
        const g = await req('GET', `/api/repos/${repoUuid}/prove`);
        if (g.run && g.run.state !== 'running') { final = g.run; break; }
        await new Promise(r => setTimeout(r, 1000));
      }
      assert.ok(final, `the run did not finish:\n${log.slice(-3000)}`);
    });
    await test('PL-02', 'round 1 fails, attributed to lib/sum.js, which is sent back', () => {
      const r1 = final.rounds[0];
      assert.strictEqual(r1.verdict, 'failed', JSON.stringify(final, null, 1).slice(0, 3000));
      assert.ok(r1.failures.some(f => f.file === 'lib/sum.js' && f.kind === 'test' && f.test === 'test/sum.test.js'), JSON.stringify(r1.failures));
      assert.deepStrictEqual(r1.repaired, ['lib/sum.js']);
      assert.ok(r1.built >= 3, `built ${r1.built}`);
    });
    await test('PL-03', 'the repair prompt carried the exact failure and the file as it was', () => {
      const rp = PROMPTS.find(p => /THIS FILE FAILED VERIFICATION/.test(p));
      assert.ok(rp, 'a repair prompt was sent');
      assert.match(rp, /Write the complete file `lib\/sum\.js`/);
      assert.match(rp, /actual: -1/); assert.match(rp, /expected: 5/);
      assert.match(rp, /return a - b;/, 'the file as it is now');
      assert.match(rp, /assert\.strictEqual\(sum\(2, 3\), 5\)/, 'what the test asks');
    });
    await test('PL-04', 'round 2 is proven; the run says so; the rounds are recorded', async () => {
      assert.strictEqual(final.state, 'done'); assert.strictEqual(final.verdict, 'proven', final.why);
      assert.strictEqual(final.rounds.length, 2);
      assert.strictEqual(final.rounds[1].verdict, 'proven');
      assert.strictEqual(final.rounds[1].built, 1, 'only the repaired file was rebuilt');
      const g = await req('GET', `/api/repos/${repoUuid}/prove`);
      assert.ok(g.history.length >= 1 && g.history[0].verdict === 'proven');
    });
    await test('PL-05', 'the repair is in the chunk history; the failed version is never reused', () => {
      const m = se.loadSpec(manifest.uuid);
      const c = m.chunks.find(x => x.realPath === 'lib/sum.js');
      assert.ok(!c.repair && Array.isArray(c.repairHistory) && c.repairHistory.length === 1, JSON.stringify(c.repairHistory));
      assert.strictEqual(c.repairHistory[0].round, 2);
      assert.match(c.content, /a \+ b/);
      const CS = require(path.join(ROOT, 'lib/component-store.js'));
      const id = CS.idFor('sum-demo', 'lib/sum.js');
      const versions = Object.values(CS.loadIndex().components[id].versions);
      assert.ok(versions.some(v => v.failedVerification), 'the wrong version is marked');
      for (const [, v] of Object.entries(CS.loadIndex().byContract)) if (v[0] === id) assert.ok(!CS.manifest(v[0], v[1]).failedVerification, 'no reuse key points at it');
    });
    await test('PL-06', 'verify on demand: proven; a document spec is refused', async () => {
      const v = await req('POST', `/api/repos/${repoUuid}/verify`, {});
      assert.strictEqual(v.verdict, 'proven', JSON.stringify(v).slice(0, 1500));
      const bad = await req('POST', `/api/repos/${docRepo.repo.uuid}/prove`, {});
      assert.strictEqual(bad.ok, false); assert.match(bad.error, /builds documents, not files/);
    });
    // §0.39.308 — James: "We need the agents to use it." The model really receives each file's build context.
    await test('PL-07', 'the model is told each file\'s relations: lib/sum.js who will use it; the test sees lib/sum.js first, in full', () => {
      const forFile = (f) => PROMPTS.filter(p => (String(p).match(/^Write the complete file `([^`]+)`/m) || [])[1] === f);
      const sumP = forFile('lib/sum.js').find(p => /\[BUILD CONTEXT/.test(p));
      assert.ok(sumP, 'lib/sum.js\'s prompt carried a build context');
      assert.match(sumP, /USED BY[\s\S]*test\/sum\.test\.js — proves sum/);
      assert.ok(sumP.indexOf('[BUILD CONTEXT') < sumP.search(/^Write the complete file/m), 'beside the task, before it');
      const testP = forFile('test/sum.test.js')[0];
      const below = testP.slice(testP.indexOf('FILES ALREADY BUILT BELOW THIS LAYER'));
      assert.ok(below.indexOf('--- lib/sum.js') >= 0 && below.indexOf('--- lib/sum.js') < below.indexOf('--- package.json'), 'the file the test is about comes first');
    });
  } finally { stop(); }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
