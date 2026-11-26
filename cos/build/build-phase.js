'use strict';
// cos/build/build-phase.js — a COS pipeline step (his scripts folder holds a one-line door to it: data/ is never committed): build one phase with the local models (cos/build/emerge-build.js), and repair itself.
// James, 2026-11-24: "told you that pipeline is the end state. get it working, and get the system repairing itself. less it needs you the better."
// Input (NEXUS_STEP_INPUT): { map, phase, rounds }. Each round resumes from the run's own gap files on disk; it goes on while a round passes more
// pieces than the one before, and stops when the module passes or a round makes no progress. The last line is the output, as JSON.
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const inp = (() => { try { return JSON.parse(process.env.NEXUS_STEP_INPUT || '{}'); } catch (_) { return {}; } })();
const MAP = inp.map || 'docs/2026-10-17-pieces-not-order-phasemap.spec', PHASE = inp.phase || 'EMB3_the_autocorrect', ROUNDS = Number(inp.rounds) || 6;
const BUILD = path.join(ROOT, 'cos', 'data', 'build');
// James, 2026-11-24: "3b needs to do it's pices": the 3b alone; what it cannot do is broken down and asked of Nexus, not of a bigger model
// James, 2026-11-24: "a bigger model, only if we hit an actual wall." The rung climbs only when a piece cannot be broken down any further (no new
// smaller piece can be named, or it loops); each climb is a row in the build's record, a wall to look at.
const LADDER = inp.ladder || 'huihui_ai/qwen2.5-coder-abliterate:3b,hf.co/mradermacher/DeepSeek-Coder-V2-Lite-Instruct-abliterated-i1-GGUF:Q4_K_M';
const lastRun = () => fs.readdirSync(BUILD).filter((f) => /^cbuild-.*\.jsonl$/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(BUILD, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
const rowsOf = (f) => fs.readFileSync(path.join(BUILD, f), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return {}; } });
const rounds = []; let best = -1;
// 2026-11-26 — the queue (his: "What ever gets the pipeline building all of this the quickest. Once that happens, nexus can build in my sleep" ·
// "what if we build per node. then we could have all of the phase nodes build one by one. bottom up?"). Idearium's own queue of ready phases
// (GET /api/phases/next: dependencies closed, files named, no open decision; sorted by what each unlocks) is read by route; the phases the
// Emerge builder can build (an .eg file of their own that is not a test) each become a branch that plans and builds itself piece by piece
// (input.steps). They wait on nothing but this step, and the pipeline's parallel setting runs them one at a time: a phase that sticks files
// its failure and grows its climb, and the next phase still runs.
if (inp.queue) {
  const http = require('http');
  const get = (port, p) => new Promise((res) => { const q = http.get({ host: '127.0.0.1', port, path: p, timeout: 180000 }, (r) => { let t = ''; r.on('data', (c) => t += c); r.on('end', () => { try { res(JSON.parse(t)); } catch (_) { res(null); } }); }); q.on('timeout', () => { q.destroy(); res(null); }); q.on('error', () => res(null)); });
  (async () => {
    const q = await get(4800, '/api/phases/next');
    if (!q || !Array.isArray(q.queue)) { console.log(JSON.stringify({ ok: false, why: 'Idearium did not give its queue of ready phases (GET /api/phases/next)' })); process.exit(1); }
    const emerge = (x) => (x.files || []).some((f) => /\.eg$/.test(f) && !/(^|\/)test\//.test(f) && !/\.test\.eg$/.test(f));
    const take = q.queue.filter(emerge).slice(0, Number(inp.limit) || 3);
    const skipped = q.queue.filter((x) => !emerge(x)).slice(0, 10).map((x) => `${x.id} (no Emerge file of its own)`);
    const SID = (s) => String(s).replace(/[^\w.:-]/g, '_');
    const branches = take.map((x) => ({ id: `phase:${SID(x.id)}`, label: `build ${x.id}`, why: `ready, unlocks ${x.unlocks}: ${x.why}`, onFail: 'continue',
      step: { type: 'script', config: { script: 'build-phase.js', input: { map: x.map, phase: x.id, steps: true, ladder: inp.ladder || LADDER, ...(inp.adversaries ? { adversaries: inp.adversaries } : {}) }, timeoutMs: 2700000 } } }));
    console.log(JSON.stringify({ ok: true, ready: q.queue.length, building: take.map((x) => x.id), skipped, branches }));
    process.exit(0);
  })();
} else
// 2026-11-26 — one piece, one step (his: "it should not be one box. one box is one step. each step has to build upon the last"). With
// input.steps, the first step plans: one branch per planned piece not yet passed, each waiting on the one before. A piece's step builds only
// that piece (emerge-build --only); a helper it needs becomes its own step, then the piece again after it; held with nothing to break it into,
// the step fails and grows its recovery (the failure filed, the next model up), as a whole build does.
if (inp.steps) {
  const SID = (s) => String(s).replace(/[^\w.:-]/g, '_');
  const builds = () => fs.readdirSync(BUILD).filter((f) => /^cbuild-.*\.jsonl$/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(BUILD, f)).mtimeMs })).sort((a, b) => b.t - a.t)
    .map((x) => ({ f: x.f, rs: rowsOf(x.f) })).filter((b) => (b.rs[0] || {}).phase === PHASE);
  const pieceStep = (name, why, deps) => ({ id: `${PHASE}:${SID(name)}`, label: `build ${name}`, why, ...(deps ? { depends_on: deps } : {}),
    step: { type: 'script', config: { script: 'build-phase.js', input: { ...inp, piece: name }, timeoutMs: 2700000 } } });
  const run1 = (piece) => spawnSync(process.execPath, [path.join(ROOT, 'cos', 'build', 'emerge-build.js'), '--map', MAP, '--phase', PHASE, '--ladder', LADDER, ...(piece ? ['--only', piece] : []), ...(inp.adversaries ? ['--adversaries', String(inp.adversaries)] : [])], { cwd: ROOT, stdio: 'ignore', timeout: 3 * 3600 * 1000 });
  if (!inp.piece) {
    let b = builds()[0]; if (!b || !b.rs.some((r) => r.state === 'planned')) { run1(null); b = builds()[0]; }
    const rs = (b && b.rs) || [], planned = (((rs.find((r) => r.state === 'planned') || {}).exports) || []).map((x) => x.name);
    const pcs = ([...rs].reverse().find((r) => r.state === 'pieces') || {}).pieces || [], ok = new Set(pcs.filter((p) => p.status === 'passed').map((p) => p.name));
    const todo = planned.filter((n) => !ok.has(n)); let prev = null;
    const branches = todo.map((n, i) => { const s = pieceStep(n, i ? `after ${todo[i - 1]}` : 'the first piece not yet built', prev ? [prev] : null); prev = s.id; return s; });
    console.log(JSON.stringify({ ok: true, phase: PHASE, planned, passed: [...ok].filter((n) => planned.includes(n)), branches }));
    process.exit(0);
  }
  run1(inp.piece);
  const rs = (builds()[0] || {}).rs || [], pcs = ([...rs].reverse().find((r) => r.state === 'pieces') || {}).pieces || [], me = pcs.find((p) => p.name === inp.piece) || {};
  if (me.status === 'passed') { console.log(JSON.stringify({ ok: true, phase: PHASE, piece: inp.piece, tries: me.tries, models: me.models })); process.exit(0); }
  const helpers = pcs.filter((p) => p.blocks === inp.piece && p.status !== 'passed').map((p) => p.name);
  if (helpers.length) {
    const hs = helpers.map((h) => pieceStep(h, `${inp.piece} needs it first`));
    const again = { ...pieceStep(inp.piece, `again, with ${helpers.join(', ')}`, hs.map((h) => h.id)), id: `${PHASE}:${SID(inp.piece)}:again` };
    console.log(JSON.stringify({ ok: false, phase: PHASE, piece: inp.piece, why: `${inp.piece} needs ${helpers.join(', ')} first`, branches: [...hs, again] }));
    process.exit(1);
  }
  rounds.push({ round: 1, run: null, last: me.status || 'held', passed: 0, of: 1, note: String(me.last || '').slice(0, 300) });
} else {
for (let i = 1; i <= ROUNDS; i++) {
  spawnSync(process.execPath, [path.join(ROOT, 'cos', 'build', 'emerge-build.js'), '--map', MAP, '--phase', PHASE, '--ladder', LADDER, ...(inp.adversaries ? ['--adversaries', String(inp.adversaries)] : [])], { cwd: ROOT, stdio: 'ignore', timeout: 3 * 3600 * 1000 });
  const run = lastRun(), rs = run ? rowsOf(run.f) : [], end = rs[rs.length - 1] || {}, pcs = ([...rs].reverse().find((r) => r.state === 'pieces') || {}).pieces || [];
  const planned = new Set((((rs.find((r) => r.state === 'planned') || {}).exports) || []).map((x) => x.name)),
    // 2026-11-25: progress is the planned functions that hold, not every piece: helpers the model invents (six parse_json helpers for EMB10's
    // served_by, passing on compile alone) made each round look like progress
    passed = pcs.filter((p) => p.status === 'passed' && (!planned.size || planned.has(p.name))).length, done = ['examples-passed', 'landed'].includes(end.state);
  rounds.push({ round: i, run: run && run.f.replace(/\.jsonl$/, ''), last: end.state, passed, of: pcs.length, note: String(end.note || '').slice(0, 300) });
  console.log(`round ${i}: ${end.state} · ${passed} of ${pcs.length} pieces passed`);
  if (done) { console.log(JSON.stringify({ ok: true, phase: PHASE, rounds })); process.exit(0); }
  if (passed <= best) break; best = passed;
}
}
if (inp.queue) return;   // the queue answers by itself, above (a module's top level may return)
// 2026-11-25 (his: "Have it expand itself, fix itself, get it working using nexus to get it working if not ... This is meant to be autonoius"):
// a build that made no progress says what to try next, as branches the pipeline grows (PC26): the failure filed with Cortex (evidence, never a
// recovery), and the same build on the next model up (his: "a bigger model, only if we hit an actual wall" — a round with no progress is the
// wall). A retry that fails grows the next one; at the top of the ladder, nothing is left to try and the run fails, said.
const CLIMB = (inp.climb || 'huihui_ai/qwen2.5-coder-abliterate:3b,huihui_ai/qwen2.5-coder-abliterate:7b,hf.co/mradermacher/DeepSeek-Coder-V2-Lite-Instruct-abliterated-i1-GGUF:Q4_K_M').split(',');
const top = LADDER.split(',').map((m) => CLIMB.indexOf(m.trim())).reduce((a, b) => Math.max(a, b), -1), next = CLIMB[top + 1] || null;
const short = (m) => String(m).split('/').pop().replace(/[^\w.:-]/g, '');
const branches = [
  { id: `${PHASE}:failure`, label: `file the failure: ${PHASE} made no progress`, recovers: false, why: 'the evidence goes to Cortex, counted (anomaly, coincidence, invariant)',
    step: { type: 'http', config: { method: 'POST', url: 'http://127.0.0.1:3748/api/failure-modes', failOnHttpError: false,
      body: JSON.stringify({ faultClass: 'no-progress', where: PHASE, system: 'cos/build', summary: `${PHASE}: a round made no progress on ${LADDER}`, evidence: rounds.map((r) => ({ run: r.run, passed: r.passed, of: r.of, note: r.note })) }) } } },
  ...(next ? [{ id: `${PHASE}:on-${short(next)}`, label: `build ${PHASE} on ${short(next)}`, why: `no progress on ${short(LADDER.split(',').pop())}: the next model up`,
    step: { type: 'script', config: { script: 'build-phase.js', input: { ...inp, ladder: next, climb: CLIMB.join(',') }, timeoutMs: 2700000 } } }] : []),
];
console.log(JSON.stringify({ ok: false, phase: PHASE, why: next ? `a round made no progress; next: ${short(next)}` : 'a round made no progress, and no model is left to climb to', rounds, branches }));
// 2026-11-25 (his: "nothing in nexus wouldn't be explicit"): a phase not built is a failed step, so its gate holds and its retries run; it exited 0
// and COS showed EMB10's run ff13a979 as done with served_by held
process.exit(1);
