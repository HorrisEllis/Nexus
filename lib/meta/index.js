'use strict';
/**
 * lib/meta/index.js — NEXUS Meta Layer v1.2.0
 * UUID: nexus-meta-layer-v1-0000-4000-0000-000000000001
 *
 * Six intelligence modules. Lazy-loaded. Nothing required unless used.
 *
 *   topo-kernel  — 8-gate SNR pipeline
 *   telemetry    — SlopeEngine + StabilityEngine + OscillationEngine +
 *                  ConfidencePropagator + ServiceDriftEngine + TelemetryRuntime
 *   liminal      — 12 gap detectors (code/assumption/contrastive/structural/
 *                  shadow/negative_space/relational/oscillatory/existential/
 *                  field/music/reversal)
 *   alk          — ALK composite behavioral state classifier
 *   spatial      — sigma (entropy/regime) + lattice (resonance-weighted graph)
 *   bda          — Behavioral Drift Analyzer: 5-signal extractor, pendulum engine,
 *                  regime classification, gap detector, hash-linked ledger
 */

let _topo, _tel, _lim, _alk, _spatial, _bda;

module.exports = {
  get topo()     { return _topo    || (_topo    = require('./topo-kernel/index.js')); },
  get telemetry(){ return _tel     || (_tel     = require('./telemetry-codec/index.js')); },
  get liminal()  { return _lim     || (_lim     = require('./liminal/index.js')); },
  get alk()      { return _alk     || (_alk     = require('./alk-perception/index.js')); },
  get spatial()  { return _spatial || (_spatial = require('./spatial/index.js')); },
  get bda()      { return _bda     || (_bda     = require('./bda/index.js')); },
  VERSION:   '1.2.0',
  MODULE_ID: 'meta-layer',
};
