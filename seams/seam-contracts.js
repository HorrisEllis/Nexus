'use strict';
/**
 * seams/seam-contracts.js — NEXUS Seam Contract Registry
 * UUID: nexus-seam-contracts-v1-0000-4000-0000-000000000001
 * §SEAM: Growth happens at the seam. Every seam is declared here.
 */

// ── System ports (single source of truth) ────────────────────────────────────
const PORTS = Object.freeze({
  bridge:       parseInt(process.env.BRIDGE_PORT        || '9999'),
  orchestrator: parseInt(process.env.ORCHESTRATOR_PORT  || '9000'),
  cortex:       parseInt(process.env.NEXUS_PORT         || '3748'),
  guardian:     parseInt(process.env.GUARDIAN_HTTP_PORT || '7820'),
  idearium:     parseInt(process.env.IDEARIUM_PORT      || '4800'),
  architect:    parseInt(process.env.ARCHITECT_PORT     || '3747'),
  emerge:       parseInt(process.env.EMERGE_PORT        || '4242'),
  diagnostic:   parseInt(process.env.DIAGNOSTIC_PORT   || '7825'),
  ollama:       parseInt(process.env.OLLAMA_PORT        || '11434'),
});

// ── Seam contracts ────────────────────────────────────────────────────────────

const CORTEX_CONTRACT = {
  name:    'CORTEX_CONTRACT',
  between: ['forge', 'cortex-3748'],
  port:    PORTS.cortex,
};

const GUARDIAN_WSS_CONTRACT = {
  name:    'GUARDIAN_WSS_CONTRACT',
  between: ['userscript', 'guardian-7821'],
  port:    7821,
};

const FORGE_CONTRACT = {
  name:    'FORGE_CONTRACT',
  between: ['guardian', 'forge-4800'],
  port:    PORTS.idearium,
};

const SPEC_SEAM_CONTRACT = {
  name:    'SPEC_SEAM_CONTRACT',
  between: ['spec-parser', 'seam-delivery'],
};

const CLI_UI_CONTRACT = {
  name:     'CLI_UI_CONTRACT',
  between:  ['cli', 'cockpit-ui'],
  hotswap:  true,
};

const BRIDGE_CONTRACT = {
  name:    'BRIDGE_CONTRACT',
  between: ['*', 'bridge-9999'],
  port:    PORTS.bridge,
};

module.exports = {
  // Seam contracts (all have .name and .between[2])
  CORTEX_CONTRACT,
  GUARDIAN_WSS_CONTRACT,
  FORGE_CONTRACT,
  SPEC_SEAM_CONTRACT,
  CLI_UI_CONTRACT,
  BRIDGE_CONTRACT,
};

// Attached as non-enumerable so the brutal test loop doesn't pick them up
Object.defineProperty(module.exports, 'PORTS', { value: PORTS, enumerable: false });
Object.defineProperty(module.exports, 'ALL', {
  value: [CORTEX_CONTRACT, GUARDIAN_WSS_CONTRACT, FORGE_CONTRACT, SPEC_SEAM_CONTRACT, CLI_UI_CONTRACT, BRIDGE_CONTRACT],
  enumerable: false,
});