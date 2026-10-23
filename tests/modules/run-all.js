'use strict';
/**
 * tests/modules/run-all.js — Module Test Runner
 * UUID: test-modules-runner-v1-0000-4000-0000-000000000001
 *
 * Runs every per-module fractal adversarial test suite.
 * Each module test lives at tests/modules/<module>.test.js
 *
 * §12.1 Every runtime file has a brutal recursive test suite.
 * §12.2 Tests are verification, not coverage.
 *
 * Run: node tests/modules/run-all.js
 */

const path = require('path');
const fs   = require('fs');

const MODULES_DIR = __dirname;

const SUITES = [
  'test-build-paths.test.js',             // 0.60.67 WB0 — every build path and whether WARP is on it, measured; CK-255
  'test-warp-rung.test.js',               // 0.60.73 WB1/WB2 — WARP around the chosen agent: cache, axiom gate, retain; gate mode never serves
  'test-projects-overview.test.js',       // 0.60.74 COSA10 — every project on one list; no two API routes share a method and path
  'test-contract-trace.test.js',          // 0.60.75 GW3 — a contract traced end to end; holes named, never filled
  'test-context-budget.test.js',          // 0.60.76 GW24 — the dependencies' code ranked and cut to the agent's budget; the cut said
  'test-flight-recorder-standalone.test.js', // 0.60.118 FR4a — the flight recorder on its own, run from a carved copy
  'test-undo-any-change.test.js',         // 0.60.117 FR3 — undo any change, keeping later edits (merge3, route, command, Clear Glass Undo)
  'test-tested-before-lands.test.js',     // 0.60.115 FR2 — tested in its own tree; a staged batch tested together before it lands
  'test-change-record.test.js',           // 0.60.114 FR1 — one record per change an agent makes (join, holes, route, command, Clear Glass panel)
  'test-flight-data.test.js',             // 0.60.144 FR6 — each agent run read whole (his IM1 run: stuck, the shared failure, the waste), route, command, Clear Glass panel
  'test-failure-modes.test.js',          // 0.60.146 FMR2/FMR3 — every failure reaches cortex's one writer by route; the report; the Debug tab in Clear Glass
  'test-repo-carve.test.js',              // 0.60.112 CV1 — a part of Nexus as its own Idearium repo (closure, route, command, Clear Glass UI)
  'test-work-funnel.test.js',             // 0.60.94 FN0 — dependencies, spec, phase, chunks, in his order; each stop planted
  'test-spec-pipeline.test.js',           // 0.60.66 SF1-SF3 — intent blocks, the spec framework, the spec gate + collector (phase-tagged)
  'test-phase-map-auto.test.js',          // 0.60.65 MP1/MP2 — every phase mapped by Nexus (no model): files with evidence, requires, consumers, waits-on, specs; automatic in any repo
  'test-phase-specs-tag.test.js',          // 0.60.63 PT1 — specs tagged per phase; the WARP / spec-framework map's files and deps declared
  'test-lifeline-ollama-dispatch.test.js', // 0.60.62 — an Ollama job goes to the bridge, not Guardian's tab check (officiator / RAID bricks)
  'test-cg-copilot-no-api.test.js',      // 0.39.274 — the Clear Glass pane: copilot, else Ollama / Guardian directly; no API
  'test-code-intel.test.js',             // 0.39.273 — structural chunker v2, chunk cards, search, grep (lib/code-intel)
  'test-code-edit.test.js',              // 0.39.273 — edit engine, inject delete/defer, real-bytes reads (lib/code-edit.js)
  'test-code-tools.test.js',             // 0.39.273 — /api/repos/:uuid/code/* and the eleven agent code tools
  'test-tool-layers-and-pane-memory.test.js', // 0.39.278 — tools as layers (nexus.tools → tools_expand); the co-pilot pane keeps its conversation
  'test-chat-ledger-stream.test.js',     // 0.39.278 — every chat streamed live (mutations, not polling) into the download manager's chat ledger
  'test-cg-field.test.js',               // 0.39.279 — Clear Glass interaction field: numbered x/y/z targets, virtual pointer (native / ErosmancerOS), spotlight
  'test-cos-workspace.test.js',          // 0.39.279 — COS workspaces: code repo as a git worktree branch, VM disk overlay, desktop VM
  'test-settings-console.test.js',       // 0.39.279 — idearium settings console: layered config + every repo's agent/prompt/hat/compartment
  'test-staging-s0-s1.test.js',          // 0.39.279 — staging self-heal S0 (versionium fork points) + S1 (code-edit stage/promote)
  'test-compartment-window.test.js',     // 0.39.280 — BS0: idearium pop-outs as frameless compartment windows in Clear Glass
  'test-build-surface.test.js',          // 0.39.280 — BS2–BS7: file states, deviation, environment, spec → phasemap, build plan, routes
  'test-build-surface-2.test.js',        // 0.39.280 — BS13 a chosen provider is honoured; BS15 deleting a code repo tells its original
  'test-cg-copilot-verbs.test.js',       // 0.39.280 — BS17: "visit X" with no model; loose driver blocks repaired; unreadable reported
  'test-economy.test.js',                // 0.39.281 — EC0–EC5, EC7, EC9: policy, ledger, gate, token limits, router, staging by tier, learned build order, ErosmancerOS input
  'test-economy-guardian.test.js',       // 0.39.281 — EC6: guardian's dispatcher waits / stops / falls back by the economy; every outcome recorded
  'test-guardian-json-routes.test.js',   // 0.39.282 — the real guardian answers provider/login, economy and intake once (was: json undefined, 404 then crash)
  'test-run-all-process-group.test.js',   // 0.39.282 N29 — a suite's whole process group dies with it (orphaned servers caused full-run-only failures)
  'test-step-gate.test.js',   // 0.39.282 N21 — every build step passes a gate (rule nodes); a refusal is blocked, never 'replied'; no empty file is written
  'test-run-state.test.js',   // 0.60.50 CE1–CE5 + CE10 — the run is kept by Nexus: resume, task header, reply-on-task gate, reply tags, lost-job fallback
  'test-code-surface-state.test.js',   // 0.60.80 CE8 — the Code tab's surface kept by Nexus: the CLI reads and sets it, the tab follows (Clear Glass)
  'test-code-tab-expand.test.js',   // 0.60.81 CE7 · CV2 · CV4 · CV3 — line edits checked and proposed, the agent on a picked range, a version per diff, tagged history, run rewind
  'test-code-tab-merge.test.js',   // 0.60.82 CE6 · CE7 · CE9 · CV1 — Files merged into Code, Manage+History one menu, line actions, the bottom panels (Clear Glass)
  'test-canvas-compartments.test.js',   // 0.60.104 CN1–CN4 — his ERAVOS canvas as a COS compartment, each tool nested; COS + workshop templates (Clear Glass, his serve.js and harness)
  'test-reject-learn-retry.test.js',   // 0.60.105 RL1–RL4 — a rejection read for its failure mode, told, learned, then retried; the agent screen stops gutted files and lost exports
  'test-plan-sidebar.test.js',   // 0.60.107 PS1–PS3 — the Plan panel as Progress · Plan · Context cards; context recorded per build; charter, agents, jobs their own panels (Clear Glass)
  'test-tls-layer.test.js',   // 0.60.109 TLS1–TLS3 — cg-tls-helper (Go + uTLS): a Firefox persona's TLS handshake is Firefox's; the real binary end to end; never an orphan; never why a site fails
  'test-run-pipeline.test.js',   // 0.60.50 CE1 + CE10 through the real repo-agent dispatch: a run per goal, a lost tab moves to the next provider, resume
  'test-shadow.test.js',   // 0.39.282 N22 — a step's shadow (what must exist after it); every absence is a gap + a liminal item; manage/plan runs read incomplete
  'test-draft-review.test.js',   // 0.39.282 N23 — each chunk in a fresh chat; an Ollama draft is reviewed by a guardian agent in one plain conversation
  'test-import-history.test.js',   // 0.39.282 N27 — release zips → one dated snapshot commit each on history/snapshots, real .git history into refs/import, provenance in trailers, resumable
  'test-history-import-job.test.js',   // 0.39.283 N30 — the archive drop box: idearium runs cli/import-history.js as a child job; /import-archives and "import my archives" open it (idearium CLI and the Clear Glass pane)
  'test-plan-lands.test.js',   // 0.39.284 W2 — the plan always lands: the agent's map, its reply's, or derived from the spec's sections; CLI repo plan/phases/build
  'test-work-surface.test.js',   // 0.39.284 W3 — the work surface: changed files as diffs (from .inject nodes), the run that made each, the tools given and used
  'test-idearium-theme.test.js',   // 0.39.284 W5 — one look: idearium and the settings console on the main UI's palette (css/nexus-theme.css), config ui.*
  'test-repo-architecture.test.js',   // 0.39.284 W7 — the Architect tab: the repo's component registry + wiring map in loom's shape (components, hooks, wires, consumers, orphans, breaches, data dirs, node types)
  'test-detector-code-endings.test.js', // 0.39.284 — the seam detector accepts a code chunk that ends in } ; ] or a closing fence (the outer wall-clock cap root cause)
  'test-eros-telemetry-bounded.test.js', // 0.39.285 — ErosmancerOS telemetry: each event written once, debug not persisted, rotates at a cap (data/erosmancer/telemetry.jsonl reached 8.6 GB)
  'test-file-versions-and-reassign.test.js', // 0.39.285 — from the nexus-14 fork: per-file version history (Files tab) and a FAILED chunk reassignable to another agent
  'test-pipeline-routing.test.js', // 0.39.286 RG — routing and fallback: modes, chains, failure classes, breaker, the route walked and kept on the chunk, /api/routing, the settings page
  'test-genesis-and-architecture-spec.test.js', // 0.39.286 GN1/AR1 — genesis 1.1.0 (registry doorway, routing) the default system template; the architecture spec cut to what exists
  'test-genesis-sandboxed.test.js', // DB19 (parked) — a fork of genesis: sealed sandbox, the registry the drawbridge, three tunnels (compartment, bridge, contract)
  'test-evidence-close.test.js', // 0.60.224 SL2 — an open phase closes by evidence, its own (or file-specific) tests passing; dry run first; EC-05 in Clear Glass
  'test-phase-close.test.js', // 0.60.223 SL1 — a proven, landed phase closes itself; undoing its change reopens it (lib/phase-close.js); PC-06 in Clear Glass
  'test-build-queue.test.js', // 0.60.222 SL0 — what can be built now, and why every other open phase cannot (lib/build-queue.js); BQ-05 in Clear Glass
  'test-roadmap-import.test.js', // 0.60.199 SD17 — a project's own roadmap (phases.json / PHASEMAP.md) imported as a phasemap, so it continues; RI-05 in Clear Glass
  'test-mastermind-ready.test.js', // 0.60.200 SD18 — what Idearium needed to work on MASTERMIND: wrapper folder, primary roadmap, the project's own test runner, integrity notes that fit
  'test-any-project-tests.test.js', // 0.60.201 — "do the tests pass" for any project: npm, its own runner, Gradle, Maven, pytest, Cargo, Go, make; a missing tool said
  'test-refusal-sendback.test.js', // 0.60.202 SD19 — a refused agent proposal goes back to its agent with the failing test; one toast ×N, not N; RS-03 in Clear Glass
  'test-starved-machine.test.js', // 0.60.203 SD20 — pinned Ollama falls back to the agents; an off-phase file is held; the officiator stops repeating a failing goal
  'test-log-fixes.test.js', // 0.60.205 SD21 — his run log: probe fits, build job off a sign-in wall, labelled absent line, proof history off the store, one-file phase answers "which file?", sync pauses
  'test-lift-root.test.js', // 0.60.206 SD22 — a project imported inside its own folder lifted to the root (root copies archived)
  'test-data-home.test.js', // 0.60.207 DL2 — one resolver for each system's data; each brings its own home at boot (manifest, rollback); route, commands, the Data screen in Clear Glass
  'test-guardian-own-data.test.js', // 0.60.208 SS1 + DL3 guardian — its own store, cortex's tables through cortex's routes, its paths through data-home
  'test-data-rewired.test.js', // 0.60.209 DL3 — every rewired system: no code names its old path, Diagnostic's table points home, shared writers resolve it
  'test-cos-mount-idempotent.test.js',   // 0.39.282 N28 — one COS host per process; an identical remount is a no-op (idearium OFFLINE every 10 min: 34 s → 2 ms)
  'test-eros-workbench.test.js',         // 0.39.281 — EC10: Settings → ErosmancerOS workbench (tabs, nodes, console, replay)
  'clear-glass-agent-surface.test.js',   // 0.39.272
  'test-opportunity.test.js',            // 0.39.272
  'jaa-db.test.js',
  'test-p1-fanin-live.js',
  'test-p2-snapshot-sigma.js',
  'test-p3-diagnostic-causal.js',
  'test-p4-capabilities.js',
  'test-p4-awareness.js',
  'test-p5-grammar-router.js',
  'test-p5p6-self-model.js',
  'test-p1-agent-contracts.js',
  'test-raid-agent-nodes.js',
  'test-codeblock-artifact-capture.js',
  'test-p2-injection.js',
  'test-agnostic-lib-tools.js',
  'test-ap1-agent-pull.js',
  'test-integrity-revert.js',
  'test-loom-phasemap.js',
  'test-autopilot-intelligence.js',
  'test-cli-interface.js',
  'test-scheduler.js',
  'manifest.test.js',
  'lenses.test.js',
  'tool-forge.test.js',
  'idea-provenance.test.js',
  'read-time-expiry.test.js',
  'relevance.test.js',
  'movement.test.js',
  'ledger-tail.test.js',
  'test-activity-log.js',
  'test-ledger-fanin.js',
  'test-gemini-toolbox.js',
  'jaa-store-multiprocess.test.js',
  'test-jaa-flush-lock.js',
  'test-nex-system-state.test.js',
  'test-guardian-state-provider.test.js',
  'spec-container.test.js',
  'test-repo-agent.js',       // §0.39.190 — the 0.39.188 note said these were registered; they were not
  'test-repo-agent-node.js',
  'test-repo-agent-learn.js',
  'test-repo-inject.js',
  'test-guardian-job-correlation.js',
  'test-guardian-job-persistence.js',
  'test-system-record-discipline.js',
  'test-guardian-stream-extraction.test.js',
  'test-chat-sync-agent-routing.test.js',
  'test-command-parse-null-guard.test.js',
  'test-lifeline-guardian-timeout.test.js',
  'test-file-tree-plan.js',
  'test-repo-run.js',
  'test-repo-agent-provider.js',
  'test-cos-testenv.js',
  'test-cos-testenv-any-repo.js',
  'test-cg-eros-supervisor.js',
  'test-guardian-retry-novelty-installs.js', // 0.39.265 — guardian retry + answer-first + join, semantic rewording with novelty, Eros human typing, Run-menu installs
  'test-nexus-atlas-refs.test.js',  // §0.39.264 — every reference in the written-out atlases resolves against the real tree     // §0.39.264 — ErosmancerOS starts, connects and stops with Clear Glass (real tsx + Chromium where available)   // §0.39.264 — the VM for any repo: tar disk, detect, provision, setup job, real QEMU boot where available
  'test-repo-chunks-tool.js',
  'test-repo-context.js',
  'test-runtime-proof.js',
  'queue.test.js',
  'baseline.test.js',
  'intelligence.test.js',
  'ollama-runtime.test.js',
  'flush-redundancy.test.js',
  'admin-server-routes.test.js',
  'orchestrator-cli.test.js',
  'test-c0-cfr-collapse-anchor.test.js',
  'test-c1-compound-failure-mode.test.js',
  'interaction-contract.test.js',
  'uid.test.js',
  'alk.test.js',
  'healer.test.js',
  'constitutional-ai.test.js',
  'reflection.test.js',
  'user-model.test.js',
  'snapshot-integrity.test.js',
  'test-snapshot-half-life-prune.js',
  'compartment-engine.test.js',
  'adversary-suite.test.js',
  'crystal-lattice.test.js',
  'case-library.test.js',
  'contract-intake-dependency-graph.test.js',
  'test-raid-processnext-am1-gate.js',
  'raid-retry-escalation.test.js',
  'brainos-panel.test.js',
  'brainos-canvas.test.js',
  'brainos-panel-canvas-integration.test.js',
  'ollama-command-index.test.js',
  'guardian-command-index.test.js',
  // §RETIRED 2026-09-06 — bridge-command-index.test.js archived with bridge.
  'test-raid-officiator.js',
  'test-vector-memory-pipeline.js',
  'test-nexus-intelligence-section.js',
  'test-cookie-vault-ipc-roundtrip.js',
  'test-userscript-protocol-parity.js',
  'test-guardian-agent-registry.js',
  'test-system-check-emerge-stale-entry.js',
  'test-wake-relay-real-endpoint.js',
  'test-warp-cascade-provider-fallback.js',
  'test-tool-naming-convention.js',
  'test-gap-tools.js',
  'test-vsb1-versionium-split-brain-fix.js',
  'test-brainos-real-access-path.js',
  'test-brainos-dynamic-mesh-canvas.js',
  'test-agent-mesh-view-endpoint.js',
  'test-guardian-data-sovereignty.js',
  'test-copilot-tools-guardian-ncp-mesh.js',
  'test-brainos-canvas-agent-mesh.js',
  'test-network-infra-retired.js',
  'test-brainos-v2-rebuild.js',
  'test-gm-shim-sse-streaming.js',
  'test-system-registry.js',
  'test-architect-pulse-migration.js',
  'test-emerge-direct-compile.js',
  'idearium-auto-repo-creation.test.js',
  'idearium-materialize-physical.test.js',
  'idearium-build-queue-poller.test.js',
  'idearium-ingest-stability.test.js',
  'idearium-guardian-dispatch.test.js',
  'idearium-brainstorm-assist.test.js',
  'test-phasemap-diagnosis-facts.test.js',
  'architect-spec-builder-theme.test.js',
  'idearium-chunk-dependencies.test.js',
  'test-agent-mesh-guardian-coverage.js',
  'ncp-hostile-payload.test.js',
  'agent-mesh-hostile.test.js',
  'agent-mesh-drainer.test.js',
  'test-dispatcher-deepseek-ncp.js',
  'route-graph.test.js',
  'automation-engine.test.js',
  'automation-v2.test.js',                // §0.39.265 — workflows v2: DOM steps, data, loops, triggers, runs, tools
  'automation-settings-ui.test.js',       // §0.39.265 — Settings → Automation against a real engine
  'automation-nodes.test.js',             // §0.39.266 — .workflow / .macro node files: export, bundle, import, library
  'brainos-app-hostile.test.js',
  'guardian-hostile-file-read.test.js',
  'guardian-hostile-body-dos.test.js',
  'copilot-provider-toggle.test.js',
  'clear-glass-hostile-html.test.js',
  'clear-glass-autofill.test.js',
  'clear-glass-gig.test.js',          // 0.39.301 the Fiverr gig writer
  'test-proof-run.test.js',           // 0.39.302 PR1 the delivery checker
  'test-phase-proof.test.js',         // 0.39.303 PH1 phase runs end in proof
  'test-build-from-the-spec.test.js', // 0.39.305 SB1–SB3 templates frame every spec, his words seed it, the prompt is domain agnostic
  'test-registry-drives-build.test.js', // 0.39.309 SB12 the registry block is the component list, the dependency order and the file checklist
  'test-system-template.test.js',    // 0.39.312 SB17 the system template in his structure: identity → context → file_structure → modules → components
  'test-event-contracts.test.js',     // EV0 (3) every emitted event declared; the drift baseline only shrinks
  'test-claude-code-backend.test.js', // IN2a Claude Code as an Idearium agent backend (a stand-in claude)
  'test-nexus-mcp.test.js',           // IN1 Nexus as Claude Code's toolbox (.mcp.json, honest degradation)
  'test-synthesis-declared-value.test.js', // EV0 (5) synthesis reads a phase's declared value: and cost
  'test-agent-facts.test.js',         // GA1 Guardian states the Clear Glass agents; Clear Glass caches them, stamped
  'clear-glass-library-ui.test.js',
  'clear-glass-screen-qa.test.js',
  'clear-glass-screen-qa-ui.test.js',
  'version-sync-and-registry.test.js',
  'test-cg-job-intake.test.js',           // §0.39.227 — guardian claim + Clear Glass job intake
  'test-cg-settings-ui-files.test.js',    // §0.39.227 — one JS + one CSS file per Settings area
  'test-home-ui-files.test.js',           // §0.39.228 — one JS + one CSS file per home UI area (ui/home/index.html)
  'test-provider-host-one-tab.test.js',   // §0.39.237 — real ProviderHost: agent tabs restart as themselves; intentional closes open nothing
  'test-guardian-replay-retired.test.js', // §0.39.237 — a replay never completes a job; no userscript sends one
  'test-downloads-responses.test.js',     // §0.39.239 — replies and downloads filed under their agent; Library Responses routes
  'test-agent-feed.test.js',              // §0.39.244 — repo jobs reach their own tab; the Agent tab's live DOM feed
  'test-cookie-vault-jaa.test.js',        // §0.39.243 — cookie vault on JAA; file-store records imported, deletes stick
  'test-artifact-index-jaa.test.js',      // §0.39.242 — the Responses index is JAA, self-healing against responses/
  'test-repo-agent-late.test.js',         // §0.39.241 — the Agent tab picks up a late reply from the Responses index, once
  'test-cg-accounts-portal-settings.test.js', // §0.39.223 — Clear Glass account authority, login portals, sealed vault keys, settings rebuild
  'test-cg-listener-decay.test.js',          // §0.39.265 — page listeners fade: switched off when idle, deleted later; Keep exempts
  'test-cg-bookmark-account-state.test.js',  // §0.39.265 — ★ dialog: account check mark + rewind page state; account windows
  'test-cg-shortcuts.test.js',               // §0.39.265 — keyboard shortcuts everywhere, macros and workflows on a key
  'test-cg-autofill-jobs.test.js',           // §0.39.265 — job-application + Upwork/Fiverr autofill, label matching, proposal drafts
  'test-provider-host-respawn.js',
  'test-userscript-mixed-content-fix.js',
  'test-contract-handshake-paths.js',
  'autonomous-loop.test.js',
  // FIX (James, 2026-06-19): these six suites existed, passed standalone,
  // and were never registered here — `node tests/modules/run-all.js` was
  // silently skipping all of them. Found while wiring tests for this pass,
  // not something I broke.
  'test-component-registry.js',
  'test-grammar-engine.js',
  'test-grammar-fallback.js',
  'test-mutation-contract.js',
  'test-versionium-migration.js',
  'test-ack-injection-fix.js',
  'test-am1-intent-contract.js',
  'test-versionium-sovereign.js',
  'test-intelligence-bridge.js',
  'test-liminal-space.js',
  'test-fault-taxonomy.js',
  'test-escalation.js',
  'test-self-heal.js',
  'test-self-heal-context.js',
  'mco4-stage-transitions.test.js',
  'mco6-reconcile-on-boot.test.js',
  'mco10-compartment-dom-ledger.test.js',
  'mco11-contract-repo-provision.test.js',
  'mco15-component-boundary-check.test.js',
  'mco15-component-exec-test.test.js',
  'mco19-clearglass-dispatch.test.js',
  'test-gap-finder.js',
  'test-raid-decision-record.js',
  'test-raid-constitution-gate.js',
  'test-raid-isolation-verify.js',
  'test-raid-drift-score.js',
  'test-raid-compare-gate.js',
  'test-raid-rewind.js',
  'test-raid-verify-fused.js',
  'test-schema-registry.js',
  'test-schema-observe-write.js',
  'test-user-model-schema.js',
  'test-user-model-everywhere.js',
  'test-user-model-capture.js',
  'test-user-model-editable.js',
  'test-copilot-tool-runtime.js',
  'test-injection-node-type.js',
  'test-table-materializer.js',
  'test-guardian-tool-runtime.js',
  'test-faculty-tools.js',
  'test-call-system.js',
  'test-ui-tools.js',
  'test-relevance-classify.js',
  'test-assist-loop.js',
  'test-repair-on-prompt.js',
  'test-copilot-window.js',
  'test-cli-consolidation.js',
  'test-decompose.js',
  'test-lifeline-ask.js',
  'test-system-status.js',
  'test-tool-guide.js',
  'test-capability-extend.js',
  'test-agent-routing.js',
  'test-account-registry.js',
  'test-diagnostics.js',
  'test-diagnostic-sweep.js',
  'test-movement-map.js',
  'test-tablet-homepage.js',
  'test-intelligence-layer.js',
  'test-map3d.js',
  'test-observability-map.js',
  'test-relational-field.js',
  'test-shared-stream.js',
  'test-self-register.js',
  'test-registration-shape.js',
  'test-causal-hygiene.js',
  'test-adversarial-causal-wire.js',
  'test-orion.js',
  'test-raid-orion-wiring.js',
  'test-user-model-radiate.js',
  'test-boot-phases.js',
  'test-sigma-compaction.js',
  'test-hook-ownership.js',
  'test-jaa-selective-load.js',
  'test-rfr2-cjs.js',
  'test-clear-glass-idle-vs-open.js',
  'test-clear-glass-single-instance.js',
  'test-idearium-cjs-under-esm.js',
  'test-cortex-heartbeat.js',
  'test-tablet-ledger-api.js',
  'test-tablet-container-api.js',
  'test-config-governance.js',
  'test-bus-subscriptions.js',
  'test-tablet-graph-api.js',
  'test-autopilot-boot-gates.js',
  'test-diagnostic-heal-path.js',
  'test-contract-queue-hardening.js',
  'test-intelligence-core-wired.js',
  'test-alk-lattice-live.js',
  'test-ledger-schema.js',
  'test-health-authority.js',
  '../../diagnostic/tests/test-pulse-watch.test.js',   // 0.60.138: diagnostic's own test, with its system (D6)
  'test-setup-job-settles.test.js',
  'test-spec-document.test.js',   // 0.49.0 RS3 — a .spec / .eg as blocks with ids, byte-identical
  'test-thread.test.js',
  'test-hardening-pass.test.js',   // 0.52.0 HP2–HP4 — interrupted runs, the ladder climbs only what is installed, signals weighted
  'test-guardian-stack-sim.test.js',   // 0.55.2 HP13–HP22 — the stack run end to end: right gate, pickup, never resend, cancel, no tab, economy, tab order
  'test-idearium-solid.test.js',   // 0.56.0 SD0 versionium dropped → retried and said · SD2 copilot never ok with nothing · SD3 the person goes first
  'test-options.test.js',   // 0.57.0 OP0–OP3 — one options shape for every system (lib/options.js), guardian first, its routes, the console's System tab
  'test-idearium-access.test.js',   // 0.58.0 IA0–IA4 — app passwords scoped per repo/hat, the gate, /api/access/*, the command, Clear Glass sign-in
  'test-field-nerve.test.js',   // 0.59.0 FN1–FN3 — the interaction field as commands; Clear Glass's attention record; Nexus Nerve reads it
  'test-provider-lists.test.js',   // 0.59.1 — every hard-coded list of browser agents names them all (deepseek was absent)
  'test-workshop-nexus-specs.test.js',   // 0.59.2 — Nexus's own specs, by system, as a start in the spec workshop (saved: a new repo)
  'test-idea-dump.test.js',   // 0.59.3 — idearium dump: a raw idea dump into the Void, verbatim, many at once
  'test-listener-commands.test.js',   // 0.59.4 — a Guardian listener runs the Nexus commands it hears (nexus> …), once each, the person's rows refused
  'test-nexus-chat.test.js',   // 0.59.5 — open a chat in Clear Glass: its nexus> lines run (read-only), the answer typed back
  'test-nexus-ask.test.js',   // 0.59.11 — talk to Nexus in plain words: the rows' ASK words run the command, no model; the row's printer as plain text
  'test-nexus-read.test.js',   // 0.59.12 — the agent's own nexus> tools: glass open, log, file, grep — secrets refused, keys redacted
  'test-readme-atlas.test.js',   // 0.59.12 — README.md is the NEXUS atlas
  'test-copilot-claude-code.test.js',   // 0.59.14 — Claude Code as the co-pilot: reads all of Nexus, writes nothing itself, one session per conversation
  'test-plan-code-run-attention.test.js',   // 0.60.0 — plan then code (Ollama codes the planned files), the planner grounded and the system checked, learning from the agents; repo play/pause/rewind; Plan clear; Guardian sign-in / map attention + Clear Glass panel and picker
  // 0.60.1 — the nexus-system template's handoff and modules are checked by test-system-skeleton (SK-02 runs the laid-out system's own self-test)
  'test-accounts-picker-cos.test.js',
  'test-project-decompose.test.js',   // 0.60.5 — a project (zip or folder) decomposed into the component store, each component bundled with its require closure; the drop zone; Clear Glass in the COS window style   // 0.60.2 — account routing by hat / intent / repo (Guardian, JAA) + Clear Glass's account switch on the JAA cookie vault; the COS-window attention panel; the pick checked by Clear Glass's selector check, anchored at x/y/z and used by every userscript (field map); ChatGPT works signed out; sign-in responses untouched
  'test-contract-gates.test.js',   // 0.60.15 — .contract v2: his four acceptance conditions (legacy files, evidence, invalidation, packet)
  'test-recursive-split.test.js', // 0.60.40 BR2 — splitting recursively to a depth bound; CK-247 runs
  'test-releases.test.js', // 0.60.41 RN1 — releases in Versionium: tags, Nexus's backfill, a repo's releases
  'test-gate-tracking.test.js', // 0.60.42 GT2 — each gate tags and reports its progress
  'test-qa2-real-run.test.js', // 0.60.43 QA2 — one phase build end to end with the real Versionium
  'test-gate-assess.test.js', // 0.60.44 GA1 — the gate assesses dependencies and context before it spends
  'test-cg-attention-focus.test.js', // 0.60.45 — the provider tab stops fighting the person (focus, sign-in, Escape)
  'test-net-routes.test.js',          // 0.60.60 — net routes + Snowflake transport (CLI first): policy, fail-closed PAC, fake tor, agent read-only
  'test-snowflake.test.js',           // 0.60.178 — SF1–SF6: Snowflake end to end (detect, bridge lines, compartment, HTTPS-only, circuit check)
  'test-compartment-downloads.test.js',   // 0.60.179 — CD1–CD5: magnets caught, downloads quarantined, verified qBittorrent hand-off, kill on disconnect
  'test-browser-shell.test.js',          // 0.60.179 — BS1–BS7: Firefox import, the window like Firefox, plugin icons, the floating CLI (in Clear Glass)
  'test-adblock.test.js',                // 0.60.183 AB1–AB4 — a full content blocker: real lists, exceptions, options, element hiding, per-site allow, its page
  'test-passwords.test.js',              // 0.60.186 PW1–PW4 — websites use the password manager; a login belongs to the account the cookie vault keeps
  'test-site-profile.test.js',           // 0.60.215 SP1 — one site's settings for every feature: keys, the resolver, the route as a netPolicy rule
  'test-site-readers.test.js',           // 0.60.216 SP2 — each feature reads its site value: driver, passwords, autofill, resume, Guardian, workflows, macros, Co-pilot
  'test-site-settings-ui.test.js',       // 0.60.217 SP3 — the Site Settings popup and Settings › Sites by feature (in Clear Glass, the real resolver)
  'test-global-settings.test.js',        // 0.60.218 SP4 — ClearDriver, Agent Mesh and Guardian settings (GS-05 in Clear Glass)
  'test-processes.test.js',              // 0.60.219 SP5 — processes with their pages, end (his only), the activity ring, the doors
  'test-processes-ui.test.js',           // 0.60.220 SP6 — the Processes window in Clear Glass (Shift+Esc, ☰, Tools)
  'test-live-recording.test.js',      // 0.60.57 — a recording is a .macro node file from the first second; scroll/paging keys; survives navigation
  'test-chatgpt-scrape-template.test.js', // 0.60.69 — the ChatGPT chat reader template (loop body, vars, extract fields)
  'test-cos-app-ui.test.js',          // 0.60.89 COSA6 — COS window (jsdom) and controller
  'test-release-deliver.test.js',     // 0.60.93 COSA7 — Clear Glass delivers a release to COS's inbox
  'test-autopilot-idle.test.js',      // 0.60.92 the autopilot's GET /idle
  'test-cos-app-shell.test.js',       // 0.60.91 CON-lite — the COS command line (npm run start:all, nexus ...) without PowerShell
  'test-cos-app-update.test.js',      // 0.60.90 COSA12/13 — settings and the update policy
  'test-cos-app-build.test.js',       // 0.60.89 COSA6 — staging for the Windows build
  'test-cos-app-runtime.test.js',     // 0.60.88 COSA2/3 — start/stop/health of an installed version
  'test-cos-app-switch.test.js',      // 0.60.88 COSA4 — switch, snapshot, rollback
  'test-cos-app-store.test.js',       // 0.60.87 COSA1 — COS version store and zip import
  'test-clearglass-jobs.test.js',     // 0.60.86 — five ready-made jobs run on the real engine, network stubbed
  'test-chat-ports.test.js',          // 0.60.85 PI5b — the crawler's ports on the real automation engine, fake chat site in jsdom
  'test-chat-crawler.test.js',        // 0.60.84 PI5 — the crawler driving the plan through fake ports
  'test-vector-memory-embed-check.test.js', // 0.60.97 — the embed check, fixed for good
  'test-inject-screen.test.js',       // 0.60.98 — every proposal passes one screen at the door
  'test-repo-procedures.test.js',     // 0.60.118 DK1 — replayable procedures, .procedure files
  'test-expectation-tests.test.js',   // 0.60.119 TF1 — a file's expectation from the plan, before the code
  'test-system-boundary.test.js',   // 0.60.126 DB1 — every require() across a system boundary, and the ratchet that only shrinks
  'test-drawbridge-registry.test.js',   // 0.60.127 DB9/DB10 — a system's registry as its dependency graph, and its negative space
  'test-system-tunnel.test.js',   // 0.60.128 DB13/DB14 — his lib/system-registry.js as the tunnel: routes, commands, toasts, heartbeat over routes
  'test-system-node-relations.test.js',   // 0.60.129 DB18 — a system's nodes in relation to it: meta.system, .wire per dependency
  'test-node-registry-system.test.js',   // 0.60.130 P33a — any system's node registry: its own database, all the history, the listener
  'test-sovereign-systems.test.js',   // 0.60.133 IM1/IM5/IM6 — a system made sovereign: its own store, another reached through its route; the census
  'test-cos-compartment-template.test.js',   // 0.60.134 — the template for each system's COS compartment, held by loom
  'test-cos-app-self-update.test.js',   // 0.60.137 COS 0.1.2 — COS says when a newer COS is out
  'test-system-shape.test.js',   // 0.60.138 — does each system match genesis, role by role
  '../../diagnostic/tests/shape.test.js',   // 0.60.138 — diagnostic is a genesis system (its own test, D6)
  '../../diagnostic/tests/causality.test.js',   // 0.60.146 FMR0 — how much of each ledger names its cause (diagnostic's own test, D6)
  'test-code-dock.test.js',           // 0.60.118 DK2 — the dock: separate panels on the right edge (Clear Glass)
  'test-plan-pieces.test.js',         // 0.60.123 PP1–PP4 — the Plan's bar is its pieces; every run with its log; a piece/run points the dock (Clear Glass)
  'test-prevention.test.js',          // 0.60.123 MP — a memory crisis recorded becomes a prevention: heavy work waits for headroom; Ollama unloads when idle
  'test-sync-off-thread.test.js',     // 0.60.124 SW1–SW3 — the self-sync's pipeline in its own thread; Guardian holds jobs behind a sign-in wall; COS map EPERM
  'test-phase-deps-gate.test.js',     // 0.60.125 DG1 — a phase build is refused while its depends_on are open (his decisions by their question); --anyway is the override
  'test-phase-graph.test.js',             // 0.60.147 DG2 — a phase has a dependency graph before it executes (gate, route, command, Phases tab in Clear Glass)
  'test-test-first.test.js',          // 0.60.141 TF2 — the phase's test is written first (by the planner, never the coder), seen failing, then shapes the plan and proves it
  'test-live-everywhere.test.js',     // 0.60.142 LV1/LV4 — thinking streams before the reply (5 userscripts, guardian); picked selectors kept stable
  'test-work-journal.test.js',        // 0.60.143 TL1b — the agent's reply and thinking on disk as they stream; back after a reload or restart
  'test-gate-context.test.js',        // 0.60.145 TL2a — a gate's context from what was kept; its finished or in-flight reply reused, once
  'test-context-stream.test.js',      // 0.60.156 GM5 — context as a SISO stream: every source at once, the residue named, the model asked only the residue
  'test-node-lattice.test.js',        // 0.60.157 GM4 — every data node, one lattice: causal, wire, reference, temporal (when it happened)
  'test-checks-layer-one.test.js',    // 0.60.157 QA1 — CK-231, CK-237, CK-239, CK-252 run; each red on a planted defect
  'test-gates-solid.test.js',         // 0.60.158 — six holes in contract-gates, each proven then closed (three false completes)
  'test-cg-network-ui.test.js',       // 0.60.160 — Settings → Network: the Tor·Snowflake transport UI, driven in Clear Glass over the real net service
  'test-cg-gig-autofill.test.js',     // 0.60.161 GA1 — co-pilot fills the Fiverr gig editor (the engine, not a chat); written gig, else draft from profile+offer, else ask
  'test-pipeline-nodes.test.js',      // 0.60.162 — the pipeline is persistent: derivePlan names each phase's files (DG2), and phase/graph/gate are node-export types
  'test-model-fit-ladder.test.js',    // 0.60.163 MF1 — the ladder leaves off local models that can't fit free RAM up front (byFit/fittingModels); ollama-first on a small box
  'test-project-registry.test.js',    // 0.60.164 CR1 — the contract build wires every built file into the project's component store with resolved edges (the spine)
  'test-economy-resume.test.js',    // 0.60.165 AB1 — a build that exhausted only on time-bound holds (economy/rate-limit/no-RAM) is retried when the slot frees; never a real failure
  'test-cos-run-target.test.js',     // 0.60.166 CT1 — the gate's test runs inside COS's process sandbox (clean env, timeout, output cap); portable, no KVM needed
  'test-tf-already-done.test.js',      // 0.60.167 — a phase whose files already exist is not stuck forever on test_first:require (TF.decide: passes-already+exists = already satisfied)
  'test-stream-fallback.test.js',  // 0.60.191 R1/I1 — the DOM mutator's stream at the node anchor, kept as a partial .response; the last fallback before a re-send
  'test-approval-chain.test.js',  // 0.60.190 APV — an approved change: its entry in the Versionium commit of its diff, the change log route/row/drawer, the orchestrator's ledger
  'test-phase-census.test.js',  // 0.60.188 CNS1 — every phase judged against its evidence; short ids, mapping commits and map citations are not evidence
  'test-pipeline-root-causes.test.js',  // 0.60.170 RC1-RC4 — watcher EPERM never kills a kernel; linear node scan; Windows-safe node names; agent file names guarded
  'test-verify-first.test.js',          // 0.60.171 VF1 CB1 CB2 SM1 RC4b — check as it is before any agent; Gemini's five-part brief with the axioms; gemini first; agent self-models; labelled files archived
  'test-phase-dag.test.js',             // 0.60.172 DG3 — every phase of every phasemap in one DAG: cycles, dangling, undeclared, layers, critical path, conflicts; the build refuses an invalid DAG
  'test-root-findings-not-phases.test.js',  // 0.60.225 NF1 — a root_findings entry is a finding, not a phase: loom marks it, the DAG closes it, the build refuses NOT_A_PHASE
  'test-phase-groom.test.js',  // 0.60.227 SL3 — the DAG groomed: one depends_on reader, MP1's inferred edges, no cycle, DG1 checks every phase, the route
  'test-agent-maps-phase.test.js',  // 0.60.228 SL8 — the agent maps one phase Nexus cannot place: checked by code, kept per phase text, past DG2; the run says so
  'test-phase-nodes-all.test.js',  // 0.60.229 SL9 — every phase a .phase with its .graph beside its owner system; deterministic; the route reads what is written
  'test-upload-placement.test.js',      // 0.60.173 UP1-UP4 — a zip with an intent placed against the repo, waits for his answer, only his answer writes; his moves learned; the panel in Clear Glass
  'clear-glass-page-map.test.js',       // 0.60.174 PM1-PM4 — the page as blocks → index + chunks → a synthesized map that learns per site → intent → targets (layout in Clear Glass)
  'clear-glass-page-session.test.js',   // 0.60.175 PM5-PM8 — the page map as driver actions, co-pilot tools and commands; attention → Nerve → Ollama feel; live re-map; the panel in Clear Glass
  'test-substrate-spec.test.js',        // 0.60.176 — docs/substrate.spec, docs/belief-loop.spec, emerge SPEC_COMPILER compile at full depth, tied to their phases; emerge build order topological
  'test-phase-specs.test.js',           // 0.60.176 PS1 — each phase specced again with its DAG and related files beside its owner; drift checked
  'test-data-clearup.test.js',          // 0.60.177 DL0/DL1 — every data file placed by docs/data-layout.spec; moved by hash with a manifest; rolled back byte for byte
  'test-readme-generate.test.js',    // 0.60.153 — the README: every system, module and file; every phase; the data; Idearium; every release; under 512 KiB
  'test-ui-editor.test.js',           // 0.60.122 UE0/UE1 — the UI editor: GrapesJS vendored, a repo page opened, edited, saved back (Clear Glass)
  'test-proposal-evidence.test.js',   // 0.60.99 — a proposal is tested before it reaches a person
  'test-language-checks.test.js',     // 0.60.101 — every language's own parser, at the gate
  'test-cos-vm-shell.test.js',        // 0.60.101 — `cos vm shell`: the test VM's own terminal
  'test-scroll-until.test.js',       // 0.60.56 — the slow scroll step (ErosmancerOS wheel, arrow keys, page) and the Read-one-chat template
  'test-chat-crawl-plan.test.js',    // 0.60.55 — the personal-chat crawl plan: nothing missed, the stopping edge, pace, stop rules
  'test-gig-ledger.test.js',         // 0.60.53 — the Fiverr ledger keeps only what checks out
  'test-cg-toolbar-live.test.js',    // 0.60.52 — a pin changed in Settings reaches the main window live
  'test-ncp-half-open.test.js', // 0.60.46 — a half-open NCP tab reconnects within one heartbeat; send picks must be buttons
  'test-reply-not-found-attention.test.js', // 0.60.47 — a reply that cannot be found opens the agent's window
  'test-update-script.test.js', // 0.60.48 — npm run update: the latest Nexus without a zip
  'test-capability-spec.test.js', // 0.60.49 CS1 — a spec per capability, whose surface is the gate (CK-254)
  'test-semantic-page-tree.test.js', // 0.60.49 SP1 — the page as a semantic tree for the browser agent
  'test-semantic-field-map.test.js', // 0.60.50 SP2 — picked fields found by semantic address after class churn
  'test-tool-required-alias.test.js', // 0.60.50 — a required tool parameter named the model's own way still arrives
  'test-guardian-field-pick.test.js', // 0.60.71 — the attention panel's picks use the Guardian picker: walk one element at a time
  'test-release-notes.test.js', // 0.60.72 RN2/RN3 — every commit under the release that shipped it; Versionium; the Releases screen
  'test-spec-gaps-intelligence.test.js', // 0.60.49 — every spec gap goes through the intelligence gap system
  'test-gate-versioning.test.js', // 0.60.39 GS1 — a snapshot per gate: commit, rewind before a retry, compare, replay decisions
  'test-raid-runs-contract.test.js', // 0.60.36 RD0 — RAID runs the .contract: its gates before, bricks, verdict, self-heal
  'test-release-version.test.js', // 0.60.34 VR1 — one version: Idearium, GitHub (tag + release + zip), every zip
  'test-check-catalogue.test.js', // 0.60.33 QA1 — the catalogue runs: CK-230 shadow, CK-233 deny list, CK-248 every language's toolchain
  'test-profile-tabs.test.js', // 0.60.32 PF1 — a tab per account profile: hat → account → tab, accounts at once
  'test-route-eligibility.test.js', // 0.60.31 RT1 — eligibility then preference: tools, window, readiness; the record
  'test-contract-adapters.test.js', // 0.60.18 EX0 — agent + phase adapters: routed, budgeted, blocked≠failed, checkpoints, integration, audit
  'test-contract-phase-build.test.js', // 0.60.18 EX0e — Build through the contract scheduler on the real route: bricks, checkpoints, resume, rejected checkpoint, recovery, integration
  'test-lean-mode.test.js', // 0.60.20 — lean mode: one switch in Idearium settings, read by npm run start:all
  'test-run-watch.test.js', // 0.60.21 — no run left in limbo: stalls closed + retried once, a reject retries its phase, a finished review ends
  'test-cg-command-index.test.js', // 0.60.23 — Clear Glass's command index read 0 commands (micro-http has no _router)
  'test-account-fallback.test.js', // 0.60.25 — account fallback chaining: a spent account rests, the next takes the job; all spent → rate-limit
  'test-lean-quiet.test.js', // 0.60.26 — what lean mode holds is not retried against; the probe is held; relays say it once
  'test-phase-cost.test.js', // 0.60.27 AG1a — agent calls and tokens per phase: plan/code/review, local vs remote, estimated tokens
  'test-run-ready.test.js', // 0.60.28 PF1/PF2 — ready before run (Guardian's facts, the ladder) and a plan written without a model
  'test-phase-mapping.test.js', // 0.60.29 PM — every phase mapped to its files (an agent, scored first) and dependencies (from the files)
  'test-contract-ct0-self.test.js',   // 0.60.15 — CT0 complete by its own contract, read by the evaluator
  'test-no-compartment-label.test.js',   // 0.60.11 — regression guard: no "compartment · …" label drawn anywhere
  'test-reasoning-route.test.js',   // 0.60.8 — intent routing for reasoning: complex chat → agent:reason with the reasoning agent; route assess
  'test-mesh-chat-reload.test.js',   // 0.60.8 — a sent job whose page navigated is reopened at its chat URL and read (never retyped); the ladder reloads before asking a person
  'test-repo-history.test.js',   // 0.60.7 — Versionium per repo: history import (git, version zips, secrets gate), index, diff, restore one file; import checks as notes
  'test-repo-notes.test.js',   // 0.60.6 — notes per repo and on no repo (ideas, decisions, todos, questions, quotes); routes, commands, the Notes tab
  'test-phases-tab.test.js',
  'test-workshop-thread.test.js',   // 0.51.0 RS11 — each workshop section its phases (Clear Glass)   // 0.50.0 RS10 — the Phases tab rebuilt on the thread (Clear Glass)   // 0.49.0 RS9 — spec blocks ⇄ phases ⇄ runs ⇄ files, stale per block
  'test-escalation-ladder.test.js',   // 0.39.352 CT6/CT8 — the escalation ladder, the tool-error stop, live tool calls
  'test-ollama-check.test.js',   // 0.39.350 CT4 — Settings → Models: every Ollama model asked through copilot, every caller's route
  'test-code-tab.test.js',   // 0.39.349 CT3 — the Code tab is the work surface; 0.39.351 CT5 — hooked into the Plan (Clear Glass)
  'test-model-door.test.js',   // 0.39.346 CT1 — copilot is the one door for which model; the pages ask through it, it learns and switches   // 0.39.344 — the setup job settles on its result, not on its process exiting   // 0.39.342 PR1/PR3 — systems known from their first beat; a missed heartbeat is negative space (WARP 2 expectations)
  'test-intelligence-causal.js',
  'test-sentinel-cli.js',
  'test-adversarial-sim.js',
  'test-boot-log-fixes.js',
  'test-autopilot-warp-spine.js',
  'test-guardian-cfr-consolidation.js',
  'test-ico-ledger-writethrough.js',
  'test-consumer-registry.js',
  'test-spawn-guard.js',
  'test-capability-registry.js',
  'test-raid-router.js',
  'test-snr-filter.js',
  'test-ui-registry.js',
  // Added 2026-07-06 — built alongside cortex/core/raid/snr-filter.js and
  // the real roleConfidence/topologicalProximity fitness terms this pass.
  'cfr-graph-component-distance.test.js',
  'raid-fitness-real-terms.test.js',
  'raid-tunables.test.js',
  'system-lattice.test.js',
  'intuition-upgrade.test.js',
  'mastermind-upgrade.test.js',
  'adversarial.test.js',
  'copilot-adversarial-wire.test.js',
  'copilot-adversarial-consolidation.test.js',
  'idearium-warp-dispatch.test.mjs',
  'idearium-phase-sync.test.mjs',
  'idearium-phase-compartment.test.mjs',
  'test-manifest-phase1.test.mjs',
  'test-three-graphs.test.mjs',      // 0.39.246 — code · execution · spec graphs hooked into repo import
  'test-response-downloads.test.js', // 0.39.246 — responses land in the Clear Glass downloads manager
  'test-selector-map.test.js',        // 0.39.249 — one selector map per provider, pushed to the userscripts
  'test-cg-selector-assign.test.js',   // 0.39.251 — the element picker assigns selectors (real-page parts run in Clear Glass's engine; SKIPPED without it)
  'test-chat-transcripts.test.js',
  'test-back-and-forth.test.js',     // 0.39.259 — turns 2+ of a conversation complete; each agent keeps its chat
  'test-dangling-hooks-and-idearium-load.test.js', // 0.39.260 — dangling-hook flood, large-import idearium stall, real idearium health in the UI
  'test-nexus-self-and-cos-run.test.js', // 0.39.261 — Nexus as immutable repos in nested compartments, the COS run menu + JS runtime, tool calls, glyphs, in-house zip/http/ws
  'test-nexus-atlas-and-glass.test.js',  // 0.39.263 — one nexus repo whose Home is the Nexus atlas (every reference opens in idearium); Clear Glass's engine replaces Playwright
  'test-idearium-source-files-async.test.js',  // 0.39.265 — nexus-self sync writes sources without blocking the event loop; unchanged files are kept
  'test-idearium-codegen.test.js',  // 0.39.265 — a finished spec → Generate code → a code spec (one chunk per real file) built into its own repo
  'test-idearium-spec-meta-cache.test.js',  // 0.39.265 — repo lists read cached, content-free spec metadata instead of parsing every whole manifest
  'test-repo-git.test.js',  // 0.39.265 — real git for repos: remote, commit, push, pull (changed files back into the repo), clone, SSH keygen; Git & CI tab
  'test-cos-remote.test.js',  // 0.39.265 — compartment remotes: push/pull a COS compartment to a folder or ssh host, two machines, in-sync/ahead/behind/diverged
  'test-cos-remote-api.test.js',  // 0.39.265 — the same through a real idearium API: a repo's compartment pushed, pulled elsewhere, edits back into the repo, clone
  'test-build-verify.test.js',  // 0.39.291 PV1–PV2 — verify (graded, attributed), the repair block, markForRepair, markFailed, the file-kind detector, fence → code
  'test-prove-loop.test.js',  // 0.39.291 PV3 — the real server + COS + a model that writes a bug: round 1 fails, the failure goes back, round 2 is proven
  'test-spatial-void.test.js',   // 0.39.295 — the spatial void: the linked dials, the voices, echoes never in the idea, take in his words, the router
  'test-spec-workshop.test.js',  // 0.39.294 SW1 — the spec workshop: the dial, the feeds, the d20, propose-then-accept, saved into the repo's spec (the router, a stand-in agent)
  'test-architect.test.js',      // 0.39.298 AR2 — ARCHITECT: loom + the store as one index, reuse / new, the gaps said, levels bottom-up, propose-then-accept, saved beside the spec (the router, a stand-in agent)
  'test-synthesis-zoom-versionium.test.js',  // 0.39.300 VX1/WS3/AZ1/SY1/SY2 — versionium down is a stated 502/404; the pipeline together; systems → components zoom; intelligence's gap synthesis ranked by leverage
  'test-nexstore-census.test.js',  // 0.39.300 N0 — every data shape in the tree classified into the seven kinds; the type catalogue
  'test-nexstore-log.test.js',     // 0.39.300 N1 — the record frame and the log: 25 SIGKILLs mid-append, every ack survives, the chain verifies, the torn tail reported
  'test-warp2.test.js',   // 0.39.323 EM2 — WARP 2: links with causes, expectations as gaps, constraints first, 1.x through the adapter
  'test-agent-context-always.test.js',   // 0.39.325 SB32/SB33 — context on every send; the persona on the live index; the agent runs the pipeline
  'test-agent-index-ready.test.js',   // 0.39.335 SB35 — the store flushes under constant writes; a lost nexus mark is updated in place; every agent send reads an indexed directory
  'test-agent-tools-every-backend.test.js',   // 0.39.336 SB36 — one tool-call protocol for ollama and guardian; a written call is run; the code tools read the indexed directory
  'test-copilot-workset.test.js',   // 0.39.337 SB37 — the working set: reads into a JSON file, rounds send its synthesis within a budget
  'test-context-prereqs.test.js',   // 0.39.338 SB38 — the questions first: a checklist per question, found in the index or past conversations, else asked
  'test-checklist-workset.test.js',   // 0.39.339 SB39 — one agnostic context tool (code · data · topic, nexus.learn.tool); the checklist seeds the working set
  'test-desktop-setup-popup.test.js',   // 0.39.340 DK2 — the desktop setup popup in Clear Glass; the repo's setup passes the account
  'test-workshop-full.test.js',   // 0.39.354 WS7 — the full workshop: the writer, parts, modes, SEND TO THE PIPELINE (Clear Glass)
  'test-phase-actually-builds.test.js',   // 0.39.355 PB1–PB5 — the ladder's floor, no-change is incomplete, a round fails only on what the run broke, strings are not imports
  'test-agent-live.test.js',   // 0.39.356 LS1–LS4 — the agent writing, live: bridge partial → copilot → agent/stream → the Code tab and the Plan (Clear Glass)
  'test-repo-expand.test.js',   // 0.39.360 SB42–SB45 — a repo expands from its spec: phased, chunked, coded; uncoded files grey; an empty slot is never complete
  'test-system-skeleton.test.js',   // 0.39.359 SB28/SB30/SB31 — genesis 1.4.0 is the nexus-system archetype; reusable components; every new repo is the skeleton, the idea slotted in
  'test-template-picker.test.js',   // 0.39.357 RS5 — the workshop's start is the template picker: + CUSTOM / MANUAL, every quick-spec template, saved ones versioned (Clear Glass)
  'test-shadow-space.test.js',   // 0.39.322 SH1 — a change acts in a shadow space; only what passes its test and its shadow reaches the real tree
  'test-emerge-core.test.js',   // 0.39.321 EM1 — Emerge core: rejected by id, a gap names its input, a lens cannot write, one seed one history
  'test-route-contracts.test.js',   // 0.39.320 EV0 (2)(3) — every served route in its system's contract, and nothing more
  'test-emergence-and-warp-suites.test.js',   // 0.39.319 EM0 (3) — Emergence's and WARP's own suites inside Nexus
  'test-nexstore-types.test.js',   // 0.39.300 N2 — the type registry and the gate per type (warp Axiom): missing field, ledger patch, dangling reference refused and logged
  'test-nexstore-writers.test.js', // 0.39.300 DT1 — every writer that persists data has a type, a reason, or is listed owed; a new writer fails
  'test-spec-library.test.js',  // 0.39.290 IL1 — a zip of specs → ideas + specs (duplicates folded, zips in zips, programs refused, by family); importSpec in memory
  'test-reply-continuation.test.js',  // 0.39.289 — a cut reply is finished (tail shown back, stitched); Ollama streamed with an idle timeout; thinking-only → think:false
  'test-nexus-self-incremental.test.js',  // 0.39.288 PF1–PF5 — nexus-self updates a spec in place (one changed file ≠ 2,000 rewritten), yielding ingest, changed paths logged, manifest meta sidecar for cold reads
  'test-nexus-self-visible.test.js',  // 0.39.266 — immutable nexus repos refuse Delete; ones already archived are restored by the sync; the library refills on nexus-self events
  'test-nexus-inject-approval.test.js',  // 0.39.266 — agent code on a nexus repo waits for approval, then goes through the apply gate into the live tree; revert = gate rollback
  'test-jaa-deletes-stick.test.js',  // 0.39.266 — a row deleted by one process stays deleted (compaction stuck at 7,176 → 19,788 rows/h before)
  'test-nexus-specs-and-ideas-cleanup.test.js',  // 0.39.266 — nexus repos are not ideas; one spec per nexus repo; removing a spec deletes it
  'test-registry-harness.test.js',  // 0.39.266 — loom's registry as the agent's harness: events, find/card/read, a ~2.7k-char first message
  'test-component-store.test.js',   // 0.39.266 — the component store: folders, pinned deps, reuse by contract/prompt, harness
  'test-ollama-activity.test.js',  // 0.39.266 — num_ctx sized to every prompt; every model call logged; nexus-live capped
  'test-agent-hat-agnostic.test.js',  // 0.39.267–268 — one provider list; a build wears its hat on copilot/ollama/guardian; RAID reads the worn hat; activity recall; code captured with fences
  'test-one-idearium-phases-nodes.test.js',  // 0.39.271 — /idearium/ redirect, versionium newest-first per repo, one bar, Phases manager, living spec, COS suite + every test + debug reports, copilot contract, per-system nodes + guardian .hat/.agent
  'test-agent-memory.test.js',        // 0.39.269 — agent memory over the Clear Glass download manager: record on every backend, recall before every call; loom map
  'test-build-context.test.js',       // 0.39.308 — a build agent's context: dependencies' interfaces, users, relations, primitives, invariants
  'test-repo-settings-ui.test.js',     // 0.39.310 — the repo Settings tab in categories, one pane at a time (Clear Glass's driver; skipped and said without an engine)
  'test-chat-per-agent.test.js',  // 0.39.266 — each repo agent gets its own chat (they all shared one)
  'test-versionium-repo-history.test.js', // 0.39.263 — every repo's history in versionium (staged big versions, files/versions), nexus repos committed on sync, loom reads versionium not git
  'brainos-float-cg.test.js', // 0.39.262 — BrainOS Float Clear Glass tabs + pre-mount registration fix
  'test-agent-tools-and-graph.test.js', // 0.39.257 — every tool (enforced), /tools /debug /graph, the graph in context
  'test-live-stream-and-gates.test.js', // 0.39.256 — 500 ms transcript streaming + gate-specific errors (GS-20 in Clear Glass's engine)     // 0.39.254 — every provider chat, one versioned record per chat (TX-20 in Clear Glass's engine)
  'test-one-tab-e2e.test.js',        // 0.39.247 — real guardian, one tab: job → reply → .response   // 0.39.245 — spec-engine/manifest phase 1: file list → wire-check → manifest + registry
  'idearium-phase-compartment-integration.test.js',
  'idearium-agent-routing.test.mjs',
  'lifeline-fluid-routing.test.js',
  'run-command-tool.test.js',
  'tutorial-engine.test.js',
  // §2026-08-11 — found via James's "should be way more tests": these were
  // written across this whole session (91 tests) and never registered here,
  // the exact same gap this file's own history already caught once
  // (idea-provenance.test.js's own comment above). Every "full sweep" this
  // session was manually invoking these files one by one, never the real
  // suite. Registered now so `node tests/modules/run-all.js` actually means
  // what it says.
  'test-gap-field.js',
  'test-triggers.js',
  'test-chains.js',
  'test-connections.js',
  'test-system-control.js',
  'test-command-builder.js',
  'test-constant-autonomy.js',
  'test-autonomy-router.js',
  'test-intent-learning.js',
  'test-chunk-build-orchestrator.js',
  'test-agent-build-learning.js',
  'test-lifeline-contracts.js',
  'test-lifeline-fault-logging.js',
  'test-stub-scanner.js',
  'test-autonomous-repair.js',
  'test-nerve-gap-bridge.js',
  'test-relational-context.js',

  // §2026-08-17 — ledger wire + person model
  'test-ledger-sse.js',
  'test-person-model.js',

  // §2026-08-18 — wake word, agent-to-agent chat, end-state goals
  'test-nexus-wake.js',
  'test-agent-chat.js',
  'test-end-state.js',

  // §2026-08-19 — real, permanent agent-ID system (hat-forge). Found
  // genuinely unregistered while running the full suite after merging in
  // the freeze-thaw branch — 29 real tests, invisible to the project's
  // own tally until this line was added.
  'test-hat-forge.js',
  'test-hat-forge-cross-process.test.js',
  'test-artifact-namer.js',
  'test-node-export.js',
  'test-node-schemas.js',
  'test-ncp-handler-sr3.js',
  'test-response-sink-passthrough.test.js',
  'test-self-build-loop.js',
  'test-sr11-import-pipeline.js',
  // §2026-09-19 — MCO1 graph layer + the brace-balance false-positive it
  // surfaced (6 of 407 real files wrongly excluded from the map).
  'test-repo-graph.js',
  // §2026-09-20 — MCO2 (verification L4-L8; code landed in 5e082f4 but its
  // test was never registered here) and MCO3 (repo snapshots, §33).
  'test-mco2-verify-deepening.js',
  'test-mco3-repo-snapshot.js',
  'test-mco3-versionium-tab.js',
  'test-mcob-file-versioning.js',
  'test-mcob-snapshot-restore.js',
  'test-mcoc-import-baseline.js',
  'test-mcof-config-gate.js',
  'test-moce-roadmap.js',
  'test-moce-roadmap-ui.js',
  'test-extract-code.js',
  'test-languages.js',
  'test-loom-phasemap-status.js',
  'test-import-pipeline-syntax.js',
  'test-code-artifact.js',
  'test-b1-synthesize-contract.js',
  // §2026-08-23 — real screenshot tool + the driver.exec payload-injection
  // bugfix it surfaced (navigate was also affected).
  'test-browser-action-screenshot.js',
  // §2026-08-23 — native OS-level toast notification + the server-trigger
  // path (GUARDIAN_NATIVE_TOAST), built to close a real, confirmed gap
  // found mining four old Guardian extension zips.
  'test-native-toast.js',
  // §2026-08-23 — the real macro tool, built on browser_action + rewind_replay.
  'test-macro.js',
  // §2026-08-23 — dynamic, delta-based tension: CFR ledger's continuous
  // cfr_tension_history writes + gap-priority's real windowed read.
  'test-dynamic-tension.js',

  // §2026-08-19 — queue/ollama-lock/introspect/agent-capability merge
  // (nexus0822 branch). test-end-state.js, test-nexus-wake.js, and
  // test-hat-forge.js were also independently registered on this side —
  // not duplicated, already listed above.
  'test-work-queue.js',
  'test-introspect.js',
  'test-agent-capability.js',
  'copilot-handshake-dispatch.test.js',

  // §2026-08-19 — pressure/intake subsystem (real, previously identified but not merged until now)
  'test-intake.js',
  'test-pressure-window.js',

  // §2026-08-19 — tool-config governance ratchet + agent-reach + copilot probe
  'test-copilot-probe.js',
  'test-agent-reach.js',
  'test-tool-config.js',
  'tool-call-listener.test.js',
  'brainos-panel-wiring.test.js',
  'clear-glass-plugin-routes.test.js',
  'guardian-picker-cookies-wiring.test.js',
  'guardian-picker-answer-roundtrip.test.js',
  'nexus-cli-switch.test.js',
  'node-index-watcher.test.js',

  // §2026-09-25 (0.39.236) — tests never write real data
  'test-test-sandbox.test.js',
  'test-clear-idearium.test.js',

  // §2026-10-07 (0.39.361–0.39.367) — the learned ladder, chunked phases, the resource monitor driving what runs,
  // provider tabs that do not load, a repo's background tasks
  'test-agent-record.test.js',   // 0.39.361 AR1 — the ladder ordered by what past builds say of each agent
  'test-chunked-phase-build.test.js',   // 0.39.361 SB51 — a phase built one file at a time on a small local model
  'test-resource-adaptive.test.js',   // 0.39.364 — hysteresis, heap vs its limit, a model that will not fit is skipped, background gives way
  'test-provider-host-load.test.js',   // 0.39.365 — a provider tab that does not load is retried, said why, its queued jobs fail
  'test-repo-activity.test.js',   // 0.39.366 — a repo's background tasks: every agent call wearing its hat
  'test-cli-route-commands.test.js',   // 0.39.374 CM1 — every capability a command: the real CLI against the real API
  'test-nexus-command-tool.test.js',   // 0.39.376 CM2 — every command for copilot and every agent (and Claude Code over MCP)
  'test-repo-versions.test.js',   // 0.40.0 VR1 — every change to a repo's files a versionium commit (settled, attributed, nothing lost)
  'test-pf1-stalls.test.js',      // 0.40.1 PF1 — the 5-minute cortex stall (update by id) and the liminal runaway wall
  'test-pf3-append-store.test.js', // 0.41.0 PF3 — the store appends to one segment per process and folds; no whole-table rewrite per write
  'test-pf5-bounded-tables.test.js', // 0.43.0 PF5 — hot tables capped; what leaves is archived (gzip) before it is deleted
  'test-ollama-tape.test.js',      // 0.44.0 OR1–OR3 — every Ollama call a frame; a run's macro; the cassette replays without Ollama
  'test-cm3-commands.test.js',     // 0.45.0 CM3 — repo phasemap / phase / versions, store, ollama tape: commands first, routes behind them
  'test-spec-blanks.test.js',      // 0.47.0 SP2 — a repo spec's blank parts named, drafted as workshop proposals
  'test-system-control.test.js',   // 0.39.372 NC2 — a Nexus system's controls through its supervisor; one intent, inherited
  'test-vm-control.test.js',   // 0.39.371 VM1 + CK1 — pause, live checkpoints, rewind over QMP; a checkpoint before every task's work
  'test-desktop-activity.test.js',   // 0.39.370 DT1 — runs in the repo's compartment and the desktop setup are its tasks and log rows
  'test-compartment-activity-log.test.js',   // 0.39.368 AL1 + 0.39.373 BO1 (GET /api/activity, BrainOS ACTIVITY) — a repo's durable activity log: tasks, phase rows, proposals (who applied, who undid), faults
];

