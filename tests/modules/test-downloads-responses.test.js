'use strict';
/**
 * tests/modules/test-downloads-responses.test.js — v0.39.239
 * James: "the download manager should be routing the response to the agent or
 * compartment id" and "needs a ui so i can actually see this visually".
 *
 * Real modules throughout; only 'electron' is faked (not installable here).
 *   - guardian/lib/code-artifact.js recordAgentResponse — the real writer of every
 *     completed agent reply — writes into the downloads index
 *   - clear-glass/src/ipc/bridge.js — the REAL bridge, started on a free port —
 *     serves it back over HTTP to the Library's Responses tab
 *   - clear-glass/src/providers/download-capture.js — the real capture, against a
 *     fake session with two windows attached, as ProviderHost attaches them
 * Everything writes into the test sandbox (lib/test-sandbox.js), never real data.
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..', '..');
require(path.join(ROOT, 'lib', 'test-sandbox.js')).ensure();

// ── the ports download-capture reads at load: two local listeners stand in ──
const announced = [], ledgered = [];
function listen(sink) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { sink.push(JSON.parse(b)); } catch (_) {} res.end('{"ok":true,"dropId":"d1"}'); }); });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const fakeElectron = { ipcMain: { handle() {}, on() {}, removeHandler() {} }, session: { fromPartition: () => ({}), defaultSession: {} },
  Notification: class { static isSupported() { return false; } show() {} }, app: { getPath: () => require('os').tmpdir(), on() {} }, BrowserWindow: class {} };
const _load = Module._load;
Module._load = function (req, ...a) { return req === 'electron' ? fakeElectron : _load.call(this, req, ...a); };

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  \u2713 ${id} ${d}`); passed++; } catch (e) { console.error(`  \u2717 ${id} ${d}\n    ${e.message}`); failed++; } }
const get = async (port, p) => { const r = await fetch(`http://127.0.0.1:${port}${p}`); return { status: r.status, body: await r.json() }; };
const wait = async (fn, ms = 3000) => { const t = Date.now() + ms; while (!fn()) { if (Date.now() > t) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 20)); } };

(async () => {
  const gSrv = await listen(announced), oSrv = await listen(ledgered);
  process.env.GUARDIAN_HTTP_PORT = String(gSrv.address().port);
  process.env.ORCHESTRATOR_PORT = String(oSrv.address().port);

  const index = require(path.join(ROOT, 'clear-glass/src/downloads/artifact-chat-index.js'));
  const { recordAgentResponse } = require(path.join(ROOT, 'guardian/lib/code-artifact.js'));
  require(path.join(ROOT, 'clear-glass/src/core/bus.js')).createBus();
  const Bridge = require(path.join(ROOT, 'clear-glass/src/ipc/bridge.js'));
  const BridgeClass = Bridge.IpcBridge || Bridge;
  const port = 17000 + Math.floor(Math.random() * 2000);
  const bridge = new BridgeClass({ port, sse: { emit() {} } });
  await bridge.start();

  console.log('\n\u2B21  DOWNLOADS INDEX — responses routed to their agent\n');
  const root = index.defaultRoot();

  await test('DR-01', 'defaultRoot() is inside the test sandbox, never real data', async () => {
    const sb = process.env.NEXUS_TEST_SANDBOX || process.env.COS_DATA_ROOT || '';
    assert.ok(sb && root.startsWith(path.resolve(sb).split(path.sep).slice(0, 4).join(path.sep)), `root ${root} not under the sandbox (${sb})`);
    assert.ok(!root.startsWith(path.join(ROOT, 'data')), `root is in the real data folder: ${root}`);
  });

  let chatId;
  await test('DR-02', "guardian's real writer records a reply with its agent and job as fields", async () => {
    const stored = recordAgentResponse({ job: { id: 'job-aaaa1111', provider: 'chatgpt', agentId: 'repo-nexus-id-repo-933db1a8', prompt: 'hello' },
      text: 'Hello, James. Scoped to ERAVOS.\n```js\nconsole.log(1)\n```', blocks: [{ index: 0, syntax: 'js', code: 'console.log(1)' }] });
    assert.ok(stored && stored.id, 'recordAgentResponse returned nothing');
    assert.strictEqual(stored.agentId, 'repo-nexus-id-repo-933db1a8');
    assert.strictEqual(stored.jobId, 'job-aaaa1111');
    chatId = stored.id;
  });

  await test('DR-03', 'a .response written BEFORE 0.39.239 (agent only inside raw) is still attributed to its agent', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    fs.writeFileSync(path.join(root, 'responses', `${id}.response`), JSON.stringify({ id, kind: 'chat', provider: 'gemini', chat_id: null,
      captured_at: Date.now() - 60000, content_hash: 'sha256:x', artifact_path: null, raw: { jobId: 'job-old-2222', agentId: 'repo-old', response: 'old reply' } }));
    const items = index.queryItems(root, { agentId: 'repo-old' });
    assert.strictEqual(items.length, 1, `got ${items.length}`);
    assert.strictEqual(items[0].job_id, 'job-old-2222');
  });

  await test('DR-04', 'the bridge lists responses and every agent that has one', async () => {
    const r = await get(port, '/cli/downloads/responses');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.agents['repo-nexus-id-repo-933db1a8'] >= 1 && r.body.agents['repo-old'] === 1, JSON.stringify(r.body.agents));
  });

  await test('DR-05', "the bridge filters to one agent's responses", async () => {
    const r = await get(port, '/cli/downloads/responses?agentId=repo-nexus-id-repo-933db1a8');
    assert.ok(r.body.items.length >= 1 && r.body.items.every((i) => i.agent_id === 'repo-nexus-id-repo-933db1a8'), JSON.stringify(r.body.items.map((i) => i.agent_id)));
  });

  await test('DR-06', 'the bridge filters by job', async () => {
    const r = await get(port, '/cli/downloads/responses?jobId=job-aaaa1111');
    assert.deepStrictEqual(r.body.items.map((i) => i.job_id), ['job-aaaa1111']);
  });

  await test('DR-07', 'opening one returns the full reply text and its code blocks', async () => {
    const r = await get(port, `/cli/downloads/responses/${chatId}`);
    assert.strictEqual(r.status, 200);
    assert.match(r.body.item.raw.response, /Scoped to ERAVOS/);
    assert.strictEqual(r.body.item.raw.codeBlocks[0].code, 'console.log(1)');
    assert.strictEqual(r.body.item.agent_id, 'repo-nexus-id-repo-933db1a8');
  });

  await test('DR-08', 'an unknown id is a 404; an id that could leave responses/ is refused', async () => {
    assert.strictEqual((await get(port, '/cli/downloads/responses/11111111-2222-4333-8444-555555555555')).status, 404);
    assert.strictEqual(index.readItem(root, '../../etc/passwd').error, 'invalid id');
    assert.strictEqual(index.readItem(root, 'a/b').error, 'invalid id');
  });

  console.log('\n\u2B21  DOWNLOAD CAPTURE — one listener, the right agent\n');
  const capture = require(path.join(ROOT, 'clear-glass/src/providers/download-capture.js'));
  const listeners = [];
  const session = { on: (ev, fn) => listeners.push({ ev, fn }), removeListener: (ev, fn) => { const i = listeners.findIndex((l) => l.fn === fn); if (i >= 0) listeners.splice(i, 1); } };
  const repoWc = { getURL: () => 'https://chatgpt.com/c/repo-chat' }, sharedWc = { getURL: () => 'https://chatgpt.com/c/shared' };
  const agentIdFor = (wc) => (wc === repoWc ? 'repo-nexus-id-repo-933db1a8' : null);
  const logs = [];
  capture.attach({ session, providerId: 'chatgpt', log: (m) => logs.push(m), agentIdFor });
  capture.attach({ session, providerId: 'chatgpt', log: (m) => logs.push(m), agentIdFor }); // the second window

  await test('DC-01', 'two windows on one session attach ONE listener (each download announced once)', async () => {
    assert.strictEqual(listeners.filter((l) => l.ev === 'will-download').length, 1);
  });

  const file = path.join(require('os').tmpdir(), `dc-${process.pid}.js`);
  fs.writeFileSync(file, 'export const catalog = [];\n');
  function download(wc) {
    let done;
    const item = { getFilename: () => 'catalog.js', getSavePath: () => file, getURL: () => 'blob:https://chatgpt.com/x', getMimeType: () => 'text/javascript',
      getTotalBytes: () => fs.statSync(file).size, once: (ev, fn) => { if (ev === 'done') done = fn; } };
    listeners[0].fn({}, item, wc);
    done({}, 'completed');
  }

  await test('DC-02', "a download from a repo tab is announced to guardian with that tab's agent", async () => {
    download(repoWc);
    await wait(() => announced.length >= 1);
    assert.strictEqual(announced[0].agentId, 'repo-nexus-id-repo-933db1a8');
    assert.strictEqual(announced[0].provider, 'chatgpt');
  });

  await test('DC-03', 'the ledger records the agent, not the provider name as the agent', async () => {
    await wait(() => ledgered.length >= 1);
    assert.strictEqual(ledgered[0].payload.agentId, 'repo-nexus-id-repo-933db1a8');
  });

  await test('DC-04', 'the download is in the index under its agent, with the file copied in', async () => {
    const items = index.queryItems(root, { agentId: 'repo-nexus-id-repo-933db1a8', kind: 'artifact' });
    assert.strictEqual(items.length, 1, `got ${items.length}`);
    const full = index.readItem(root, items[0].id);
    assert.strictEqual(full.raw.copied, true);
    assert.strictEqual(fs.readFileSync(path.join(root, full.artifact_path), 'utf8'), 'export const catalog = [];\n');
  });

  await test('DC-05', 'a download from the shared window is recorded with no agent, not a guessed one', async () => {
    download(sharedWc);
    await wait(() => announced.length >= 2);
    assert.strictEqual(announced[1].agentId, null);
  });

  console.log('\n\u2B21  ONE RESOLVER, ONE UI FILE PAIR\n');
  await test('DR-09', "every reader and writer of the index uses its own defaultRoot(), nobody resolves the root themselves", async () => {
    const callers = ['guardian/lib/code-artifact.js', 'guardian/lib/response-sink.js', 'clear-glass/src/ipc/bridge.js', 'clear-glass/src/providers/download-capture.js'];
    for (const f of callers) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(/defaultRoot\(\)/.test(src), `${f} does not use defaultRoot()`);
      assert.ok(!/ensureCompartment\(createHost\(\)\)/.test(src), `${f} still resolves the root itself`);
    }
  });

  // 0.39.241 — the Library moved from ui/library/ to Clear Glass's own window
  // (renderer/library.html, on the Settings runtime); the Responses area moved with it.
  await test('DR-10', 'the Library window has a Responses area in its own JS + CSS, reading this index', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/library.html'), 'utf8');
    assert.ok(html.includes('<script src="library/sections/responses.js"></script>'));
    assert.ok(html.indexOf('library/api.js') < html.indexOf('library/sections/responses.js'), 'api.js must load before the area');
    const js = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/library/sections/responses.js'), 'utf8');
    assert.ok(/\/cli\/downloads\/responses/.test(js) && /section\(\{\s*id: 'responses'/.test(js));
    assert.ok(fs.existsSync(path.join(ROOT, 'clear-glass/renderer/library/sections/responses.css')));
    assert.ok(!fs.existsSync(path.join(ROOT, 'ui/library')), 'ui/library/ is retired — one Library, not two');
  });

  try { fs.unlinkSync(file); } catch (_) {}
  console.log(`\n  ${passed} passed \u00B7 ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
