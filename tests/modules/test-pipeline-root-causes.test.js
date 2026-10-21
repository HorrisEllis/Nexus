'use strict';
/**
 * tests/modules/test-pipeline-root-causes.test.js — RC1–RC4 (0.60.170)
 * Map: docs/2026-10-19-pipeline-root-causes-phasemap.spec
 * James, 2026-10-19: "we need to fix the pipeline though. like i said." · "files names must remain consistent."
 *
 *   RC-01  safe-watch: the EPERM the OS fires asynchronously is caught, said once, and the watcher re-arms; the process lives
 *   RC-02  every long-running watcher site in the tree goes through safe-watch (no bare fs.watch left in a kernel)
 *   RC-03  node registry scan is linear: 3,000 nodes scan in well under the time the old O(n²) path took, and a rescan is unchanged
 *   RC-04  node-export fileIdOf: a ':' id is written under a Windows-safe name, round-trips, and the registry removes it by file
 *   RC-05  path-guard: "Gemini said tests/x.test.js" → tests/x.test.js; "tests/x." → the one existing file, else refused; prose refused
 *   RC-06  repo-inject propose() refuses a cut-short name with the reason, and records what the guard changed
 *   RC-07  RC5 (0.60.187): the speaker label is stripped where a reply is read and where an answer becomes a path; one complete path or none
 *   RC-08  RC5: a transcript still being written is not taken as an answer (replyFor); the Gemini page strips its own label
 *   RC-09  RC6 (0.60.187): the Ollama bridge refuses an ownerless job and names the owner in its log line; diagnose is background work
 *   RC-10  RC6: the diagnostic escalation names itself, asks for less, sends one per sweep, keeps its cooldown on disk, and sets the
 *          gap's status through cortex (POST /api/gaps/status), which owns the table
 *   RC-16  0.60.196: a build of a repo with no index indexes it first, then snapshots (his upload timed out before indexing)
 *   RC-17  0.60.196: the upload dialog finds an import that outran its wait, closes, and indexes
 *   RC-18  0.60.198 (IN3a, his decision): a build requires the registry — spine, event bus, interaction contract, components
 *   RC-19  0.60.201: a wait that runs out is said plainly (his "signal is aborted without reason"); the upload start waits 60 s
 *   RC-11  RC7 (0.60.188): every run names its starter — the gate's keyed caller (access), a declared door (person:ui, person:cli,
 *          agent:<name>), the watchdog (system), or unknown; an agent's build is agent:<name> whatever the row sent, and a
 *          listener that hears five build lines in one reply builds five phases, each recorded as agent:listener
 *   RC-12  0.60.194: every phase build repairs the tree after its snapshot — a build that resumes its saved plan too (SP5's
 *          "Gemini said tests/sp5-title.test.js" survived because the repair ran only inside the test-first branch)
 *   RC-13  0.60.194: ChatGPT's /uc/<id> chats are chats — the userscript's chatId, the transcript reader's resumable URL and Clear
 *          Glass's chat ports read them (as 'home', every /uc/ chat was dropped by the chat ledger and the reply recovery)
 *   RC-14  0.60.195: a bundle's file delivered under its own folder is the file its map names (Gemini's looking-glass-bundle-v0_4/
 *          lib/title.js was called "absent — lib/title.js" and every working attempt climbed the ladder); a bare file name is not
 *   RC-15  0.60.195: the Code tab credits a change to the agent whose reply brought it, not the rung the ladder climbed to next
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `rc-${n}-`));

(async () => {
  await test('RC-01', 'safe-watch survives the async EPERM, says it once, re-arms', async () => {
    const SW = require(path.join(ROOT, 'lib/safe-watch.js'));
    const dir = tmp('w');
    const seen = [];
    const h = SW.watch(dir, (ev, f) => seen.push(f));
    const warns = [];
    const w0 = console.warn; console.warn = (m) => warns.push(String(m));
    try {
      const err = Object.assign(new Error('operation not permitted, watch'), { code: 'EPERM', errno: -4048 });
      h._inject(err); h._inject(err);   // no listener for 'error': before RC1 this was "Unhandled 'error' event"
    } finally { console.warn = w0; }
    assert.strictEqual(warns.filter(m => /EPERM/.test(m)).length, 1, 'said once, not per event');
    await wait(2300);
    assert.ok(SW.stats().rearmed >= 1, 're-armed after the backoff');
    fs.writeFileSync(path.join(dir, 'after.txt'), 'x');
    await wait(400);
    h.close();
    assert.ok(seen.length >= 1 || process.platform !== 'linux', 'the re-armed watcher still reports changes');
    // a missing target throws synchronously, like fs.watch, so existing try/catch keeps working
    assert.throws(() => SW.watch(path.join(dir, 'nope')), /ENOENT/);
  });

  await test('RC-02', 'no long-running kernel file uses a bare fs.watch', async () => {
    const files = ['orchestrator/orchestrator.js', 'guardian/lib/node-registry.js', 'lib/node-registry.js', 'lib/node-index-watcher.js',
      'lib/queue.js', 'auth/index.js', 'architecture-spec/registry/watcher.js', 'cos/foundation/file-browser.js',
      'diagnostic/nexus-diagnostic.js', 'emerge/emerge-kernel.js', 'idearium/repo/watcher.js'];
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(!/\bfs\.watch\(/.test(src), `${f} still calls fs.watch directly`);
      assert.ok(/safe-watch/.test(src), `${f} does not use lib/safe-watch.js`);
    }
  });

  await test('RC-03', 'node registry scan is linear (3,000 nodes) and a rescan is all unchanged', async () => {
    const NX = require(path.join(ROOT, 'lib/node-export.js'));
    const NR = require(path.join(ROOT, 'lib/node-registry.js'));
    const root = tmp('nr');
    const tdir = path.join(root, 'rcsys', 'data', 'nodes', 'chunk');
    fs.mkdirSync(tdir, { recursive: true });
    const N = 3000;
    const payload = (i) => ({ specUuid: 's', sectionId: `sec-${i}`, chunkIdx: i, status: 'done', title: `c${i}`, uuid: `u${i}`, content: 'x'.repeat(1500) });
    let schemaOk = true;
    try { NX.exportToFile('chunk', 'probe', payload(0), { system: 'rcsys', context: 'c', summary: 's' }, tdir); } catch (_) { schemaOk = false; }
    assert.ok(schemaOk, 'fixture writes');
    for (let i = 1; i < N; i++) NX.exportToFile('chunk', `n-${i}`, payload(i), { system: 'rcsys', context: 'c', summary: 's' }, tdir);
    const reg = NR.createNodeRegistry({ system: 'rcsys', root, fresh: true });
    const t0 = Date.now(); const r1 = await quiet(() => reg.scan()); const ms1 = Date.now() - t0;
    const t1 = Date.now(); const r2 = await quiet(() => reg.scan()); const ms2 = Date.now() - t1;
    reg.stop();
    assert.strictEqual(r1.indexed, N, `every node indexed (a fixture that fails its schema would pass vacuously): ${JSON.stringify(r1.invalid.slice(0, 2))}`);
    assert.strictEqual(r2.indexed, 0); assert.strictEqual(r2.unchanged, r1.indexed);
    console.log(`    (first scan ${ms1} ms, rescan ${ms2} ms for ${N} nodes)`);
    assert.ok(ms2 < 3000, `rescan of ${N} took ${ms2} ms (the O(n²) path took ~1.3 s for 4,000 and ~10 s for 12,000 here)`);
  });

  await test('RC-04', 'a ":" node id is written under a Windows-safe name, round-trips, and is removed by its file', async () => {
    const NX = require(path.join(ROOT, 'lib/node-export.js'));
    const PN = require(path.join(ROOT, 'lib/pipeline-nodes.js'));
    assert.strictEqual(NX.fileIdOf('phase:SP5_title:6ceaa59e8eee182c'), 'phase~SP5_title~6ceaa59e8eee182c');
    assert.strictEqual(NX.fileIdOf('plain-id_1.2'), 'plain-id_1.2', 'a safe id is its own name: nothing written before moves');
    const dir = tmp('pn');
    const g = PN.graphNode({ phase: 'SP5_title', hash: '6ceaa59e8eee182c', nodes: [{ path: 'lib/title.js', role: 'changes' }], edges: [], crossings: [] }, { repo: 'r', kind: 'phase' });
    const fp = PN.writeNode(g, path.join(dir, 'graph'));
    assert.ok(!/:/.test(path.basename(fp)), path.basename(fp));
    assert.strictEqual(NX.importFromFile(fp).id, g.id, 'the envelope keeps its real id');
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/PN\.writeNode\(PN\.graphNode[^\n]*path\.join\(ndir, 'graph'\)/.test(src) && /path\.join\(ndir, 'phase'\)\);/.test(src), 'the build writes into nodes/graph and nodes/phase');
  });

  await test('RC-05', 'path-guard: labels stripped, cut names resolved or refused, prose refused', async () => {
    const PG = require(path.join(ROOT, 'lib/path-guard.js'));
    const have = new Set(['tests/sp5-title.test.js', 'lib/title.js']);
    const exists = (p) => have.has(p);
    let r = PG.check('Gemini said tests/sp5-title.test.js', { exists });
    assert.deepStrictEqual([r.ok, r.path, r.changed], [true, 'tests/sp5-title.test.js', true]);
    assert.strictEqual(PG.check('ChatGPT said: lib/title.js', { exists }).path, 'lib/title.js');
    r = PG.check('tests/sp5-title.', { exists }); assert.deepStrictEqual([r.ok, r.path], [true, 'tests/sp5-title.test.js'], JSON.stringify(r));
    r = PG.check('tests/sp5-title-test.', { exists }); assert.deepStrictEqual([r.ok, r.path], [true, 'tests/sp5-title.test.js'], JSON.stringify(r));
    r = PG.check('tests/other.', { exists }); assert.ok(!r.ok && /names no existing file/.test(r.error), r.error);
    r = PG.check('tests/sp5-title.', {}); assert.ok(!r.ok && /refused, not guessed/.test(r.error));
    r = PG.check('here is the file/title.js', { exists }); assert.ok(!r.ok && /reads as reply text/.test(r.error), r.error);
    r = PG.check('lib/title.js', { exists }); assert.deepStrictEqual([r.ok, r.changed], [true, false], 'a good path is untouched');
  });

  await test('RC-06', 'propose() refuses a cut-short name with the reason (the agent hears why)', async () => {
    const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
    const r = await quiet(() => RI.propose({ layer: null, repo: { uuid: 'rc-6' }, hat: 'repo_x', path: 'tests/sp5-title.', content: 'x', source: { kind: 'agent' } }));
    assert.strictEqual(r.ok, false); assert.ok(/cut short/.test(r.errors[0]), r.errors[0]);
    const src = fs.readFileSync(path.join(ROOT, 'lib/repo-inject.js'), 'utf8');
    assert.ok(/require\('\.\/path-guard\.js'\)/.test(src) && /pathNote: opts\.pathNote/.test(src));
  });

  await test('RC-07', 'RC5: the label is stripped where a reply is read and where it becomes a path; one complete path or none', async () => {
    const PG = require(path.join(ROOT, 'lib/path-guard.js'));
    const cases = { 'Gemini said tests/sp5-title.test.js': 'tests/sp5-title.test.js', 'Gemini said\ntests/sp5-title.test.js': 'tests/sp5-title.test.js',
      'tests/sp5-title.': null, 'tests/sp5-title-test.': null, 'Here is the file: lib/x.js': null, 'NEW src/a.js': 'src/a.js', 'ChatGPT said:\n\nNEW tests/a.test.js': 'tests/a.test.js' };
    for (const [a, want] of Object.entries(cases)) assert.strictEqual(PG.pathAnswer(a).path, want, a);
    assert.strictEqual(PG.stripSpeaker('As Claude said earlier, x'), 'As Claude said earlier, x', 'only a leading label');
    const { matchJobs } = require(path.join(ROOT, 'guardian/lib/chat-transcripts.js'));
    const prompt = 'Reply with ONE line only: the path of the file this code belongs in.';
    const m = matchJobs([{ role: 'user', text: prompt }, { role: 'assistant', text: 'Gemini said\ntests/sp5-title.test.js' }], [{ id: 'j1', prompt, ts: 1 }]);
    assert.strictEqual(m[0].reply, 'tests/sp5-title.test.js', 'the transcript reply carries no label');
    const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
    const src = fs.readFileSync(path.join(ROOT, 'lib/repo-inject.js'), 'utf8');
    assert.ok(/PG\.pathAnswer\(answer\)\.path/.test(src) && RI.fromReply, 'fromReply takes only a complete path from the agent');
  });

  await test('RC-08', 'RC5: replyFor skips a transcript still being written; the Gemini page strips its own label', () => {
    const src = fs.readFileSync(path.join(ROOT, 'guardian/lib/chat-transcripts.js'), 'utf8');
    assert.ok(/if \(st\.settled === false \|\| st\.generating === true\) continue;/.test(src));
    const us = fs.readFileSync(path.join(ROOT, 'guardian/userscript-gemini.js'), 'utf8');
    const fn = us.slice(us.indexOf('function _noSpeaker')); const noSpeaker = new Function(`${fn.slice(0, fn.indexOf('}') + 1)}; return _noSpeaker;`)();
    assert.strictEqual(noSpeaker('Gemini said\nHere it is'), 'Here it is'); assert.strictEqual(noSpeaker('Plain reply'), 'Plain reply');
  });

  await test('RC-09', 'RC6: the bridge refuses an ownerless job and names the owner in its log; diagnose is background', async () => {
    const { state } = require(path.join(ROOT, 'ollama/lib/state.js')); state.ollamaOnline = true;
    const D = require(path.join(ROOT, 'ollama/lib/dispatch.js')); const pump = D.pump; D.pump = () => {};
    const { handle } = require(path.join(ROOT, 'ollama/routes/jobs.js'));
    const { Readable } = require('stream');
    const call = async (body) => { const req = Readable.from([JSON.stringify(body)]); let code = 0, out = ''; const res = { writeHead: (c) => { code = c; }, setHeader() {}, end: (b) => { out = b; }, statusCode: 0 };
      await handle(req, res, { method: 'POST', url: '/api/jobs', pathname: '/api/jobs' }); return { code: code || res.statusCode, body: JSON.parse(out || '{}') }; };
    const none = await call({ prompt: 'NEXUS DIAGNOSTIC ESCALATION\nGap: x' });
    assert.strictEqual(none.code, 400); assert.ok(/name its owner/.test(none.body.error));
    const before = state.queue.length;
    const ok = await call({ prompt: 'p', componentId: 'diagnostic.escalation', intent: 'diagnose' });
    assert.ok(ok.body.ok !== false, JSON.stringify(ok.body)); const job = state.queue[state.queue.length - 1];
    assert.strictEqual(state.queue.length, before + 1); assert.strictEqual(job.owner, 'diagnostic.escalation');
    assert.strictEqual((await call({ prompt: 'p', meta: { source: 'guardian-mistral' } })).body.ok !== false, true, 'meta.source names an owner');
    state.queue.length = before; D.pump = pump;
    const dsrc = fs.readFileSync(path.join(ROOT, 'ollama/lib/dispatch.js'), 'utf8');
    assert.ok(/job\.owner \? ` for \$\{job\.owner\}`/.test(dsrc) && /BACKGROUND_INTENTS = new Set\(\['adversarial-probe', 'diagnose'\]\)/.test(dsrc));
  });

  await test('RC-10', 'RC6: the escalation names itself, asks for less, one per sweep, cooldown on disk, status through cortex', () => {
    const src = fs.readFileSync(path.join(ROOT, 'diagnostic/nexus-diagnostic.js'), 'utf8');
    assert.ok(/componentId: 'diagnostic\.escalation', intent: 'diagnose', maxTokens: 1024/.test(src));
    assert.ok(/if \(ollamaSent >= 1\) break;/.test(src) && /ESC_COOLDOWN_MS = 6 \* 3600 \* 1000/.test(src) && /_saveEscalated\(\)/.test(src));
    assert.ok(/_gapStatusViaCortex\(gap, 'investigating'\)/.test(src) && !/jaaDB\.update\('gaps', gap\.uuid/.test(src), 'no private store write');
    const cx = fs.readFileSync(path.join(ROOT, 'cortex/boot.js'), 'utf8');
    assert.ok(/p === '\/api\/gaps\/status' && method === 'POST'/.test(cx) && /jaaDB\.update\('gaps', row\.id \? \{ id: row\.id \} : \{ uuid: row\.uuid \}/.test(cx));
    const { numCtxFor } = require(path.join(ROOT, 'lib/ollama-activity.js'));
    assert.deepStrictEqual([numCtxFor(293, 4096).numCtx, numCtxFor(293, 1024).numCtx], [5120, 4096], 'his log\'s 5120 came from the 4096-token default; 1024 tokens sits at the 4096 floor');
  });

  await test('RC-11', 'RC7: every run names its starter; an agent or a listener is recorded as itself, unknown stays unknown', async () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const fn = api.match(/function _starter\(req, body\) \{[\s\S]*?\n\}/)[0];
    const _starter = new Function(`${fn}; return _starter;`)();
    assert.deepStrictEqual(_starter({ access: { who: { hat: 'copilot' } } }, { startedBy: 'person:ui' }), { who: 'copilot', whence: 'access' }, 'the gate\'s caller beats a declaration');
    assert.deepStrictEqual(_starter({}, { startedBy: 'person:ui' }), { who: 'person:ui', whence: 'declared' });
    assert.deepStrictEqual(_starter({}, {}), { who: 'unknown', whence: 'unknown' }, 'never guessed as the person');
    assert.ok(/startedBy: startedBy \|\| \{ who: 'unknown', whence: 'unknown' \}/.test(api), 'on every row of a run');
    assert.ok(/retryKind: kind, startedBy: \{ who: `watchdog:\$\{kind\}`, whence: 'system' \}/.test(api) && /phase: info\.phase, note, startedBy: \{ who: `watchdog:/.test(api), 'the watchdog names itself');
    assert.ok(/_phaseBuild\(repo, dir, \{ startedBy: _starter\(req, body\)/.test(api) && /BS\.specBuild\(d, u, \{ \.\.\.\(body \|\| \{\}\), startedBy: _starter\(req, body\) \}\)/.test(api), 'both build routes');
    for (const [f, rx] of [['idearium/ui/js/plan-panel.js', /startedBy: 'person:ui', \.\.\.b/], ['idearium/ui/js/repo-tasks.js', /startedBy: 'person:ui:retry'/], ['idearium/ui/js/living-spec.js', /startedBy: 'person:ui'/], ['idearium/ui/js/workshop.js', /startedBy: 'person:ui:workshop'/], ['idearium/cli/index.js', /startedBy: 'person:cli', path: specPath/], ['idearium/repo/build-plan.js', /startedBy: starter/]])
      assert.ok(rx.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), `${f} declares its door`);
    // the real agent tool and the real listener, with only the HTTP call stubbed
    const C = require(path.join(ROOT, 'lib/agent-tools/tools/idearium/code.js'));
    const real = C._call; const posts = [];
    C._call = async (method, p, body) => (method === 'GET' && p === '/api/repos' ? { repos: [{ uuid: 'r-1', name: 'nexus' }] } : (posts.push({ p, body }), { ok: true, runId: `run-${posts.length}` }));
    try {
      const { command } = require(path.join(ROOT, 'lib/agent-tools/tools/nexus/command.js'));
      await command.execute({ action: 'run', command: 'repo phase', repo: 'nexus', args: ['A1_x', 'build'] }, { agent: 'copilot' });
      assert.deepStrictEqual([posts[0].p, posts[0].body.startedBy], ['/api/repos/r-1/phases/build', 'agent:copilot'], 'the row said person:cli; the tool knows it is an agent');
      const L = require(path.join(ROOT, 'lib/listener-commands.js'));
      const heard = await L.createRunner({ tool: command }).hear('chat-1', ['A1_a', 'A2_b', 'A3_c', 'A4_d', 'A5_e'].map(p => `nexus> repo phase nexus ${p} build`).join('\n'));
      const built = posts.slice(1);
      assert.strictEqual(heard.length, 5);
      assert.deepStrictEqual(built.map(x => x.body.phase), ['A1_a', 'A2_b', 'A3_c', 'A4_d', 'A5_e'], 'one reply, five builds in a row');
      assert.ok(built.every(x => x.body.startedBy === 'agent:listener'), 'each recorded as the listener');
    } finally { C._call = real; }
  });

  await test('RC-12', 'every phase build repairs the tree after its snapshot, resumed plans too; a label folder is archived, never deleted', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const snapAt = api.indexOf('// (1) snapshot first — never write without one');
    const repairAt = api.indexOf("const rep = _require('../../lib/path-guard.js').repairTree(_repoDiskDir(target.uuid));");
    const tfAt = api.indexOf("if (policy.testFirst !== 'off' && !plan.testFirst)");
    assert.ok(snapAt > 0 && repairAt > snapAt && repairAt < tfAt, 'after the snapshot, before (and outside) the test-first branch');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc12-'));
    fs.mkdirSync(path.join(root, 'looking-glass/Gemini said tests'), { recursive: true });
    fs.writeFileSync(path.join(root, 'looking-glass/Gemini said tests/sp5-title.test.js'), 'x');
    fs.mkdirSync(path.join(root, 'looking-glass/tests'), { recursive: true });
    fs.writeFileSync(path.join(root, 'looking-glass/tests/sp5-title.test.js'), 'kept');
    const PG = require(path.join(ROOT, 'lib/path-guard.js'));
    const r = PG.repairTree(root);
    assert.deepStrictEqual(r.moved.map(m => m.from), ['looking-glass/Gemini said tests']);
    assert.ok(!fs.existsSync(path.join(root, 'looking-glass/Gemini said tests')) && fs.existsSync(path.join(root, 'looking-glass/tests/sp5-title.test.js')));
    assert.ok(fs.existsSync(path.join(root, r.moved[0].to, 'sp5-title.test.js')), 'archived, not deleted');
    fs.rmSync(root, { recursive: true, force: true });
  });

  await test('RC-13', 'ChatGPT\'s /uc/<id> chats are chats: the userscript\'s chatId, the resumable URL, Clear Glass\'s chat ports', () => {
    const us = fs.readFileSync(path.join(ROOT, 'guardian/userscript-chatgpt.js'), 'utf8');
    const fnSrc = us.match(/function chatId\(\) \{[\s\S]*?\n\}/)[0];
    const chatIdAt = (pathname) => new Function('location', `${fnSrc}; return chatId();`)({ pathname });
    assert.deepStrictEqual([chatIdAt('/uc/6ad8ebba-aa74-83ea-8bed-ee7f4b94f7a6'), chatIdAt('/c/WEB%3Aabc'), chatIdAt('/')], ['6ad8ebba-aa74-83ea-8bed-ee7f4b94f7a6', 'WEB:abc', 'home']);
    assert.ok(/@version\s+10\.12\.5/.test(us) && /const VERSION\s+= '10\.12\.5'/.test(us), 'the userscript version moved, so Clear Glass loads the new one');
    const CT = require(path.join(ROOT, 'guardian/lib/chat-transcripts.js'));
    assert.strictEqual(CT.resumableChatUrl('chatgpt', 'https://chatgpt.com/uc/6ad8ebba-aa74-83ea-8bed-ee7f4b94f7a6'), 'https://chatgpt.com/uc/6ad8ebba-aa74-83ea-8bed-ee7f4b94f7a6');
    assert.strictEqual(CT.resumableChatUrl('chatgpt', 'https://chatgpt.com/c/6ab92781-aaaa'), 'https://chatgpt.com/c/6ab92781-aaaa');
    const ports = fs.readFileSync(path.join(ROOT, 'clear-glass/src/chats/ports.js'), 'utf8');
    const idSrc = ports.match(/const _chatId = \(url\) => \{[^\n]*\};/)[0];
    const _chatId = new Function(`${idSrc}; return _chatId;`)();
    assert.deepStrictEqual([_chatId('https://chatgpt.com/uc/6ad8ebba-aa74'), _chatId('https://chatgpt.com/c/6ab92781-aaaa')], ['6ad8ebba-aa74', '6ab92781-aaaa']);
  });

  await test('RC-14', 'a bundle\'s file under its own folder is the file its map names; a bare file name never is', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const U = new Function(`${api.match(/function _underMapRoot\(mapPath, expected, delivered\) \{[\s\S]*?\n\}\n/)[0]}; return _underMapRoot;`)();
    assert.deepStrictEqual(U('spec/SPEC.spec', ['lib/title.js'], ['looking-glass-bundle-v0_4/lib/title.js']), ['lib/title.js'], 'his SP5');
    assert.deepStrictEqual(U('looking-glass-bundle-v0_4/SPEC.spec', ['title.js'], ['looking-glass-bundle-v0_4/title.js']), ['title.js'], 'under the map\'s own root');
    assert.deepStrictEqual(U('SPEC.spec', ['index.js'], ['other/index.js']), ['other/index.js'], 'a bare name elsewhere is not the file');
    assert.deepStrictEqual(U('SPEC.spec', ['lib/title.js'], ['a/b/lib/title.js', 'lib/title.js']), ['a/b/lib/title.js', 'lib/title.js'], 'two folders deep is not it either');
    assert.ok(/SH\.settle\(shadow, \{ files: _underMapRoot\(map, files,/.test(api), 'the build\'s shadow settles through it');
    const SH = require(path.join(ROOT, 'lib/shadow.js'));
    const sh = SH.declare({ step: 'rc14', expects: { files: ['lib/title.js'] }, subject: {} });
    assert.ok(SH.settle(sh, { files: U('spec/SPEC.spec', ['lib/title.js'], ['looking-glass-bundle-v0_4/lib/title.js']) }).ok, 'present, not "absent — lib/title.js"');
  });

  await test('RC-15', 'the Code tab credits a change to the agent whose reply brought it, not the next rung', async () => {
    const WS = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/work-surface.js')).href);
    const t = Date.now();
    const rows = [
      { runId: 'x8d', state: 'building', ts: t },
      { runId: 'x8d', state: 'incomplete', provider: 'gemini', injects: { injected: ['looking-glass-bundle-v0_4/lib/title.js'] }, ts: t + 1 },
      { runId: 'x8d', state: 'escalating', provider: 'chatgpt', ts: t + 2 },
    ];
    const ws = WS.workSurface({ injects: [{ uuid: 'i1', path: 'looking-glass-bundle-v0_4/lib/title.js', op: 'write', status: 'proposed', content: 'a\n', createdAt: t + 1, history: [] }],
      runs: rows, readCurrent: () => '', unifiedDiff: () => '@@ -0,0 +1 @@\n+a' });
    assert.strictEqual(ws.files[0].run.provider, 'gemini', JSON.stringify(ws.files[0].run));
  });

  await test('RC-16', 'a build of a repo with files and no index runs the import pipeline, says so on the run, then snapshots', async () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const at = api.indexOf('if (_noRegistry(snap)) {');
    assert.ok(at > api.indexOf('// (1) snapshot first — never write without one') && at < api.indexOf("state: 'refused', error: `no snapshot: ${snap.error}`"), 'before the refusal');
    assert.ok(/state: 'indexed', error: why, pipeline: state/.test(api), 'the run says it indexed');
    // the mechanism, for real: his case — files on disk, no atlas.json
    const SNAP = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/snapshot.js')).href);
    const { runImportPipeline } = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/import-pipeline.js')).href);
    const dir = tmp('rc16');
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'lib/title.js'), "'use strict';\nfunction title(s) { return String(s).trim(); }\nmodule.exports = { title };\n");
    fs.writeFileSync(path.join(dir, 'lib/app.js'), "'use strict';\nconst { title } = require('./title.js');\nconst bus = new (require('events'))();\nbus.on('title.set', (t) => title(t));\nbus.emit('title.set', ' x ');\nmodule.exports = { title };\n");
    const repo = { uuid: 'rc16-repo', name: 'looking-glass-bundle-v0_4', files: ['lib/title.js', 'lib/app.js'].map(f => ({ path: f, content: fs.readFileSync(path.join(dir, f), 'utf8') })) };
    assert.strictEqual(SNAP.buildSnapshotRecord({ repo, repoDir: dir }).code, 'NOT_INDEXED');
    const p = await quiet(() => runImportPipeline(repo, dir));
    assert.notStrictEqual(p.state, 'FAULT', p.error);
    const rec = SNAP.buildSnapshotRecord({ repo, repoDir: dir });
    assert.ok(rec.ok, 'snapshot-able now');
    // 0.60.197 — "shouldn't that be the component registry. architecture tab": the snapshot names the registry the planner reads
    const reg = rec.record.mustRecord.registryVersion;
    assert.ok(reg.available && /^[0-9a-f]{64}$/.test(reg.sha256) && reg.components >= 2, JSON.stringify(reg));
    // 0.60.198 — "the spine, event bus, interaction contract, and component registry": four parts, each its own hash
    assert.deepStrictEqual(Object.keys(reg.parts), ['components', 'spine', 'eventBus', 'contract']);
    for (const k of Object.keys(reg.parts)) assert.ok(/^[0-9a-f]{64}$/.test(reg.parts[k].sha256), k);
    assert.ok(reg.parts.spine.wires >= 1, 'app.js requires title.js: ' + JSON.stringify(reg.parts));
    // dir is left in the OS temp: the lazy L6 pass writes into it after the test returns
  });

  await test('RC-17', 'the upload dialog waits 120s, and an import that outran the wait is found by its compartment and opened', () => {
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    const fin = app.slice(app.indexOf('async function submitUploadProjectImport'), app.indexOf('async function chunkRepoWithProgress'));
    assert.ok(/deferChunking: true \}\),\n    \}, 120000\);/.test(fin), '120s, not 30s');
    assert.ok(/r\.compartmentId === UP_COMPARTMENT_ID/.test(fin) && /UP_COMPARTMENT_ID = res\.compartmentId/.test(app), 'found by the compartment the start opened');
    assert.ok(fin.indexOf('if (!res) {') < fin.indexOf('closeUploadProjectModal();') && fin.indexOf('closeUploadProjectModal();') < fin.indexOf('chunkRepoWithProgress(repo.uuid'), 'found → closed, opened, indexed');
    assert.ok(!/— ready`;\n    return;/.test(fin), 'a failure never resets to "ready"');
  });

  await test('RC-18', 'a phase build stands on the registry (spine, event bus, contract, components), not atlas.json', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const gate = api.slice(api.indexOf('const _noRegistry = (s) =>'), api.indexOf("state: 'refused', error: `no snapshot: ${snap.error}`"));
    assert.ok(/registryVersion\.available/.test(gate) && !/atlas\.json'\)/.test(gate), 'the gate reads registryVersion');
    assert.ok(/code: 'NO_REGISTRY'/.test(gate) && /state: 'refused', snapshot: snap\.data\.commitId, error: `no registry:/.test(gate), 'still none after indexing: refused, said on the run');
    assert.ok(gate.indexOf('runImportPipeline(') < gate.indexOf("code: 'NO_REGISTRY'"), 'indexes once before refusing');
    const SNAP = fs.readFileSync(path.join(ROOT, 'idearium/repo/snapshot.js'), 'utf8');
    assert.ok(/'registryVersion',/.test(SNAP), 'a must-record key');
  });

  await test('RC-19', 'a wait that runs out says which call, how long, and why it may be busy — never "signal is aborted"; the upload start waits 60 s', async () => {
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    const ft = app.match(/async function fetchTimeout\(url, opts=\{\}, ms=5000\) \{[\s\S]*?\n\}\n/)[0];
    const ap = app.match(/async function api\(path, opts=\{\}, timeoutMs=6000\) \{[\s\S]*?\n\}\n/)[0];
    // a fetch that never answers until its signal aborts, as a busy Idearium does
    const fetch = (url, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' }))));
    const run = new Function('fetch', 'API_BASE', `${ft}\n${ap}\nreturn api;`)(fetch, 'http://127.0.0.1:4800');
    let err = null; try { await run('/api/project-import/start', { method: 'POST', body: '{}' }, 50); } catch (e) { err = e; }
    assert.ok(err && err.name === 'AbortError' && err.timedOut, String(err));
    assert.ok(/^Idearium did not answer POST \/api\/project-import\/start within 0s — it may be busy/.test(err.message) && !/signal is aborted/.test(err.message), err.message);
    assert.ok(/api\('\/api\/project-import\/start', \{ method: 'POST', body: JSON\.stringify\(\{ name, goal \}\) \}, 60000\)/.test(app), 'the start waits 60 s');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
