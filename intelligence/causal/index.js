'use strict';
/**
 * meta/causal/index.js — Causal engines
 * UUID: nexus-meta-causal-v1-0000-2026-0702-jamesbrooks-001
 */
module.exports = {
  get anomaly()  { return require('./anomaly.js'); },
  get compound() { return require('./compound.js'); },
};
