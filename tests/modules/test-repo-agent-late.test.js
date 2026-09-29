'use strict';
// run-all: timeout 180000   (§0.39.282 — boots real guardian/idearium processes; ~92s alone, past the 60s default)
/**
 * tests/modules/test-repo-agent-late.test.js — v0.39.241
 * James (0.39.239's open item): the idearium Agent tab should pick up a reply
 * that arrives after copilot's wait has ended, from the Responses index by
 * agent, instead of staying on "thinking…".
 *
 * Real modules end to end, in the test sandbox (lib/test-sandbox.js):
 *   - a stub copilot on :3750 plays "copilot stopped waiting" (the only fake)
 *   - lib/repo-agent.js dispatch() → ok:false + awaitLate
 *   - guardian/lib/code-artifact.js recordAgentResponse — guardian's REAL writer —
 *     files the late reply into Clear Glass's REAL Responses index
 *   - repo-agent findLate / adoptLate read it back and process it once
 *   - the Agent tab's own watcher (idearium/ui/js/app.js, extracted verbatim and
 *     run in a vm) settles its "thinking…" line from the index
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
require(path.join(ROOT, 'lib', 'test-sandbox.js')).ensure();

const RA = require(path.join(ROOT, 'lib', 'repo-agent.js'));
const RH = require(path.join(ROOT, 'lib', 'repo-hat.js'));
const MEM = require(path.join(ROOT, 'lib', 'repo-hat-memory.js'));
const IDX = require(path.join(ROOT, 'clear-glass/src/downloads/artifact-chat-index.js'));
const { recordAgentResponse } = require(path.join(ROOT, 'guardian/lib/code-artifact.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`); failed++; } }

const REPO = { uuid: `late-test-${Date.now()}`, name: 'late scratch', compartmentId: 'cos.test.late' };
const AGENT = `repo-${REPO.uuid}`;
const MSG = 'explain the organism factory';

let copilotReply = { status: 502, body: { ok: false, error: 'guardian did not answer within 300000ms', jobId: 'job-live-1' } };   // copilot's real 502 shape (0.39.244: carries the jobId guardian created)
function stubCopilot() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let d = ''; req.on('data', (c) => (d += c));
      req.on('end', () => { res.writeHead(copilotReply.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(copilotReply.body)); });
    });
    srv.on('error', reject);
    srv.listen(3750, '127.0.0.1', () => resolve(srv));
  });
}
const guardianFiles = (text, { agentId = AGENT, prompt, jobId = `job-${Math.random().toString(16).slice(2, 10)}` } = {}) =>
  recordAgentResponse({ job: { id: jobId, provider: 'chatgpt', agentId, prompt: prompt || `You are the project agent…\n───\n${MSG}` }, text, blocks: [] });

(async () => {
  let srv;
  try { srv = await stubCopilot(); }
  catch (e) { console.log(`  ! could not bind :3750 (${e.message}) — a real copilot is probably running; run this suite alone.`); process.exitCode = 1; return; }
  const root = IDX.defaultRoot();
  console.log('\n⬡  REPO AGENT — late replies from the Responses index\n');

  try {
    let started;
    await test('LR-01', 'a guardian dispatch that copilot gave up on says where to look and from when (awaitLate)', async () => {
      const r = await RA.dispatch({ repo: REPO, repoDir: null, message: MSG, provider: 'chatgpt' });
      assert.strictEqual(r.ok, false);
      assert.ok(r.awaitLate, `no awaitLate: ${JSON.stringify(r)}`);
      assert.strictEqual(r.awaitLate.agentId, AGENT);
      assert.ok(r.awaitLate.since > 0 && r.awaitLate.since <= Date.now());
      assert.strictEqual(r.awaitLate.jobId, 'job-live-1', 'the job guardian created is carried, so the match can be exact');
      started = r.awaitLate.since;
    });

    await test('LR-01b', 'a guardian refusal with NO job (nothing was ever dispatched) does not await — nothing can arrive', async () => {
      const keep = copilotReply;
      copilotReply = { status: 502, body: { ok: false, error: "guardian reports no chatgpt tab connected (GET /providers: null)" } };
      try {
        const r = await RA.dispatch({ repo: REPO, repoDir: null, message: MSG, provider: 'chatgpt' });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.awaitLate, undefined);
        assert.ok(/no chatgpt tab connected/.test(r.error), `the real reason must reach the tab, got: ${r.error}`);
      } finally { copilotReply = keep; }
    });

    await test('LR-02', 'an ollama dispatch that fails does NOT await a late reply (no tab exists to answer)', async () => {
      const r = await RA.dispatch({ repo: REPO, repoDir: null, message: MSG, provider: 'ollama' });
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.awaitLate, undefined);
    });

    await test('LR-03', 'nothing in the index yet → found:false', async () => {
      const f = RA.findLate({ repo: REPO, since: started, message: MSG });
      assert.deepStrictEqual([f.ok, f.found], [true, false]);
    });

    // noise the finder must step over
    const before = guardianFiles('an OLD reply from before this exchange');
    // make it look older than `started` by rewriting captured_at in its .response (source of truth)
    { const p = path.join(root, before.responsePath); const j = JSON.parse(fs.readFileSync(p, 'utf8')); j.captured_at = started - 60000; fs.writeFileSync(p, JSON.stringify(j));  IDX.rebuildIndexFromResponses(root); }   // the source of truth changed under the (JAA) index — rebuild it, as the module's own contract says
    guardianFiles('a reply for a DIFFERENT compartment', { agentId: 'repo-someone-else' });
    guardianFiles('a reply to a different question', { prompt: 'You are the project agent…\n───\nwhat is the wire system?' });
    guardianFiles('```tool\n{"name":"read_file","args":{"path":"x"}}\n```');
    await test('LR-04', 'old replies, other agents, other questions and bare tool-loop turns are all passed over', async () => {
      const f = RA.findLate({ repo: REPO, since: started, message: MSG });
      assert.strictEqual(f.found, false, `wrongly found: ${f.text}`);
    });

    const late = guardianFiles('The organism factory spawns organisms from genomes.\n@learn fact: the factory is in runtime-organism-factory [evidence: runtime-organism-factory.js]');
    let found;
    await test('LR-05', "guardian's real reply for this agent and question is found, read-only", async () => {
      found = RA.findLate({ repo: REPO, since: started, message: MSG });
      assert.strictEqual(found.found, true);
      assert.strictEqual(found.responseId, late.id);
      assert.ok(found.text.startsWith('The organism factory'));
      assert.strictEqual(found.provider, 'chatgpt');
      assert.strictEqual(RA.history(REPO.uuid, 100).filter((r) => r.responseId).length, 0, 'find must not log anything');
    });

    let adopted;
    await test('LR-06', 'adopting it runs the same learn/log path as a normal reply, and marks it late', async () => {
      adopted = await RA.adoptLate({ repo: REPO, repoDir: null, responseId: found.responseId, message: MSG, since: started });
      assert.strictEqual(adopted.ok, true, adopted.error);
      assert.ok(!/@learn/.test(adopted.text), '@learn lines must be stripped exactly as dispatch strips them');
      assert.strictEqual(adopted.late.responseId, late.id);
      assert.ok(adopted.learned && adopted.learned.recorded.some((x) => x.ok), 'the @learn line was not recorded');
      const logged = RA.history(REPO.uuid, 100).find((r) => r.responseId === late.id);
      assert.ok(logged && logged.ok, 'the exchange was not logged with its responseId');
    });

    await test('LR-07', 'adoption is once: a second adopt returns the logged exchange and records nothing new', async () => {
      const obsBefore = MEM.stats(REPO.uuid).total;
      const again = await RA.adoptLate({ repo: REPO, repoDir: null, responseId: late.id, message: MSG, since: started });
      assert.strictEqual(again.ok, true);
      assert.strictEqual(again.alreadyAdopted, true);
      assert.strictEqual(MEM.stats(REPO.uuid).total, obsBefore);
      assert.strictEqual(RA.history(REPO.uuid, 100).filter((r) => r.responseId === late.id).length, 1);
    });

    await test('LR-07b', 'with the job id, the match is exact — another job’s reply for the same agent and question is not taken', async () => {
      const other = guardianFiles('reply to a DIFFERENT job, same agent and question', { jobId: 'job-other' });
      const mine = guardianFiles('reply to MY job', { jobId: 'job-mine' });
      const f = RA.findLate({ repo: REPO, since: started, message: MSG, jobId: 'job-mine' });
      assert.strictEqual(f.found, true); assert.strictEqual(f.responseId, mine.id);
      assert.strictEqual(RA.findLate({ repo: REPO, since: started, message: MSG, jobId: 'job-nope' }).found, false);
      // tidy: adopt both so LR-08's "nothing left to offer" still holds
      await RA.adoptLate({ repo: REPO, responseId: other.id, message: MSG, since: started });
      await RA.adoptLate({ repo: REPO, responseId: mine.id, message: MSG, since: started });
    });

    await test('LR-08', 'an adopted reply is not offered again to the next exchange', async () => {
      assert.strictEqual(RA.findLate({ repo: REPO, since: started, message: MSG }).found, false);
    });

    await test('LR-09', "another compartment's reply cannot be adopted into this one", async () => {
      const other = guardianFiles('not yours', { agentId: 'repo-someone-else' });
      const r = await RA.adoptLate({ repo: REPO, repoDir: null, responseId: other.id, message: MSG, since: started });
      assert.strictEqual(r.ok, false);
      assert.ok(/belongs to repo-someone-else/.test(r.error), r.error);
    });

    await test('LR-10', 'our own wait on copilot timing out also awaits a late reply; a refused connection does not', async () => {
      srv.close(); await new Promise((r) => setTimeout(r, 50));
      const refused = await RA.dispatch({ repo: REPO, repoDir: null, message: MSG, provider: 'chatgpt' });
      assert.strictEqual(refused.ok, false);
      assert.strictEqual(refused.awaitLate, undefined, 'no copilot → no job was created → nothing to wait for');
      const hang = http.createServer(() => { /* never answers */ });
      await new Promise((r) => hang.listen(3750, '127.0.0.1', r));
      try {
        const slow = await RA.dispatch({ repo: REPO, repoDir: null, message: MSG, provider: 'chatgpt', timeoutMs: 300 });
        assert.strictEqual(slow.ok, false);
        assert.ok(slow.awaitLate, `timed-out dispatch has no awaitLate: ${slow.error}`);
      } finally { hang.closeAllConnections && hang.closeAllConnections(); hang.close(); }
    });

    // ── the Agent tab's watcher, extracted verbatim from app.js ───────────
    const APP = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    const a = APP.indexOf('const AGENT_LATE_POLL_MS'), b = APP.indexOf('\n// §AGENT-DETAIL');
    const watcherSrc = APP.slice(a, b).replace('const AGENT_LATE_POLL_MS = 5000;', 'const AGENT_LATE_POLL_MS = 5;');
    function runWatcher({ findSeq, adoptReply }) {
      const calls = [];
      const ctx = { setTimeout, clearTimeout, encodeURIComponent, CURRENT_API_REPO: { uuid: 'u1' }, renderRepoAgent() {}, _agentDetail: () => '', calls };
      ctx.api = async (url, opts) => {
        calls.push([opts && opts.method || 'GET', url.split('?')[0], url]);
        if (opts && opts.method === 'POST') return adoptReply;
        return findSeq.length > 1 ? findSeq.shift() : findSeq[0];
      };
      vm.createContext(ctx);
      vm.runInContext(watcherSrc + '\nthis._agentLateWatch = _agentLateWatch;', ctx);
      return ctx;
    }
    const until = async (fn, ms = 2000) => { const t = Date.now() + ms; while (!fn()) { if (Date.now() > t) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 5)); } };

    await test('LR-11', 'tab: a reply found while copilot is still waiting replaces "thinking…" at once, without adopting', async () => {
      const ctx = runWatcher({ findSeq: [{ found: false }, { found: true, responseId: 'r1', text: 'early reply', provider: 'chatgpt' }], adoptReply: { ok: true, text: 'x' } });
      const line = { role: 'agent', text: 'thinking…' };
      const w = ctx._agentLateWatch('u1', MSG, Date.now(), line);
      await until(() => line.text === 'early reply');
      assert.ok(!ctx.calls.some((c) => c[0] === 'POST'), 'must not adopt while the dispatch is in flight');
      w.stop();
    });

    await test('LR-12', 'tab: copilot gives up, the reply lands later → adopted and the line settles as a late answer', async () => {
      const ctx = runWatcher({ findSeq: [{ found: false }, { found: false }, { found: true, responseId: 'r2', text: 'late text' }],
        adoptReply: { ok: true, text: 'late text', hatName: 'hat', providerUsed: 'chatgpt', late: { responseId: 'r2' }, elapsedMs: 400000 } });
      const line = { role: 'agent', text: 'thinking…' };
      const w = ctx._agentLateWatch('u1', MSG, Date.now(), line);
      w.afterFailure({ ok: false, error: 'guardian did not answer', awaitLate: { jobId: 'job-live-1' } }, false);
      assert.ok(/watching the Responses index/.test(line.text), line.text);
      await until(() => ctx.calls.some(c => c[0] === 'GET' && c[2] && /jobId=job-live-1/.test(c[2])));
      await until(() => line.text === 'late text');
      assert.ok(/late — from the Responses index/.test(line.meta), line.meta);
      assert.strictEqual(ctx.calls.filter((c) => c[0] === 'POST').length, 1);
    });

    await test('LR-13', 'tab: a reply seen in flight is adopted (not re-searched) once copilot reports failure', async () => {
      const ctx = runWatcher({ findSeq: [{ found: true, responseId: 'r3', text: 'seen early' }], adoptReply: { ok: true, text: 'seen early', late: { responseId: 'r3' } } });
      const line = { role: 'agent', text: 'thinking…' };
      const w = ctx._agentLateWatch('u1', MSG, Date.now(), line);
      await until(() => line.text === 'seen early');
      w.afterFailure({ ok: false, error: 'x', awaitLate: {} }, false);
      await until(() => line.meta && /late/.test(line.meta));
      assert.strictEqual(ctx.calls.filter((c) => c[0] === 'POST').length, 1);
    });

    await test('LR-14', 'tab: agentSend only waits on the index when the server said a tab may answer, or the tab itself timed out', async () => {
      assert.ok(/if \(!r\.awaitLate && !r\.clientTimeout\) \{ watch\.stop\(\); _agentSettle\(line, r\);/.test(APP));
      // 0.39.244 — the refusal body survives api()'s throw (before, awaitLate was lost and the watch never started)
      assert.ok(/e\.data = data;/.test(APP) && /r = \(e\.data && typeof e\.data === 'object'\) \? \{ \.\.\.e\.data, ok: false/.test(APP));
      assert.ok(!/lines\.pop\(\); \/\/ drop the placeholder/.test(APP), 'the old pop-and-replace path is gone');
    });

    await test('LR-15', 'idearium exposes find (GET, read-only) and adopt (POST) on /api/repos/:uuid/agent/late', async () => {
      const API = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
      const REG = fs.readFileSync(path.join(ROOT, 'idearium/registry-components.js'), 'utf8');
      assert.ok(/\['GET',\s+\['api','repos',\s+':uuid','agent','late'\],\s+'repo\.agent\.late\.find'\]/.test(API));
      assert.ok(/\['POST',\s+\['api','repos',\s+':uuid','agent','late'\],\s+'repo\.agent\.late\.adopt'\]/.test(API));
      assert.ok(/case 'repo\.agent\.late\.find':[\s\S]{0,400}RA\.findLate\(/.test(API));
      assert.ok(/case 'repo\.agent\.late\.adopt':[\s\S]{0,700}RA\.adoptLate\(/.test(API));
      assert.ok(REG.includes("'repo.agent.late.find'") && REG.includes("'repo.agent.late.adopt'"));
    });
  } finally {
    try { srv.close(); } catch (_) {}
    try { RH.revokeRepoHat(REPO.uuid); } catch (_) {}
    try { MEM.list(REPO.uuid, { limit: 1000 }).forEach((o) => MEM.forget(o.uuid || o.id)); } catch (_) {}
    try { RA.clearHistory(REPO.uuid); } catch (_) {}
  }
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed ? 1 : 0;
})();
