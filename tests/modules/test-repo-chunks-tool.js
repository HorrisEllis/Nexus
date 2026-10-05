'use strict';
/**
 * tests/modules/test-repo-chunks-tool.js — idearium.repo_chunks.tool: the compartment
 * agent reads its repo's chunk nodes for context.
 *
 * The tool is real code making real HTTP requests; the stand-in is only the idearium
 * server, a real http server on a free port that records every request it gets and answers
 * the three routes' shapes. So the tests check what actually went over the wire.
 */
const assert = require('assert');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e.message}`); }
}

(async () => {
  const seen = [];
  const BIG = 'x'.repeat(30000);
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/repos/r1/search') return send(200, { ok: true, matches: [{ symbol: 'poll', file: 'api/index.js', chunkId: 'c1' }], q: u.searchParams.get('q') });
    if (u.pathname === '/api/repos/r1/chunks') return send(200, { ok: true, chunks: [{ id: 'c1', file: u.searchParams.get('file') || 'api/index.js', range: [1, 40] }] });
    if (u.pathname === '/api/repos/r1/chunks/c1') return send(200, { ok: true, chunk: { id: 'c1', content: 'const poll = 1; // 日本語 ü' } });
    if (u.pathname === '/api/repos/r1/proof') return send(200, { ok: true, chunks: [{ chunkId: u.searchParams.get('chunk'), proof: 'passed', stale: false }], state: u.searchParams.get('state') });
    if (u.pathname === '/api/repos/r1/chunks/big') return send(200, { ok: true, chunk: { id: 'big', content: BIG } });
    return send(404, { ok: false, error: `no such ${u.pathname}` });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  process.env.IDEARIUM_PORT = String(server.address().port); // read when the tool loads
  const tool = require(path.join(ROOT, 'lib/agent-tools/tools/idearium/repo-chunks.js'));
  const exec = (a) => tool.execute(a);

  await t('it is named by the dotted convention and asks for repoUuid and action', () => {
    assert.strictEqual(tool.name, 'idearium.repo_chunks.tool');
    assert.deepStrictEqual(tool.parameters.required, ['repoUuid', 'action']);
    assert.deepStrictEqual(tool.parameters.properties.action.enum, ['search', 'list', 'get', 'proof', 'reindex']);   // §SB33 0.39.325 — the agent runs the pipeline
  });
  await t('search sends GET /api/repos/:uuid/search?q= with the query encoded, and returns the body', async () => {
    const r = await exec({ repoUuid: 'r1', action: 'search', query: 'poll & write' });
    assert.ok(seen.includes('GET /api/repos/r1/search?q=poll%20%26%20write'), seen.join('|'));
    assert.strictEqual(r.matches[0].chunkId, 'c1'); assert.strictEqual(r.q, 'poll & write');
  });
  await t('list sends the optional file filter only when given', async () => {
    await exec({ repoUuid: 'r1', action: 'list' });
    await exec({ repoUuid: 'r1', action: 'list', file: 'src/a b.js' });
    assert.ok(seen.includes('GET /api/repos/r1/chunks')); assert.ok(seen.includes('GET /api/repos/r1/chunks?file=src%2Fa%20b.js'));
  });
  await t('get returns one chunk\'s real text, multi-byte characters intact', async () => {
    const r = await exec({ repoUuid: 'r1', action: 'get', chunkId: 'c1' });
    assert.strictEqual(r.chunk.content, 'const poll = 1; // 日本語 ü');
  });
  await t('an oversized chunk is cut at the cap and says so (does not flood the model)', async () => {
    const r = await exec({ repoUuid: 'r1', action: 'get', chunkId: 'big' });
    assert.strictEqual(r.chunk.content.length, 12000);
    assert.deepStrictEqual(r.truncated, { at: 12000, originalChars: 30000 });
  });
  await t('proof sends the chunk / file / state filters that were given, and returns the stored proof', async () => {
    const r = await exec({ repoUuid: 'r1', action: 'proof', chunkId: 'c1', state: 'passed' });
    assert.ok(seen.includes('GET /api/repos/r1/proof?chunk=c1&state=passed'), seen.join('|'));
    assert.strictEqual(r.chunks[0].proof, 'passed'); assert.strictEqual(r.chunks[0].stale, false);
    await exec({ repoUuid: 'r1', action: 'proof' });
    assert.ok(seen.includes('GET /api/repos/r1/proof'));
  });
  await t('a server error is returned as {error}, not thrown', async () => {
    const r = await exec({ repoUuid: 'nope', action: 'list' });
    assert.ok(/no such/.test(r.error), JSON.stringify(r));
  });
  await t('bad input is refused BEFORE any request is made', async () => {
    const n = seen.length;
    for (const a of [{ action: 'list' }, { repoUuid: '../x', action: 'list' }, { repoUuid: 'r1', action: 'search' }, { repoUuid: 'r1', action: 'get' }, { repoUuid: 'r1', action: 'get', chunkId: 'a/b' }, { repoUuid: 'r1', action: 'delete' }, { repoUuid: 'r1', action: 'proof', chunkId: 'a/b' && '' }].slice(0, 6)) {
      const r = await exec(a); assert.ok(r.error, JSON.stringify(a));
    }
    assert.strictEqual(seen.length, n, 'a refused call reached the server');
  });
  await t('an unreachable idearium is an {error}, not a crash', async () => {
    const dead = http.createServer(); await new Promise(r => dead.listen(0, '127.0.0.1', r)); const port = dead.address().port; await new Promise(r => dead.close(r));
    delete require.cache[require.resolve(path.join(ROOT, 'lib/agent-tools/tools/idearium/repo-chunks.js'))];
    const old = process.env.IDEARIUM_PORT; process.env.IDEARIUM_PORT = String(port);
    const t2 = require(path.join(ROOT, 'lib/agent-tools/tools/idearium/repo-chunks.js'));
    const r = await t2.execute({ repoUuid: 'r1', action: 'list' });
    process.env.IDEARIUM_PORT = old;
    assert.ok(r.error && /ECONNREFUSED|connect/i.test(r.error), JSON.stringify(r));
  });

  console.log('\n── the agent can actually use it ────────────────────────');
  const AT = require(path.join(ROOT, 'lib/agent-tools/index.js'));
  const RH = require(path.join(ROOT, 'lib/repo-hat.js'));
  await t('it is in the live tool registry, and in the compartment hat\'s tool scope', () => {
    const names = AT.getToolSchemas().map(s => s.name || (s.function && s.function.name));
    assert.ok(names.includes('idearium.repo_chunks.tool'));
    assert.ok(RH.REPO_TOOL_SCOPE.includes('idearium.repo_chunks.tool'));
  });
  await t('the persona names the tool and the repo uuid when the repo is indexed, and stays silent when it is not', () => {
    const idx = { indexed: true, languages: ['js'], kinds: ['function'], fileCount: 3, symbolCount: 9, chunkCount: 5, verification: 'passed' };
    const yes = RH.buildPersona({ repoName: 'p', repoUuid: 'repo-uuid-1', compartmentId: 'cos.x', index: idx });
    assert.ok(yes.includes('idearium.repo_chunks.tool') && yes.includes('repoUuid="repo-uuid-1"'), yes);
    const no = RH.buildPersona({ repoName: 'p', repoUuid: 'repo-uuid-1', compartmentId: 'cos.x', index: { indexed: false, languages: [], kinds: [] } });
    // §SB33 0.39.325 — the one thing an unindexed agent is told to do with the tool is run the pipeline, never to query chunks
    assert.ok(!/repo_chunks\.tool[^\n]*"action":"(search|list|get|proof)"/.test(no) && !/code_search|code_chunk/.test(no), 'told an unindexed repo\'s agent to query chunks that do not exist');
    assert.ok(no.includes('"action":"reindex"'), 'an unindexed agent runs the pipeline itself');
  });

  server.close();
  console.log(`\n${fail ? '✗' : '✓'} repo-chunks-tool: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
