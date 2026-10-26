'use strict';
/**
 * lib/gate-walker.js — the walker: advance a step_chain one gate at a time (GWK1, 0.60.258).
 *
 * docs/2026-10-26-gate-walker-programmable-surface-phasemap.spec.
 *
 * James, 2026-10-26, across three messages:
 *   "holy shit this is why the gates. each gate can be a step, like a question, then holds the data, so that way agents can
 *    follow a order like stepwise, use the gates as the surface."
 *   "it cuts down tokens drastically. Makes it more agnostic. Can handle more complex tasks by offloading into the gates."
 *   "Yes and dynamic decomposing/chunking using the tool. Breaking down primitives. Makes it programmable. Each gate can be
 *    a different agent."
 *
 * The gate chain is already a stepwise, linked, data-holding surface (lib/step-gate.js — his 2026-09-29 "gate each step with
 * events"; schema.gate / gate-memory GM1 — a durable record per transition, references NOT copies; the contract DAG). The ONE
 * new thing is the WALKER: the loop that runs the chain step-by-step, hands each step ONLY its budgeted packet (so tokens stay
 * O(1)-ish per step, not O(N) — the offload), routes each step to its own agent, writes the result back as a record (by
 * reference), and lets the chain GROW mid-walk (dynamic decomposition). Everything else it composes.
 *
 * NEUTRAL CORE (NC0, 2026-10-19): it RECEIVES hooks, it does not reach into any system. So it is unit-tested with injected
 * hooks — no backend, no model, no Electron. The real bindings (phase-plan/context-builder for the packet, raid-port/route-
 * eligibility for the route, gate-memory for the record, step-gate for a check) are the integration phases GWK2/GWK3/GWK5.
 *
 * walk(chain, hooks, opts) -> { status, records, gaps, ... }
 *   chain  : { id, steps: [ { id, kind: 'ask'|'act'|'check', depends_on?, needs?, params? } ] } (schema.step_chain)
 *   hooks  : all optional; sensible no-op/echo defaults so a partial wiring still runs and SAYS what it could not do (§1.2)
 *     assemblePacket(step, { records, chain }) -> { refs:[id...], data? }   // ONLY this step's budgeted slice, by reference
 *     routeStep(step, { packet }) -> agent                                 // which agent runs this act step
 *     runStep(step, { packet, agent }) -> { ok, output?, reads?, append? } // reads = ids it actually read; append = new steps
 *     ask(step, { packet, records }) -> { answered, answer? }              // an ask step; answered:false pauses the walk
 *     check(step, { packet, records }) -> { ok, reasons? }                 // a verdict (step-gate, bound in GWK5)
 *     writeRecord(record) -> void                                         // persist the gate record (by reference)
 *     clock() -> ts
 *   opts   : { records?:[...] (resume), maxSteps? (a budget stop) }
 *
 * status: 'done' (every step recorded PASSED/ANSWERED), 'waiting' (an ask step is unanswered — resume with its answer),
 *         'blocked' (a step FAILED/BLOCKED, or the DAG is unrunnable), 'budget' (maxSteps hit). Never throws for a chain's
 *         own content; a structural problem (dangling depends_on, a cycle) is returned as blocked with the reason.
 */

const MODULE_ID = 'nexus.lib.gate-walker';
const VERSION = '1.0.0';

const KINDS = Object.freeze(['ask', 'act', 'check']);
const PASSED = new Set(['PASSED', 'ANSWERED']); // a dependency is satisfied when its record is one of these

function _noop() {}
function _defaults(h = {}) {
  return {
    assemblePacket: h.assemblePacket || ((step) => ({ refs: Array.isArray(step.needs) ? step.needs.slice() : [], data: {} })),
    routeStep:      h.routeStep      || (() => 'unrouted'),     // GWK3 binds raid-port; the default names that it did not route
    runStep:        h.runStep        || ((step) => ({ ok: true, output: null, note: 'no runStep hook — act step passed vacuously' })),
    ask:            h.ask            || (() => ({ answered: false })), // no ask hook → the walk waits (nothing is invented)
    check:          h.check          || (() => ({ ok: true, note: 'no check hook — verdict vacuously true' })),
    writeRecord:    h.writeRecord    || _noop,
    clock:          h.clock          || (() => Date.now()),
  };
}

/** Structural read of the chain: dangling depends_on and cycles, named not hidden (§1.2). Returns { ok, reason? }. */
function _validate(chain) {
  if (!chain || typeof chain !== 'object' || !Array.isArray(chain.steps)) return { ok: false, reason: 'chain must be { id, steps:[...] }' };
  const ids = new Set();
  for (const s of chain.steps) {
    if (!s || !s.id) return { ok: false, reason: 'every step needs an id' };
    if (ids.has(s.id)) return { ok: false, reason: `duplicate step id "${s.id}"` };
    ids.add(s.id);
    if (!KINDS.includes(s.kind)) return { ok: false, reason: `step "${s.id}" has kind "${s.kind}" — one of ${KINDS.join(', ')}` };
  }
  for (const s of chain.steps) {
    for (const d of (s.depends_on || [])) {
      if (!ids.has(d)) return { ok: false, reason: `step "${s.id}" depends_on "${d}", which is not a step in this chain (dangling)` };
    }
  }
  // cycle check — Kahn's algorithm over depends_on
  const indeg = new Map(chain.steps.map(s => [s.id, (s.depends_on || []).length]));
  const byId = new Map(chain.steps.map(s => [s.id, s]));
  const q = [...indeg].filter(([, n]) => n === 0).map(([id]) => id);
  let seen = 0;
  while (q.length) {
    const id = q.shift(); seen++;
    for (const s of chain.steps) if ((s.depends_on || []).includes(id)) { indeg.set(s.id, indeg.get(s.id) - 1); if (indeg.get(s.id) === 0) q.push(s.id); }
  }
  if (seen !== chain.steps.length) return { ok: false, reason: 'the chain has a cycle — no runnable order' };
  void byId;
  return { ok: true };
}

