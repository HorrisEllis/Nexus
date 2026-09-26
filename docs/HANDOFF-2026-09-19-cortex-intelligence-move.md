# Handoff — 2026-09-19, v0.39.151

Rule from James: **each system is sovereign; if cortex going down breaks something, it gets moved.**
Full map + evidence: `docs/2026-09-19-cortex-to-intelligence-and-versionium-consolidation-phasemap.spec` (section `built_2026_09_19`).

## Done
- **Intelligence routes** (context, intuition, mastermind[/patterns], adversarial, rca, query, lattice, crystals, liminal-space) now served by
  `intelligence/routes.js`; cortex returns 410 tombstones. Field comes from the orchestrator (`intelligence/field-provider.js`); reads are jaaDB-reload-throttled.
- **liminal-space organ** runs inside `intelligence/server.js`; cortex relays the 5 events it originates to `POST /api/intelligence/bus` (allowlisted).
- **RAID**: intelligence registers 16 capabilities with cortex's RAID over HTTP (retry + re-announce). In-process registration is opt-in.
- **CFR field relay removed from cortex**: 8 consumers read the orchestrator directly (`/cfr/field`, now includes `regime`). `tension` was a fabricated constant; now optional.
- **Versionium**: cortex CLI reads `:3754`; `/api/memory?table=versionium_*` is a 410; field reader uses the orchestrator.
- nexus-healer moved to :3755 (was colliding with intelligence :3753). Hooks/contracts/registries/loom map re-homed. Session-final (agent-model/chat-index) merged.
- Verified with real processes (event cortex->intelligence, RAID registration, cortex killed => intelligence still 200). Guards: `test-intelligence-{faculties,organs}-move`, `test-cfr-field-authority`.

## Must do
1. **Reinstall the six guardian userscripts** (v10.2/10.3): old ones get 410s.
2. Run the full suite once on your machine (needs node_modules). Here: 352 files, only flaky `intelligence.test.js`/`queue.test.js` differ from baseline. Pre-existing failures: ICW-006, DHP-001/008, guardian-cfr-consolidation, tablet-ledger-api.

## Open (decisions, in order)
- **"Current sigma"**: autonomous-loop, hot-loader (rollback at sigma>0.70) and MCP `nexus_cfr` read a `sigma` no route exposes, so it is always 0/n/a. Suggest max sigma over last N ledger entries.
- **V7**: two independent sigma-gated auto-commit triggers (versionium/lib/engine.js, orchestrator/lib/versionium-auto-commit.js).
- **`cortex/snapshot`** (D3) still cortex-owned; decide git-vs-versionium rewind engine first.
- `cortex/versionium/` left as unexecuted archive (D6) on purpose.
- Cortex still keeps a private CFR cache for RAID and `/health` output (not served as a relay).
- Intelligence's command logger writes `event_log` from its own process (multi-writer hazard); `relational-field` capability has no handler.
- `guardian-cfr-proxy.test.js` is vacuous (re-implements the handler); IOM-013 is the real coverage.
- Wire the new phasemap into `docs/SPEC-REGISTRY.spec`; `lib/agent-tools/tools/query/ambiguity-pull.js` still says agent_model is not built.

## Full remaining list (checkable, nothing omitted that I know of)

**Behavioural / decisions**
- [ ] Define "current sigma" (suggest max sigma over last N ledger entries) and expose it on the orchestrator ledger; then autonomous-loop, hot-loader (rollback >0.70) and MCP `nexus_cfr` start working. Until then they read 0 / n/a.
- [ ] V7: pick ONE sigma-gated auto-commit trigger (versionium/lib/engine.js vs orchestrator/lib/versionium-auto-commit.js) or a shared cooldown.
- [ ] D3: decide the rewind engine (git in lib/project-container.js vs versionium), then decide whether `cortex/snapshot` (3 in-repo consumers: orchestrator/lib/autonomous-loop.js, orchestrator/lib/request-handler.js, lib/compartment-engine.js) moves.
- [ ] Decide whether `cortex/versionium/` (unexecuted archive, D6) is finally deleted or stays.

**Cortex still owns / does (deliberately, not yet moved)**
- [ ] Cortex keeps a private CFR cache (`_field`, polled from the orchestrator) for its own RAID decisions, and still prints it in `/health` and `/api/friction`. Not a relay any more, but RAID-in-cortex still depends on the orchestrator being up. Moving RAID's field read to a shared client is separate work.
- [ ] RAID itself (router + capability registry) still lives in cortex; intelligence is now a client. If cortex is down at intelligence boot it retries (15s x attempts, max 60s) and re-announces every 5 min.
- [ ] Cortex still relays 5 bus events to intelligence (`RELAY_TO_INTELLIGENCE`); those producers are cortex-side, so liminal-space gets nothing new while cortex is down (it keeps serving persisted state).

**Known bugs / hazards found, not fixed**
- [ ] Intelligence's command logger inserts into `event_log` from its own process while cortex writes the same table (jaa-store multi-writer hazard).
- [ ] `intelligence/index.js` advertises capability `relational-field` at `/api/intelligence/relational-field`; no handler exists.
- [ ] `lib/agent-tools/tools/query/ambiguity-pull.js` still says agent_model is "mapped, not built" (lib/agent-model.js now exists).
- [ ] `guardian-cfr-proxy.test.js` is vacuous; `test-guardian-cfr-consolidation.js`, `test-tablet-ledger-api.js`, ICW-006, DHP-001/008 fail on the pre-migration baseline too. `intelligence.test.js` and `queue.test.js` are flaky.
- [ ] Stale comments still mention cortex hosting intelligence/CFR (lib/nexus-client.js header, guardian/server.js proxy comments, loom/scanners/dangling-report.js).

**Ops / wiring**
- [ ] Reinstall the six guardian userscripts (v10.3.0 claude/hey-claude, v10.2.0 others).
- [ ] Wire the phasemap into `docs/SPEC-REGISTRY.spec`.
- [ ] Verify autopilot starts intelligence (phase 3) and that nexus-healer is not started on 3753; add nexus-healer to autopilot on :3755 only if wanted.
- [ ] Run the full suite with node_modules present (not available in the build sandbox): browser/playwright/jsdom tests were environment failures on both sides.
- [ ] Orchestrator now health-polls `intelligence` (new SYS entry); expect it to show offline if intelligence is not running.
