'use strict';
/**
 * meta/index.js — NEXUS Meta Layer v2.0.0
 * UUID: nexus-meta-layer-v2-0000-2026-0702-jamesbrooks-001
 *
 * Sovereign intelligence modules. Every module here is domain-agnostic —
 * it does not know what NEXUS is. It measures, detects, classifies, scores.
 * Any system consumes it over its public API, never as a direct import of
 * another sovereign system.
 *
 * Modules:
 *   cfr          — truth substrate (coherence/friction/resonance/entropy)
 *   rfr2         — causal interaction-space toolkit (measurement, replay, enforcement)
 *   gap          — gap detection (hunter 8-type, predicate/closure, ledger)
 *   topo-kernel  — 8-gate SNR pipeline
 *   telemetry    — slope/stability/oscillation/confidence engines
 *   liminal      — 12 domain-agnostic gap detectors
 *   alk-perception — behavioral state classifier
 *   alk          — decision lattice + causedBy chains + rewind
 *   spatial      — sigma (entropy/regime) + resonance-weighted lattice
 *   bda          — behavioral drift analyzer
 *   causal       — anomaly engine + compounding effects
 *   crystal-lattice — crystallization patterns + lattice edge weights
 *   adversary-suite — attack classification (syntax/logic/edge/state/cross/stress)
 */

let _cfr, _rfr2, _gap, _topo, _tel, _lim, _alk, _alkPerc, _spatial, _bda, _causal, _crystal, _adversary;

module.exports = {
  get cfr()           { return _cfr       || (_cfr       = require('../intelligence/cfr/index.js')); },
  get rfr2()          { return _rfr2      || (_rfr2      = require('../intelligence/rfr2/index.js')); },
  get gap()           { return _gap       || (_gap       = require('../intelligence/gap/index.js')); },
  get topo()          { return _topo      || (_topo      = require('../intelligence/topo-kernel/index.js')); },
  get telemetry()     { return _tel       || (_tel       = require('../intelligence/telemetry-codec/index.js')); },
  get liminal()       { return _lim       || (_lim       = require('../intelligence/liminal/index.js')); },
  get alk()           { return _alk       || (_alk       = require('../intelligence/alk/index.js')); },
  get alkPerception() { return _alkPerc   || (_alkPerc   = require('../intelligence/alk-perception/index.js')); },
  get spatial()       { return _spatial   || (_spatial   = require('../intelligence/spatial/index.js')); },
  get bda()           { return _bda       || (_bda       = require('../intelligence/bda/index.js')); },
  get causal()        { return _causal    || (_causal    = require('../intelligence/causal/index.js')); },
  get crystalLattice(){ return _crystal   || (_crystal   = require('./crystal-lattice.js')); },
  get adversary()     { return _adversary || (_adversary = require('./adversary-suite.js')); },
  VERSION:   '2.0.0',
  MODULE_ID: 'nexus-meta',
};
