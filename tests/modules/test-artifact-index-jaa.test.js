'use strict';
/**
 * tests/modules/test-artifact-index-jaa.test.js — v0.39.241
 * James, on "better-sqlite3 is not installed … index.db is skipped": "use jaa for
 * the database". The Responses index (clear-glass/src/downloads/artifact-chat-index.js)
 * is now a JaaStore table (guardian/jaa-store.js) at <compartment>/index-jaa/items.json.
 *
 * Real modules, test sandbox. The cross-process case uses a real child process
 * running guardian's real writer, because that is the production shape: guardian
 * writes, Clear Glass and idearium read, three processes.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
require(path.join(ROOT, 'lib', 'test-sandbox.js')).ensure();
const IDX = require(path.join(ROOT, 'clear-glass/src/downloads/artifact-chat-index.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); failed++; } }

(async () => {
  const root = IDX.defaultRoot();
  const jaaFile = path.join(root, 'index-jaa', 'items.json');
  const respDir = path.join(root, 'responses');
  console.log('\n⬡  RESPONSES INDEX ON JAA\n');

  await test('JX-01', 'the index module no longer requires better-sqlite3 anywhere', () => {
    const src = fs.readFileSync(path.join(ROOT, 'clear-glass/src/downloads/artifact-chat-index.js'), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    assert.ok(!/require\(['"]better-sqlite3['"]\)/.test(src) && !/_openDb|\.prepare\(/.test(src));
    assert.ok(/require\('\.\.\/\.\.\/\.\.\/guardian\/jaa-store\.js'\)/.test(src));
  });

  // Replies written before the index existed (all of them, on James's machine).
  fs.mkdirSync(respDir, { recursive: true });
  for (let i = 0; i < 3; i++) {
    fs.writeFileSync(path.join(respDir, `pre-${i}.response`), JSON.stringify({ id: `pre-${i}`, kind: 'chat', provider: 'chatgpt',
      agent_id: 'repo-old', job_id: `job-pre-${i}`, captured_at: 1000 + i, content_hash: `h${i}`, raw: { response: `old ${i}` } }));
  }
  await test('JX-02', 'replies that were never indexed are indexed on the first read, newest first', () => {
    assert.ok(!fs.existsSync(jaaFile), 'precondition: no index yet');
    const rows = IDX.queryItems(root, { agentId: 'repo-old' });
    assert.deepStrictEqual(rows.map(r => r.id), ['pre-2', 'pre-1', 'pre-0']);
    assert.ok(fs.existsSync(jaaFile), 'items.json not written');
    assert.strictEqual(JSON.parse(fs.readFileSync(jaaFile, 'utf8')).length, 3);
  });

  await test('JX-03', 'the index is JAA only — no guardian settings rows bootstrapped into it', () => {
    assert.deepStrictEqual(fs.readdirSync(path.join(root, 'index-jaa')).filter(f => f.endsWith('.json')), ['items.json']);
  });

  await test('JX-04', 'a write is indexed and on disk at once (not after JAA’s 1.5 s debounce)', () => {
    const r = IDX.recordResponse(root, { kind: 'chat', provider: 'claude', agentId: 'repo-a', jobId: 'job-a', raw: { response: 'hi' } });
    assert.strictEqual(r.indexed, true, r.indexError);
    assert.ok(JSON.parse(fs.readFileSync(jaaFile, 'utf8')).some(x => x.id === r.id && x.agent_id === 'repo-a' && x.job_id === 'job-a'));
  });

  await test('JX-05', 'another process (guardian’s real writer) writes; this process sees the row on its next read', () => {
    const script = `require(${JSON.stringify(path.join(ROOT, 'lib/test-sandbox.js'))}).ensure();
      const { recordAgentResponse } = require(${JSON.stringify(path.join(ROOT, 'guardian/lib/code-artifact.js'))});
      const r = recordAgentResponse({ job: { id: 'job-child', provider: 'gemini', agentId: 'repo-child', prompt: 'p' }, text: 'from the child', blocks: [] });
      process.stdout.write(JSON.stringify({ id: r.id, indexed: r.indexed })); process.exit(0);`;
    const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { env: process.env, encoding: 'utf8' }).trim().split('\n').pop());
    assert.strictEqual(out.indexed, true);
    const rows = IDX.queryItems(root, { agentId: 'repo-child' });
    assert.strictEqual(rows.length, 1); assert.strictEqual(rows[0].id, out.id); assert.strictEqual(rows[0].job_id, 'job-child');
  });

  await test('JX-06', 'filters combine (agent AND job AND provider)', () => {
    assert.strictEqual(IDX.queryItems(root, { agentId: 'repo-old', jobId: 'job-pre-1' }).length, 1);
    assert.strictEqual(IDX.queryItems(root, { agentId: 'repo-old', provider: 'claude' }).length, 0);
  });

  await test('JX-07', 'a deleted index is rebuilt from responses/ on the next read — nothing lost', () => {
    const before = IDX.queryItems(root, { limit: 1000 }).length;
    fs.rmSync(jaaFile);
    // a fresh process has no in-memory copy; this one does, so model that honestly by clearing it too
    const { JaaStore } = require(path.join(ROOT, 'guardian/jaa-store.js'));
    const fresh = new JaaStore(path.join(root, 'index-jaa'), { tables: ['items'], settings: false });
    assert.strictEqual(fresh.count('items'), 0);
    const r = IDX.rebuildIndexFromResponses(root);
    assert.strictEqual(r.total, before);
    assert.strictEqual(JSON.parse(fs.readFileSync(jaaFile, 'utf8')).length, before);
  });

  await test('JX-08', 'an unreadable .response is indexed as unreadable, never dropped', () => {
    fs.writeFileSync(path.join(respDir, 'broken.response'), '{not json');
    const rows = IDX.queryItems(root, { limit: 1000 });
    const b = rows.find(r => r.id === 'broken');
    assert.ok(b && b.status === 'unreadable');
  });

  await test('JX-09', 'if JAA itself fails, responses/ is still read directly', () => {
    const { JaaStore } = require(path.join(ROOT, 'guardian/jaa-store.js'));
    const orig = JaaStore.prototype.reloadTable;
    JaaStore.prototype.reloadTable = () => { throw new Error('simulated JAA failure'); };
    try { const got = IDX.queryItems(root, { agentId: 'repo-child' }); assert.strictEqual(got.length, 1, JSON.stringify(got)); }
    finally { JaaStore.prototype.reloadTable = orig; }
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
