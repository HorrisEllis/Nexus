'use strict';
/**
 * tests/modules/test-agent-facts.test.js — GA1: Guardian is the source of truth for the Clear Glass agents (E13).
 * guardian/lib/agent-facts.js (the provider nodes, served with their hash) · clear-glass/src/providers/registry.js (a
 * stamped cache of them) · lib/agent-facts-hash.js (the one hash both use).
 *
 *   GA-01  Guardian's facts: five provider nodes valid against schema.provider, deepseek among them; every node's
 *          userscript exists; the hash covers the facts only (not envelope timestamps); provider is a Guardian node type;
 *          /providers no longer hard-codes its list
 *   GA-02  the map's proof (1): a provider added in Guardian alone appears in Clear Glass after its refresh — in the
 *          live table the other modules already imported
 *   GA-03  the map's proof (2): a cache edited by hand is a gap on the next boot (verify stale, 'agent.cache.stale');
 *          the next refresh from Guardian replaces it
 *   GA-04  the map's proof (3): with Guardian down, Clear Glass runs on the stamped cache, and says so
 *   GA-05  Guardian's autostart fact decides which tabs open at boot, under the person's own toggles
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ga1-'));
process.env.NEXUS_DATA_ROOT = path.join(tmp, 'data');   // the cache lands here, never in the repo
const NE = require(path.join(ROOT, 'lib/node-export.js'));
const A = require(path.join(ROOT, 'guardian/lib/agent-facts.js'));
const R = require(path.join(ROOT, 'clear-glass/src/providers/registry.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}
/** a stand-in guardian serving GET /api/providers exactly as server.js does: { ok, ...agentFacts.facts() } */
function guardian() {
  return new Promise((res) => {
    const s = http.createServer((q, r) => { r.writeHead(q.url === '/api/providers' ? 200 : 404, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(q.url === '/api/providers' ? { ok: true, ...A.facts() } : { ok: false })); });
    s.listen(0, '127.0.0.1', () => res({ url: `http://127.0.0.1:${s.address().port}`, close: () => new Promise(r => s.close(r)) }));
  });
}

