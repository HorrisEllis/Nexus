'use strict';
/**
 * architect/config.js — real, distinct config, not inline constants
 * scattered across architect/service.js. Matches the pattern
 * established by guardian/config.js, copilot/config.js, cortex/
 * config.js, etc.
 *
 * §SCOPE — PORT, CORTEX_PORT, ORCH_PORT are the real, tunable config
 * values. SPEC_DIMENSIONS/SPEC_QUESTIONS deliberately left in
 * service.js — the real, structural spec-wizard schema, not tunable
 * config in the same sense. ROOT also left in place — structural,
 * derived from __dirname.
 *
 * PORT is deliberately NOT wrapped in parseInt, unlike most other
 * config.js files in this session — preserving the real, original
 * behavior exactly (Node's server.listen() accepts a string port
 * fine) rather than silently changing it while centralizing.
 */

module.exports = {
  PORT: process.env.ARCHITECT_PORT || 3747,
  CORTEX_PORT: process.env.CORTEX_PORT || 3748,
  ORCH_PORT: process.env.ORCH_PORT || 9000,
};