let totalPassed = 0;
let totalFailed = 0;
const results = [];

async function runSuite(file) {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    // §SANDBOX 2026-09-25 — every suite gets its own throwaway data root
    // (idearium, cortex memory, COMPARTMENT OS, inject nodes). The suite
    // would also get one by itself (lib/test-sandbox.js), but giving it here
    // means anything it spawns before touching a store is covered too, and
    // no two suites share leftovers.
    const sb = require('../../lib/test-sandbox.js').childEnv();
    // §0.39.282 N29 — each suite runs in its OWN process group, and the whole group is killed when the suite ends or
    // times out. Killing only the suite's pid left the servers it started (guardian, autopilot, orchestrator) running,
    // still holding ports and writing, and the suites after it talked to them: failures that showed only in a full run.
    const group = process.platform !== 'win32';
    const proc = spawn('node', [path.join(MODULES_DIR, file)], {
      cwd: path.join(__dirname, '../..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: sb.env,
      detached: group,
    });
    const killGroup = () => { try { if (group) process.kill(-proc.pid, 'SIGKILL'); else proc.kill('SIGKILL'); } catch (_) { /* already gone */ } };
    proc.on('close', () => { killGroup(); sb.cleanup(); });

    let out = '';
    let settled = false;
    proc.stdout.on('data', d => { out += d; process.stdout.write(d); });
    proc.stderr.on('data', d => { process.stderr.write(d); });

    // §BUILT 2026-08-19 — found by running the full suite for real: no
    // per-test bound existed here at all, so a single hung suite (a real
    // one found live this session — a lingering flush timer outliving the
    // test's own explicit cleanup) froze the ENTIRE run indefinitely, with
    // no way to tell which of 70+ files was responsible without bisecting
    // by hand. §1.2 — an unbounded wait is never acceptable; a suite that
    // cannot finish in a real, generous window is reported as hung, not
    // silently waited on forever.
    // §0.39.282 — a suite that genuinely needs longer says so in its own header ("run-all: timeout <ms>"), read here,
    // so no list of slow suites lives in this file. Default 60s.
    let SUITE_TIMEOUT_MS = 60000;
    try { const m = fs.readFileSync(path.join(MODULES_DIR, file), 'utf8').slice(0, 4000).match(/run-all:\s*timeout\s+(\d+)/); if (m) SUITE_TIMEOUT_MS = Math.min(600000, parseInt(m[1], 10)); } catch (_) {}
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killGroup();
      console.log(`\n  ⧖ ${file} TIMED OUT after ${SUITE_TIMEOUT_MS}ms — force-killed with everything it started, not counted as passing\n`);
      totalFailed += 1;
      results.push({ file, passed: 0, failed: 1, code: null, crashed: false, timedOut: true });
      resolve();
    }, SUITE_TIMEOUT_MS);

    proc.on('close', (code) => {
      if (settled) return; // the timeout already force-killed and reported this one
      settled = true;
      clearTimeout(timer);
      // FIX (James, 2026-06-19): two test-file naming conventions in this
      // codebase use two different summary formats —
      //   *.test.js    : "16 passed  0 failed"   (whitespace-separated)
      //   test-*.js    : "16 passed, 0 failed"    (comma-separated)
      // The old regex only matched the first, so every test-*.js suite
      // silently reported 0/0 here even though it ran and passed for real.
      const match = out.match(/(\d+)\s*passed,?\s+(\d+)\s*failed/);
      // §FIX 2026-08-11 (James: "the autopilot is still registering
      // architect as the component registry" led here) — a suite that
      // CRASHES at require-time (MODULE_NOT_FOUND, a broken import) prints
      // no parseable summary and exits nonzero, but the old code fell
      // through to passed:0, failed:0 — then the report below did
      // `r.failed === 0 ? '✓' : '✗'`, which is TRUE for a crash, so a dead
      // suite rendered a green checkmark. Found two real instances tonight:
      // flush-redundancy.test.js and admin-server-routes.test.js, both
      // requiring modules that don't exist — exactly the "seven test
      // suites, registered, crashing, rendered with a ✓" pattern a parallel
      // session's diagnostic named. A crash with no summary is now a real
      // failure, not a silent pass.
      const crashed = !match && code !== 0;
      const p = match ? parseInt(match[1]) : 0;
      const f = match ? parseInt(match[2]) : (crashed ? 1 : 0);
      totalPassed += p;
      totalFailed += f;
      results.push({ file, passed: p, failed: f, code, crashed });
      resolve();
    });
  });
}

