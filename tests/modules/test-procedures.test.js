'use strict';
/**
 * tests/modules/test-procedures.test.js — PD1 (0.60.354): his .procedure (lib/repo-procedures.js, 0.60.118) gains his yes, checks and a Nexus library.
 * James, 2026-11-01: "a command like a batch but a .framework or .macro that me and copilot can use" · choosing the name: ".procedure"
 * Map: docs/2026-11-01-procedures-phasemap.spec PD1. runSteps against stand-in tools; then the real Idearium API, the real CLI and nexus.command.
 * (DK1's own tests stay in test-repo-procedures.test.js, PR-01..07.)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-'));
process.env.REPO_PROCEDURES_DIR = path.join(tmp, 'repos');
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });
const RP = require(path.join(ROOT, 'lib/repo-procedures.js'));
const NX = require(path.join(ROOT, 'lib/node-export.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const strip = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const cmd = (command, flags) => ({ tool: 'nexus.command', args: { command, ...(flags ? { flags } : {}) } });
const UPDATE_LIKE = { id: 'up', name: 'Update', steps: [cmd('update'), { confirm: 'Bring it in' }, cmd('update apply', { yes: true }), cmd('system version'), { check: { of: 4, matches: 'Nexus \\d+' } }] };

(async () => {
  console.log('\n⬡  PROCEDURES — his .procedure, run like a .bat, stopping at his yes (PD1)\n');

  await test('PD-01', 'a repo procedure takes confirm and check steps; a check of a later step, an empty confirm or a bad pattern is refused, named', async () => {
    assert.ok(RP.save({ repoUuid: 'r1', name: 'ok', steps: UPDATE_LIKE.steps }).ok);
    const bad = RP.save({ repoUuid: 'r1', name: 'bad', steps: [{ check: { of: 2, contains: 'x' } }, { confirm: '  ' }, { tool: 't', args: {} }, { check: { of: 3, matches: '(' } }] });
    assert.ok(!bad.ok && /step 1, 2, 4 is not/.test(bad.error), bad.error);
  });

  await test('PD-02', 'without his yes a run stops at the confirm: nothing after it runs, and the run says it is waiting', async () => {
    const ran = [];
    const r = await RP.runSteps(UPDATE_LIKE, { runTool: async (t, a) => { ran.push(a.command); return { text: 'ok' }; } });
    assert.ok(!r.ok && r.waiting && r.run.waiting && r.run.stoppedAt === 2, JSON.stringify(r));
    assert.deepStrictEqual(ran, ['update']);
  });

  await test('PD-03', 'with his yes every step runs in order and the check reads what its step gave', async () => {
    const ran = [];
    const r = await RP.runSteps(UPDATE_LIKE, { yes: true, runTool: async (t, a) => { ran.push(a.command); return { text: a.command === 'system version' ? 'Nexus 0.60.354' : 'ok' }; } });
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepStrictEqual(ran, ['update', 'update apply', 'system version']);
    assert.ok(r.run.results[4].ok && r.run.results[4].check);
  });

  await test('PD-04', 'a refusal, a throw, or a check that does not hold stops the run with the reason; nothing after it runs', async () => {
    const ran = [];
    const refused = await RP.runSteps(UPDATE_LIKE, { yes: true, runTool: async (t, a) => { ran.push(a.command); return a.command === 'update apply' ? { refused: true, reason: 'the person\'s' } : { text: 'ok' }; } });
    assert.ok(!refused.ok && refused.run.stoppedAt === 3 && /the person's/.test(refused.run.results[2].error), JSON.stringify(refused.run));
    assert.ok(!ran.includes('system version'));
    const thrown = await RP.runSteps(UPDATE_LIKE, { runTool: async () => { throw new Error('unreachable'); } });
    assert.ok(!thrown.ok && /unreachable/.test(thrown.run.results[0].error));
    const bad = await RP.runSteps(UPDATE_LIKE, { yes: true, runTool: async () => ({ text: 'no version here' }) });
    assert.ok(!bad.ok && bad.run.stoppedAt === 5 && /step 4: .*does not match/.test(bad.run.results[4].error), JSON.stringify(bad.run.results[4]));
  });

  await test('PD-05', 'a repo replay waits at the confirm and keeps that on the file; with yes it runs through', async () => {
    const p = RP.save({ repoUuid: 'r2', name: 'gated', steps: [{ tool: 'a', args: {} }, { confirm: 'go on?' }, { tool: 'b', args: {} }] }).procedure;
    const runTool = async () => ({ ok: true });
    const w = await RP.replay('r2', p.id, { runTool });
    assert.ok(w.waiting && RP.get('r2', p.id).runs[0].waiting);
    assert.ok((await RP.replay('r2', p.id, { runTool, yes: true })).ok);
  });

  await test('PD-06', 'the library reads shipped procedures (no repo); a broken file is listed in bad; the shipped update-nexus asks his yes before the update', async () => {
    const dir = path.join(tmp, 'lib');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'up.procedure'), NX.toYaml(NX.wrap('procedure', 'up', UPDATE_LIKE, {})));
    fs.writeFileSync(path.join(dir, 'broken.procedure'), NX.toYaml(NX.wrap('procedure', 'broken', { id: 'broken', steps: [{ check: { of: 9, contains: 'x' } }] }, {})));
    const l = RP.library({ dir });
    assert.deepStrictEqual(l.map(x => x.id), ['up']); assert.strictEqual(l.bad[0].file, 'broken.procedure');
    const shipped = RP.library({ dir: path.join(ROOT, 'idearium/procedures') });
    const up = shipped.find(x => x.id === 'update-nexus');
    assert.ok(up && !shipped.bad.length, JSON.stringify(shipped.bad));
    assert.ok(up.steps.findIndex(s => s.confirm != null) < up.steps.findIndex(s => s.args && s.args.command === 'update apply'), 'his yes comes before the update');
  });

  // the real API, CLI and nexus.command: a safe procedure (only reads, around a confirm) in the test's own folder
  const dir = path.join(tmp, 'served');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'look.procedure'), NX.toYaml(NX.wrap('procedure', 'look', { id: 'look', name: 'Look', steps: [cmd('system version'), { confirm: 'Go on' }, cmd('system version'), { check: { of: 3, matches: 'Nexus \\d+' } }] }, {})));
  process.env.NEXUS_PROCEDURES_DIR = dir;
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const srv = await new Promise((res) => { const sv = http.createServer((q, r) => { let b = ''; q.on('data', d => { b += d; }); q.on('end', async () => {
    let body = {}; try { body = b ? JSON.parse(b) : {}; } catch (_) {}
    const o = await quiet(() => api._route(q.method, q.url, body)); r.statusCode = o.status || 200; r.setHeader('content-type', 'application/json'); r.end(JSON.stringify(o.json || {})); }); });
    sv.listen(0, '127.0.0.1', () => res(sv)); });
  const port = String(srv.address().port);
  process.env.IDEARIUM_PORT = port;
  const cli = (args) => new Promise((res) => execFile(process.execPath, [path.join(ROOT, 'idearium/cli/index.js'), ...args], { env: { ...process.env, IDEARIUM_PORT: port }, timeout: 120000 },
    (err, stdout, stderr) => res({ code: err ? (err.code ?? 1) : 0, out: strip(stdout), err: strip(stderr) })));

  await test('PD-07', '`procedure list` and `procedure show` from a terminal, through the real API', async () => {
    const l = await cli(['procedure', 'list']);
    assert.ok(l.code === 0 && /look\s+Look\s+system version → confirm → system version → check/.test(l.out), l.out + l.err);
    const s = await cli(['procedure', 'show', 'look']);
    assert.ok(s.code === 0 && /2\. confirm\s+Go on/.test(s.out) && /4\. check\s+step 3 matches/.test(s.out), s.out + s.err);
  });

  await test('PD-08', '`procedure run` stops at his yes; with --yes it runs through and the version check holds', async () => {
    const w = await cli(['procedure', 'run', 'look']);
    assert.ok(w.code === 0 && /waiting for your yes/.test(w.out) && !/ 3\. /.test(w.out), w.out + w.err);
    const y = await cli(['procedure', 'run', 'look', '--yes']);
    assert.ok(y.code === 0 && /✓  4\. check step 3/.test(y.out) && /\n  done/.test(y.out), y.out + y.err);
  });

  await test('PD-09', 'copilot gets the same stop: through nexus.command a run waits at the yes, and --yes is refused to it', async () => {
    const T = require(path.join(ROOT, 'lib/agent-tools/tools/nexus/command.js'));
    const r = await quiet(() => T.command.execute({ command: 'procedure run', args: ['look'] }, { agent: 'copilot' }));
    assert.ok(r.result && r.result.run && r.result.run.waiting && r.result.finished === false, JSON.stringify(r).slice(0, 400));
    const y = await T.command.execute({ command: 'procedure run', args: ['look'], flags: { yes: true } }, { agent: 'copilot' });
    assert.ok(y.refused && /person/.test(y.reason), JSON.stringify(y));
  });

  srv.close();
  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
