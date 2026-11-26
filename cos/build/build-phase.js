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
// 2026-11-26 — James: "it needs to run end to end, fix itself each time and return to the original request, and retry, until it either does it
// or figures out how." Every way a build ends unbuilt (refused, no progress, the top of the ladder) files its failure and grows one branch back
// to the original request: the same map and phase, built again with the next way not yet tried (stronger readers, a fresh plan, the strongest
// model). When every way is tried, the last branch figures out how: what the builder lacked is written as a phase of the builder's own map
// through Idearium, with the evidence, so the next build has it. Each attempt is a node grown from the one before, on the canvas.
const STRONG = 'hf.co/mradermacher/DeepSeek-Coder-V2-Lite-Instruct-abliterated-i1-GGUF:Q4_K_M,huihui_ai/qwen2.5-coder-abliterate:7b,huihui_ai/qwen2.5-coder-abliterate:3b';
const WAYS = [
  { id: 'strong-readers', what: 'the stronger readers write and check its examples first', input: { readers: STRONG } },
  { id: 'fresh-plan', what: 'planned again from nothing: its functions read again, its examples asked again', input: { fresh: true } },
  { id: 'top-model', what: 'the strongest model builds every piece', input: { ladder: STRONG.split(',')[0] } },
];
const backToRequest = (why, extra = {}) => {
  const tried = [].concat(inp.tried || []), attempt = Number(inp.attempt) || 1, way = WAYS.find((w) => !tried.includes(w.id));
  const origin = { map: MAP, phase: PHASE, rounds: inp.rounds, ...(inp.steps ? { steps: true } : {}), origLadder: inp.origLadder || LADDER, ladder: inp.origLadder || LADDER };
  const failure = { id: `${PHASE}:failure-${attempt}`, label: `file the failure: ${PHASE}, attempt ${attempt}`, recovers: false, why: 'the evidence goes to Cortex, counted (anomaly, coincidence, invariant)',
    step: { type: 'http', config: { method: 'POST', url: 'http://127.0.0.1:3748/api/failure-modes', failOnHttpError: false,
      body: JSON.stringify({ faultClass: 'not-built', where: PHASE, system: 'cos/build', summary: `${PHASE} attempt ${attempt} (${tried.join(', ') || 'first way'}): ${why}`.slice(0, 600), evidence: rounds }) } } };
  const next = way
    ? { id: `${PHASE}:attempt-${attempt + 1}`, label: `back to the request: build ${PHASE} again (attempt ${attempt + 1}, ${way.id})`, why: `${why} → ${way.what}`,
      step: { type: 'script', config: { script: 'build-phase.js', input: { ...origin, ...way.input, attempt: attempt + 1, tried: [...tried, way.id] }, timeoutMs: 3600000 } } }
    : { id: `${PHASE}:how`, label: `figure out how: what the builder lacked for ${PHASE}, written as a phase`, why: `every way was tried (${tried.join(', ')}): ${why}`,
      step: { type: 'http', config: { method: 'POST', url: 'http://127.0.0.1:4800/api/repos/nexus-id-repo-cd326725/phases/add', failOnHttpError: false,
        body: JSON.stringify({ map: 'docs/2026-11-25-break-anything-down-phasemap.spec', prefix: 'UD', dependsOn: [],
          title: `the builder learns what ${PHASE} needed`.slice(0, 90),
          does: `Found by the pipeline, 2026-11-26 loop (his: "fix itself each time and return to the original request, and retry, until it either does it or figures out how"). ${PHASE} (${MAP}) was not built after ${attempt} attempts (${tried.join(', ')}). The last reason: ${why}. The builder gains what this names; then ${PHASE} is built again from its request.`.slice(0, 1800) }) } } };
  console.log(JSON.stringify({ ok: false, phase: PHASE, why, attempt, tried, ...extra, branches: [failure, next] }));
  process.exit(1);
};
const readersArg = inp.readers ? ['--readers', String(inp.readers)] : [];
if (inp.fresh) for (const f of [`${PHASE}.examples.json`, `${PHASE}.signatures.json`]) { try { fs.unlinkSync(path.join(ROOT, 'idearium', 'data', 'tasks', f)); } catch (_) {} }
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
    // a scheduled run steps aside while an earlier run of the same pipeline is still going (two at once would double the memory it needs)
    if (inp.pipelineId) { const rs = await get(7799, `/api/cos/automation/pipeline-runs?pipelineId=${encodeURIComponent(inp.pipelineId)}&limit=5`);
      const going = ((rs && rs.runs) || []).filter((r) => r.status === 'running' || r.status === 'paused');
      if (going.length > 1) { console.log(JSON.stringify({ ok: true, skipped: true, why: `an earlier run is still going (${going.slice(1).map((r) => r.id.slice(0, 8)).join(', ')}): this one steps aside`, branches: [] })); process.exit(0); } }
    const q = await get(4800, '/api/phases/next');
    if (!q || !Array.isArray(q.queue)) { console.log(JSON.stringify({ ok: false, why: 'Idearium did not give its queue of ready phases (GET /api/phases/next)' })); process.exit(1); }
    // buildable: an .eg file of its own, and examples the builder can test against, read by the builder's own reader (lib/test-first.js
    // examplesFrom). Found on the first scheduled run (71eefa48): GW0, OL1 and OS3 had none, the builder refused all three, and OS3's 39
    // "pieces" were a JavaScript file's constants
    const TF = require(path.join(ROOT, 'lib', 'test-first.js')), mapText = {};
    const hasExamples = (x) => { try { mapText[x.map] = mapText[x.map] || fs.readFileSync(path.join(ROOT, x.map), 'utf8'); return (TF.examplesFrom(mapText[x.map], x.id) || []).length > 0; } catch (_) { return false; } };
    // UD23: a phase without examples is taken too now: the builder has three readers agree on them first (examples-agreed); those with
    // examples of his go first
    const emerge = (x) => (x.files || []).some((f) => /\.eg$/.test(f) && !/(^|\/)test\//.test(f) && !/\.test\.eg$/.test(f));
    const take = q.queue.filter(emerge).sort((a, b) => Number(hasExamples(b)) - Number(hasExamples(a))).slice(0, Number(inp.limit) || 3);
    const skipped = q.queue.filter((x) => !emerge(x)).slice(0, 10).map((x) => `${x.id} (${(x.files || []).some((f) => /\.eg$/.test(f)) ? 'no examples to build against' : 'no Emerge file of its own'})`);
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
  const run1 = (piece) => spawnSync(process.execPath, [path.join(ROOT, 'cos', 'build', 'emerge-build.js'), '--map', MAP, '--phase', PHASE, '--ladder', LADDER, ...(piece ? ['--only', piece] : []), ...(inp.adversaries ? ['--adversaries', String(inp.adversaries)] : []), ...readersArg], { cwd: ROOT, stdio: 'ignore', timeout: 3 * 3600 * 1000 });
  if (!inp.piece) {
    let b = inp.fresh ? null : builds()[0]; if (!b || !b.rs.some((r) => r.state === 'planned')) { run1(null); b = builds()[0]; }
    const rs = (b && b.rs) || [];
    // the builder refused the phase (no examples, no plan): said as a failure, never a silent "done" with nothing planned (71eefa48)
    const refusedRow = rs.find((r) => r.state === 'refused');
    if (refusedRow || !rs.some((r) => r.state === 'planned')) backToRequest(refusedRow ? 'the builder refused it: ' + String(refusedRow.note || '').slice(0, 300) : 'the builder planned nothing');
    const planned = (((rs.find((r) => r.state === 'planned') || {}).exports) || []).map((x) => x.name).filter((n) => !/^[A-Z][A-Z0-9_]*$/.test(n));   // a constant is no piece to build
    const pcs = ([...rs].reverse().find((r) => r.state === 'pieces') || {}).pieces || [], ok = new Set(pcs.filter((p) => p.status === 'passed').map((p) => p.name));
    const todo = planned.filter((n) => !ok.has(n)); let prev = null;
    const branches = todo.map((n, i) => { const s = pieceStep(n, i ? `after ${todo[i - 1]}` : 'the first piece not yet built', prev ? [prev] : null); prev = s.id; return s; });
    console.log(JSON.stringify({ ok: true, phase: PHASE, planned, passed: [...ok].filter((n) => planned.includes(n)), branches }));
    process.exit(0);
  }
  run1(inp.piece);
  { const r0 = (builds()[0] || {}).rs || [], refusedRow = r0.find((r) => r.state === 'refused');
    // refused before any model was asked (no examples): no model can fix that, so no climb and no failure filed per piece
    if (refusedRow) backToRequest('the builder refused it: ' + String(refusedRow.note || '').slice(0, 300), { piece: inp.piece }); }
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
  spawnSync(process.execPath, [path.join(ROOT, 'cos', 'build', 'emerge-build.js'), '--map', MAP, '--phase', PHASE, '--ladder', LADDER, ...(inp.adversaries ? ['--adversaries', String(inp.adversaries)] : []), ...readersArg], { cwd: ROOT, stdio: 'ignore', timeout: 3 * 3600 * 1000 });
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
// at the top of the ladder: back to the original request, the next way not yet tried (2026-11-26), never a dead end
if (!next) backToRequest(`no progress at the top of the ladder (${short(LADDER.split(',').pop())}): ${String((rounds[rounds.length - 1] || {}).last || '')} ${String((rounds[rounds.length - 1] || {}).note || '')}`.trim());
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
