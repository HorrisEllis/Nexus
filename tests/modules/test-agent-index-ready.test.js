'use strict';
/**
 * tests/modules/test-agent-index-ready.test.js — SB35 (docs/2026-10-05-build-from-the-spec-phasemap.spec).
 * James: "why are the agents still not using the context. fix it. actualy fix it. do not hand it back until you.
 *         wasting my fucking tokens"
 *
 * His boot log: idearium stopped mid-sync without flushing (the store's debounce restarted on every write), the
 * next boot re-created every nexus repo from nothing, and his question reached core's agent before core had an
 * index — "context: none — no index to read". Each cause, held:
 *   IA-01  a table written every 200 ms is on disk within the max wait (it was never, while the writes went on)
 *   IA-02  a nexus repo whose nexusSelf mark was lost is UPDATED in place (same uuid), not created again; while its
 *          sync runs, syncing(uuid) is the promise an agent send waits on
 *   IA-03  through the real API: a repo with its sources on disk and NO index — the agent's send runs the pipeline
 *          first, and the prompt the model gets carries the Code tab's chunks and code
 *   IA-04  through the real API: a repo row that lost materializeDir — the send reads the directory that holds the
 *          index (nexus-self/repos/<uuid>), not the empty data/projects/<uuid>
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-test-'));
process.env.NEXUS_SELF_DIR = path.join(TMP, 'self');
const PORT = 49600 + Math.floor(Math.random() * 300);

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

const FILES = {
  'src/upload.js': "const { backoff } = require('./retry.js');\n\n/** send a file, retrying when the network drops */\nfunction sendFile(file) {\n  return backoff(() => post(file), 3);\n}\nfunction post(file) { return file; }\nmodule.exports = { sendFile };\n",
  'src/retry.js': "/** wait longer after each failed attempt */\nfunction backoff(fn, attempts) {\n  for (let i = 0; i < attempts; i++) { try { return fn(); } catch (_) {} }\n  throw new Error('gave up');\n}\nmodule.exports = { backoff };\n",
  'README.md': '# fixture\nA small project that uploads files.\n',
};

