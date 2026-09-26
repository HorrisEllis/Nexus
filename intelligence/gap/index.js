'use strict';
/**
 * meta/gap/index.js — Gap detection, predicate, and ledger
 * UUID: nexus-meta-gap-v1-0000-2026-0702-jamesbrooks-001
 */
module.exports = {
  get hunter()    { return require('./hunter.js'); },
  get predicate() { return require('./predicate.js'); },
  get ledger()    { return require('./ledger.js'); },
};
