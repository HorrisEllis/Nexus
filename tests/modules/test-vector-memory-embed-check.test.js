'use strict';
// EC-01..10 (0.60.73): the embed check, fixed for good. A fake Ollama on a real port (started, stopped and started again); the index lives in a temp dir.
// James, 2026-10-16: "good embedded check isnt working, need to fix that for good."
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-ec-'));
process.env.NEXUS_VECTOR_INDEX_DIR = DIR;
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log('  ok ' + name); passed++; } catch (e) { console.log('  FAIL ' + name + '\n    ' + String(e.stack || e).split('\n').slice(0, 4).join('\n    ')); failed++; } }
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
function vec(text) { const v = new Array(768).fill(0); for (const w of String(text).toLowerCase().match(/[a-z]+/g) || []) { let h = 7; for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 768; v[h] += 1; v[(h * 7 + 3) % 768] += 0.5; } const m = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1; return v.map(x => x / m); }
const mode = { tags: 'ok', emb: 'ok' }; let srv = null, PORT = 0;
const start = () => new Promise(r => { srv = http.createServer((q, res) => {
  const body = []; q.on('data', c => body.push(c)); q.on('end', () => {
    if (q.url === '/api/tags') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ models: mode.tags === 'ok' ? [{ name: 'nomic-embed-text:latest' }] : [{ name: 'qwen2.5-coder:7b' }] })); }
    if (q.url === '/api/embeddings') { if (mode.emb === 'http500') { res.writeHead(500); return res.end('boom'); } res.writeHead(200, { 'Content-Type': 'application/json' }); const p = JSON.parse(Buffer.concat(body).toString()).prompt;
      return res.end(JSON.stringify(mode.emb === 'error' ? { error: 'model failed to load: not enough memory' } : mode.emb === 'dim' ? { embedding: [0.1, 0.2] } : { embedding: vec(p) })); }
    res.writeHead(404); res.end(); }); }).listen(PORT, '127.0.0.1', r); });
