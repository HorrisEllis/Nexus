'use strict';
/**
 * tests/modules/test-agent-context-always.test.js — SB32, SB33 (docs/2026-10-05-build-from-the-spec-phasemap.spec), 0.39.325.
 * James: "agents always need context, not optional." · "like context isnt optional its vital" ·
 *        "also running the pipeline the agent should be able to do."
 *
 *   CA-01  a question that names no file carries the cards of what a search of its words finds ("tell me about idearium")
 *   CA-02  a question that matches nothing carries the project's map — never an empty context
 *   CA-03  a persona written before indexing is re-grounded on the live index
 *   CA-04  the agent's chunk tool runs the pipeline (POST /api/repos/:uuid/reindex); an unindexed persona says to run it
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-always-'));
  const files = { 'idearium/core.js': "module.exports = { idea: 1 };\n", 'lib/other.js': "module.exports = 2;\n", 'README.md': '# fixture\n', 'docs/atlases/idearium-atlas.md': '# idearium\nWhere his ideas become specs.\n' };
  for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); }
  fs.writeFileSync(path.join(dir, 'graph.json'), JSON.stringify({ nodes: Object.keys(files).map(f => ({ kind: 'file', file: f })), edges: [] }));
  fs.writeFileSync(path.join(dir, 'atlas.json'), JSON.stringify({ fileCount: 3, byLanguage: { javascript: 2 } }));
  fs.mkdirSync(path.join(dir, 'chunks')); fs.writeFileSync(path.join(dir, 'chunks/index.json'), JSON.stringify([{}, {}, {}, {}]));
  return dir;
}

(async () => {
  const server = http.createServer((req, res) => { server.last = `${req.method} ${req.url}`; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ pipeline: { state: 'READY', files: { count: 3 }, chunks: { count: 4 } } })); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  process.env.IDEARIUM_PORT = String(server.address().port);

  const RA = require('../../lib/repo-agent.js');
  const RH = require('../../lib/repo-hat.js');
  const dir = fixture();
  const repo = { uuid: `ctx-${Date.now()}`, name: 'fixture', compartmentId: 'c-1' };

  await test('CA-01', 'no file named → the cards a search of its words finds', () => {
    const c = RA.contextFor({ repo, repoDir: dir, message: 'tell me about idearium' });
    assert.strictEqual(c.kind, 'card', JSON.stringify(c));
    assert.deepStrictEqual(c.cards.map(x => x.file), ['docs/atlases/idearium-atlas.md', 'idearium/core.js'], 'its atlas first, then its code');
    assert.match(c.reason, /found by searching: idearium/);
    assert.match(c.block, /opening:\n# idearium\nWhere his ideas become specs\./, 'a document carries its opening');
  });

  await test('CA-02', 'nothing matches → the map, never nothing', () => {
    const c = RA.contextFor({ repo, repoDir: dir, message: 'hello there' });
    assert.strictEqual(c.kind, 'map');
    assert.match(c.block, /files: 4 · chunks: 4/);
    assert.match(c.block, /idearium\/ 1/);
    assert.ok(c.chars > 0);
  });

  await test('CA-03', 'a persona from before indexing is re-grounded on the live index', () => {
    const stale = { name: 'h', personaPrompt: RH.buildPersona({ repoName: 'fixture', repoUuid: repo.uuid, compartmentId: 'c-1', index: RH.readRepoIndex(null) }) };
    assert.match(stale.personaPrompt, /has NOT been indexed yet/);
    const h = RA._grounded(RH, stale, repo, dir);
    assert.doesNotMatch(h.personaPrompt, /has NOT been indexed yet/);
    assert.match(h.personaPrompt, /- files: 3/);
    assert.match(h.personaPrompt, /- chunks: 4/);
    assert.strictEqual(RA._grounded(RH, h, repo, dir), h, 'a grounded persona is left as it is');
  });

  await test('CA-04', 'the agent runs the pipeline; an unindexed persona says to', async () => {
    const tool = require('../../lib/agent-tools/tools/idearium/repo-chunks.js');
    const r = await tool.execute({ repoUuid: repo.uuid, action: 'reindex' });
    assert.strictEqual(server.last, `POST /api/repos/${repo.uuid}/reindex`);
    assert.deepStrictEqual(r, { ok: true, state: 'READY', files: 3, chunks: 4, error: null });
    const p = RH.buildPersona({ repoName: 'x', repoUuid: 'u-1', compartmentId: 'c', index: RH.readRepoIndex(null) });
    assert.match(p, /idearium\.repo_chunks\.tool \{"repoUuid":"u-1","action":"reindex"\}/);
    assert.doesNotMatch(p, /Ask for the import pipeline/);
  });

  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
