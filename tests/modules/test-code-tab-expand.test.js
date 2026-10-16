'use strict';
/**
 * tests/modules/test-code-tab-expand.test.js — CE7 · CV2 · CV4 · CV3 (docs/2026-10-15-code-tab-run-state-phasemap.spec,
 * addendum 2026-10-16 (b)), 0.60.80.
 * James: "expand the code tab in repo. the file and code tab merge. all of it from the phases3"
 *
 *   CX-01  lib/line-edit.js verifyText / applyText: a matching expect applies; a stale one, an overlap or a range past the
 *          end refuses the WHOLE set; an insert (to = from - 1); checksums before and after
 *   CX-02  POST …/code/edit through idearium's real router: one proposal (source line-edit, its ranges and checksums);
 *          a stale expect 409, a stale checksum 409, no edits 400, a file not in the repo 404
 *   CX-03  POST …/code/assist: the agent (a stand-in copilot) is handed exactly the picked lines; its fenced block replaces
 *          exactly them as a proposal; a reply with no block proposes nothing and says so; explain only answers
 *   CX-04  lib/repo-versions.js commitNow: the change commits at once (no settle), its labels in the provenance
 *   CX-05  an applied line-edit proposal is its own commit labelled kind edit (CV2, through repo-inject)
 *   CX-06  GET …/history ?tag=: only the commits whose labels match (CV4); by: also matches who stands behind it
 *   CX-07  GET …/runs and POST …/runs/:id/rewind (CV3): every file the run changed back as at the last version before the
 *          run; a file the run created is named and left; --dry changes nothing
 *   CX-08  the commands: code edit · code assist · repo runs · repo rewind-run · repo history --tag build their requests
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 6).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const LE = require(path.join(ROOT, 'lib/line-edit.js'));

  await test('CX-01', 'verifyText / applyText: expect checked; stale, overlap or past the end refuses the set; insert; checksums', async () => {
    const t = 'a\nb\nc\nd';
    const r = LE.applyText(t, [{ anchor: { startLine: 2, endLine: 3 }, expect: 'b\nc', replacement: 'B' }, { anchor: { startLine: 4, endLine: 4 }, expect: 'd', replacement: 'D1\nD2' }]);
    assert.deepStrictEqual([r.ok, r.content], [true, 'a\nB\nD1\nD2']);
    assert.ok(r.checksumBefore && r.checksumAfter && r.checksumBefore !== r.checksumAfter);
    assert.ok(/anchor mismatch/.test(LE.applyText(t, [{ anchor: { startLine: 1, endLine: 1 }, expect: 'a', replacement: 'A' }, { anchor: { startLine: 2, endLine: 2 }, expect: 'x', replacement: 'X' }]).reason), 'one stale edit refuses all');
    assert.ok(/overlap/.test(LE.applyText(t, [{ anchor: { startLine: 1, endLine: 2 }, replacement: 'x' }, { anchor: { startLine: 2, endLine: 3 }, replacement: 'y' }]).reason));
    assert.ok(/past the end/.test(LE.applyText(t, [{ anchor: { startLine: 4, endLine: 9 }, replacement: 'x' }]).reason));
    assert.strictEqual(LE.applyText(t, [{ anchor: { startLine: 3, endLine: 2 }, replacement: 'new' }]).content, 'a\nb\nnew\nc\nd');
  });

  // ── a stand-in copilot (the agent) and a stand-in versionium (history + file bytes) ──
  const prompts = []; let REPLY = '```js\nconst two = 2;\nconst three = 3;\n```';
  const copilot = http.createServer((q, s) => { let b = ''; q.on('data', d => b += d); q.on('end', () => {
    const body = b ? JSON.parse(b) : {}; s.setHeader('content-type', 'application/json');
    if (q.url === '/api/route') return s.end(JSON.stringify({ ok: true, route: [{ provider: 'ollama', backend: 'ollama', model: null }] }));
    if (q.url === '/api/route/outcome') return s.end('{"ok":true}');
    if (q.url === '/api/prompt') { prompts.push(body); return s.end(JSON.stringify({ ok: true, text: REPLY })); }
    s.statusCode = 404; s.end('{}'); }); });
  await new Promise(r => copilot.listen(0, '127.0.0.1', r));
  let UUID = null; const COMMITS = []; const BYTES = {};
  const vers = http.createServer((q, s) => { let b = ''; q.on('data', d => b += d); q.on('end', () => {
    s.setHeader('content-type', 'application/json'); const u = new URL(q.url, 'http://x');
    if (u.pathname === '/api/versionium/history') return s.end(JSON.stringify({ commits: COMMITS.map(c => ({ system: 'idearium.repo', commitId: c.id, wall: c.ts, message: c.message, state: { kind: 'repo-snapshot', repository: UUID, provenance: c.provenance } })) }));
    if (u.pathname === '/api/versionium/files/content') { const k = `${u.searchParams.get('commitId')}:${u.searchParams.get('path')}`; if (!(k in BYTES)) { s.statusCode = 404; return s.end('{"ok":false,"error":"not found"}'); }
      const buf = Buffer.from(BYTES[k]); return s.end(JSON.stringify({ content_b64: buf.toString('base64'), sha256: require('crypto').createHash('sha256').update(buf).digest('hex') })); }
    s.statusCode = 404; s.end('{"ok":false,"error":"stand-in: not served"}'); }); });
  await new Promise(r => vers.listen(0, '127.0.0.1', r));
  const cfg = require(path.join(ROOT, 'lib/nexus-config.js')).get();
  const realPort = cfg.ports.versionium; cfg.ports.versionium = vers.address().port;
  process.env.COPILOT_URL = `http://127.0.0.1:${copilot.address().port}`;

  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  const L = api.getRepoLayer();
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  const RV = require(path.join(ROOT, 'lib/repo-versions.js'));
  let made = null;
  for (let i = 0; i < 20; i++) {
    made = await quiet(async () => L.ingest({ name: `cx-${Date.now()}`, source: 'test', compartmentId: 'c-cx', files: [{ path: 'src/a.js', content: 'const one = 1;\nconst two = 0;\nmodule.exports = { one, two };\n' }, { path: 'src/b.js', content: 'b1\nb2\n' }] }));
    if (!(made && made.error && /no spec-engine/.test(made.error))) break;
    await wait(250);
  }
  const u = UUID = made.repo.uuid;
  const read = (p) => L.readTextFile(u, p).content;

  await test('CX-02', 'POST …/code/edit: one proposal with its ranges and checksums; stale expect / checksum 409; 400; 404', async () => {
    const r = await quiet(() => api._route('POST', `/api/repos/${u}/code/edit`, { path: 'src/a.js', edits: [{ from: 2, to: 2, expect: 'const two = 0;', replacement: 'const two = 2;' }] }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const n = RI.get(r.json.inject.uuid);
    assert.deepStrictEqual([n.status, n.source.kind, n.source.ranges], ['proposed', 'line-edit', [[2, 2]]]);
    assert.ok(/const two = 2;/.test(n.content) && /const one = 1;/.test(n.content));
    assert.strictEqual(read('src/a.js').includes('const two = 0;'), true, 'proposed, not written');
    assert.strictEqual((await api._route('POST', `/api/repos/${u}/code/edit`, { path: 'src/a.js', edits: [{ from: 2, to: 2, expect: 'nope', replacement: 'x' }] })).status, 409);
    assert.strictEqual((await api._route('POST', `/api/repos/${u}/code/edit`, { path: 'src/a.js', checksum: 'deadbeef', edits: [{ from: 1, to: 1, replacement: 'x' }] })).status, 409);
    assert.strictEqual((await api._route('POST', `/api/repos/${u}/code/edit`, { path: 'src/a.js', edits: [] })).status, 400);
    assert.strictEqual((await api._route('POST', `/api/repos/${u}/code/edit`, { path: 'src/zz.js', edits: [{ from: 1, to: 1, replacement: 'x' }] })).status, 404);
    RI.reject(r.json.inject.uuid, {});
  });

  await test('CX-03', 'POST …/code/assist: exactly the picked lines go to the agent; its block replaces exactly them; no block → nothing; explain answers', async () => {
    let r = await quiet(() => api._route('POST', `/api/repos/${u}/code/assist`, { path: 'src/a.js', from: 2, to: 2, action: 'fix', note: 'two is two' }));
    assert.strictEqual(r.json.ok, true, JSON.stringify(r.json).slice(0, 400));
    const sent = prompts[prompts.length - 1];
    const msg = JSON.stringify(sent);
    assert.ok(/THE LINES 2-2/.test(msg) && /FROM JAMES: two is two/.test(msg), msg.slice(0, 300));
    const n = RI.get(r.json.inject.uuid);
    assert.strictEqual(n.content, read('src/a.js').replace('const two = 0;', 'const two = 2;\nconst three = 3;'), 'only line 2 replaced; the file keeps its own ending');
    assert.strictEqual(n.source.action, 'fix');
    RI.reject(n.uuid, {});
    REPLY = 'I would change it but here is no code.';
    r = await quiet(() => api._route('POST', `/api/repos/${u}/code/assist`, { path: 'src/a.js', from: 2, to: 2, action: 'change' }));
    assert.deepStrictEqual([r.json.ok, /no code block/.test(r.json.error)], [false, true]);
    r = await quiet(() => api._route('POST', `/api/repos/${u}/code/assist`, { path: 'src/a.js', from: 1, to: 3, action: 'explain' }));
    assert.deepStrictEqual([r.json.ok, r.json.reply, r.json.inject], [true, REPLY, undefined]);
    assert.strictEqual((await api._route('POST', `/api/repos/${u}/code/assist`, { path: 'src/a.js', from: 2, to: 2, action: 'dance' })).status, 400);
    assert.strictEqual((await api._route('POST', `/api/repos/${u}/code/assist`, { path: 'src/a.js', from: 9, to: 2, action: 'fix' })).status, 400);
  });

  await test('CX-04', 'commitNow: the change commits at once, its labels in the provenance', async () => {
    const got = [];
    RV.setCommitter(async (c) => { got.push(c); return { ok: true, commitId: `c${got.length}` }; });
    RV.touched('r-cx4', 'x.js', 'write');
    const r = await RV.commitNow('r-cx4', { kind: 'edit', inject: 'i1', by: 'person', junk: 'dropped' });
    assert.deepStrictEqual([r.commitId, got.length, got[0].provenance.labels], ['c1', 1, [{ kind: 'edit', inject: 'i1', by: 'person' }]]);
    assert.strictEqual(RV.pending('r-cx4'), null);
    assert.strictEqual(await RV.commitNow('r-none', { kind: 'edit' }), null, 'nothing written: nothing to commit');
  });

  await test('CX-05', 'an applied line-edit proposal is its own commit, labelled kind edit', async () => {
    const got = [];
    RV.setCommitter(async (c) => { got.push(c); return { ok: true, commitId: `e${got.length}` }; });
    const r = await quiet(() => api._route('POST', `/api/repos/${u}/code/edit`, { path: 'src/b.js', edits: [{ from: 1, to: 1, expect: 'b1', replacement: 'B1' }] }));
    const a = await quiet(() => api._route('POST', `/api/repos/${u}/injects/${r.json.inject.uuid}/apply`, { approvedBy: 'james' }));
    assert.strictEqual(a.status, 200, JSON.stringify(a.json).slice(0, 300));
    for (let i = 0; i < 40 && !got.length; i++) await wait(25);
    const l = got.flatMap(c => c.provenance.labels);
    assert.ok(l.some(x => x.kind === 'edit' && x.path === 'src/b.js' && x.inject === r.json.inject.uuid && x.by === 'james'), JSON.stringify(l));
    assert.ok(got.length >= 1 && got.length < 3, `one commit, not a settle later (${got.length})`);
    assert.strictEqual(read('src/b.js').split('\n')[0], 'B1');
  });

  // history for CX-06 / CX-07: three versions of src/a.js and src/b.js, newest first as versionium answers
  const now = Date.now();
  COMMITS.push(
    { id: 'v3', ts: now + 20000, message: '1 file: src/a.js', provenance: { by: ['ollama'], refs: [], files: [{ path: 'src/a.js', op: 'write' }], labels: [{ kind: 'agent', path: 'src/a.js', run: 'run-x' }] } },
    { id: 'v2', ts: now + 10000, message: '1 file: src/a.js', provenance: { by: ['james'], refs: [], files: [{ path: 'src/a.js', op: 'write' }], labels: [{ kind: 'edit', path: 'src/a.js' }] } },
    { id: 'v1', ts: now - 9000, message: 'baseline', provenance: { by: [], refs: [], files: [{ path: 'src/a.js', op: 'write' }, { path: 'src/b.js', op: 'write' }], labels: [] } });
  BYTES['v1:src/a.js'] = 'const one = 1;\nconst two = 0;\nmodule.exports = { one, two };\n';

  await test('CX-06', 'GET …/history ?tag=: only commits whose labels match; by: also matches who stands behind it', async () => {
    let r = await api._route('GET', `/api/repos/${u}/history?path=src/a.js`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(r.json.commits.map(c => c.commitId), ['v3', 'v2', 'v1']);
    r = await api._route('GET', `/api/repos/${u}/history?path=src/a.js&tag=kind:edit`);
    assert.deepStrictEqual(r.json.commits.map(c => c.commitId), ['v2']);
    r = await api._route('GET', `/api/repos/${u}/history?path=src/a.js&tag=run:run-x`);
    assert.deepStrictEqual(r.json.commits.map(c => c.commitId), ['v3']);
    r = await api._route('GET', `/api/repos/${u}/history?path=src/a.js&tag=by:james`);
    assert.deepStrictEqual(r.json.commits.map(c => c.commitId), ['v2']);
    r = await api._route('GET', `/api/repos/${u}/history?path=src/a.js&tag=kind:edit,by:ollama`);
    assert.deepStrictEqual(r.json.commits, [], 'every tag must match');
  });

  await test('CX-07', 'GET …/runs and POST …/runs/:id/rewind: files back as before the run; a created file named and left; dry changes nothing', async () => {
    const RS = require(path.join(ROOT, 'lib/run-state.js'));
    const run = RS.begin({ repoUuid: u, session: `cx7-${now}`, goal: 'touch a and add c' });
    const runs = (await api._route('GET', `/api/repos/${u}/runs`)).json.runs;
    assert.ok(runs.some(x => x.runId === run.runId));
    // the run started after v1 (v2, v3 came later); it wrote a.js and created c.js — recorded as a real run records them
    RS.step(run.runId, { name: 'idearium.code_write', arguments: { path: 'src/a.js' }, ok: true });
    RS.step(run.runId, { name: 'idearium.code_write', arguments: { path: 'src/c.js' }, ok: true });
    RS.finish(run.runId, 'done');
    assert.deepStrictEqual(RS.load(run.runId).filesChanged, ['src/a.js', 'src/c.js'], 'the run node holds what it changed');
    L.writeFile(u, 'src/a.js', 'changed by the run\n', { preserveWhitespace: true });
    const dry = await quiet(() => api._route('POST', `/api/repos/${u}/runs/${run.runId}/rewind`, { dryRun: true }));
    assert.strictEqual(dry.status, 200, JSON.stringify(dry.json));
    assert.deepStrictEqual([dry.json.to.commitId, dry.json.results.every(x => !x.done)], ['v1', true]);
    assert.strictEqual(read('src/a.js'), 'changed by the run\n');
    const r = await quiet(() => api._route('POST', `/api/repos/${u}/runs/${run.runId}/rewind`, {}));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const by = Object.fromEntries(r.json.results.map(x => [x.path, x]));
    assert.strictEqual(by['src/a.js'].done, true);
    assert.deepStrictEqual([by['src/c.js'].done, /created it/.test(by['src/c.js'].why)], [false, true]);
    assert.strictEqual(read('src/a.js'), BYTES['v1:src/a.js']);
    assert.ok((RS.load(run.runId).events || []).some(e => e.kind === 'rewound'));
    assert.strictEqual((await api._route('POST', `/api/repos/${u}/runs/nope/rewind`, {})).status, 404);
  });

  await test('CX-08', 'the commands build their requests', async () => {
    const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = (k) => RC.SPEC.find(x => x.key === k);
    const repo = { uuid: 'r9' };
    assert.deepStrictEqual(row('code.edit').req({ repo, args: ['a.js', '2', '3'], flags: { with: 'x', expect: 'y' } }).body, { path: 'a.js', by: 'cli', edits: [{ from: '2', to: '3', replacement: 'x', expect: 'y' }] });
    assert.ok(row('code.edit').need({ repo, args: ['a.js', '2', '3'], flags: {} }));
    const as = row('code.assist').req({ repo, args: ['a.js', '2', '3', 'fix', 'the', 'bug'], flags: { model: 'm' } });
    assert.deepStrictEqual([as.path, as.body.action, as.body.note, as.body.model], ['/api/repos/r9/code/assist', 'fix', 'the bug', 'm']);
    assert.strictEqual(row('repo.runs').req({ repo, args: [], flags: { status: 'done' } }).path, '/api/repos/r9/runs?status=done');
    assert.deepStrictEqual(row('repo.rewind-run').req({ repo, args: ['run-1'], flags: { dry: true } }).body, { by: 'cli', dryRun: true });
    assert.ok(/&tag=kind%3Aedit$/.test(row('repo.history').req({ repo, args: ['a.js'], flags: { tag: 'kind:edit' } }).path));
  });

  cfg.ports.versionium = realPort;
  copilot.close(); vers.close();
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
