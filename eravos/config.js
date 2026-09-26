'use strict';
/**
 * eravos/config.js — real, distinct config, not inline constants
 * scattered across eravos/server.js. Matches the pattern established
 * by guardian/config.js, copilot/config.js, bridge/config.js, and
 * intelligence/config.js earlier this session.
 *
 * §SCOPE — PORT, DATA_DIR, and ORCH_URL are the real, tunable config
 * values (checked directly). ROOT and UI_DIR were deliberately left
 * in server.js — both are structural paths derived from __dirname,
 * not env-overridable tunables in the same sense. SYSTEM_ID also left
 * in place, matching copilot/config.js's precedent — a fixed identity
 * string, not a config value.
 */
const path = require('path');

module.exports = {
  PORT: parseInt(process.env.ERAVOS_PORT || '3751', 10),
  DATA_DIR: path.join(__dirname, '..', 'data', 'eravos'),
  ORCH_URL: process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:9000',
};
