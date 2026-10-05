// scripts/bench-warp2-vs-siso.mjs — SISO vs WARP 1.x vs WARP 2, one workload, measured here.
// James: "can you benchmark it?"  ·  Run: node --expose-gc scripts/bench-warp2-vs-siso.mjs
//
// Workload, identical in all three: N "order.placed" events from outside; a handler turns each into "order.billed".
// One in ten orders is never billed (the handler drops it) — the failure each system should be able to report.
//   speed   — events handled per second (median of 7 runs), logging on in each (SISO's StreamLog, WARP 1.x's
//             StreamLog, WARP 2's ledger — WARP 2 cannot run without its ledger)
//   memory  — heap held per order after the run (what each keeps)
//   answers — after the run: which orders were never billed, and what caused a given bill
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
  class Bill extends S.Gate { transform(ev, st) { if (!dropped(ev.data.i)) st.emit(new S.Event('order.billed', { i: ev.data.i })); } }
  s.register(new Bill('order.placed'));
  for (let i = 0; i < N; i++) s.emit(new S.Event('order.placed', { i }));
  return {
    keep: s,
    neverBilled: null,                                  // nothing records a missing event
    causeOfBill: null,                                  // its log has no parent per event
  };
}

function warp1() {
  const s = new W.Stream({ log: new W.StreamLog() });
  s.register(new W.Gate('order.placed', { transform: (ev) => (dropped(ev.data.i) ? null : new W.Event('order.billed', { i: ev.data.i })) }));
  for (let i = 0; i < N; i++) s.emit(new W.Event('order.placed', { i }));
  return { keep: s, neverBilled: null, causeOfBill: null };
}

function warp2() {
  const e = new W.Engine();
  e.on('order.placed', (l, ctx) => { if (!dropped(l.data.i)) ctx.emit('order.billed', { i: l.data.i }); });
  for (let i = 0; i < N; i++) {
    e.emit('order.placed', { i }, { root: true, rootReason: 'a customer', expect: [{ effect: 'order.billed', within: 1 }] });
  }
  e.advance(2);
  const gaps = e.residue().gaps;
  const bill = e.ledger.links().find(l => l.type === 'order.billed');
  return {
    keep: e,
    neverBilled: gaps.length,
    causeOfBill: e.ledger.chain(bill.id).map(l => `${l.type}#${l.data.i}`).join(' ← '),
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
  return { name, ms: med, perSec: Math.round(N / (med / 1000)), bytesPerOrder: Math.round(heap / N), neverBilled: out.neverBilled, causeOfBill: out.causeOfBill };
}

// warm up, then measure
siso(); warp1(); warp2();
const rows = [measure('SISO', siso), measure('WARP 1.x', warp1), measure('WARP 2', warp2)];
const base = rows[0];
console.log(`\n${N} orders (${N / 10} never billed), median of ${RUNS} runs, node ${process.version}${global.gc ? '' : ' (no --expose-gc: memory not measured)'}\n`);
console.log('system     orders/sec   vs SISO   ms/run   bytes held/order   never-billed found   cause of a bill');
for (const r of rows) {
  console.log(`${r.name.padEnd(10)} ${String(r.perSec).padStart(10)}   ${(r.perSec / base.perSec).toFixed(2).padStart(6)}x  ${r.ms.toFixed(1).padStart(7)}   ${global.gc ? String(r.bytesPerOrder).padStart(16) : '               —'}   ${String(r.neverBilled ?? 'cannot tell').padStart(18)}   ${r.causeOfBill ?? 'cannot tell'}`);
}
console.log('');
