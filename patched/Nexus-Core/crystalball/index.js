// ═══════════════════════════════════════════════════
// NEXUS — CrystalBall Module Entry
// crystalball/index.js
// UUID: nexus-mod-crystalball-0000-4000-0000-000000000001
//
// Wires LatticeBridge + BEPEngine + MCL + MQL into
// the NEXUS kernel bus. This is the plugin boundary.
//
// Nothing in here is a dependency import.
// Everything communicates via kernel.emit() (Law III).
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const { LatticeBridge }              = require('./lattice-bridge');
const { BEPEngine }                  = require('./bep-engine');
const { MemoryCrystallizationLayer } = require('./mcl');
const { MemoryQueryLayer }           = require('./mql');

class CrystalBall {
  constructor({ nexusKernel, jaaDB }) {
    this._nk  = nexusKernel;
    this._jaa = jaaDB;
    this._lb  = null;
    this._bep = null;
    this._mcl = null;
    this._mql = null;
  }

  // ── Boot ──────────────────────────────────────────
  async init() {
    const { _nk: nk, _jaa: jaaDB } = this;

    // 1. Lattice bridge — wildcard, must be first
    this._lb = new LatticeBridge({ nexusKernel: nk, jaaDB });
    this._lb.attach(); // subscribes to '**'

    // 2. BEP engine
    this._bep = new BEPEngine({ jaaDB, nexusKernel: nk });

    // 3. MCL
    this._mcl = new MemoryCrystallizationLayer({
      jaaDB, nexusKernel: nk, latticeBridge: this._lb,
    });

    // 4. MQL
    this._mql = new MemoryQueryLayer({
      jaaDB, nexusKernel: nk,
      latticeBridge: this._lb,
      bepEngine:     this._bep,
      mcl:           this._mcl,
    });

    // 5. Wire MCL to significant events
    nk.on('gate.failed',             e => this._mcl.process(e, { causalDepth: 3 }));
    nk.on('gap.found',               e => this._mcl.process(e, { causalDepth: 2 }));
    nk.on('healer.exhausted',        e => this._mcl.process(e, { causalDepth: 4 }));
    nk.on('healer.resolved',         e => this._mcl.process(e, { causalDepth: 2 }));
    nk.on('agent.response.received', e => this._mcl.process(e));
    nk.on('alignment.scanned',       e => this._mcl.process(e));

    // 6. BEP EMA updates after gate results
    nk.on('gate.passed', e => {
      if (e.payload.bepPatternId)
        this._bep.onGateResult(e.payload.bepPatternId, true,  e.payload.latencyMs ?? 0);
    });
    nk.on('gate.failed', e => {
      if (e.payload.bepPatternId)
        this._bep.onGateResult(e.payload.bepPatternId, false, e.payload.latencyMs ?? 0);
    });

    // 7. MCL sweep trigger
    nk.on('crystalball.mcl.sweep', async () => {
      const promoted = await this._mcl.sweep();
      nk.emit('crystalball.mcl.sweep.done', { promoted });
    });

    // 8. BEP query (from cli or admin)
    nk.on('crystalball.bep.query', async (e) => {
      const result = await this._bep.match(e.payload.intent ?? '', e.payload.inputContract ?? {});
      nk.emit('crystalball.bep.query.result', {
        queryId:   e.id,
        result:    result ?? null,
        found:     !!result,
      });
    });

    // 9. Memory recall (from Ollama context builder or cli)
    nk.on('crystalball.memory.recall', async (e) => {
      const result = await this._mql.query(e.payload.query, e.payload.sessionId);
      nk.emit('crystalball.memory.recall.result', {
        queryId:  e.id,
        sections: result.sections,
        traceId:  result.trace.uuid,
        items:    result.trace.final_included,
      });
    });

    // 10. Feedback reinforcement
    nk.on('feedback.submitted', (e) => {
      const { traceId, score } = e.payload ?? {};
      if (traceId && score != null) this._mcl.reinforceTrace(traceId, score);
    });

    // Signal ready
    nk.emit('crystalball.ready', {
      uuid:        'nexus-mod-crystalball-0000-4000-0000-000000000001',
      latticeStats: this._lb.stats,
      bepCount:    this._bep.patternCount,
      crystalCount: this._mcl.crystalCount,
      mclActive:   true,
    });

    return this;
  }

  // ── Public API (for boot.js exports) ─────────────
  get lb()  { return this._lb; }
  get bep() { return this._bep; }
  get mcl() { return this._mcl; }
  get mql() { return this._mql; }
}

module.exports = { CrystalBall };
