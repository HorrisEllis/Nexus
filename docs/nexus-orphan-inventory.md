# NEXUS Orphaned-Code Inventory
*Mechanical audit 2026-07-21. Require-graph + `<script src>` scan across 637 backend .js (excl. node_modules/tests/unintegrated). "Orphan" = imported by nothing, not an entrypoint. This is the permanent-until-Phase-2 version of the wiring audit — once the bidirectional registry exists, this becomes a live query instead of a scan.*

## Headline
- **637** backend .js scanned
- **180** imported-by-nothing (raw)
- **69** TRUE backend orphans after excluding browser files, CLI entrypoints, trivial (<15L)
- The 111 difference = browser `<script>`-loaded UI/organism files + CLI tools run directly. Not dormant, just not `require`d.

## FALSE orphans — flagged so they're not chased
- `guardian/userscript-{chatgpt,claude,perplexity,gemini,memory}.js` (~6,000L, all show `[init]`) — **browser-injected into provider tabs**, Guardian drives them over SSE. Confirmed via guardian/server.js. NOT dormant.
- `ui/**`, `eravos/ui/**`, `**/organisms/**`, `**/renderer/**` — browser-loaded by HTML, invisible to a node require-scan.
- `cli/**`, `**/cli.js` — entrypoints run directly (`node cli/x.js`), not imported by design.

## TRUE dormant subsystems — with an init() nobody calls
These are real machinery with a startup that's never invoked. Highest-value targets.
- **`lib/reflection.js`** (517L) — reflection subsystem, unwired. Likely relevant to the intelligence layer.
- **`emerge-codegen-v2.js`** (859L) — code generation, dormant.
- (the userscripts above also show init but are false orphans)

## TRUE orphans that ALREADY IMPLEMENT convergence layers  ⚑ the key finding
The convergence phase map assumed some layers were new construction. They're not — they exist as orphaned code. Each convergence phase should WIRE THESE IN, not rebuild:

| Convergence need | Existing orphaned code | Lines |
|---|---|---|
| **Wire registry** (Phase 3) | `clear-glass/wire/nexus-wire.js`, `scripts/verify-wires.js`, `loom/seed/2026-07-11-session-wires.js` | 229 + 224 + 167 |
| **Seam** (minimal unit) | `emerge/seams/CORTEX_QUERY_SEAM.js` | 188 |
| **Word lattice** (should converge w/ radiate) | `meta/lattice/associative-lattice.js` | 160 |
| **Oscillation/drift** (Phase 5 friction) | `meta/telemetry-codec/runtime.js` | 256 |
| **Contract system** (handshake-ledger) | `contracts/SYSTEM-CONTRACTS.js` | 1100 |
| **Causal expectation** (Phase 6 RFR2/intel) | `bridge/causal/expectation.js` | 303 |
| **cockpit/forge-ide** (Phase 7 viz) | `cockpit/core.js` + pipeline/live | 544 + … |

## Other notable true orphans (exports-only, nothing imports)
- **`cortex/cortex-v2.js`** (1,357L) — an entire alternate cortex implementation. Decide: adopt, cannibalize, or delete (§10.3 — two cortexes is a competing-truth risk).
- **`cos/manager.js`** (413L, sovereign compartment mgr) — the one whose `new JaaDB()` we made real this session; still not wired to boot.
- `emerge-kernel.js` (604), `emerge-ide.js` (328), `emerge/verify.js` (276), `emerge/compiler/{ring-buffer,baseline-tracker}.js` — the emerge subsystem is largely dormant.
- `lib/loop-topology.js` (442), `lib/ess.js` (388), `lib/uid/config-schema.js` — dormant lib/ utilities.
- `service/nexus-diagnostic.js` (2,105L) — flagged orphan but IS spawned by autopilot as a process (entrypoint false-positive; runs, just isn't `require`d).
- `cos/**` gates (vault/plugin/playgrounds), `cos/watchdog/monitor.js`, `cos/foundation/file-browser.js` — COS host largely unwired.
- `idearium/spec-engine/{templates,chunk-dispatch,warp-build-dispatch}.js`, `idearium/repo/watcher.js`, `idearium/lib/db.js` — idearium spec-engine pieces.
- `loom/scanners/closed-door.js` (187) — a scanner loom doesn't run.
- `auth/client.js` (513) — auth client, unwired.

## How this changes the convergence plan
The phase map stands, but several phases shift from BUILD to WIRE-IN-EXISTING:
- Phase 3 (wire registry): start from `nexus-wire.js` + `verify-wires.js`, don't rebuild.
- Phase 5 (oscillation/friction): `meta/telemetry-codec/runtime.js` exists.
- Phase 6 (RFR2/causal): `bridge/causal/expectation.js` exists.
- Phase 7 (cockpit viz): `cockpit/core.js` exists.
- Lattice: `meta/lattice/associative-lattice.js` should merge with the radiate()/user-model lattice built this session — two lattices is the same §10.3 risk as two cortexes.

## Recommended triage order (independent of convergence, quick wins)
1. **Decide cortex-v2.js and the second lattice** — competing-truth risks (§10.3), decide adopt-vs-delete before they cause drift.
2. **Wire lib/reflection.js** if it belongs to intelligence (verify first).
3. Everything else flows through the convergence phases as "wire in existing" per the table above.

*Caveat: a require-graph scan can't see dynamic requires (`require(variable)`), bus-only participants, or HTTP-only services. A module absent here may still be reached at runtime; a module present may still be live via a path the scan can't trace. Treat as a strong signal to verify per-module, not a verdict — the same discipline every "dormant" finding this session got.*
