'use strict';
/**
 * tests/modules/test-claude-code-backend.test.js — IN2a: Claude Code as an Idearium agent backend
 * (lib/claude-code-backend.js, lib/repo-agent.js's 'claude-code' provider).
 * James: "i cant have an agent use this window" · "okay but im using idearium".
 *
 * A stand-in `claude` (CLAUDE_CODE_BIN) reads its prompt from stdin, edits files in its working directory and prints the
 * headless JSON result — the real `claude` is never run.
 *
 *   CC-01  the argv (headless, json, acceptEdits, read/edit tools only — no Bash) and the result's parse
 *   CC-02  a run works in a COPY: the stand-in's edits, additions and deletions come back as a diff; the repo itself is
 *          untouched and the copy is removed; the prompt arrives on stdin
 *   CC-03  failures are said, never thrown: claude not installed, an error result, output that is not JSON, a timeout
 *   CC-04  through Idearium: the 'claude-code' provider routes to it; a dispatch writes its changes through the REAL repo
 *          layer and reports them as injects; then PH1's proof loop drives it — the readme it misses on attempt 1 is
 *          fed back, attempt 2 writes it, the phase reads proven
 *   CC-05  wired: the provider in the Agent tab's switch; loom
 *   CC-06  the economy (§IN2b): every run is one ledger row (reported tokens, dollars, outcome); switched off → refused,
 *          nothing run; the person's fallback provider is followed and said; a failed run is a row too
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const CC = require(path.join(ROOT, 'lib/claude-code-backend.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}

// the stand-in `claude`: mode from STANDIN_MODE; it logs what it was given to STANDIN_LOG
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-test-'));
const standin = path.join(tmp, 'claude-standin.js');
fs.writeFileSync(standin, `#!/usr/bin/env node
const fs = require('fs');
let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => {
  const mode = process.env.STANDIN_MODE || 'edit';
  if (process.env.STANDIN_LOG) fs.appendFileSync(process.env.STANDIN_LOG, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), input }) + '\\n');
  if (mode === 'garbage') { process.stdout.write('not json at all'); return; }
  if (mode === 'error') { process.stdout.write(JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, result: 'ran out of turns' })); process.exit(1); }
  if (mode === 'sleep') { setTimeout(() => {}, 60000); return; }
  if (mode === 'edit') {
    fs.writeFileSync('a.js', 'module.exports = 2;\\n');
    fs.writeFileSync('notes/new.md', '# added\\n');
    fs.unlinkSync('gone.txt');
  }
  if (mode === 'readme' && /NOT met yet/.test(input)) fs.writeFileSync('README.md', '# Orbit Garden\\nPlans beds by sunlight.\\n');
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'done: ' + mode, session_id: 'sess-1', total_cost_usd: 0.0123, num_turns: 4, usage: { input_tokens: 100, cache_read_input_tokens: 20, cache_creation_input_tokens: 5, output_tokens: 30 } }));
});
`);
fs.chmodSync(standin, 0o755);
process.env.CLAUDE_CODE_BIN = standin;
const LOG = path.join(tmp, 'standin.log');
process.env.STANDIN_LOG = LOG;
const readLog = () => fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

function fixtureRepo() {
  const d = fs.mkdtempSync(path.join(tmp, 'repo-'));
  fs.writeFileSync(path.join(d, 'a.js'), 'module.exports = 1;\n');
  fs.mkdirSync(path.join(d, 'notes'));
  fs.writeFileSync(path.join(d, 'gone.txt'), 'bye\n');
  fs.mkdirSync(path.join(d, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(d, 'node_modules', 'x', 'i.js'), 'ignored');
  return d;
}

(async () => {
  console.log('\ntest-claude-code-backend — Claude Code as an Idearium agent backend (IN2a)');

  await test('CC-01', 'the argv is headless json with read/edit tools only; the result parses', async () => {
    const a = CC.argsFor();
    assert.deepStrictEqual(a.slice(0, 7), ['-p', '--output-format', 'json', '--permission-mode', 'acceptEdits', '--no-session-persistence', '--allowedTools']);
    assert.ok(!a.includes('Bash'), 'no Bash: running the code is the proof\'s job');
    assert.ok(CC.argsFor({ model: 'opus' }).join(' ').endsWith('--model opus'));
    const ok = CC.parseResult(JSON.stringify({ subtype: 'success', is_error: false, result: 'hi', total_cost_usd: 0.5, session_id: 's', num_turns: 2 }));
    assert.deepStrictEqual([ok.isError, ok.text, ok.cost, ok.sessionId, ok.turns], [false, 'hi', 0.5, 's', 2]);
    assert.strictEqual(CC.parseResult('{"type":"system"}\n{"subtype":"success","result":"last line"}').text, 'last line', 'stream-json: the last line');
    assert.match(CC.parseResult('nope').error, /not JSON/);
    assert.match(CC.parseResult('').error, /printed nothing/);
  });

  await test('CC-02', 'a run works in a copy; its edits come back as a diff; the repo is untouched', async () => {
    const repo = fixtureRepo();
    process.env.STANDIN_MODE = 'edit';
    const r = await CC.run({ repoDir: repo, prompt: 'change a.js, add notes/new.md, remove gone.txt' });
    assert.ok(r.ok, r.error);
    assert.deepStrictEqual(r.changes.map(c => [c.path, c.op]), [['a.js', 'write'], ['gone.txt', 'delete'], ['notes/new.md', 'write']]);
    assert.strictEqual(r.changes.find(c => c.path === 'a.js').content, 'module.exports = 2;\n');
    assert.strictEqual(r.changes.find(c => c.path === 'notes/new.md').created, true);
    assert.deepStrictEqual([r.text, r.cost, r.sessionId, r.turns], ['done: edit', 0.0123, 'sess-1', 4]);
    assert.strictEqual(fs.readFileSync(path.join(repo, 'a.js'), 'utf8'), 'module.exports = 1;\n', 'the repo itself is untouched');
    assert.ok(fs.existsSync(path.join(repo, 'gone.txt')));
    const call = readLog().pop();
    assert.notStrictEqual(call.cwd, repo, 'it ran in a copy'); assert.ok(!fs.existsSync(call.cwd), 'the copy is removed');
    assert.strictEqual(call.input, 'change a.js, add notes/new.md, remove gone.txt', 'the prompt arrives on stdin');
    assert.ok(!r.changes.some(c => c.path.startsWith('node_modules')), 'node_modules is not copied or diffed');
  });

  await test('CC-03', 'failures are said: not installed, an error result, not JSON, a timeout', async () => {
    const repo = fixtureRepo();
    process.env.CLAUDE_CODE_BIN = path.join(tmp, 'no-such-claude');
    const missing = await CC.run({ repoDir: repo, prompt: 'x' });
    assert.strictEqual(missing.ok, false); assert.match(missing.error, /not installed on this machine/);
    process.env.CLAUDE_CODE_BIN = standin;
    process.env.STANDIN_MODE = 'error';
    const er = await CC.run({ repoDir: repo, prompt: 'x' });
    assert.strictEqual(er.ok, false); assert.match(er.error, /error_max_turns — ran out of turns/);
    process.env.STANDIN_MODE = 'garbage';
    assert.match((await CC.run({ repoDir: repo, prompt: 'x' })).error, /not JSON/);
    process.env.STANDIN_MODE = 'sleep';
    const slow = await CC.run({ repoDir: repo, prompt: 'x', timeoutMs: 800 });
    assert.strictEqual(slow.ok, false); assert.match(slow.error, /did not finish in 1s/);
    assert.match((await CC.run({ repoDir: path.join(tmp, 'nowhere'), prompt: 'x' })).error, /not on disk/);
  });

  // ── through Idearium, the real repo layer ───────────────────────────────────────────────────────────────────────
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await imp('idearium/api/index.js');
  const R = (m, p, b) => api._route(m, p, b);
  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Orbit Garden' })).json.workshop;
  await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'A planner that places garden beds by measured sunlight.' }] });
  const repoUuid = (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
  const layer = api.getRepoLayer();
  const diskDir = () => { const r = layer.get(repoUuid); return r.materializeDir || layer.materialize(repoUuid).dir; };
  const Store = require(path.join(ROOT, 'lib/economy/store.js'));
  const Ledger = require(path.join(ROOT, 'lib/economy/ledger.js'));
  Store.save({ providers: { 'claude-code': { limits: { minGapMs: 0 } } } }, null, { by: 'test' });   // back-to-back runs in CC-04

  await test('CC-04', "Idearium's 'claude-code' provider: changes through the repo layer as injects; PH1 drives it to proven", async () => {
    const set = await R('POST', `/api/repos/${repoUuid}/agent/settings`, { provider: 'claude-code' });
    assert.strictEqual(set.status, 200, JSON.stringify(set.json)); assert.strictEqual(set.json.provider, 'claude-code');
    assert.strictEqual(RA.settingsView(repoUuid).backend, 'claude-code');
    layer.writeFile(repoUuid, 'a.js', 'module.exports = 1;\n', { preserveWhitespace: true });
    layer.writeFile(repoUuid, 'gone.txt', 'bye\n', { preserveWhitespace: true });
    layer.writeFile(repoUuid, 'notes/keep.md', 'k\n', { preserveWhitespace: true });
    process.env.STANDIN_MODE = 'edit';
    const repo = layer.get(repoUuid);
    const r = await RA.dispatch({ repo, repoDir: diskDir(), message: 'make the change', layer, session: 'cc4' });
    assert.ok(r.ok, r.error);
    assert.strictEqual(r.providerUsed, 'claude-code');
    assert.deepStrictEqual(r.injects.injects.map(i => [i.path, i.op]).sort(), [['a.js', 'write'], ['gone.txt', 'delete'], ['notes/new.md', 'write']]);
    assert.strictEqual(layer.readFile(repoUuid, 'a.js').content, 'module.exports = 2;\n', 'written through the repo layer');
    assert.ok(layer.readFile(repoUuid, 'notes/new.md'), 'a new file through the repo layer');
    assert.ok(!layer.readFile(repoUuid, 'gone.txt') || layer.readFile(repoUuid, 'gone.txt').error, 'a deletion through the repo layer');
    assert.deepStrictEqual([r.claudeCode.cost, r.claudeCode.sessionId], [0.0123, 'sess-1']);
    const sent = readLog().pop().input;
    assert.match(sent, /make the change/, "the repo's composed prompt (hat, context, blocks) is what Claude Code is given");

    // PH1: the phase's own conditions; attempt 1 (the build) left no readme, the retry goes to Claude Code with the feedback
    const MAP = `spec:\n  phases:\n    P1_readme:\n      does: write the readme\n      conditions:\n        - says: The project has a readme for the client\n          check: { kind: file, path: README.md, contains: Orbit Garden }\n`;
    process.env.STANDIN_MODE = 'readme';
    const base = { runId: 'phrun-cc4', repoUuid, targetRepo: repoUuid, map: 'docs/fixture-phasemap.spec', phase: 'P1_readme', title: 'the readme' };
    const p = await api._provePhase({ target: layer.get(repoUuid), base, commitId: 'c1', mapText: MAP, phase: 'P1_readme', message: 'build the readme', dispatch: { provider: 'claude-code' } });
    assert.strictEqual(p.state, 'proven', JSON.stringify(p.run && p.run.results));
    assert.strictEqual(p.attempt, 2);
    assert.match(readLog().pop().input, /THE PROOF RUN CHECKED YOUR LAST ATTEMPT: 0 of 1 conditions met/, 'Claude Code was given the unmet promise');
    assert.match(layer.readFile(repoUuid, 'README.md').content, /Orbit Garden/);
  });

  await test('CC-06', 'the economy: every run is a ledger row with its reported tokens and dollars; a refusal is said, nothing run; a fallback is the person\'s', async () => {
    const rows = Ledger.records({ provider: 'claude-code' });
    assert.ok(rows.length >= 2, `CC-04's runs are in the ledger (${rows.length})`);
    const last = rows[rows.length - 1];
    assert.deepStrictEqual([last.outcome, last.tokensIn, last.tokensOut, last.tokenMethod, last.usd, last.jobType], ['ok', 125, 30, 'reported', 0.0123, 'build'], JSON.stringify(last));
    const repo = layer.get(repoUuid);
    // switched off in the economy → refused with the reason, the stand-in never runs
    Store.save({ providers: { 'claude-code': { enabled: false, onLimit: 'stop' } } }, null, { by: 'test' });
    const before = readLog().length, rowsBefore = Ledger.records({ provider: 'claude-code' }).length;
    const off = await RA.dispatch({ repo, repoDir: diskDir(), message: 'anything', layer, session: 'cc6' });
    assert.strictEqual(off.ok, false); assert.match(off.error, /the economy says stop: claude-code is switched off in the economy/);
    assert.strictEqual(readLog().length, before, 'claude was not run');
    assert.strictEqual(Ledger.records({ provider: 'claude-code' }).length, rowsBefore, 'a refusal is not a run');
    // the person's fallback: off, onLimit fallback:ollama → the dispatch goes to ollama (copilot down here), said
    Store.save({ providers: { 'claude-code': { enabled: false, onLimit: 'fallback:ollama' } } }, null, { by: 'test' });
    const fb = await RA.dispatch({ repo, repoDir: diskDir(), message: 'anything', layer, session: 'cc6b', timeoutMs: 2000 });
    assert.deepStrictEqual([fb.economy.from, fb.economy.fallback], ['claude-code', 'ollama']);
    assert.strictEqual(readLog().length, before, 'claude was not run for the fallback either');
    // a failed run is a row too
    Store.save({ providers: { 'claude-code': { enabled: true, onLimit: 'wait' } } }, null, { by: 'test' });
    process.env.STANDIN_MODE = 'error';
    const bad = await RA.dispatch({ repo, repoDir: diskDir(), message: 'anything', layer, session: 'cc6c' });
    assert.strictEqual(bad.ok, false);
    const lastBad = Ledger.records({ provider: 'claude-code' }).pop();
    assert.deepStrictEqual([lastBad.outcome, lastBad.jobType], ['failed', 'chat']); assert.match(lastBad.reason, /error_max_turns/);
    const P = require(path.join(ROOT, 'lib/agent-providers.js'));
    assert.ok(P.headless().includes('claude-code') && !P.all().includes('claude-code'), 'kept out of all(): its callers would route it to a guardian tab');
    assert.ok(Store.load().providers['claude-code'], 'an economy entry of its own');
  });

  await test('CC-05', "wired: the Agent tab's switch, loom", async () => {
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    assert.ok(app.includes("btn('claude-code',") && app.includes("backend === 'claude-code' ? { provider: 'claude-code' }"), 'a fourth position in the backend switch');
    const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'loom/data/registry.json'), 'utf8'));
    assert.ok(reg.component['nexus.lib.claude-code-backend'], 'a loom component');
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
