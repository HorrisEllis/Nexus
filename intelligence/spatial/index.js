'use strict';
/**
 * lib/meta/spatial/index.js — Spatial meta-layer modules
 * UUID: nexus-spatial-meta-v1-0000-4000-0000-000000000001
 *
 * sigma   — entropy/slope/trajectory regime classification
 * lattice — resonance-weighted associative memory graph
 */
let _sigma, _lattice;
module.exports = {
  get sigma()   { return _sigma   || (_sigma   = require('./sigma.js')); },
  get lattice() { return _lattice || (_lattice = require('./lattice.js')); },
  MODULE_ID: 'spatial', VERSION: '1.0.0',
};
