'use strict';
/**
 * tests/modules/test-log-fixes.test.js — what his 0.60.201 run log showed, fixed (0.60.205)
 * Map: docs/2026-10-10-idearium-solid-phasemap.spec (SD21_what_his_run_log_showed).
 * James, 2026-10-22: "the log fixes also. start them"
 *
 *   LF-01  L1 the background probe is deferred when its model would not fit free memory (it drove memory critical every 10 min)
 *   LF-02  L2 behind a sign-in wall a build's job is sent back so the ladder climbs; a person's job still waits (claude, 295 s)
 *   LF-03  L3 the shadow's absent line says what each thing is: a file, an event, a condition
 *   LF-04  L4 a proof run's per-run history stays out of the repo's store (one spec chunk per run: 35 → 65 in an evening)
 *   LF-05  L5 the phase asked for one file: an unaddressed block goes there, no "which file?" job is sent
 *   LF-06  L6 the Nexus sync pauses between systems when memory goes, the rest next round
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

(async () => {
  console.log('\n⬡  what his run log showed, fixed\n');

  await test('LF-01', 'L1 the probe asks whether its model fits free memory, and is deferred when it does not', async () => {
    const ncPath = require.resolve(path.join(ROOT, 'lib/nexus-client.js'));
    const real = require(ncPath);
    const GB = 1073741824;
    require.cache[ncPath].exports = { ...real, get: async () => ({ models: ['qwen2.5-coder:7b'], active: 'qwen2.5-coder:7b', sizes: { 'qwen2.5-coder:7b': 64 * GB }, loaded: [] }) };
    try {
      delete require.cache[require.resolve(path.join(ROOT, 'copilot/adversarial.js'))];
      const A = require(path.join(ROOT, 'copilot/adversarial.js'));
      const f = await A._probeModelFits();
      assert.ok(f.fits === false && /qwen2\.5-coder:7b needs/.test(f.why), JSON.stringify(f));   // 64 GB never fits the test machine
      require.cache[ncPath].exports = { ...real, get: async () => null };
      assert.strictEqual((await A._probeModelFits()).fits, true, 'Ollama not answering: not checked, the level check still holds');
      const src = fs.readFileSync(path.join(ROOT, 'copilot/adversarial.js'), 'utf8');
      assert.ok(src.indexOf('await _probeModelFits()') < src.indexOf('_running = true;'), 'asked before the probe loads anything');
    } finally { require.cache[ncPath].exports = real; }
  });

  await test('LF-02', 'L2 a build job (…-phrun-…) is sent back at a sign-in wall; a person\'s job still waits for the sign-in', async () => {
    const P = require(path.join(ROOT, 'guardian/lib/provider-login.js'));
    assert.strictEqual(P.releasableBehindWall({ status: 'queued', sessionId: 'repo-agent-nexus-id-repo-c4022f03-phrun-1761000-c1-r3t1' }), true);
    assert.strictEqual(P.releasableBehindWall({ status: 'queued', priority: 'normal' }), true, 'background work too');
    assert.strictEqual(P.releasableBehindWall({ status: 'queued', priority: 'high', sessionId: 'repo-agent-x' }), false, 'a person waiting: kept');
    assert.strictEqual(P.releasableBehindWall({ status: 'queued' }), false, 'default (high): kept');
    assert.strictEqual(P.releasableBehindWall({ status: 'dispatched', sessionId: 'x-phrun-1' }), false, 'only what is still queued');
    const src = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
    assert.ok(/function _releaseBehindWall\(provider, why\)/.test(src) && /bus\.emit\('guardian\.job\.error', \{ jobId: job\.id, error, provider \}\)/.test(src), 'the waiting caller is told (guardian.job.error)');
    assert.ok(/if \(state === 'wall'\) \{ try \{ _releaseBehindWall\(provider/.test(src) && /_releaseBehindWall\(provider, rec\.text \|\| rec\.url\);\n\s+const left/.test(src), 'on the wall report and in the held flush');
  });

  await test('LF-03', 'L3 the absent line labels each thing: his "lib/title.js, a-test-that-proves…" read like two missing files', async () => {
    const SH = require(path.join(ROOT, 'lib/shadow.js'));
    assert.strictEqual(SH.absentLine({ files: ['lib/title.js'], fields: ['a-test-that-proves-title-as-the-spec-sta'] }), 'file lib/title.js · condition a-test-that-proves-title-as-the-spec-sta');
    assert.strictEqual(SH.absentLine({ events: ['x.done'] }), 'event x.done');
  });

  await test('LF-04', 'L4 a proof run gives the store the report and latest.json only; the per-run history goes to the disk', async () => {
    const PR = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/proof-run.js')).href);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf04-'));
    fs.writeFileSync(path.join(dir, 'a.txt'), 'hi\n');
    const stored = [];
    const r = await quiet(() => PR.runProof({ repoDir: dir, conditions: [{ says: 'a.txt exists', check: { kind: 'file', path: 'a.txt' } }], writer: async (rel) => { stored.push(rel); return { ok: true }; } }));
    assert.ok(r.ok && r.run.met === 1, JSON.stringify(r).slice(0, 300));
    assert.deepStrictEqual(stored.sort(), [PR.LATEST_FILE, PR.REPORT_FILE].sort(), 'two fixed names in the store, so the spec does not grow per run');
    assert.ok(fs.existsSync(path.join(dir, r.run.files.run)), 'the history file is on disk');
    const r2 = await quiet(() => PR.runProof({ repoDir: dir, conditions: [{ says: 'a.txt exists', check: { kind: 'file', path: 'a.txt' } }] }));
    assert.ok(fs.existsSync(path.join(dir, PR.REPORT_FILE)) && fs.existsSync(path.join(dir, r2.run.files.run)), 'no writer: all three on disk, as before');
  });

  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  const repoUuid = await quiet(async () => {
    const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: `Looking Glass LF ${Date.now().toString(36)}` })).json.workshop;
    await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'Titles.' }] });
    return (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
  });
  const layer = api.getRepoLayer();

  await test('LF-05', 'L5 the phase asked for one file: the reply\'s one unaddressed block goes there and nobody is asked "which file?"', async () => {
    const CODE = "'use strict';\nfunction title(s) { return String(s).trim(); }\nmodule.exports = { title };\n";
    let asked = 0; const resolve = async () => { asked++; return 'NONE'; };
    const release = RI.expectPhase(repoUuid, { phase: 'SPEC.spec::SP5_title', files: ['lib/title.js'] });
    try {
      const out = await quiet(() => RI.fromReply({ layer, repo: layer.get(repoUuid), hat: { name: 'gemini' }, text: 'Here it is:\n```js\n' + CODE + '```\n', resolve, exchange: { ts: Date.now(), phase: 'SPEC.spec::SP5_title' } }));
      assert.strictEqual(asked, 0, 'no second job');
      assert.strictEqual(out.injects[0].path, 'lib/title.js', JSON.stringify(out).slice(0, 300));
      // a yaml block is not JavaScript: it is not put in lib/title.js on the phase's word — the agent is asked as before
      await quiet(() => RI.fromReply({ layer, repo: layer.get(repoUuid), hat: { name: 'gemini' }, text: '```yaml\ntitle:\n  input: string\n```\n', resolve, exchange: { ts: Date.now(), phase: 'SPEC.spec::SP5_title' } }));
      assert.strictEqual(asked, 1, 'a block whose language does not fit is asked about');
      // two unaddressed blocks: which is which is not known — asked
      await quiet(() => RI.fromReply({ layer, repo: layer.get(repoUuid), hat: { name: 'gemini' }, text: '```js\nconst a = 1;\n```\n\n```js\nconst b = 2;\n```\n', resolve, exchange: { ts: Date.now(), phase: 'SPEC.spec::SP5_title' } }));
      assert.strictEqual(asked, 3, 'each of two blocks is asked about');
    } finally { release(); }
    assert.strictEqual(RI.phaseSoleFile(repoUuid, 'SPEC.spec::SP5_title'), null, 'the build ended: nothing is assumed');
  });

  await test('LF-06', 'L6 the sync reads memory before each system and leaves the rest for the next round', async () => {
    const NS = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/nexus-self.js')).href);
    const src = fs.readFileSync(path.join(ROOT, 'idearium/repo/nexus-self.js'), 'utf8');
    const loop = src.slice(src.indexOf('const deferred = [];'), src.indexOf("lap('systems');"));
    assert.ok(/shouldPause\(\)/.test(loop) && /break;/.test(loop) && loop.indexOf('shouldPause') < loop.indexOf('syncSystem('), 'asked before each system');
    assert.ok(typeof NS.sync === 'function');
    const api2 = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/_nexusSelfSync\(\{ shouldPause: \(\) =>/.test(api2) && /only, force, shouldPause, log:/.test(api2), 'the scheduled sync passes it through');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
