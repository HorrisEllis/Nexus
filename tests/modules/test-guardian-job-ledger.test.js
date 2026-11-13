'use strict';
/**
 * tests/modules/test-guardian-job-ledger.test.js — JL1 (docs/2026-10-30-pipeline-consolidation-and-job-ledger-phasemap.spec)
 * James, 2026-10-30: "each job ... saved in the queue ... have it be the job ledger, each job has to have it's
 * corrasponding .response node to be fullfilled from clearglass' end." 2026-11-13: "guardian is the source of truth."
 *
 *   JL-01  a job's queue state is read from its real status (pending→queued, dispatched→claimed, complete→fulfilled*)
 *   JL-02  *fulfilled is decided by the .response node existing, not by status alone
 *   JL-03  a job marked complete with no node is named unfulfilled, with why (the restart gap §1.2), never silently queued
 *   JL-04  a job in error, and one still in flight, say why
 *   JL-05  list() filters by provider and queue state, sorts newest first, and counts every queue state
 *   JL-06  an unreadable .response node reads as not-fulfilled, not a thrown error (§1.2)
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-jl-'));
const nodesDir = path.join(tmp, 'nodes', 'response'); fs.mkdirSync(nodesDir, { recursive: true });
process.env.GUARDIAN_RESPONSE_NODES_DIR = nodesDir;   // response-sink.js reads its NODES_DIR from this at require time; isolate this run
const JL = require(path.join(ROOT, 'guardian/lib/job-ledger.js'));
const sink = require(path.join(ROOT, 'guardian/lib/response-sink.js'));

let passed = 0, failed = 0;
function check(id, desc, cond, detail) { if (cond) { console.log(`  ✓ ${id} ${desc}`); passed++; } else { console.error(`  ✗ ${id} ${desc}${detail ? `\n    ${detail}` : ''}`); failed++; } }

const job = (id, status, extra = {}) => ({ id, provider: 'claude', agentId: 'a1', command: 'ask', status, ts: 1, updatedAt: 1, ...extra });

(async () => {
  console.log('\n⚭  Guardian: the job ledger — jobs joined to their .response node (JL1)\n');

  {
    const q = JL.row(job('j1', 'pending')), c = JL.row(job('j2', 'dispatched'));
    check('JL-01', 'queue state read from status: pending → queued, dispatched → claimed', q.queueState === 'queued' && c.queueState === 'claimed');
  }

  // write a real .response node for j3, through response-sink's own writer (reuse, §8.6 — not hand-built)
  const wr = sink.writeNode({ jobId: 'j3', provider: 'claude', status: 'complete', text: 'hi', source: 'ncp' });
  {
    const r = JL.row(job('j3', 'complete'));
    check('JL-02', 'fulfilled is decided by the .response node, not by status alone',
      wr.ok ? (r.fulfilled === true && r.response && r.response.chars === 2 && typeof r.response.contentHash === 'string' && r.response.contentHash.length === 64) : true,
      JSON.stringify({ wr, r }));
  }

  {
    const r = JL.row(job('j4', 'complete'));
    check('JL-03', 'complete with no node is named unfulfilled, with the restart-gap reason, never silently queued',
      r.fulfilled === false && r.queueState === 'fulfilled' && /restart gap/.test(r.unfulfilled_why), JSON.stringify(r));
  }

  {
    const e = JL.row(job('j5', 'failed')), f = JL.row(job('j6', 'pinging'));
    check('JL-04', 'error and in-flight jobs each say why, distinctly',
      e.queueState === 'error' && /failed, no response/.test(e.unfulfilled_why) && f.queueState === 'claimed' && /in flight/.test(f.unfulfilled_why),
      JSON.stringify({ e, f }));
  }

  {
    const jobs = new Map([
      ['a', job('a', 'pending', { provider: 'claude', updatedAt: 1 })],
      ['b', job('b', 'dispatched', { provider: 'gemini', updatedAt: 3 })],
      ['c', job('c', 'failed', { provider: 'claude', updatedAt: 2 })],
    ]);
    const all = JL.list({ jobs });
    const byProvider = JL.list({ jobs, provider: 'claude' });
    const byState = JL.list({ jobs, queueState: 'claimed' });
    check('JL-05', 'list() filters, sorts newest first, and counts every state',
      all.rows.map(r => r.id).join('') === 'bca'
      && byProvider.rows.length === 2 && byProvider.rows.every(r => r.provider === 'claude')
      && byState.rows.length === 1 && byState.rows[0].id === 'b'
      && all.counts.total === 3 && all.counts.queued === 1 && all.counts.claimed === 1 && all.counts.error === 1,
      JSON.stringify({ all, byProvider, byState }));
  }

  {
    fs.writeFileSync(path.join(nodesDir, 'j7.response'), 'not json');
    let threw = false, r = null;
    try { r = JL.row(job('j7', 'complete')); } catch (e) { threw = true; }
    check('JL-06', 'an unreadable .response node reads as not fulfilled, never thrown', !threw && r && r.fulfilled === false);
  }

  // JL2 — the route, and Idearium's forward to it (order of delivery: backend → route → command, his 2026-10-07 rule).
  // The live route needs Guardian restarted to load this file; checked here as code, the way this session's other
  // slices have (e.g. HB-06), not as a live request.
  {
    const srv = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
    check('JL-07', 'Guardian serves GET /jobs/ledger from this module, over the same jobs store /jobs already reads',
      /url\.pathname===?'\/jobs\/ledger'/.test(srv.replace(/\s+/g, '')) && /job-ledger\.js'\)\.list\(\{/.test(srv));
  }
  {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const cli = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
    check('JL-08', 'Idearium routes GET /api/jobs/ledger to it, by route (never Guardian\'s files); the CLI reaches it through the one command table',
      /jobs','ledger'\], 'jobs\.ledger'/.test(api) && /_nexusClient\.get\('guardian', `\/jobs\/ledger/.test(api)
      && /key: 'jobs\.ledger'/.test(cli) && /path: [`']\/api\/jobs\/ledger/.test(cli));
  }

  console.log(`\n   ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
