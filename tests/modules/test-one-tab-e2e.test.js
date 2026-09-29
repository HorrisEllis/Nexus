'use strict';
// §0.39.282 — starts NEXUS processes: into the test sandbox first (test-test-sandbox's rule), so nothing writes real data.
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-one-tab-e2e.test.js — 0.39.247
 * James: "repo-agent jobs must use ONE ChatGPT tab ... and the reply must
 * land as a .response in the download manager ... Prove it with a test
 * that goes from job to reply to .response." / "the agents are the ones
 * writing code..."
 *
 * The REAL guardian server (guardian/server.js), booted from an isolated
 * copy of this tree on scratch ports — so its jobs, JAA store and .response
 * nodes land in the copy, never in live data. Around it, only what a real
 * run has on the other side of guardian's sockets:
 *   - ONE tab: an NCP client doing what userscript-chatgpt.js does —
 *     GET /channel (SSE), GUARDIAN_REGISTER, answer each GUARDIAN_JOB with
 *     GUARDIAN_COMPLETE via POST /result, and refuse a job that arrives
 *     mid-reply exactly as the 0.39.247 busy guard does.
 *   - Clear Glass's IPC port: bridge.js's POST /cli/downloads body over
 *     the REAL DownloadsStore, and a recorder for POST /providers/:id/start
 *     (a second tab being opened).
 * Repo jobs go in the way copilot sends them: POST /api/copilot/prompt with
 * an agentId, three at once, from three repos.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { spawn, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'one-tab-e2e-'));
const COPY = path.join(TMP, 'nexus');
const HOME = path.join(TMP, 'home');
const base = 20000 + Math.floor(Math.random() * 20000);
const P = { guardian: base, memory: base + 1, dropzone: base + 2, orch: base + 3, cg: base + 4 };
const PROVIDER = 'chatgpt', TAB = 'pre-warmed-tab';
const REPLY_MS = 400;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); failed++; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const note = m => process.stderr.write(`    · ${m}\n`);
function req(method, port, p, body, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ hostname: '127.0.0.1', port, path: p, method, timeout,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} resolve({ status: res.statusCode, body: j, raw: d }); });
    });
    r.on('error', reject); r.on('timeout', () => { r.destroy(); reject(new Error(`${method} ${p} timed out`)); });
    if (data) r.write(data); r.end();
  });
}

// ── Clear Glass's side: the real DownloadsStore behind bridge.js's handler ──
fs.mkdirSync(HOME, { recursive: true });
process.env.HOME = HOME; process.env.APPDATA = HOME;
const StoreMod = require('../../clear-glass/src/downloads/store.js');
const store = typeof StoreMod === 'function' ? new StoreMod() : (StoreMod.DownloadsStore ? new StoreMod.DownloadsStore() : StoreMod);
const tabStarts = [];
const clearGlass = http.createServer((q, s) => {
  let b = ''; q.on('data', c => b += c);
  q.on('end', () => {
    if (q.method === 'POST' && q.url === '/cli/downloads') {
      const record = store.add(JSON.parse(b || '{}'));
      s.writeHead(200, { 'Content-Type': 'application/json' }); return s.end(JSON.stringify({ ok: true, record }));
    }
    const m = q.url.match(/^\/providers\/([^/]+)\/start$/);
    if (q.method === 'POST' && m) { tabStarts.push({ provider: m[1], body: b }); s.writeHead(200); return s.end(JSON.stringify({ ok: true })); }
    s.writeHead(404); s.end('{}');
  });
});

// ── the one tab ──────────────────────────────────────────────────────────────
const tab = { active: null, received: [], refused: [], answered: [] };
let channelRes = null;
function connectTab() {
  return new Promise((resolve, reject) => {
    const r = http.get({ hostname: '127.0.0.1', port: P.guardian, path: `/channel?provider=${PROVIDER}&tabId=${TAB}` }, res => {
      channelRes = res;
      let buf = '';
      res.on('data', chunk => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = frame.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          let msg; try { msg = JSON.parse(line.slice(6)); } catch (_) { continue; }
          if (msg.type === 'NCP_READY') resolve(res);
          if (msg.type === 'GUARDIAN_JOB') onJob(msg);
          if (msg.type === 'GUARDIAN_PING') req('POST', P.guardian, '/result', { type: 'GUARDIAN_PING_ACK', pingId: msg.pingId, tabId: TAB, provider: PROVIDER }).catch(() => {});
        }
      });
    });
    r.on('error', reject);
  });
}
async function onJob(msg) {
  tab.received.push(msg.jobId);
  if (tab.active && tab.active !== msg.jobId) {                     // the 0.39.247 userscript busy guard
    tab.refused.push(msg.jobId);
    await req('POST', P.guardian, '/result', { type: 'GUARDIAN_ERROR', jobId: msg.jobId, provider: PROVIDER, gate: 'tab_busy', error: `busy with ${tab.active}` });
    return;
  }
  tab.active = msg.jobId;
  await sleep(REPLY_MS);                                             // "typing" the reply
  const text = `reply to [${msg.prompt || msg.content || ''}]`;
  tab.answered.push({ jobId: msg.jobId, text });
  tab.active = null;
  await req('POST', P.guardian, '/result', { type: 'GUARDIAN_COMPLETE', jobId: msg.jobId, provider: PROVIDER, text, chatUrl: 'https://chatgpt.com/c/test' });
}

