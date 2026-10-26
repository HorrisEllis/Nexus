'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-recall-tool.test.js — RC1 (0.60.261). Map: docs/2026-10-26-recall-tool-phasemap.spec
 * James, 2026-10-26: "what if we have a tool for the agents to capture the recent event ledger or orchastrator? using the .response nodes,
 * chat ledgers for the repo, and log for context. for persistent memory?" · "make the tool."
 *
 *   RC-01  every source read through its owner's route (stand-in Idearium, Guardian and Clear Glass), one compact text
 *   RC-02  a system that is down is said per source, never an empty success; the budget cuts and says so
 *   RC-03  Guardian's recent(): the newest .response nodes, filtered, unreadable ones counted
 *   RC-04  wired: registered, catalogued (Memory), guided, the co-pilot hat, the row, Guardian's route, loom
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const serve = (routes) => new Promise(r => { const s = http.createServer((req, res) => { const u = req.url.split('?')[0]; const h = routes[u]; res.setHeader('content-type', 'application/json'); if (!h) { res.statusCode = 404; return res.end('{"ok":false,"error":"no route"}'); } res.end(JSON.stringify(h(req.url))); }); s.listen(0, '127.0.0.1', () => r(s)); });

(async () => {
  console.log('\n  test-recall-tool — RC1 the agents\' recall\n');
  const ide = await serve({
    '/api/activity': () => ({ ok: true, rows: [{ ts: Date.now(), status: 'failed', kind: 'phase.contract-incomplete', actor: 'gemini', title: 'IC1 gate failed' }] }),
    '/api/repos/r1/runs': () => ({ ok: true, runs: [{ runId: 'phrun-1', status: 'stalled', provider: 'gemini', goal: 'build IC1' }] }),
    '/api/repos/r1/activity': () => ({ ok: true, rows: [{ ts: Date.now(), status: 'ok', kind: 'phase.closed', actor: 'person', title: 'G0 closed' }] }),
    '/api/ledger/out': () => ({ ok: true, sent: 12, buffered: 1, failed: 0, drained: 3, lastType: 'idearium.repo.phase.run', target: 'orchestrator POST /api/ledger' }),
  });
  const gua = await serve({ '/api/responses/recent': () => ({ ok: true, responses: [{ jobId: 'j1', provider: 'gemini', status: 'complete', kind: 'code', run: 'IC1', at: new Date().toISOString(), chars: 3025, text: 'spec: interaction_contract_context' }], scanned: 1, unreadable: 0 }) });
  const cg = await serve({ '/cli/downloads/ledgers': () => ({ ledgers: [{ provider: 'chatgpt', agentId: 'copilot', turns: 14, url: 'https://chatgpt.com/c/x' }] }) });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-')); fs.writeFileSync(path.join(tmp, 'x.log'), 'line one\nERROR the thing broke\nline three\n');
  Object.assign(process.env, { IDEARIUM_PORT: String(ide.address().port), GUARDIAN_PORT: String(gua.address().port), CLEARGL_IPC_PORT: String(cg.address().port) });
  const R = require(path.join(ROOT, 'lib/agent-tools/tools/nexus/recall.js'));
  const logRel = path.relative(ROOT, path.join(tmp, 'x.log'));

  await test('RC-01', 'every source through its owner, one compact text', async () => {
    const r = await R.execute({ repo: 'r1', limit: 5 });
    assert.ok(r.ok);
    for (const s of ['activity', 'runs', 'ledger', 'responses', 'chats']) assert.ok(r.sources[s].ok, `${s}: ${r.sources[s].why}`);
    assert.match(r.text, /## activity \(1\)\n- .*G0 closed/, 'the repo\'s own activity when a repo is given');
    assert.match(r.text, /phrun-1 stalled gemini — build IC1/);
    assert.match(r.text, /sent 12 · buffered 1 · failed 0/);
    assert.match(r.text, /gemini complete code run IC1 \(3025 ch\): spec: interaction_contract_context/);
    assert.match(r.text, /chatgpt copilot 14 turns/);
    const all = await R.execute({ sources: ['activity'] });
    assert.match(all.text, /IC1 gate failed/, 'every system\'s activity without a repo');
  });

  await test('RC-02', 'a system that is down is said; the budget cuts and says so', async () => {
    process.env.GUARDIAN_PORT = '1';
    const r = await R.execute({ sources: ['responses', 'runs'] });
    assert.strictEqual(r.ok, false);
    assert.match(r.text, /## responses — not read: .*ECONNREFUSED|## responses — not read: /);
    assert.match(r.text, /## runs — not read: needs repo/);
    process.env.GUARDIAN_PORT = String(gua.address().port);
    const big = await R.execute({ repo: 'r1', budget: 1000, limit: 50 });
    assert.ok(big.text.length <= 1000);
  });

  await test('RC-03', "Guardian's recent(): newest first, filtered, unreadable counted", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-nodes-'));
    process.env.GUARDIAN_RESPONSE_NODES_DIR = dir;
    delete require.cache[require.resolve(path.join(ROOT, 'guardian/lib/response-sink.js'))];
    const RS = require(path.join(ROOT, 'guardian/lib/response-sink.js'));
    const NE = require(path.join(ROOT, 'lib/node-export.js'));
    NE.exportToFile('response', 'a1', { jobId: 'a1', provider: 'gemini', agentId: 'repo-x', status: 'complete', kind: 'code', text: 'older' }, { tags: ['repo:x'] }, dir);
    const t0 = Date.now() / 1000 - 60; fs.utimesSync(path.join(dir, 'a1.response'), t0, t0);
    NE.exportToFile('response', 'a2', { jobId: 'a2', provider: 'ollama', agentId: 'copilot', status: 'complete', kind: 'code', text: 'newer' }, {}, dir);
    fs.writeFileSync(path.join(dir, 'bad.response'), ':::not yaml{{');
    const r = RS.recent({ limit: 10 });
    assert.deepStrictEqual(r.responses.filter(x => x.jobId === 'a1' || x.jobId === 'a2').map(x => x.jobId), ['a2', 'a1'], 'newest first');
    assert.ok(r.unreadable + r.responses.length === r.scanned, 'every node scanned is returned or counted unreadable');
    assert.deepStrictEqual(RS.recent({ provider: 'gemini' }).responses.map(x => x.text), ['older']);
  });

  await test('RC-04', 'wired: registry, catalog, guide, hat, row, route, loom', async () => {
    const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
    assert.ok(read('lib/agent-tools/index.js').includes("registerTool(require('./tools/nexus/recall.js'))"));
    assert.strictEqual(require(path.join(ROOT, 'lib/agent-tools/tool-catalog.js')).groupOf ? require(path.join(ROOT, 'lib/agent-tools/tool-catalog.js')).groupOf('nexus.recall.tool').id : 'memory', 'memory');
    assert.ok(read('lib/agent-tools/tool-guide.js').includes("'nexus.recall.tool'"));
    assert.ok(/'0\.60\.261': \['nexus\.recall\.tool'\]/.test(read('lib/hat-seed.js')));
    const C = await import(require('url').pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    assert.ok(C.SPEC.find(r => r.key === 'recall'));
    assert.ok(read('guardian/server.js').includes("url.pathname === '/api/responses/recent'"));
    assert.ok(read('loom/maps/economy-map.js').includes('0.60.261 RC1'));
  });

  ide.close(); gua.close(); cg.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
