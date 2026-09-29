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
  'test-eravos-pulse-migration.js',
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
    const proc = spawn('node', [path.join(MODULES_DIR, file)], {
      cwd: path.join(__dirname, '../..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: sb.env,
    });
    proc.on('close', sb.cleanup);

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
    const SUITE_TIMEOUT_MS = 60000;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      console.log(`\n  ⧖ ${file} TIMED OUT after ${SUITE_TIMEOUT_MS}ms — force-killed, not counted as passing\n`);
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

  console.log('\n══ MODULE TEST RESULTS ══════════════════════════════');
  for (const r of results) {
    const status = r.timedOut ? '⧖' : r.crashed ? '✗' : (r.failed === 0 ? '✓' : '✗');
    const note = r.timedOut ? ' TIMED OUT — force-killed' : r.crashed ? ` CRASHED (exit ${r.code}, no summary — see output above)` : '';
    console.log(`  ${status} ${r.file.padEnd(40)} ${r.passed} passed  ${r.failed} failed${note}`);
  }
  console.log('─'.repeat(55));
  console.log(`  TOTAL: ${totalPassed} passed  ${totalFailed} failed`);
  const crashedSuites = results.filter(r => r.crashed);
  if (crashedSuites.length) console.log(`  CRASHED (not counted in totals as passing): ${crashedSuites.map(r => r.file).join(', ')}`);

  if (totalFailed > 0) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
