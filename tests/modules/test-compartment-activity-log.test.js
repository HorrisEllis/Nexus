'use strict';
/**
 * tests/modules/test-compartment-activity-log.test.js — §0.39.368 AL1: a repo's durable activity log.
 * James: "I also want to have a full extensive activity log in each repo."
 * Through the real API and repo layer: Claude Code (a stand-in `claude`) works a repo in review mode — its call is a
 * task, its files are proposals; the person applies one and rejects one; a phase-run row and a fault land; every one is
 * a row, in order, read back through GET /api/repos/:uuid/activity with its filters, and from another process.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'al-test-'));
const standin = path.join(tmp, 'claude-standin.js');
fs.writeFileSync(standin, `#!/usr/bin/env node
const fs = require('fs');
let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => {
  fs.writeFileSync('a.js', 'module.exports = 2;\\n');
  fs.writeFileSync('b.js', 'module.exports = "b";\\n');
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: 's1', total_cost_usd: 0.01, num_turns: 2, usage: { input_tokens: 10, output_tokens: 5 } }));
});
`);
fs.chmodSync(standin, 0o755);
process.env.CLAUDE_CODE_BIN = standin;
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });

(async () => {
  console.log('\n⬡  ACTIVITY LOG — one durable row per thing that happened in a repo\n');
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const quiet = console.log; console.log = () => {};
  const api = await imp('idearium/api/index.js');
  const R = (m, p, b) => api._route(m, p, b);
  const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Ledger Lane' })).json.workshop;
  await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'A tiny ledger.' }] });
  const repoUuid = (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
  console.log = quiet;
  const layer = api.getRepoLayer();
  layer.writeFile(repoUuid, 'a.js', 'module.exports = 1;\n', { preserveWhitespace: true });
  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  const RAct = require(path.join(ROOT, 'lib/repo-activity.js'));
  const AL = require(path.join(ROOT, 'lib/activity-log/compartment.js'));
  RI.setMode(repoUuid, 'review');
  const t0 = Date.now();

  let r;
  await test('AL-01', "an agent's call is a task: started and ended rows, its provider and time", async () => {
    await R('POST', `/api/repos/${repoUuid}/agent/settings`, { provider: 'claude-code' });
    const repo = layer.get(repoUuid);
    r = await RA.dispatch({ repo, repoDir: layer.get(repoUuid).materializeDir || layer.materialize(repoUuid).dir, message: 'add b and change a', layer });
    assert.ok(r.ok, r.error);
    const rows = AL.list(repoUuid, { kind: 'task' }).rows;
    assert.deepStrictEqual(rows.map(x => x.status).reverse(), ['running', 'ok'], JSON.stringify(rows));
    assert.ok(rows[0].actor && rows[0].ms >= 0 && rows[0].ref === rows[1].ref);
  });

  await test('AL-02', "its files are proposals — each a row, by the agent", () => {
    const rows = AL.list(repoUuid, { kind: 'inject' }).rows;
    assert.deepStrictEqual(rows.map(x => x.title.split(' — ')[0]).sort(), ['a.js', 'b.js']);
    assert.ok(rows.every(x => x.status === 'proposed' && x.actor !== 'person'), JSON.stringify(rows.map(x => x.actor)));
  });

  await test('AL-03', "the person applies one and rejects the other: rows by 'person'", async () => {
    const [a, b] = ['a.js', 'b.js'].map(p => r.injects.injects.find(i => i.path === p));
    const ap = await R('POST', `/api/repos/${repoUuid}/injects/${a.uuid}/apply`, {});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.json));
    await R('POST', `/api/repos/${repoUuid}/injects/${b.uuid}/reject`, { reason: 'not this one' });
    const rows = AL.list(repoUuid, { actor: 'person' }).rows;
    assert.deepStrictEqual(rows.map(x => x.kind).sort(), ['inject.applied', 'inject.rejected']);
    assert.ok(rows.find(x => x.kind === 'inject.rejected').detail === 'not this one');
  });

  await test('AL-04', 'a phase-run row and a fault are rows; a fault is failed, first class', () => {
    RAct.phaseRow({ uuid: 'phrun-al-1-started', runId: 'phrun-al-1', repoUuid, map: 'core', phase: 'P1', state: 'building', ts: Date.now() });
    RAct.phaseRow({ uuid: 'phrun-al-1-skipped', runId: 'phrun-al-1', repoUuid, state: 'skipped', memorySkip: true, provider: 'ollama:x:7b', rung: 2, error: 'not enough memory', ts: Date.now() });
    require(path.join(ROOT, 'lib/fault-log.js')).logFault({ system: 'idearium', agent: 'ollama:x:3b', component: 'test', faultClass: 'wrote-nothing', intent: 'P1', meta: { repoUuid, error: 'the reply changed no file' } });
    assert.deepStrictEqual(AL.list(repoUuid, { kind: 'phase' }).rows.map(x => x.kind).reverse(), ['phase.building', 'phase.skipped']);
    const f = AL.list(repoUuid, { kind: 'fault' }).rows[0];
    assert.ok(f && f.status === 'failed' && f.kind === 'fault.wrote-nothing' && /changed no file/.test(f.title));
  });

  await test('AL-05', 'GET /api/repos/:uuid/activity: newest first, filters, words, paging back, facets', async () => {
    const all = (await R('GET', `/api/repos/${repoUuid}/activity?facets=1`)).json;
    assert.ok(all.rows.length >= 9, String(all.rows.length));
    assert.ok(all.rows.every((x, i) => i === 0 || all.rows[i - 1].ts >= x.ts), 'newest first');
    assert.ok(all.rows.every(x => x.ts >= t0 - 1000));
    assert.strictEqual((await R('GET', `/api/repos/${repoUuid}/activity?status=failed`)).json.rows.every(x => x.status === 'failed'), true);
    assert.strictEqual((await R('GET', `/api/repos/${repoUuid}/activity?q=memory`)).json.rows[0].kind, 'phase.skipped');
    const page = (await R('GET', `/api/repos/${repoUuid}/activity?limit=3`)).json;
    assert.strictEqual(page.rows.length, 3); assert.strictEqual(page.more, true);
    const back = (await R('GET', `/api/repos/${repoUuid}/activity?limit=3&before=${page.rows[2].ts}`)).json;
    assert.ok(back.rows.every(x => x.ts < page.rows[2].ts));
    assert.ok(all.facets.kinds.inject >= 4 && all.facets.kinds.task === 2 && all.facets.actors.person === 2, JSON.stringify(all.facets));
    assert.strictEqual((await R('GET', '/api/repos/no-such-repo/activity')).status, 404);
  });

  await test('AL-06', 'durable: another process reads the same rows', () => {
    require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB.flush();   // the store writes on a timer; a restart after it has the rows
    const n = execFileSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(ROOT, 'lib/test-sandbox.js'))}).ensure(); process.stdout.write(String(require(${JSON.stringify(path.join(ROOT, 'lib/activity-log/compartment.js'))}).list(${JSON.stringify(repoUuid)}, { limit: 500 }).rows.length))`], { env: process.env, encoding: 'utf8' });
    assert.ok(Number(n.trim().split('\n').pop()) >= 9, n);
  });

  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