const stop = () => new Promise(r => { if (!srv) return r(); srv.closeAllConnections && srv.closeAllConnections(); srv.close(() => r()); srv = null; });
(async () => {
  PORT = await freePort(); process.env.OLLAMA_HOST = `127.0.0.1:${PORT}`;
  const _l = console.log, _w = console.warn; console.log = console.warn = () => {};
  const vm = require('../../lib/vector-memory.js'); const item = (id, text) => ({ uuid: id, text, type: 't', source: 's', table: 'gaps' });
  console.log = _l; console.warn = _w;
  await test('EC-01 Ollama down at boot: ready, the reason is in words and names the address, the item is kept as a tf-idf vector and tagged', async () => {
    const q = console.log; console.log = console.warn = () => {}; await vm.init(); console.log = q; console.warn = _w;
    let s = await vm.status(); assert.strictEqual(s.ready, true); assert.strictEqual(s.ollamaOk, false); assert.match(s.ollamaWhy, new RegExp(`did not answer at http://127\\.0\\.0\\.1:${PORT}`));
    await vm.embed(item('a1', 'the garbage collector pauses every request during the nightly build')); s = await vm.status(); assert.deepStrictEqual(s.vectors, { neural: 0, tfidf: 1, untagged: 0 });
    const r = await vm.search('garbage collector', { threshold: 0, k: 3 }); assert.strictEqual(r.kind, 'tfidf'); assert.match(r.note, /word-overlap match, not a semantic one/);
  });
  await test('EC-02 Ollama comes up LATER: the next check finds it with no restart, and the tf-idf item becomes a real embedding', async () => {
    await start(); const r = await vm.recheck(); assert.strictEqual(r.ollamaOk, true); assert.strictEqual(r.upgraded, 1); const s = await vm.status(); assert.strictEqual(s.ollamaOk, true); assert.strictEqual(s.ollamaWhy, null); assert.deepStrictEqual(s.vectors, { neural: 1, tfidf: 0, untagged: 0 });
    const q = await vm.search('garbage collector pauses', { threshold: 0.1, k: 3 }); assert.strictEqual(q.kind, 'neural'); assert.ok(q.results.length >= 1 && q.results[0].vecFrom === 'snippet', 'the upgraded item says its vector came from the snippet');
  });
  await test('EC-03 the two kinds are never compared: with Ollama down again, a query matches only tf-idf items and says how many it skipped', async () => {
    await vm.embed(item('n2', 'a neural vector item about databases and indexes')); await stop(); await vm.embed(item('t3', 'a word overlap item about databases and indexes'));
    const s = await vm.status(); assert.strictEqual(s.ollamaOk, false); assert.deepStrictEqual([s.vectors.neural, s.vectors.tfidf], [2, 1]);
    const r = await vm.search('databases and indexes', { threshold: 0, k: 10 }); assert.strictEqual(r.kind, 'tfidf'); assert.ok(r.skippedOtherKind >= 2, JSON.stringify(r)); assert.ok(r.results.every(x => x.vec === 'tfidf'));
  });
  await test('EC-04 recovery after a failure in the middle of running (not only at boot): back up, one check, neural again, the tf-idf item upgraded', async () => {
    await start(); const r = await vm.recheck(); assert.strictEqual(r.ollamaOk, true); assert.strictEqual(r.upgraded, 1); const s = await vm.status(); assert.deepStrictEqual([s.vectors.neural, s.vectors.tfidf], [3, 0]);
  });
  await test('EC-05 listed but cannot embed (out of memory): NOT reported available, and the reason is the model\'s own', async () => {
    mode.emb = 'error'; await vm.status(); const q = console.log; console.log = console.warn = () => {}; await vm.embed(item('x5', 'forces the failure path with enough words here')); console.log = q;
    let s = await vm.status(); assert.strictEqual(s.ollamaOk, false); assert.match(s.ollamaWhy, /could not run nomic-embed-text: model failed to load: not enough memory/); const r = await vm.recheck(); assert.strictEqual(r.ollamaOk, false); assert.match(r.why, /not enough memory/); mode.emb = 'ok';
  });
  await test('EC-06 a wrong-size embedding is refused with both numbers; an HTTP 500 is a reason too; both recover when fixed', async () => {
    mode.emb = 'dim'; let r = await vm.recheck(); assert.strictEqual(r.ollamaOk, false); assert.match(r.why, /returned 2 dimensions, the index expects 768/);
    mode.emb = 'http500'; r = await vm.recheck(); assert.strictEqual(r.ollamaOk, false); assert.match(r.why, /listed but did not embed/);
    mode.emb = 'ok'; r = await vm.recheck(); assert.strictEqual(r.ollamaOk, true);
  });
  await test('EC-07 model not pulled: says so and gives the command', async () => {
    mode.tags = 'nomodel'; const q = console.log; console.log = console.warn = () => {}; await vm.embed(item('x7', 'forces a failure by making ollama look away now')); console.log = q;
    mode.emb = 'error'; await vm.embed(item('x8', 'another failure forcing sentence for the flag')); mode.emb = 'ok';
    const r = await vm.recheck(); assert.strictEqual(r.ollamaOk, false); assert.match(r.why, /is not pulled — run: ollama pull nomic-embed-text/); mode.tags = 'ok'; assert.strictEqual((await vm.recheck()).ollamaOk, true);
  });
  await test('EC-08 the address comes from OLLAMA_HOST (here a random port), not a hardcoded 11434', async () => { const s = await vm.status(); assert.strictEqual(s.ollamaUrl, `http://127.0.0.1:${PORT}`); assert.ok(!/11434/.test(fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'vector-memory.js'), 'utf8').split('\n').filter(l => /hostname:|port:/.test(l)).join('\n'))); });
  await test('EC-09 an item with no tag (written before this) is still found by a neural query, and counted as untagged', async () => {
    const f = path.join(DIR, 'index.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); const items = Array.isArray(j) ? j : j.items; items.push({ id: 'old1', vector: vec('legacy untagged item about zebras'), metadata: { uuid: 'old1', text: 'legacy untagged item about zebras', table: 'gaps' } }); fs.writeFileSync(f, JSON.stringify(items));
    // a fresh process reads it
    const { spawn } = require('child_process'); const code = `process.env.NEXUS_VECTOR_INDEX_DIR=${JSON.stringify(DIR)};const vm=require('./lib/vector-memory.js');const l=console.log;console.log=console.warn=()=>{};vm.init().then(async()=>{const s=await vm.status();const r=await vm.search('zebras',{threshold:0,k:5});console.log=l;console.log(JSON.stringify({u:s.vectors.untagged,found:r.results.some(x=>x.uuid==='old1'),kind:r.kind}));process.exit(0)})`;
    const out = await new Promise(res => { const c = spawn(process.execPath, ['-e', code], { cwd: path.join(__dirname, '..', '..'), env: { ...process.env } }); let b = ''; c.stdout.on('data', d => b += d); c.on('close', () => res(b)); }); const j2 = JSON.parse(out.trim().split('\n').pop()); assert.strictEqual(j2.u, 1); assert.strictEqual(j2.found, true); assert.strictEqual(j2.kind, 'neural');
  });
  await test('EC-10 the re-check runs on a timer whatever the queue holds, and the timer never keeps a process alive', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'vector-memory.js'), 'utf8'); assert.match(src, /setInterval\(\(\) => \{ _recheck\(\)/); assert.match(src, /t\.unref/); assert.ok(!/setInterval\(_flushQueue/.test(src), 'the old queue-gated check is gone');
  });
  await stop(); fs.rmSync(DIR, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