(async () => {
  console.log('\ntest-agent-facts — Guardian is the source of truth for the Clear Glass agents (GA1)');

  await test('GA-01', "Guardian's provider nodes: valid, deepseek included, userscripts real, hashed by facts only", async () => {
    const S = require(path.join(ROOT, 'lib/node-schemas.js'));
    const f = A.facts();
    assert.deepStrictEqual(f.providers.map(p => p.id), ['chatgpt', 'claude', 'deepseek', 'gemini', 'perplexity']);
    for (const file of fs.readdirSync(A.dir())) {
      const d = NE.importFromFile(path.join(A.dir(), file));
      assert.ok(S.checkPayload('provider', d.payload).ok, file);
      assert.ok(fs.existsSync(path.join(ROOT, 'guardian', d.payload.userscriptFile)), `${d.payload.userscriptFile} exists`);
    }
    const again = A.hash(f.providers.map(p => ({ ...p, exported_at: 1, lastSeenAt: 2 })));
    assert.strictEqual(again, f.hash, 'timestamps are not facts');
    assert.notStrictEqual(A.hash(f.providers.map(p => p.id === 'gemini' ? { ...p, url: 'https://x' } : p)), f.hash, 'a fact change changes the hash');
    assert.ok(fs.readFileSync(path.join(ROOT, 'guardian/lib/node-registry.js'), 'utf8').includes("'response', 'provider']"), 'provider is a Guardian node type');
    const srv = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
    assert.ok(srv.includes("url.pathname==='/api/providers'") && !srv.includes("{ claude:'null', chatgpt:'null', gemini:'null', perplexity:'null', ollama:'null' }"), '/providers reads the nodes; /api/providers serves them');
  });

  const nodesDir = path.join(tmp, 'provider-nodes');
  fs.cpSync(A.dir(), nodesDir, { recursive: true });
  process.env.GUARDIAN_PROVIDER_NODES = nodesDir;   // a Guardian whose nodes the test can change

  await test('GA-02', 'a provider added in Guardian alone appears in Clear Glass after its refresh', async () => {
    const g = await guardian();
    try {
      const first = await R.refresh({ guardianUrl: g.url });
      assert.ok(first.ok && first.changed, JSON.stringify(first));
      assert.strictEqual(R.verify().from, 'guardian');
      const live = R.NCP_PROVIDERS;   // the object host.js / selector-assign.js imported
      const doc = NE.wrap('provider', 'mistralchat', { id: 'mistralchat', name: 'Le Chat', url: 'https://chat.mistral.ai', hosts: ['chat.mistral.ai'], userscriptFile: 'userscript-mistralchat.js', autostart: false }, { system: 'guardian' });
      fs.writeFileSync(path.join(nodesDir, 'mistralchat.provider'), NE.toYaml(doc));
      assert.ok(!R.listProviders().some(p => p.id === 'mistralchat'), 'not before the refresh');
      const r = await R.refresh({ guardianUrl: g.url });
      assert.ok(r.ok && r.changed); assert.strictEqual(r.count, 6);
      assert.ok(R.listProviders().some(p => p.id === 'mistralchat'));
      assert.strictEqual(live.mistralchat.url, 'https://chat.mistral.ai', 'the live table, updated in place');
      assert.strictEqual(R.getProvider('mistralchat').name, 'Le Chat');
      assert.ok(fs.existsSync(R._cacheFile()), 'written to the cache'); assert.ok(R._cacheFile().startsWith(tmp));
      const same = await R.refresh({ guardianUrl: g.url });
      assert.deepStrictEqual([same.ok, same.changed], [true, false], 'unchanged facts → no rewrite');
    } finally { await g.close(); }
  });

  await test('GA-03', 'a cache edited by hand is a gap on the next boot; the next refresh replaces it', async () => {
    const c = JSON.parse(fs.readFileSync(R._cacheFile(), 'utf8'));
    c.providers.find(p => p.id === 'chatgpt').url = 'https://evil.example';
    fs.writeFileSync(R._cacheFile(), JSON.stringify(c));
    R._reload();   // the next boot
    const v = R.verify();
    assert.deepStrictEqual([v.ok, v.stale], [false, true]); assert.match(v.reason, /does not match its stamp/);
    const g = await guardian();
    try {
      const seen = [];
      const r = await R.refresh({ guardianUrl: g.url, emit: (type, data) => seen.push({ type, data }) });
      assert.strictEqual(seen[0].type, 'agent.cache.stale'); assert.match(seen[0].data.reason, /edited outside Guardian/);
      assert.ok(r.ok && r.changed, 'Guardian\'s facts replace the edited cache');
      assert.ok(R.verify().ok); assert.strictEqual(R.getProvider('chatgpt').url, 'https://chatgpt.com');
    } finally { await g.close(); }
  });

  await test('GA-04', 'with Guardian down, Clear Glass runs on the stamped cache and says so', async () => {
    const before = R.verify().hash;
    const r = await R.refresh({ guardianUrl: 'http://127.0.0.1:9', timeoutMs: 1500 });
    assert.deepStrictEqual([r.ok, r.usingCache, r.from], [false, true, 'guardian']);
    assert.match(r.error, /guardian's agent facts not read/);
    assert.strictEqual(R.verify().hash, before); assert.ok(R.listProviders().length >= 5, 'still running on the cache');
  });

  await test('GA-05', "Guardian's autostart fact decides the boot tabs, under the person's toggles", async () => {
    assert.strictEqual(R.autoBootList(undefined, {}), 'chatgpt,deepseek', "Guardian's autostart: chatgpt and deepseek");
    assert.deepStrictEqual(R.autoBootList(undefined, { gemini: true, chatgpt: false }).split(',').sort(), ['deepseek', 'gemini'], 'a toggle overrides the fact');
    assert.strictEqual(R.autoBootList('claude', {}), 'claude', 'CG_AUTOBOOT_PROVIDERS still wins');
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
