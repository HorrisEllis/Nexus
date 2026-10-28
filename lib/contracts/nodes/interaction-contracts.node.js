'use strict';
/**
 * contracts/nodes/interaction-contracts.node.js — extracted from contracts/SYSTEM-CONTRACTS.js
 * Real node id: contracts.interaction-contracts.node
 * §EXTRACTED 2026-09-12 — cli/decompose.js --mode=registry, block INTERACTION_CONTRACTS.
 * Verbatim body — this extraction moves the const, it does not re-derive it,
 * so nothing about the taxonomy itself changed, only where it lives.
 */
module.exports = Object.freeze({

  // Bridge interaction contract
  // §RETIRED 2026-09-06 — bridge interaction contract removed.
  // Seam contracts (from seams/seam-contracts.js)
  SEAM: {
    CORTEX:   { name: 'CORTEX_CONTRACT',      between: ['forge', 'cortex-3748'] },
    GUARDIAN: { name: 'GUARDIAN_WSS_CONTRACT', between: ['userscript', 'guardian-7821'] },
    FORGE:    { name: 'FORGE_CONTRACT',        between: ['guardian', 'forge-4800'] },
    SPEC:     { name: 'SPEC_SEAM_CONTRACT',    between: ['spec-parser', 'seam-delivery'] },
    CLI_UI:   { name: 'CLI_UI_CONTRACT',       between: ['cli', 'cockpit-ui'], hotswap: true },
  },

  // Universal rules every contract must satisfy
  // §FIX 2026-09-13 (MCO1c) — line 12's own §RETIRED 2026-09-06 note said
  // Bridge was removed, but these three rules still named it, undetected
  // until now. Bridge references removed. nexus-connect is left in place —
  // confirmed still real (grep: guardian/lib/ncp-handler.js, guardian/
  // server.js, loom/server.js, hooks/ollama.hooks.js, hooks/copilot.hooks.js)
  // — not assumed retired just because Bridge was. The two Bridge-specific
  // header rules are dropped rather than reworded onto nexus-connect: no
  // X-Bridge-UUID/X-Bridge-Source equivalent for nexus-connect was found in
  // any of those five real files, so inventing one here would be a
  // fabricated rule, not a corrected one (§1.1).
  UNIVERSAL_RULES: [
    'Respond to GET /health within 3000ms',
    'Emit UDP pulse on :7777 every 10s',
    'Register with orchestrator on boot via POST :9000/api/register',
    'Write boot record to event_log on successful start',
    'Never call another system directly — always via nexus-connect (or RAID, per §5.2, for contract-governed work)',
    'Requests must be idempotent — retrying must not cause duplicate state',
    'All errors are loud and specific — §1.2',
    'No stubs in production — §1.3',
  ],
});
