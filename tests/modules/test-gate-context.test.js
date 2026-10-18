'use strict';
/**
 * tests/modules/test-gate-context.test.js — TL2a (0.60.145): a gate's context, and its job and reply reused across a restart.
 * Map: docs/2026-10-16-durable-work-timeline-phasemap.spec addendum (f).
 * James, 2026-10-18: "alright the gates need context. needs persistence, needs to survive restarts, reuse contracts, jobs and
 * responses."
 *
 *   GC-01  context + note: from the journal (every attempt at the gate) and the brick's run state (files changed, steps) — after
 *          a restart (memory dropped); the note names the attempts, the files, the last reply's tail, and is capped
 *   GC-02  a finished reply no attempt handled is reused: adopted from the real Responses index (guardian's own writer files it),
 *          through repo-agent adoptLate — once; after handled() it is never reused again
 *   GC-03  a reply still being written is waited for, then reused; one that stays open past the wait is asked again, said
 *   GC-04  the run log as the second witness: a job the gate already judged (a reply journaled before handled marks existed)
 *          is not reused, and is marked
 *   GC-05  the wiring: every attempt at a gate carries the note, tries reuse before it dispatches, and marks the gate's jobs
 *          handled when it ends; the run row says reused
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.join(__dirname, '../..');
require(path.join(ROOT, 'lib/test-sandbox.js')).ensure();
const assert = require('assert');
process.env.WORK_JOURNAL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-wj-'));
process.env.RUN_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-rs-'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

(async () => {
  const WJ = require(path.join(ROOT, 'lib/work-journal.js'));
  const RS = require(path.join(ROOT, 'lib/run-state.js'));
  const GC = require(path.join(ROOT, 'lib/gate-context.js'));
  const RH = require(path.join(ROOT, 'lib/repo-hat.js'));
  const { recordAgentResponse } = require(path.join(ROOT, 'guardian/lib/code-artifact.js'));
  const REPO = { uuid: `gc-${Date.now()}`, name: 'gate scratch', compartmentId: 'cos.test.gc' };
  const AGENT = `repo-${REPO.uuid}`;
  const brick = 'docs/m-phasemap.spec::P1_census::b1.census.js';
  const frames = (job, text, end, extra = {}) => {
    WJ.record({ repoUuid: REPO.uuid, jobId: job, event: 'dispatched', brick, provider: 'chatgpt', ...extra });
    if (text) WJ.record({ repoUuid: REPO.uuid, jobId: job, event: 'chunk', text, fullLen: text.length, brick, ...extra });
    if (end) WJ.record({ repoUuid: REPO.uuid, jobId: job, event: end, brick, ...extra });
  };
  const files = (job, text) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return recordAgentResponse({ job: { id: job, provider: 'chatgpt', agentId: AGENT, prompt: 'Build phase P1_census' }, text, blocks: [] }); } finally { console.log = l; console.warn = w; } };

  await test('GC-01', 'context and note from the journal and the run state, after a restart; capped', async () => {
    frames('a-1', 'const census = (', 'error');
    WJ.mark(REPO.uuid, brick, { state: 'failed' });
    frames('a-2', 'x'.repeat(5000) + '\nmodule.exports = { census };', 'complete');
    WJ.mark(REPO.uuid, brick, { state: 'incomplete' });
    const run = RS.begin({ repoUuid: REPO.uuid, goal: 'Build phase P1_census', brick });
    RS.step(run.runId, { name: 'code_write', arguments: { path: 'lib/census.js' }, ok: true });
    WJ._reset();   // a restart: nothing in memory
    const c = GC.context(REPO.uuid, brick);
    assert.deepStrictEqual(c.attempts.map(a => [a.attempt, a.jobId, a.handled]), [[1, 'a-1', 'failed'], [2, 'a-2', 'incomplete']]);
    assert.deepStrictEqual(c.files, ['lib/census.js']);
    const n = GC.note(c);
    assert.ok(n.length <= GC.NOTE_MAX, `capped (${n.length})`);
    assert.match(n, /THIS GATE BEFORE/); assert.match(n, /2 attempt\(s\): 1\. chatgpt failed; 2\. chatgpt incomplete/);
    assert.match(n, /files already changed at this gate: lib\/census\.js/); assert.match(n, /code_write/);
    assert.match(n, /module\.exports = \{ census \};$/, 'the last reply\'s tail');
    assert.strictEqual(GC.note(GC.context(REPO.uuid, 'nowhere::P::b9.x.js')), '', 'no history: nothing');
  });

  await test('GC-02', 'a finished reply no attempt handled is reused once, from the real Responses index', async () => {
    await quiet(() => { try { RH.ensureRepoHat({ repo: REPO, repoDir: null }); } catch (_) {} });
    assert.ok(RH.getRepoHat(REPO.uuid), 'the compartment has a hat');
    frames('b-1', 'census done: the command row is added', 'complete');
    files('b-1', 'census done: the command row is added');
    const u = await quiet(() => GC.reuse({ repo: REPO, brick, message: 'Build phase P1_census', pollMs: 50 }));
    assert.ok(u.r, u.why);
    assert.strictEqual(u.r.text, 'census done: the command row is added');
    assert.strictEqual(u.r.reused.jobId, 'b-1');
    GC.handled(REPO.uuid, brick, { state: 'replied' });
    const again = await quiet(() => GC.reuse({ repo: REPO, brick, message: 'Build phase P1_census', pollMs: 50 }));
    assert.strictEqual(again.r, null); assert.match(again.why, /no reply at this gate/);
  });

  await test('GC-03', 'a reply still being written is waited for, then reused; past the wait it is asked again, said', async () => {
    frames('c-1', 'half of it', null);
    setTimeout(() => { WJ.record({ repoUuid: REPO.uuid, jobId: 'c-1', event: 'chunk', text: 'half of it, and the rest', brick }); WJ.record({ repoUuid: REPO.uuid, jobId: 'c-1', event: 'complete', brick }); files('c-1', 'half of it, and the rest'); }, 250);
    const u = await quiet(() => GC.reuse({ repo: REPO, brick, message: 'Build phase P1_census', pollMs: 50, waitMs: 5000 }));
    assert.ok(u.r, u.why); assert.strictEqual(u.r.text, 'half of it, and the rest'); assert.ok(u.waitedMs >= 200, `waited ${u.waitedMs} ms`);
    GC.handled(REPO.uuid, brick, { state: 'replied' });
    frames('c-2', 'still going', null);
    const late = await quiet(() => GC.reuse({ repo: REPO, brick, message: 'Build phase P1_census', pollMs: 50, waitMs: 300 }));
    assert.strictEqual(late.r, null); assert.match(late.why, /still writing after/);
    GC.handled(REPO.uuid, brick, { state: 'failed' });
  });

  await test('GC-04', 'the run log as the second witness: a job the gate already judged is not reused, and is marked', async () => {
    frames('d-1', 'judged already', 'complete');
    files('d-1', 'judged already');
    const u = await quiet(() => GC.reuse({ repo: REPO, brick, message: 'Build phase P1_census', pollMs: 50, judged: (j) => j.jobId === 'd-1' }));
    assert.strictEqual(u.r, null); assert.match(u.why, /already judged/);
    assert.strictEqual(WJ.get(REPO.uuid, 'd-1').handled.state, 'judged-before');
  });

  await test('GC-05', 'the wiring: the note, reuse before dispatch, handled after, the run row says reused', () => {
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const a = src.indexOf('const makeAttempt = ('), b = src.indexOf('const makeOnOutcome = (');
    const body = src.slice(a, b);
    assert.ok(/gateNote = GCx\.note\(GCx\.context\(target\.uuid, brickKey\)\)/.test(body), 'the note from the gate\'s context');
    assert.ok(/\+ \(gateNote \? `\\n\\n\$\{gateNote\}` : ''\)/.test(body), 'carried in the message');
    const ru = body.indexOf("gate-context.js').reuse("), dsp = body.indexOf('if (!r) try {');
    assert.ok(ru > 0 && dsp > ru, 'reuse is tried before a dispatch, which runs only without a reused reply');
    assert.ok(/judged: \(j\) => _phaseRows\(base\.repoUuid\)/.test(body), 'the run log is the second witness');
    assert.ok(/gate-context\.js'\)\.handled\(target\.uuid, brickKey/.test(body), 'the gate\'s jobs marked handled');
    assert.ok(/\.\.\.\(reused \? \{ reused \} : \{\}\)/.test(body), 'the run row says reused');
  });

  await test('GC-06', 'the Plan\'s run history says a reply was reused, and that the gate\'s context went with it', async () => {
    const { pathToFileURL } = require('url');
    const BP = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/build-plan.js')).href);
    const h = BP.historyOf([{ runId: 'phrun-x', state: 'replied', ts: 2, provider: 'chatgpt', reused: { jobId: 'b-1', waitedMs: 4000 }, gateContext: 812 }]);
    const l = h.runs[0].log[0];
    assert.strictEqual(l.reused, true);
    assert.match(l.note, /^reused job b-1's reply \(waited 4 s for it\) — not asked again · carried this gate's context \(812ch\)/);
    const pp = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8');
    assert.ok(/l\.reused \? ' <b data-reused>↺ reused<\/b>'/.test(pp), 'the row is marked on the Plan');
  });

  try { RH.revokeRepoHat(REPO.uuid); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