/** The next step whose depends_on are all recorded PASSED/ANSWERED and which is not itself recorded yet; null if none. */
function _nextReady(chain, recByStep) {
  for (const s of chain.steps) {
    if (recByStep.has(s.id)) continue;
    const deps = s.depends_on || [];
    if (deps.every(d => { const r = recByStep.get(d); return r && PASSED.has(r.status); })) return s;
  }
  return null;
}

function walk(chain, hooks = {}, opts = {}) {
  const H = _defaults(hooks);
  const v = _validate(chain);
  // clone steps so append does not mutate the caller's array
  const live = { id: chain.id, steps: (v.ok ? chain.steps.slice() : []) };
  const records = Array.isArray(opts.records) ? opts.records.slice() : [];
  const recByStep = new Map(records.map(r => [r.step, r]));
  const gaps = [];
  if (!v.ok) return { status: 'blocked', reason: v.reason, records, gaps };

  const maxSteps = Number.isFinite(opts.maxSteps) ? opts.maxSteps : Infinity;
  let ran = 0;

  const write = (rec) => { H.writeRecord(rec); records.push(rec); recByStep.set(rec.step, rec); };

  // a step reaching outside its packet is a gap — the token offload is only as real as steps are separable (his DAG rules)
  const checkEscape = (step, packet, reads) => {
    if (!Array.isArray(reads)) return;
    const allowed = new Set([...(packet.refs || []), ...(step.depends_on || [])]);
    const outside = reads.filter(r => !allowed.has(r));
    if (outside.length) gaps.push({ step: step.id, kind: 'packet_escape', reason: `read outside its packet: ${outside.join(', ')}`, outside });
  };

  while (true) {
    if (ran >= maxSteps) return { status: 'budget', records, gaps, ranSteps: ran };
    const step = _nextReady(live, recByStep);
    if (!step) break; // nothing ready

    const packet = H.assemblePacket(step, { records, chain: live }) || { refs: [] };
    const at = H.clock();
    let rec;

    if (step.kind === 'ask') {
      const a = H.ask(step, { packet, records }) || {};
      if (!a.answered) {
        // the walk pauses on an unanswered question — nothing invented; resume when the answer is supplied
        return { status: 'waiting', waitingOn: step.id, question: (step.params && step.params.question) || null, records, gaps, ranSteps: ran };
      }
      rec = { step: step.id, kind: 'ask', status: 'ANSWERED', answer: a.answer, packetRefs: packet.refs || [], by: 'human', at };
    } else if (step.kind === 'act') {
      const agent = H.routeStep(step, { packet });
      const r = H.runStep(step, { packet, agent }) || {};
      checkEscape(step, packet, r.reads);
      if (Array.isArray(r.append) && r.append.length) { // dynamic decomposition — the chain grows
        const grown = { id: live.id, steps: live.steps.concat(r.append) };
        const gv = _validate(grown);
        if (!gv.ok) { gaps.push({ step: step.id, kind: 'bad_append', reason: gv.reason }); }
        else live.steps = grown.steps;
      }
      rec = { step: step.id, kind: 'act', status: r.ok ? 'PASSED' : 'FAILED', agent, output: r.output != null ? r.output : null, reads: r.reads || null, packetRefs: packet.refs || [], at };
    } else { // check
      const c = H.check(step, { packet, records }) || {};
      rec = { step: step.id, kind: 'check', status: c.ok ? 'PASSED' : 'BLOCKED', reasons: c.reasons || null, packetRefs: packet.refs || [], at };
    }

    write(rec);
    ran++;
    if (!PASSED.has(rec.status)) return { status: 'blocked', blockedAt: step.id, reason: rec.reasons ? String(rec.reasons) : `${step.id} did not pass`, records, gaps, ranSteps: ran };
  }

  const pending = live.steps.filter(s => !recByStep.has(s.id));
  if (pending.length) {
    // steps remain but none is ready and none is a waiting ask — their deps did not pass (a blocked upstream), named not hidden
    return { status: 'blocked', reason: `steps not reachable (an upstream step did not pass): ${pending.map(s => s.id).join(', ')}`, records, gaps, ranSteps: ran };
  }
  return { status: 'done', records, gaps, ranSteps: ran };
}

module.exports = { MODULE_ID, VERSION, KINDS, walk, _validate };