(async () => {
  console.log('\none ChatGPT tab, end to end: job → reply → .response');
  fs.mkdirSync(COPY, { recursive: true });
  note('copying the tree (without node_modules) to an isolated folder');
  execSync(`tar --exclude=./node_modules --exclude=./.git -cf - . 2>/dev/null | (cd "${COPY}" && tar xf - 2>/dev/null); true`, { cwd: ROOT, shell: '/bin/bash', stdio: 'ignore' });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(COPY, 'node_modules'));
  await new Promise(r => clearGlass.listen(P.cg, '127.0.0.1', r));

  const env = { ...process.env, HOME, APPDATA: HOME, GUARDIAN_HTTP_PORT: String(P.guardian), MEMORY_PORT: String(P.memory),
    GUARDIAN_DROPZONE_PORT: String(P.dropzone), ORCHESTRATOR_PORT: String(P.orch), CLEARGL_IPC_PORT: String(P.cg) };
  const log = [];
  note(`booting guardian on :${P.guardian}`);
  const g = spawn(process.execPath, [path.join(COPY, 'guardian', 'server.js')], { cwd: COPY, env });
  g.stdout.on('data', d => log.push(String(d))); g.stderr.on('data', d => log.push(String(d)));
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    try { channelRes && channelRes.destroy(); } catch (_) {}
    try { g.kill('SIGKILL'); } catch (_) {}
    try { clearGlass.close(); } catch (_) {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  };
  process.on('exit', cleanup);

  let up = false;
  for (let i = 0; i < 160 && !up; i++) { await sleep(250); try { up = (await req('GET', P.guardian, '/health', null, 2000)).status === 200; } catch (_) {} }
  await test('OT-00 the real guardian boots from the isolated copy', () => assert.ok(up, log.join('').slice(-1500)));
  if (!up) { cleanup(); process.exitCode = 1; return; }

  await connectTab();
  await req('POST', P.guardian, '/result', { type: 'GUARDIAN_REGISTER', provider: PROVIDER, host: 'chatgpt.com', tabId: TAB, claimed: true });
  await sleep(300);
  note('tab connected; sending three repo jobs at once');

  const repos = ['repo-nexus-id-repo-aaaa1111', 'repo-nexus-id-repo-bbbb2222', 'repo-nexus-id-repo-cccc3333'];
  const t0 = Date.now();
  const results = await Promise.all(repos.map((agentId, i) =>
    req('POST', P.guardian, '/api/copilot/prompt', { prompt: `build chunk ${i} for ${agentId}`, provider: PROVIDER, agentId, timeoutMs: 45000 }, 60000)
      .catch(e => ({ status: 0, body: null, raw: e.message }))));
  const elapsed = Date.now() - t0;
  note(`replies back in ${elapsed} ms`);
  if (results.some(r => r.status !== 200)) {
    // On failure, show what guardian itself said about these jobs.
    const lines = log.join('').split('\n').filter(l => /\[guardian\]|dispatch|queued|pool|job/i.test(l) && !/\[jaa\]/.test(l));
    note('guardian log (job lines):\n      ' + lines.slice(-40).join('\n      '));
  }

  await test('OT-01 three repo jobs sent at once each get their OWN reply back', () => {
    results.forEach((r, i) => {
      assert.equal(r.status, 200, `job ${i}: HTTP ${r.status} ${String(r.raw).slice(0, 300)}`);
      const text = (r.body && (r.body.text || r.body.response || r.body.content)) || '';
      assert.equal(text, `reply to [build chunk ${i} for ${repos[i]}]`, `job ${i} got: ${JSON.stringify(r.body).slice(0, 300)}`);
    });
  });

  await test('OT-02 the tab answered them one at a time — no job arrived mid-reply, none refused', () => {
    assert.equal(tab.refused.length, 0, `refused: ${tab.refused.join(', ')}`);
    assert.equal(tab.answered.length, 3, `answered ${tab.answered.length}, received ${tab.received.length}`);
    assert.ok(elapsed >= 3 * REPLY_MS, `3 replies of ${REPLY_MS} ms finished in ${elapsed} ms — they overlapped`);
  });

  await test('OT-03 no second tab: nothing asked Clear Glass to open one', () => {
    assert.equal(tabStarts.length, 0, JSON.stringify(tabStarts));
  });

  for (let i = 0; i < 50 && store.list().filter(e => e.kind === 'response').length < 3; i++) await sleep(100);
  const entries = store.list().filter(e => e.kind === 'response');

  await test('OT-04 every reply is in the downloads manager as <jobId>.response', () => {
    assert.equal(entries.length, 3, JSON.stringify(entries).slice(0, 500));
    for (const e of entries) { assert.equal(e.filename, `${e.jobId}.response`); assert.equal(e.state, 'completed'); }
  });

  await test('OT-05 each entry is filed under the repo that asked, not "chatgpt"', () => {
    assert.deepEqual(entries.map(e => e.agentId).sort(), repos.slice().sort());
    for (const e of entries) assert.equal(e.provider, PROVIDER);
  });

  await test('OT-06 each entry\'s file exists, inside the isolated copy, holding that repo\'s reply', () => {
    for (const e of entries) {
      assert.ok(fs.existsSync(e.savePath), `missing ${e.savePath}`);
      assert.ok(e.savePath.startsWith(COPY), `written outside the isolated copy: ${e.savePath}`);
      const i = repos.indexOf(e.agentId);
      assert.ok(fs.readFileSync(e.savePath, 'utf8').includes(`reply to [build chunk ${i} for ${e.agentId}]`), `wrong reply in ${e.savePath}`);
    }
  });

  await test('OT-07 the dispatcher no longer contains the per-repo tab path', () => {
    const d = fs.readFileSync(path.join(ROOT, 'guardian/lib/dispatcher.js'), 'utf8');
    for (const gone of ['_awaitAgentTab(', '_requestAgentTab(', '_fallBackToSharedTab(', 'spawnProviderTab']) assert.ok(!d.includes(gone), gone);
    assert.match(d, /const sent = ncp\.pushActive\(job\.provider, payload\)/);
  });

  cleanup();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
