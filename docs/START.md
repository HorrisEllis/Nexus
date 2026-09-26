# NEXUS Start Guide

## §AXIOM: Orchestrator is source of truth. Start it first.

### Boot order
\`\`\`
node orchestrator.js     # :9000 — starts first, opens CLI terminal
node cortex/boot.js      # :3748
node guardian/server.js  # :7820
node idearium/api/index.js   # :4800
\`\`\`

> **Note, 2026-09-10:** `bridge/nexus-bridge.js` (:9999) was retired
> 2026-09-06 (`contracts/nexus-interaction-contract.js` §RETIRED,
> `_archive/bridge-retired-2026-09-06/`) — no longer a manual boot step.
> Real, current per-system boot order is whatever `autopilot.js` runs;
> the list above reflects known-live systems as of this note but is not
> re-verified against `autopilot.js` itself in this pass — check there
> if in doubt.

Or: `npm start` (orchestrator only) / `npm run start:all` (all systems, via `autopilot.js`)

### Recall (all CLIs)
\`\`\`
nexus> recall              # full ledger from orchestrator
nexus> recall guardian 50  # last 50 guardian events
\`\`\`

### Pipeline (forge → idearium)
1. Create idea: `nexus> idea my idea text`
2. Spec it: `POST /api/ideas/:uuid/spec`
3. Run pipeline: Idearium UI → Pipeline tab → select spec → ▶ Run
   - spec.check → ESS analysis → spec.build → push snapshot → system test

### Connection flow (ESS model)
\`\`\`
system boot → event bus (SISO) → kernel routing → orchestrator register
\`\`\`
(previously ended in a bridge handshake — dropped with bridge's 2026-09-06
retirement; not independently re-verified this pass, see note above)
