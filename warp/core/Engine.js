'use strict';
// warp/core/Engine.js — WARP 2's engine. James: "still i want to make warp mine" · "no. i want warp 2"
// EM2 (docs/2026-10-02-emerge-field-memory-build-phasemap.spec).
//
//   emit(type, data, { causedBy } | { root:true, rootReason }) — a link, if it passes:
//     1. WARP's Axioms (1.x Axiom objects work as they are: check(link, null, state))
//     2. the constraints — admit(link) handed in (Emerge's field, through warp/adapters/emerge-field.js), so warp/core
//        stays zero-dependency: { ok } | { ok:false, constraint, reason } | { gap }
//   then it is in the ledger, fulfils any open expectation it answers, and goes to its handlers. A handler's emits
//   are caused by the link it was handed — the parent is recorded at the moment it is known.
//   expect({ cause, effect, within }) — declared before; tick() advances logical time and breaks what is overdue.
//   residue() — open expectations and gaps: what did not happen, with its cause.

const { createLink } = require('./Link');
const { createExpectation, gapOf } = require('./Expectation');
const { Ledger } = require('./Ledger');

class Engine {
  constructor({ axioms = [], admit = null, ids = null } = {}) {
    this.ledger = new Ledger();
    this._axioms = axioms.slice();
    this._admit = admit;
    this._handlers = new Map();
    this._open = [];
    this._gaps = [];
    this._tick = 0;
    this._n = 0;
    this._ids = ids || ((p) => `${p}-${++this._n}`);   // deterministic by default; one run, one ledger
  }

  get tick() { return this._tick; }
  on(type, handler) { const h = this._handlers.get(type) || []; h.push(handler); this._handlers.set(type, h); return this; }

  emit(type, data = {}, { causedBy = null, root = false, rootReason = null, field = {} } = {}) {
    if (causedBy && !this.ledger.link(causedBy)) throw new Error(`[warp/Engine] cause ${causedBy} is not in the ledger`);
    const link = createLink({ id: this._ids('l'), type, data, causedBy, root, rootReason, field, tick: this._tick });
    for (const ax of this._axioms) {
      let ok = false; try { ok = ax.check(link, null, { tick: this._tick }) === true; } catch (_) { ok = false; }
      if (!ok && ax.severity !== 'soft') {
        this.ledger.append('rejected', { link, by: 'axiom', id: ax.id });
        return { ok: false, link, rejected: { axiom: ax.id } };
      }
    }
    if (this._admit) {
      const r = this._admit(link) || { ok: true };
      if (r.gap) { const gap = Object.freeze({ type: 'gap', cause: link.id, missingVariable: r.gap, constraint: r.constraint || null }); this._gaps.push(gap); this.ledger.append('gap', gap); return { ok: false, link, gap }; }
      if (r.ok === false) { this.ledger.append('rejected', { link, by: 'constraint', id: r.constraint, reason: r.reason || null }); return { ok: false, link, rejected: { constraint: r.constraint, reason: r.reason } }; }
    }
    this.ledger.append('link', link);
    // fulfilled when the expected effect has the cause anywhere above it (cause → … → effect): by link id, or by type
    const above = causedBy ? this.ledger.chain(causedBy) : [];
    for (const x of this._open) {
      if (x.status !== 'open' || x.effect !== type) continue;
      const causeMatches = x.causeIsLink ? above.some(l => l.id === x.cause) : above.some(l => l.type === x.cause);
      if (causeMatches) { x.status = 'fulfilled'; x.fulfilledBy = link.id; this.ledger.append('fulfilled', { expectation: x.id, by: link.id }); }
    }
    for (const h of this._handlers.get(type) || []) {
      h(link, { emit: (t, d, o = {}) => this.emit(t, d, { ...o, causedBy: link.id }) });
    }
    return { ok: true, link };
  }

  expect({ cause, effect, within, step = null }) {
    const x = createExpectation({ id: this._ids('x'), cause, effect, within, declaredAt: this._tick, step });
    x.causeIsLink = !!this.ledger.link(cause);   // a link already in the ledger, else a type: "any link of this type"
    this._open.push(x);
    this.ledger.append('expected', { ...x });
    return x;
  }

  advance(n = 1) {
    this._tick += n;
    const broken = [];
    for (const x of this._open) {
      if (x.status === 'open' && this._tick > x.deadline) {
        x.status = 'broken';
        const gap = gapOf(x);
        this._gaps.push(gap); broken.push(gap);
        this.ledger.append('gap', gap);
      }
    }
    return broken;
  }

  residue() { return { open: this._open.filter(x => x.status === 'open').map(x => ({ ...x })), gaps: this._gaps.slice() }; }
}

module.exports = { Engine };
