'use strict';
/**
 * cortex/config.js — real, distinct config, not inline constants
 * scattered across cortex/boot.js. Matches the pattern established by
 * guardian/config.js, copilot/config.js, bridge/config.js,
 * eravos/config.js, loom/config.js, and intelligence/config.js.
 *
 * §SCOPE — PORT (cortex's own) plus 4 real cross-system URLs cortex
 * calls out to: orchestrator, guardian, ollama, and intelligence
 * (IN_PORT — used to build the real proxy routes to /api/intelligence/*
 * built earlier this session). ROOT is left in boot.js — a structural
 * path derived from __dirname, not a tunable.
 */

module.exports = {
  PORT:    parseInt(process.env.NEXUS_PORT || '3748', 10),
  OR_URL:  process.env.ORCH_URL || 'http://127.0.0.1:9000',
  GD_URL:  process.env.GUARDIAN_URL || 'http://127.0.0.1:7820',
  OL_URL:  process.env.OLLAMA_URL   || 'http://127.0.0.1:3749',
  IN_PORT: parseInt(process.env.INTELLIGENCE_PORT || '3753', 10),
};
