# NEXUS Start Guide

## §AXIOM: Orchestrator is source of truth. Start it first.

### Boot order
\`\`\`
node orchestrator.js     # :9000 — starts first, opens CLI terminal
node bridge/nexus-bridge.js  # :9999
node cortex/boot.js      # :3748
node guardian/server.js  # :7820
node idearium/api/index.js   # :4800
\`\`\`

Or: `npm start` (orchestrator only) / `npm run start:all` (all systems)

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
system boot → event bus (SISO) → kernel routing → orchestrator register → bridge handshake
\`\`\`
