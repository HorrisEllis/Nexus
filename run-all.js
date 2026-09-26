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
  'queue.test.js',
  'baseline.test.js',
  'intelligence.test.js',
  'test-repo-toolbar-mode.js',
  'test-repo-hat-memory.js',
  'test-repo-agent.js',
  'test-repo-agent-node.js',
  'test-repo-agent-learn.js',
  'test-repo-inject.js',
  'test-guardian-job-correlation.js',
  'test-guardian-job-persistence.js',
  'test-system-record-discipline.js',
  'test-file-tree-plan.js',
  'test-repo-run.js',
  'test-repo-agent-provider.js',
  'test-cos-testenv.js',
  'test-cos-testenv-any-repo.js',
  'test-cg-eros-supervisor.js',
  'test-guardian-retry-novelty-installs.js', // 0.39.265 — guardian retry + answer-first + join, semantic rewording with novelty, Eros human typing, Run-menu installs
  'test-nexus-atlas-refs.test.js',  // §0.39.264 — every reference in the written-out atlases resolves against the real tree     // §0.39.264 — ErosmancerOS starts, connects and stops with Clear Glass (real tsx + Chromium where available)   // §0.39.264 — the VM for any repo: tar disk, detect, provision, setup job, real QEMU boot where available
  'ollama-runtime.test.js',
  'flush-redundancy.test.js',
  'admin-server-routes.test.js',
  'orchestrator-cli.test.js',
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
  'idearium-chunk-dependencies.test.js',
  'test-agent-mesh-guardian-coverage.js',
  'ncp-hostile-payload.test.js',
  'agent-mesh-hostile.test.js',
  'agent-mesh-drainer.test.js',
  'test-dispatcher-deepseek-ncp.js',
  'route-graph.test.js',
  'automation-engine.test.js',
  'brainos-app-hostile.test.js',
  'guardian-hostile-file-read.test.js',
  'guardian-hostile-body-dos.test.js',
  'copilot-provider-toggle.test.js',
  'clear-glass-hostile-html.test.js',
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
  'test-guardian-tool-runtime.js',
  'test-faculty-tools.js',
  'test-call-system.js',
  'test-ui-tools.js',
  'test-relevance-classify.js',
  'test-assist-loop.js',
  'test-repair-on-prompt.js',
  'test-copilot-window.js',
  'test-cli-consolidation.js',
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
  'test-table-compactor.js',
  'test-table-deduplicator.js',
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
  'test-artifact-namer.js',
  'test-node-export.js',
  'test-node-schemas.js',
  'test-ncp-handler-sr3.js',
  'test-self-build-loop.js',
  'test-sr11-import-pipeline.js',
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
];

let totalPassed = 0;
let totalFailed = 0;
const results = [];

async function runSuite(file) {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const proc = spawn('node', [path.join(MODULES_DIR, file)], {
      cwd: path.join(__dirname, '../..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

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
  const _active = _filter ? SUITES.filter(s => s.toLowerCase().includes(_filter)) : SUITES;
  if (_filter) console.log(`[run-all] filter '${_filter}' — ${_active.length} of ${SUITES.length} suites`);
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
