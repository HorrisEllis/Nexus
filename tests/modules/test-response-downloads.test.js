'use strict';
/**
 * tests/modules/test-response-downloads.test.js — 0.39.246
 * James: "we need the responses to save to the downloads manager."
 *
 * Real chain, no stubs at the seam: guardian's response-sink deliver()
 * → a real HTTP POST /cli/downloads → Clear Glass's REAL DownloadsStore
 * (served by a scratch HTTP server on a scratch port, same handler body
 * as clear-glass/src/ipc/bridge.js) → the entry, read back from the
 * store's own list(). HOME and the node dir are scratch folders, so no
 * live data is touched.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-dl-'));
process.env.HOME = TMP; process.env.APPDATA = TMP;              // DownloadsStore's file lives here
process.env.GUARDIAN_RESPONSE_NODES_DIR = path.join(TMP, 'data', 'nodes', 'response');
const PORT = 18000 + Math.floor(Math.random() * 1000);
process.env.CLEARGL_IPC_PORT = String(PORT);

const sink = require('../../guardian/lib/response-sink.js');
const Store = require('../../clear-glass/src/downloads/store.js');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); failed++; }
}
const deps = () => ({ bus: { emit() {} }, jaa: { insert() {} }, evLedger: null, updateJob() {} });

function startClearGlass(store) {
  // Same body as bridge.js's POST /cli/downloads handler.
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/cli/downloads') { res.writeHead(404); return res.end(); }
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => {
      try { const record = store.add(JSON.parse(b || '{}')); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, record })); }
      catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
  });
  return new Promise(r => server.listen(PORT, '127.0.0.1', () => r(server)));
}

(async () => {
  console.log('\nresponses → downloads manager');
  const StoreClass = Store.DownloadsStore || Store;
  const store = typeof StoreClass === 'function' ? new StoreClass() : StoreClass;
  let server = await startClearGlass(store);

  await test('RD-01 a completed repo reply lands in the downloads manager as <jobId>.response', async () => {
    const r = await sink.deliver({ jobId: 'job-a1', provider: 'chatgpt', agentId: 'repo-nexus-id-repo-af2180cf', text: 'the reply', status: 'complete' }, deps());
    assert.equal(r.sinks.downloads.ok, true, r.sinks.downloads.detail);
    const e = store.list().find(x => x.jobId === 'job-a1');
    assert.ok(e, 'no entry with that jobId in the store');
    assert.equal(e.filename, 'job-a1.response');
    assert.equal(e.state, 'completed');
    assert.equal(e.kind, 'response');
  });

  await test('RD-02 filed under the repo that asked, not the provider tab that answered', async () => {
    const e = store.list().find(x => x.jobId === 'job-a1');
    assert.equal(e.agentId, 'repo-nexus-id-repo-af2180cf');
    assert.equal(e.provider, 'chatgpt');
    assert.equal(store.list({ agentId: 'repo-nexus-id-repo-af2180cf' }).length, 1);
  });

  await test('RD-03 savePath names a file that exists and holds the reply', async () => {
    const e = store.list().find(x => x.jobId === 'job-a1');
    assert.ok(fs.existsSync(e.savePath), `missing: ${e.savePath}`);
    assert.match(fs.readFileSync(e.savePath, 'utf8'), /the reply/);
  });

  await test('RD-04 the .response node records the downloads result (written after the post)', async () => {
    const n = fs.readFileSync(path.join(process.env.GUARDIAN_RESPONSE_NODES_DIR, 'job-a1.response'), 'utf8');
    assert.match(n, /downloads:[\s\S]*ok: true/);
    assert.doesNotMatch(n, /detail: pending/);
  });

  await test('RD-05 Clear Glass down: the entry is queued, not lost, and says so', async () => {
    await new Promise(r => server.close(r));
    const r = await sink.deliver({ jobId: 'job-b2', provider: 'claude', agentId: 'repo-x', text: 'while closed', status: 'complete' }, deps());
    assert.equal(r.sinks.downloads.ok, false);
    assert.equal(r.sinks.downloads.queued, true);
    assert.ok(fs.existsSync(sink.DOWNLOADS_PENDING));
    assert.equal(store.list().some(x => x.jobId === 'job-b2'), false);
  });

  await test('RD-06 Clear Glass back: the next response replays the queued one, in order', async () => {
    server = await startClearGlass(store);
    const r = await sink.deliver({ jobId: 'job-c3', provider: 'claude', agentId: 'repo-x', text: 'after', status: 'complete' }, deps());
    assert.match(r.sinks.downloads.detail, /replayed 1 queued/);
    const ids = store.list({ agentId: 'repo-x' }).map(x => x.jobId);
    assert.deepEqual(ids.sort(), ['job-b2', 'job-c3']);
    assert.equal(fs.existsSync(sink.DOWNLOADS_PENDING), false, 'queue should be empty and removed');
  });

  await test('RD-07 an error reply is filed as interrupted, not completed', async () => {
    await sink.deliver({ jobId: 'job-d4', provider: 'chatgpt', agentId: 'repo-x', text: '', status: 'error', error: 'tab closed' }, deps());
    assert.equal(store.list().find(x => x.jobId === 'job-d4').state, 'interrupted');
  });

  await test('RD-08 ordinary browser downloads are unchanged (no response fields added)', async () => {
    const e = store.add({ filename: 'photo.png', agentId: 'default', state: 'completed' });
    for (const k of ['jobId', 'kind', 'provider', 'compartmentId', 'source']) assert.equal(k in e, false, k);
  });

  await test('RD-09 ncp-handler and POST /response pass the job\'s agentId into deliver()', async () => {
    const ncp = fs.readFileSync(path.join(__dirname, '../../guardian/lib/ncp-handler.js'), 'utf8');
    const srv = fs.readFileSync(path.join(__dirname, '../../guardian/server.js'), 'utf8');
    assert.match(ncp, /agentId: jobRec2\?\.agentId/);
    assert.match(srv, /agentId:\s+b\.agentId \|\| \(job && job\.agentId\)/);
  });

  await new Promise(r => server.close(r));
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed ? 1 : 0;
})();
