'use strict';
/**
 * tests/modules/test-cm3-commands.test.js — §0.45.0 CM3: this session's work as commands first, API routes where they fit.
 * James: "where is any of this? like i dont see any changes. like what have you been adding? also next make sure these are
 * all commands first, api routes if applicaple. also where is the background tasks? it hasnt built any phase yet."
 */
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
process.env.NEXUS_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cm3-'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack.split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
function fakeRes() { const r = { code: 0, body: null, writeHead(c) { r.code = c; }, setHeader() {}, end(b) { try { r.body = JSON.parse(b); } catch (_) { r.body = b; } } }; return r; }

(async () => {
  console.log('\n⬡  CM3 — commands first\n');
  const { SPEC } = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
  const row = (k) => SPEC.find(r => r.key === k);

  await test('CM3-01', 'the rows exist: repo phasemap, repo phase (runs | build), repo versions, store, ollama tape — and their requests', async () => {
    for (const k of ['repo.phasemap', 'repo.phase', 'repo.versions', 'store', 'ollama.tape']) assert.ok(row(k), `no row ${k}`);
    const repo = { uuid: 'u1', name: 'grove' };
    assert.deepStrictEqual(row('repo.phase').req({ repo, args: ['BL9', 'build'], flags: { provider: 'ollama' } }).body, { phase: 'BL9', provider: 'ollama' });
    assert.strictEqual(row('repo.phase').req({ repo, args: ['BL9'], flags: {} }).path, '/api/repos/u1/phases/runs?phase=BL9');
    assert.strictEqual(row('repo.phase').need({ args: [] }), '<phase>');
    assert.deepStrictEqual(row('store').req({ args: [], flags: {} }), { system: 'cortex', method: 'GET', path: '/api/store' });
    assert.strictEqual(row('ollama.tape').req({ args: ['run-1'], flags: {} }).path, '/api/tape/run-1');
  });

  await test('CM3-02', "copilot has them too: nexus.command resolves each by the words a person types", async () => {
    const C = require(path.join(ROOT, 'lib/agent-tools/tools/nexus/command.js'));
    for (const [words, key] of [['repo phasemap', 'repo.phasemap'], ['repo phase', 'repo.phase'], ['ollama tape', 'ollama.tape'], ['store', 'store'], ['idearium repo versions', 'repo.versions']]) assert.strictEqual(C._keyOf(words), key);
    const listed = (await C.command.execute({ action: 'list' })).commands.map(c => c.command);
    for (const c of ['repo phasemap', 'repo phase', 'repo versions', 'store', 'ollama tape']) assert.ok(listed.includes(c), `copilot's list lacks ${c}`);
  });

  await test('CM3-03', 'GET /api/tape lists the runs; GET /api/tape/:run is its macro; an unknown run is a 404 that says how to list them', async () => {
    const Tape = require(path.join(ROOT, 'lib/ollama-tape.js'));
    process.env.NEXUS_OLLAMA_RUN = 'run-cm3';
    Tape.record({ caller: 'test', op: 'generate', model: 'm', req: { prompt: 'p1' }, options: { seed: 7 }, res: { text: 'a1' }, ms: 10 });
    Tape.record({ caller: 'test', op: 'generate', model: 'm', req: { prompt: 'p2' }, options: { seed: 8 }, res: { text: 'a2' }, ms: 20, ok: false, error: 'boom' });
    const T = require(path.join(ROOT, 'ollama/routes/tape.js'));
    const go = async (p) => { const res = fakeRes(); const url = new URL(`http://x${p}`); const h = await T.handle({}, res, { method: 'GET', url, pathname: url.pathname }); return { h, res }; };
    let { h, res } = await go('/api/tape');
    assert.ok(h); assert.strictEqual(res.body.runs[0].run, 'run-cm3'); assert.strictEqual(res.body.runs[0].calls, 2); assert.strictEqual(res.body.runs[0].failed, 1);
    ({ res } = await go('/api/tape/run-cm3'));
    assert.deepStrictEqual(res.body.steps.map(s => [s.prompt, s.answer]), [['p1', 'a1'], ['p2', 'a2']]);
    ({ res } = await go('/api/tape/nope')); assert.strictEqual(res.code, 404);
    assert.strictEqual((await T.handle({}, fakeRes(), { method: 'GET', url: new URL('http://x/api/jobs'), pathname: '/api/jobs' })), false);
    assert.ok(fs.readFileSync(path.join(ROOT, 'ollama/server.js'), 'utf8').includes("require('./routes/tape.js')"));
  });

  await test('CM3-04', 'GET /api/store (cortex): each table by its files — base, segments, cap, archive — no row parsed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm3s-'));
    fs.writeFileSync(path.join(dir, 'event_log.json'), JSON.stringify([{ id: 'a' }]));
    fs.writeFileSync(path.join(dir, 'event_log.123.jsonl'), '{"t":1,"s":1,"id":"b","r":{"id":"b"}}\n');
    fs.writeFileSync(path.join(dir, 'event_log.124.99.closed.jsonl'), '\n');
    fs.mkdirSync(path.join(dir, 'archive', 'event_log'), { recursive: true }); fs.writeFileSync(path.join(dir, 'archive', 'event_log', '2026-10-07.jsonl.gz'), 'x');
    const r = require(path.join(ROOT, 'cortex/memory/table-compactor.js')).storeReport(dir);
    const e = r.tables.find(t => t.table === 'event_log');
    assert.strictEqual(e.segments, 2); assert.strictEqual(e.cap, 50000); assert.strictEqual(e.archiveDays, 1); assert.ok(e.baseBytes > 0);
    assert.ok(fs.readFileSync(path.join(ROOT, 'cortex/boot.js'), 'utf8').includes("p === '/api/store' && method === 'GET'"));
  });

  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
