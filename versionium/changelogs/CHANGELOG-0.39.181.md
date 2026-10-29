# v0.39.181 — MCO7f: P1 (fix the declared living maps) + P2 (per-system interaction contracts)

Per `docs/2026-09-11-sovereign-node-architecture-phasemap.spec`'s real
dependency order: P13 (full contract+handshake+queue+diagnose protocol)
needs P1, P2, and P11 done first. This pass does P1 and P2 in full for
James's scoped system list (cortex, guardian, intelligence, ollama,
clear-glass, idearium, loom, versionium). P11 is next, blocked on a real
question below.

## P1 — docs/nexus.spec fixed

- `bridge` — `boots: first` was false since 2026-09-06 retirement, fixed to
  `none`. `provides:` cleared (was 6 capabilities, none real anymore).
  `purpose:` corrected — no longer claims "no system calls another
  directly"; points at MCO7f as the real, in-progress replacement.
  `retiredReason: "wasn't needed"` added, James's own words, verbatim.
- `depends: [bridge, ...]` dropped from cortex/guardian/idearium — resolved
  a question the file's own 2026-09-10 addendum had left explicitly open.
- `boots:` order renumbered (bridge no longer occupies "first").
- CLI's `bridge:` subcommand block and the `bridge.request.*` event-channel
  rows kept present but marked (§A-4 convention), not deleted. The three
  still-real event-channel rows that named `bridge.tags`/`bridge.broadcast`
  as a routing target (`guardian.artifact`, `cortex.gap.resolved`,
  `idearium.idea.created`) had that dead target removed — these are live,
  current events, not historical record.
- Added `intelligence`, `loom`, `versionium`, `clear-glass` — four real,
  running systems this file never listed at all. Port/entry/dependsOn
  sourced from each system's own `compartment.json` (MCO7b, derived not
  authored); purpose from each system's own `spec/<s>.spec`. copilot,
  architect, eravos, diagnostic, and MCO7g's remaining unnamed systems
  deliberately still absent.
- New `## ADDENDUM 2026-09-20` closes both open questions the 2026-09-10
  addendum had left standing.

## P2 — per-system interaction contracts

Real, live drift found doing this — not assumed, checked directly against
each system's actual route-serving code:

- **intelligence** — reconciled. Was missing `alk`/`bda`/`causal`/`gap`/
  `rfr2` entirely, had several stale `/cfr/*` and `/api/intelligence/*`
  entries. Rebuilt from `intelligence/registry-components.js` directly:
  37 routes → 53.
- **idearium** — reconciled using idearium's OWN `contract.live` projection
  logic (§PHASE 3 2026-07-10, already built for exactly this problem, just
  never re-run against the served static file). 78 routes → 115.
  `idearium/schemas/interaction-contract.json` (v2.0.0, resources/views/
  components) is a separate, richer, unserved artifact — deliberately not
  touched, that's the deferred richer-shape work.
- **ollama, versionium, clear-glass** — built new (`interaction-contract.json`
  didn't exist for any of them). Derived directly from each one's own
  `registry-components.js`. **Real architecture finding**: these three
  systems' actual live `/contract` endpoint already serves
  `require('./registry-components')` directly — always fresh, drift-proof
  by construction. These new files are accurate checked-in documentation
  mirrors, not the live source of truth; noted explicitly in each file so
  nobody mistakes them for it.
- **clear-glass port ambiguity, resolved**: `compartment.json` said 7704
  (WIRE_PORT), `registry-components.js` said 7702 (IPC_PORT). Neither is
  what orchestrator's contract-handshake actually polls — confirmed
  directly against `clear-glass/src/main/index.js:1513-1514`: it's
  **SSE_PORT (7701)**. All four real ports now listed with the real one
  identified.
- **loom** — built new, AND fixed a real live bug found verifying it: its
  actual `/contract` route was a hand-typed, 16-route inline list in
  `loom/server.js`, confirmed stale against its own `registry-components.js`
  (25 real routes). Fixed to serve the live module directly, same
  drift-proof pattern ollama/clear-glass/versionium already use, instead of
  patching the stale hardcoded list.
- **guardian, cortex** — already had accurate, previously-reconciled
  contracts (`_reconciled_2026_09_13`). No changes needed.

`guardian/interaction-contract.v2.json` (the richer primitives/commands/sse
shape, sourced from `loom/data/registry.json`'s live component registry +
each system's `.spec` handshake section + `compartment.json`'s
`boundaryFindings` — not from UI, per James's correction) carried forward
from the prior session, still a checkpoint, not activated — that's the
deferred richer-shape work P13 unblocks, not P1/P2.

## Still open

**P11 (unify failure tracking) depends on P8 (per-system component
registry)** — not yet started, not in James's stated P1/P2/P11 list. Real
question before P11 can be called done: is P8 in scope now too, or does
P11 need a narrower, P8-independent version for this pass?