const PROMPTS = [];
function fakeOllama() {
  const srv = http.createServer((rq, rs) => {
    let b = ''; rq.on('data', c => b += c);
    rq.on('end', () => {
      let body = {}; try { body = b ? JSON.parse(b) : {}; } catch (_) {}
      if (rq.url.startsWith('/api/tags')) { rs.writeHead(200, { 'Content-Type': 'application/json' }); return rs.end(JSON.stringify({ models: [{ name: 'fake:1b', model: 'fake:1b' }] })); }
      if (rq.url.startsWith('/api/generate') || rq.url.startsWith('/api/chat')) {
        PROMPTS.push(body.prompt || (body.messages || []).map(m => m.content).join('\n'));
        const text = 'ok';
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
function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ hostname: '127.0.0.1', port: PORT, path: p, method, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }, timeout: 120000 }, (res) => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_) { resolve({ raw: b }); } });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
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
  await test('IA-01', 'a table written every 200 ms is on disk within the max wait', async () => {
    const { JaaStore } = require(path.join(ROOT, 'guardian/jaa-store.js'));
    const dir = fs.mkdtempSync(path.join(TMP, 'jaa-'));
    const s = await quiet(() => new JaaStore(dir));
    const file = () => { for (const f of fs.readdirSync(dir, { recursive: true })) if (String(f).includes('busy_table')) return path.join(dir, f); return null; };
    const t0 = Date.now();
    let onDiskAt = null, i = 0;
    while (Date.now() - t0 < 7000) {
      s.insert('busy_table', { n: i++ });
      if (!onDiskAt && file()) onDiskAt = Date.now() - t0;
      await new Promise(r => setTimeout(r, 200));
    }
    try { s.close(); } catch (_) {}
    assert.ok(onDiskAt !== null, 'never flushed while the writes went on');
    assert.ok(onDiskAt <= 6000, `first flush after ${onDiskAt} ms`);
  });

  const se = await import(pathToFileURL(path.join(ROOT, 'idearium/spec-engine/index.js')).href);
  const { RepoLayer } = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/index.js')).href);
  const NS = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/nexus-self.js')).href);
  const rl = new RepoLayer({ specEngine: se });
  const live = fs.mkdtempSync(path.join(TMP, 'live-'));
  for (const [f, t] of Object.entries(FILES)) { fs.mkdirSync(path.dirname(path.join(live, 'lib', f)), { recursive: true }); fs.writeFileSync(path.join(live, 'lib', f), t); }
  fs.writeFileSync(path.join(live, 'package.json'), '{ "name": "live" }\n');
  const core = () => rl.list({ includeArchived: true }).find(r => r.nexusSelf && r.nexusSelf.system === 'core');
  await quiet(() => NS.sync(rl, se, { only: ['core'], liveRoot: live }));
  const first = core();

  await test('IA-02', 'a nexus repo that lost its nexusSelf mark is updated in place; syncing() covers the run', async () => {
    assert.ok(first, 'the first sync made core');
    rl.annotate(first.uuid, { nexusSelf: null });
    fs.appendFileSync(path.join(live, 'lib/src/retry.js'), '// changed\n');
    let seen = null;
    const p = quiet(() => NS.sync(rl, se, { only: ['core'], liveRoot: live }));
    for (let k = 0; k < 2000 && !seen; k++) { seen = NS.syncing(first.uuid); if (!seen) await new Promise(r => setImmediate(r)); }
    const res = await p;
    const r = res.systems.find(x => x.system === 'core');
    assert.strictEqual(r.status, 'updated', JSON.stringify(r));
    assert.strictEqual(r.repoUuid, first.uuid);
    assert.strictEqual(rl.list({ includeArchived: true }).filter(x => x.name === 'nexus/core').length, 1, 'no second nexus/core');
    assert.ok(seen && typeof seen.then === 'function', 'syncing(uuid) was the run\'s promise');
    assert.strictEqual(NS.syncing(first.uuid), null, 'cleared once the run ended');
  });

  // IA-03's repo: sources on disk, never indexed
  const plain = rl.ingest({ name: 'ia-plain', files: Object.entries(FILES).map(([p, content]) => ({ path: p, content })), source: 'test', noIdea: true });
  assert.ok(plain.repo, JSON.stringify(plain));
  const mat = rl.materialize(plain.repo.uuid);
  assert.ok(!mat.error, mat.error);
  const plainDir = mat.dir;
  // IA-04's repo: core, its row stripped of materializeDir (the index stays in nexus-self/repos/<uuid>)
  const c = core();
  const selfDir = c.materializeDir;
  assert.ok(fs.existsSync(path.join(selfDir, 'indexes', 'cards.json')), 'core is indexed where nexus-self put it');
  const row = rl.repos.repos.find(x => x.uuid === c.uuid); delete row.materializeDir; rl._save();
  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  for (const u of [plain.repo.uuid, c.uuid]) { try { RA.setProvider(u, 'ollama'); } catch (_) {} }
  assert.strictEqual(require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB.flush(), true);

  const ollama = await fakeOllama();
  const env = { ...process.env, IDEARIUM_PORT: String(PORT), OLLAMA_HOST: `127.0.0.1:${ollama.address().port}`, OLLAMA_PORT: String(ollama.address().port), NEXUS_SELF_AUTOSYNC: '0' };
  const child = spawn(process.execPath, ['idearium/api/index.js'], { cwd: ROOT, env });
  let log = ''; child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
  try {
    await waitReady(child);
    await test('IA-03', 'sources and no index: the agent indexes first, its prompt carries the Code tab\'s chunks and code', async () => {
      assert.ok(!fs.existsSync(path.join(plainDir, 'indexes', 'cards.json')), 'not indexed before the agent was asked');
      // the preview is the exact first message the dispatch sends (persona + blocks + the real retrieval)
      const r = await req('POST', `/api/repos/${plain.repo.uuid}/agent/blocks/preview`, { message: 'where do we retry when the network drops' });
      assert.ok(fs.existsSync(path.join(plainDir, 'indexes', 'cards.json')), `indexed when asked:\n${JSON.stringify(r).slice(0, 400)}\n${log.slice(-1500)}`);
      assert.ok(r.text, JSON.stringify(r).slice(0, 600));
      assert.ok(!/no index to read/.test(r.text), 'the prompt says there is no index');
      assert.strictEqual(r.context, 'search', `context ${r.context}`);
      assert.match(r.text, /src\/(upload|retry)\.js/);
      assert.match(r.text, /function backoff/);
    });
    await test('IA-04', 'a row that lost materializeDir: the send reads the directory that holds the index', async () => {
      const pv = await req('POST', `/api/repos/${c.uuid}/agent/blocks/preview`, { message: 'where do we retry when the network drops' });
      assert.ok(pv.text && !/no index to read/.test(pv.text), JSON.stringify(pv).slice(0, 600));
      assert.match(pv.text, /backoff/);
      assert.ok(!fs.existsSync(path.join(rl.dataDir, 'projects', c.uuid, 'indexes', 'cards.json')), 'no second index was built in data/projects');
      // the dispatch itself (the model's backend is not running here — the context it composed is in the answer)
      const r = await req('POST', `/api/repos/${c.uuid}/agent/prompt`, { message: 'where do we retry when the network drops', provider: 'ollama' });
      assert.ok(r.context, JSON.stringify(r).slice(0, 600));
      assert.strictEqual(r.context.kind, 'search', JSON.stringify(r.context));
      assert.ok((r.context.files || []).some(f => /retry\.js$/.test(f)), JSON.stringify(r.context.files));
    });
  } finally { try { child.kill('SIGKILL'); } catch (_) {} try { ollama.close(); } catch (_) {} }
}

main().then(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
