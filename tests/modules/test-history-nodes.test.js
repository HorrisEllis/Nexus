'use strict';
/**
 * tests/modules/test-history-nodes.test.js — Idearium's history as nodes, one per unit (HN1–HN3, 0.60.285)
 * James, 2026-10-29: "i want all the history in idearium saved as nodes per unit. like a .reponse, .input, all of the taxonomy and expand
 * if needed." · "what about .node types for each language/code block for each agent?"
 *
 *   HN-01  codeBlocks: each fenced block with its language as written and normalized, sha, lines; ~~~ fences; an unclosed one said
 *   HN-02  an exchange with two tool calls and three code blocks → 1 exchange, 1 input, 1 response, 2 tool_call, 3 code_block nodes, each
 *          valid against its schema; the whole reply kept past 8000 characters; Idearium's own node registry indexes them, none invalid
 *   HN-03  record() never throws into the agent's dispatch; a test process writes nothing unless pointed at its own folder; _log calls it
 *          with the whole reply and the tool calls
 *   HN-04  backfill: old log rows → nodes, a cut reply marked truncated; a second backfill writes nothing new
 *   HN-05  read by language and by agent; the route and the command
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

const REPLY = [
  'Here is the fix.', '```js', 'const a = 1;', 'module.exports = a;', '```', 'And a script:', '~~~python', 'print("hi")', '~~~',
  'Then run:', '```', 'npm test', '```', 'x'.repeat(9000),
].join('\n');

(async () => {
  console.log('\n⬡  Idearium\'s history as nodes, one per unit\n');
  const HN = require(path.join(ROOT, 'lib/repo-history-nodes.js'));
  const NS = require(path.join(ROOT, 'lib/node-schemas.js'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-'));

  await test('HN-01', 'codeBlocks: language as written and normalized; ~~~; an unclosed fence said', async () => {
    const b = HN.codeBlocks(REPLY);
    assert.deepStrictEqual(b.map(x => [x.language, x.lang, x.lines]), [['js', 'javascript', 2], ['python', 'python', 1], ['', 'text', 1]]);
    assert.strictEqual(b[0].code, 'const a = 1;\nmodule.exports = a;');
    assert.match(b[0].sha, /^[0-9a-f]{64}$/);
    const u = HN.codeBlocks('look\n```ts\nlet x: number = 1;\n');
    assert.deepStrictEqual([u.length, u[0].lang, u[0].unclosed], [1, 'typescript', true]);
  });

  const row = { uuid: 'ex-1', repoUuid: 'repo-a', hatName: 'the_builder', message: 'fix the bug', response: REPLY.slice(0, 8000), ok: true, provider: 'claude', backend: 'guardian', elapsedMs: 4200, ts: 1793260000000, injects: [{ uuid: 'inj-1' }] };
  const toolCalls = [{ name: 'read_file', arguments: { path: 'a.js' }, result: { content: 'x' }, iteration: 1 }, { name: 'run_command', arguments: { cmd: 'rm -rf /' }, result: { error: 'refused' }, iteration: 2 }];

  await test('HN-02', 'one exchange → its nodes, each valid; the whole reply kept; Idearium\'s registry indexes them', async () => {
    const env = HN.nodesFor({ exchangeId: row.uuid, repoUuid: row.repoUuid, message: row.message, text: REPLY, ok: true, provider: 'claude', model: 'opus', hat: 'the_builder', toolCalls, injects: row.injects, ts: row.ts });
    const count = {}; for (const e of env) count[e.type] = (count[e.type] || 0) + 1;
    assert.deepStrictEqual(count, { exchange: 1, input: 1, response: 1, tool_call: 2, code_block: 3 });
    for (const e of env) { const c = NS.checkPayload(e.type, e.payload); assert.ok(c.ok, `${e.type} ${e.id}: ${JSON.stringify(c)}`); }
    const resp = env.find(e => e.type === 'response').payload;
    assert.deepStrictEqual([resp.text.length, resp.chars, resp.source, resp.jobId], [REPLY.length, REPLY.length, 'idearium.repo-agent', 'ex-1'], 'the whole reply, past 8000');
    const ex = env.find(e => e.type === 'exchange').payload;
    assert.deepStrictEqual([ex.parts.toolCalls.length, ex.parts.codeBlocks.length, ex.parts.injects], [2, 3, ['inj-1']]);
    assert.deepStrictEqual(env.filter(e => e.type === 'tool_call').map(e => e.payload.ok), [true, false], 'a refused call kept as failed');
    assert.deepStrictEqual(env.find(e => e.id === 'cb:ex-1:0').payload.agent, { provider: 'claude', model: 'opus', hat: 'the_builder' });
    const w = HN.write(env, { root });
    assert.deepStrictEqual([w.written, w.errors], [8, []]);
    const R = require(path.join(ROOT, 'lib/node-registry.js')).createNodeRegistry({ system: 'idearium', root, fresh: true });
    const s = R.scan();
    assert.ok(s.indexed >= 8 && (s.invalid || []).length === 0, JSON.stringify(s).slice(0, 400));
  });

  await test('HN-03', 'record() never throws; a test process writes nothing unless pointed; _log calls it with the whole reply and tool calls', async () => {
    const r = HN.record(row, { text: REPLY, toolCalls });
    assert.ok(r.ok && r.written === 0 && /a test process/.test(r.skipped), JSON.stringify(r));
    const bad = HN.record({ uuid: null }, { root, log: () => {} });
    assert.ok(bad.ok === false && /required/.test(bad.why), 'a bad row is said, not thrown');
    const src = fs.readFileSync(path.join(ROOT, 'lib/repo-agent.js'), 'utf8');
    assert.match(src, /if \(row\) require\('\.\/repo-history-nodes\.js'\)\.record\(row, \{ text: out\.ok \? out\.text : null, message, toolCalls: out\.toolCalls \|\| null, model: out\.model \|\| null \}\);/);
  });

  await test('HN-04', 'backfill: old rows → nodes, a cut reply marked truncated; a second backfill writes nothing new', async () => {
    const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'hn2-'));
    const rows = [{ ...row, uuid: 'old-1' }, { ...row, uuid: 'old-2', response: 'short ```sh\nls\n```', ok: true }, { ...row, uuid: 'old-3', ok: false, response: null, error: 'Idearium did not answer' }];
    const a = HN.backfill({ rows, root: root2 });
    assert.deepStrictEqual([a.exchanges, a.truncated, a.errors.length], [3, 1, 0], JSON.stringify(a));
    const ex1 = HN.read({ repoUuid: 'repo-a', root: root2 }).find(x => x.exchangeId === 'old-1');
    assert.ok(ex1.truncated && ex1.response.truncated, 'the cut reply is marked');
    const ex3 = HN.read({ repoUuid: 'repo-a', root: root2 }).find(x => x.exchangeId === 'old-3');
    assert.deepStrictEqual([ex3.ok, ex3.response.status, ex3.response.text], [false, 'error', 'Idearium did not answer']);
    const b = HN.backfill({ rows, root: root2 });
    assert.deepStrictEqual([b.exchanges, b.skipped], [0, 3]);
  });

  await test('HN-05', 'read by language and by agent; the route and the command', async () => {
    const py = HN.read({ repoUuid: 'repo-a', root, lang: 'python' });
    assert.deepStrictEqual([py.length, py[0].codeBlocks.map(c => c.lang)], [1, ['python']]);
    assert.strictEqual(HN.read({ repoUuid: 'repo-a', root, provider: 'chatgpt' }).length, 0);
    assert.strictEqual(HN.read({ repoUuid: 'repo-a', root, provider: 'claude' })[0].toolCalls.length, 2);
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/\['GET',\s+\['api','repos',\s+':uuid','history-nodes'\],\s+'repo\.history-nodes'\]/.test(api) && /case 'repo\.history-nodes': case 'repo\.history-nodes\.backfill':/.test(api));
    const { SPEC } = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const r = SPEC.find(x => x.key === 'repo.history-nodes');
    assert.deepStrictEqual(r.req({ repo: { uuid: 'u1' }, args: [], flags: { lang: 'python' } }), { method: 'GET', path: '/api/repos/u1/history-nodes?lang=python' });
    assert.strictEqual(r.req({ repo: { uuid: 'u1' }, args: [], flags: { backfill: true } }).path, '/api/repos/u1/history-nodes/backfill');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
