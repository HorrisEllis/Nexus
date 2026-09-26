'use strict';
/**
 * loom/schema/index.js — public surface of Phase 131.
 * comp_id: nexus.loom.schema (entry point)
 *
 * Everything CLI (Phase 132) and API (Phase 133-adjacent, per the stated
 * order CLI-then-API) will call lives behind this one export. Neither
 * layer touches gates.js, axioms.js, or registry.js directly.
 */
const { LoomDriver } = require('./driver');
const definitions = require('./definitions');

module.exports = { LoomDriver, ...definitions };