async function main() {
  console.log('\n══ NEXUS MODULE TESTS — Fractal Adversarial Suite ══\n');

  // §TABLET T2 2026-07-24 — --filter=<substring> runs only matching suites
  // (used by autopilot's /run-tests/:system container route; the tablet
  // invokes THE REAL runner, never a parallel copy — the spec's own
  // failure-mode list names 'per-container tests defined separately from
  // run-all.js' as guaranteed two-truths drift).
  const _filterArg = process.argv.find(a => a.startsWith('--filter='));
  const _filter = _filterArg ? _filterArg.slice(9).toLowerCase() : null;
  let _active = _filter ? SUITES.filter(s => s.toLowerCase().includes(_filter)) : SUITES;
  if (_filter) console.log(`[run-all] filter '${_filter}' — ${_active.length} of ${SUITES.length} suites`);

  // §CHUNK 2026-09-21 — James: "chunks need to know where they live." The
  // full run does not fit one execution window in every environment (a
  // real ceiling hit running this exact file: ~280s, ~30 of 304 suites
  // short). --filter picks suites by NAME; nothing let a caller pick a
  // bounded SLICE of the ordered list and be told, honestly, where in the
  // list it landed — so a chunked caller had no way to know it covered
  // the whole 304 across N calls versus silently double-running or
  // skipping a range. --start=<n> (0-based, into the already-filtered
  // list) + --count=<n> slice _active; every suite still logs through the
  // SAME runSuite/parsing path, so a chunk's numbers sum exactly to a
  // full run's. The chunk states its own span before running, so stitching
  // several calls' totals is arithmetic on stated ranges, not inference
  // from log-reading.
  const _startArg = process.argv.find(a => a.startsWith('--start='));
  const _countArg = process.argv.find(a => a.startsWith('--count='));
  const _start = _startArg ? parseInt(_startArg.slice(8), 10) : 0;
  const _count = _countArg ? parseInt(_countArg.slice(8), 10) : _active.length;
  if (_startArg || _countArg) {
    const _fullLen = _active.length;
    _active = _active.slice(_start, _start + _count);
    console.log(`[run-all] chunk [${_start}, ${_start + _active.length}) of ${_fullLen} suites — ${_active.length} in this run`);
  }
  for (const suite of _active) {
    const fp = path.join(MODULES_DIR, suite);
    if (!fs.existsSync(fp)) {
      console.log(`  SKIP (not found): ${suite}`);
      continue;
    }
    await runSuite(suite);
  }

  // §0.39.282 N19 — tests/known-gaps.yaml: every file that fails for a known, STATED reason, with how many cases may
  // fail. A registered file at or under its count is a KNOWN GAP (reported, with its kind and reason, never silent);
  // over its count it is a failure like any other; a registered file that now passes is reported so its entry can be
  // retired. A timeout is never excused. --strict ignores the register entirely.
  const gaps = _loadKnownGaps();
  let knownFailed = 0;
  const closed = [];
  for (const r of results) {
    const g = gaps.get(r.file);
    if (!g || r.timedOut) continue;
    if (r.failed === 0 && !r.crashed) { closed.push(r.file); continue; }
    if (r.failed <= g.failing) { r.known = g; knownFailed += r.failed; }
  }

  console.log('\n══ MODULE TEST RESULTS ══════════════════════════════');
  for (const r of results) {
    const status = r.timedOut ? '⧖' : r.known ? '◌' : r.crashed ? '✗' : (r.failed === 0 ? '✓' : '✗');
    const note = r.timedOut ? ' TIMED OUT — force-killed' : r.known ? ` KNOWN GAP (${r.known.kind}, ≤${r.known.failing})` : r.crashed ? ` CRASHED (exit ${r.code}, no summary — see output above)` : '';
    console.log(`  ${status} ${r.file.padEnd(40)} ${r.passed} passed  ${r.failed} failed${note}`);
  }
  console.log('─'.repeat(55));
  console.log(`  TOTAL: ${totalPassed} passed  ${totalFailed} failed${knownFailed ? `  (${knownFailed} of them known gaps, ${totalFailed - knownFailed} new)` : ''}`);
  const crashedSuites = results.filter(r => r.crashed && !r.known);
  if (crashedSuites.length) console.log(`  CRASHED (not counted in totals as passing): ${crashedSuites.map(r => r.file).join(', ')}`);
  const known = results.filter(r => r.known);
  if (known.length) {
    console.log(`\n  KNOWN GAPS (tests/known-gaps.yaml) — ${known.length} file(s), ${knownFailed} case(s):`);
    for (const r of known) console.log(`    ◌ ${r.file} [${r.known.kind}] ${String(r.known.reason).slice(0, 160)}${String(r.known.reason).length > 160 ? '…' : ''}`);
  }
  if (closed.length) console.log(`\n  GAPS NOW PASSING — retire these entries from tests/known-gaps.yaml: ${closed.join(', ')}`);

  if (totalFailed - knownFailed > 0) process.exitCode = 1;
}

function _loadKnownGaps() {
  const out = new Map();
  if (process.argv.includes('--strict')) return out;
  try {
    const doc = require('js-yaml').load(fs.readFileSync(path.join(__dirname, '..', 'known-gaps.yaml'), 'utf8'));
    for (const g of (doc && doc.gaps) || []) {
      if (!g || !g.file || typeof g.failing !== 'number') continue;
      out.set(path.relative(MODULES_DIR, path.join(__dirname, '../..', g.file)).split(path.sep).join('/'), g);
    }
  } catch (e) { console.log(`  [run-all] tests/known-gaps.yaml unreadable (${e.message}) — every failure counts`); }
  return out;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
