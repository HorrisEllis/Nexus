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
for (let i = 1; i <= ROUNDS; i++) {
  spawnSync(process.execPath, [path.join(ROOT, 'cos', 'build', 'emerge-build.js'), '--map', MAP, '--phase', PHASE, '--ladder', LADDER], { cwd: ROOT, stdio: 'ignore', timeout: 3 * 3600 * 1000 });
  const run = lastRun(), rs = run ? rowsOf(run.f) : [], end = rs[rs.length - 1] || {}, pcs = ([...rs].reverse().find((r) => r.state === 'pieces') || {}).pieces || [];
  const passed = pcs.filter((p) => p.status === 'passed').length, done = ['examples-passed', 'landed'].includes(end.state);
  rounds.push({ round: i, run: run && run.f.replace(/\.jsonl$/, ''), last: end.state, passed, of: pcs.length, note: String(end.note || '').slice(0, 300) });
  console.log(`round ${i}: ${end.state} · ${passed} of ${pcs.length} pieces passed`);
  if (done) { console.log(JSON.stringify({ ok: true, phase: PHASE, rounds })); process.exit(0); }
  if (passed <= best) break; best = passed;
}
console.log(JSON.stringify({ ok: false, phase: PHASE, why: 'a round made no progress', rounds }));
