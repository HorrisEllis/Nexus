// scripts/bench-warp2-vs-siso.mjs — SISO vs WARP 1.x vs WARP 2, one workload, measured here.
// James: "can you benchmark it?"  ·  Run: node --expose-gc scripts/bench-warp2-vs-siso.mjs
//
// Workload, identical in all three: N "cause" events from outside; a handler turns each into "effect".
// One cause in ten never gets its effect (the handler drops it) — the failure each system should be able to report.
//   speed   — events handled per second (median of 7 runs), logging on in each (SISO's StreamLog, WARP 1.x's
//             StreamLog, WARP 2's ledger — WARP 2 cannot run without its ledger)
//   memory  — heap held per cause after the run (what each keeps)
//   answers — after the run: which causes never got their effect, and what caused a given effect
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const S = await import('../siso/index.js');            // SISO (Jonathan Bailey), canonical shape
const W = require('../warp');                           // WARP 1.x and WARP 2 (same package)

const N = Number(process.argv[2] || 20000);
const RUNS = 7;
const dropped = (i) => i % 10 === 0;
const gc = () => { if (global.gc) { global.gc(); global.gc(); } };

function siso() {
  const s = new S.Stream({ log: new S.StreamLog() });
  class Handler extends S.Gate { transform(ev, st) { if (!dropped(ev.data.i)) st.emit(new S.Event('effect', { i: ev.data.i })); } }
  s.register(new Handler('cause'));
  for (let i = 0; i < N; i++) s.emit(new S.Event('cause', { i }));
  return {
    keep: s,
    missing: null,                                  // nothing records a missing event
    causeOfEffect: null,                                  // its log has no parent per event
  };
}

function warp1() {
  const s = new W.Stream({ log: new W.StreamLog() });
  s.register(new W.Gate('cause', { transform: (ev) => (dropped(ev.data.i) ? null : new W.Event('effect', { i: ev.data.i })) }));
  for (let i = 0; i < N; i++) s.emit(new W.Event('cause', { i }));
  return { keep: s, missing: null, causeOfEffect: null };
}

function warp2() {
  const e = new W.Engine();
  e.on('cause', (l, ctx) => { if (!dropped(l.data.i)) ctx.emit('effect', { i: l.data.i }); });
  for (let i = 0; i < N; i++) {
    e.emit('cause', { i }, { root: true, rootReason: 'outside', expect: [{ effect: 'effect', within: 1 }] });
  }
  e.advance(2);
  const gaps = e.residue().gaps;
  const one = e.ledger.links().find(l => l.type === 'effect');
  return {
    keep: e,
    missing: gaps.length,
    causeOfEffect: e.ledger.chain(one.id).map(l => `${l.type}#${l.data.i}`).join(' ← '),
  };
}

function measure(name, fn) {
  const times = [];
  let heap = 0, out = null;
  for (let r = 0; r < RUNS; r++) {
    gc(); const h0 = process.memoryUsage().heapUsed;
    const t0 = process.hrtime.bigint();
    out = fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    gc(); const h1 = process.memoryUsage().heapUsed;
    times.push(ms); heap = h1 - h0;
    out.keep = null;
  }
  times.sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)];
  return { name, ms: med, perSec: Math.round(N / (med / 1000)), bytesPerCause: Math.round(heap / N), missing: out.missing, causeOfEffect: out.causeOfEffect };
}

// warm up, then measure
siso(); warp1(); warp2();
const rows = [measure('SISO', siso), measure('WARP 1.x', warp1), measure('WARP 2', warp2)];
const base = rows[0];
console.log(`\n${N} causes (${N / 10} never got its effect), median of ${RUNS} runs, node ${process.version}${global.gc ? '' : ' (no --expose-gc: memory not measured)'}\n`);
console.log('system     causes/sec   vs SISO   ms/run   bytes held/cause   missing effects found   what caused an effect');
for (const r of rows) {
  console.log(`${r.name.padEnd(10)} ${String(r.perSec).padStart(10)}   ${(r.perSec / base.perSec).toFixed(2).padStart(6)}x  ${r.ms.toFixed(1).padStart(7)}   ${global.gc ? String(r.bytesPerCause).padStart(16) : '               —'}   ${String(r.missing ?? 'cannot tell').padStart(18)}   ${r.causeOfEffect ?? 'cannot tell'}`);
}
console.log('');
