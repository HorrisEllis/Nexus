'use strict';
/**
 * tests/modules/test-run-pipeline.test.js — 0.60.50 CE1 + CE10 through the REAL repo-agent dispatch (not the pieces).
 * James, 2026-10-15: "need the full pipeline working." A real http stub on copilot's :3750 plays the providers.
 *   RP-01  a dispatch opens a run for the repo + session; the route carries runId, runAttempt and the header template
 *   RP-02  the pinned provider's tab "did nothing with it" (guardian's own words, job c2e60104's neighbour): the run moves to
 *          the next provider in the chain, said (run.lost, run.fallback), and the second request carries attempt 2
 *   RP-03  the same goal sent again RESUMES the run: attempt + 1, no new run
 *   RP-04  a run that finishes ok is done; a different goal is a new run
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..');
process.env.NEXUS_INJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-inject-'));
process.env.RUN_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-run-'));
let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const LOST = 'the chatgpt tab was handed the job and did nothing with it for 90 s — the prompt was not typed, so it is not sent there again';

async function main() {
  console.log('\ntest-run-pipeline\n');
  const RA = require(path.join(ROOT, 'lib', 'repo-agent.js'));
  const RS = require(path.join(ROOT, 'lib', 'run-state.js'));
  const bus = require(path.join(ROOT, 'nexus', 'nexus-bus.js'));
  const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
  const layer = api.getRepoLayer();
  const seen = []; for (const t of ['run.started', 'run.resumed', 'run.finished', 'run.lost', 'run.fallback']) bus.on(t, () => seen.push(t));

  let repoRec = null;
  for (let i = 0; i < 20; i++) {
    repoRec = layer.ingest({ name: `rp-${Date.now()}`, source: 'test', files: [{ path: 'src/a.js', content: 'const a = 1;\n' }] });
    if (!(repoRec && repoRec.error && /no spec-engine/.test(repoRec.error))) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const repo = { ...(repoRec.repo || repoRec), compartmentId: 'cos.test.runpipe' };
  check('a real repo exists', !!repo.uuid);

  const bySess = (x) => RS.list({ repoUuid: repo.uuid }).find(r => String(r.session).endsWith(x)) || null;   // the agent prefixes the session it was given
  const bodies = []; let lostFor = new Set(['chatgpt']);
  const srv = await new Promise((res, rej) => {
    const s = http.createServer((q, r) => { let d = ''; q.on('data', c => d += c); q.on('end', () => {
      let b = {}; try { b = JSON.parse(d); } catch (_) {}
      r.writeHead(200, { 'Content-Type': 'application/json' });
      if (q.url === '/api/prompt/resolve') return r.end(JSON.stringify({ ok: true, provider: 'auto', backend: 'guardian', agent: 'chatgpt' }));
      if (q.url === '/api/prompt') bodies.push(b);
      if (b.agent && lostFor.has(b.agent)) return r.end(JSON.stringify({ ok: false, error: LOST, provider_used: b.agent }));
      r.end(JSON.stringify({ ok: true, text: 'The drift is in registry-components.js.', provider_used: b.agent || b.backend }));
    }); });
    s.on('error', rej); s.listen(3750, '127.0.0.1', () => res(s));
  }).catch(e => { console.log(`  ! cannot bind :3750 — ${e.message}`); return null; });
  if (!srv) { process.exitCode = 1; return; }

  try {
    RA.setProvider(repo.uuid, 'chatgpt');
    const GOAL = 'Audit the registries (BL30)';
    const r1 = await RA.dispatch({ repo, repoDir: null, message: GOAL, layer, session: 'rp-sess-1' });
    const runs = RS.list({ repoUuid: repo.uuid });
    check('RP-01 a dispatch opened exactly one run for this repo and session', runs.length === 1 && /rp-sess-1$/.test(runs[0].session) && runs[0].goal === GOAL, JSON.stringify(runs.map(r => r.runId)));
    const first = bodies[0];
    check('RP-01b the first request went to chatgpt and carries the run (id, attempt) and the header template', first && first.agent === 'chatgpt' && first.tools && first.tools.runId === runs[0].runId && first.tools.runAttempt === 1 && /Your task/.test(first.tools.headerTemplate || ''),
      JSON.stringify(first && first.tools && Object.keys(first.tools)));
    check('RP-02 chatgpt did nothing: the same goal went on to a different provider', bodies.length >= 2 && bodies[1].agent && bodies[1].agent !== 'chatgpt', JSON.stringify(bodies.map(b => b.agent)));
    check('RP-02b the answer is the next provider\'s, and says what it switched from (class lost)', r1.ok === true && Array.isArray(r1.switchedFrom) && r1.switchedFrom[0].provider === 'chatgpt' && r1.switchedFrom[0].class === 'lost', JSON.stringify({ ok: r1.ok, sw: r1.switchedFrom, err: r1.error }));
    const after = RS.load(runs[0].runId);
    check('RP-02c the second request carried attempt 2 (the run resumed, steps kept)', bodies[1].tools && bodies[1].tools.runAttempt === 2 && after.attempt === 2, JSON.stringify({ a: bodies[1].tools && bodies[1].tools.runAttempt, att: after.attempt }));
    check('RP-02d the run recorded the loss and the move as events', (after.events || []).some(e => e.kind === 'lost') && (after.events || []).some(e => e.kind === 'fallback') && seen.includes('run.lost') && seen.includes('run.fallback'));
    check('RP-04 the run that finished ok is done', after.status === 'done');

    bodies.length = 0; lostFor = new Set();
    await RA.dispatch({ repo, repoDir: null, message: GOAL, layer, session: 'rp-sess-1' });
    check('RP-04b the same goal after it was DONE starts a fresh run (attempt 1)', RS.load(runs[0].runId).attempt === 1 && bodies[0].tools.runAttempt === 1);

    // a run that FAILED is resumed by the same goal
    lostFor = new Set(['chatgpt', 'gemini', 'deepseek', 'perplexity', 'claude']);
    bodies.length = 0;
    const rf = await RA.dispatch({ repo, repoDir: null, message: 'Another task', layer, session: 'rp-sess-2' });
    const failedRun = bySess('rp-sess-2');
    check('RP-03 every provider lost: the answer is a failure, bounded (no endless loop), and the run is failed', rf.ok === false && failedRun && failedRun.status === 'failed' && bodies.length <= 5, JSON.stringify({ ok: rf.ok, n: bodies.length, st: failedRun && failedRun.status }));
    lostFor = new Set(); bodies.length = 0;
    await RA.dispatch({ repo, repoDir: null, message: 'Another task', layer, session: 'rp-sess-2' });
    check('RP-03b the same goal after a failure RESUMES the failed run (attempt + 1)', bySess('rp-sess-2').attempt >= 2 && bodies[0].tools.runAttempt >= 2, JSON.stringify(bodies[0] && bodies[0].tools && bodies[0].tools.runAttempt));
  } finally {
    srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
