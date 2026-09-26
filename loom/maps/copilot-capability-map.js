'use strict';
/**
 * loom/maps/copilot-capability-map.js — maps the schedule_task/register_trigger/
 * nexus_heal/loom_scan/raid_snr/rewind_replay tool session (docs/
 * copilot-full-capability-phasemap.spec, P2/P4/P8 + the shipped-not-phasemapped
 * batch) into LOOM's component/hook/wire registry, one component per FILE,
 * wired only by REAL require() edges — mirroring loom/maps/observability-map.js
 * and loom/maps/warp-map.js exactly.
 * comp_id: nexus.loom.maps.copilot-capability
 * UUID: nexus-loom-map-copilot-capability-v1-0000-2026-0812-001
 *
 * WHY THIS FILE EXISTS — CLAUDE.md rule 3 flagged every file below across
 * three commits this session (e4fbebd, 910450a, 3b599a7): each was a real,
 * live-verified component with zero loom wires, an isolated dot in the
 * registry's own connection graph. Closing that now, honestly — some edges
 * point to ids that already existed in loom/data/registry.json before this
 * session (nexus.lib.scheduler, nexus.lib.triggers, nexus.copilot.
 * adaptive-fulfillment, nexus.copilot.capability-extend, nexus.cortex.core.raid.*,
 * nexus.clear-glass.src.rewind.engine, nexus.guardian.clear-glass-bridge) —
 * checked against registry.json directly, not assumed present.
 *
 * §NOTE ON ID DRIFT — this session's own file docblocks (schedule-task.js
 * etc.) used comp_id: nexus.lib.agent-tools.<name>, but the REAL registered
 * convention (confirmed against loom/data/registry.json's existing entries
 * for browser-action, capability-tools, etc.) is nexus.lib.agent-tools.
 * tools.<name> — with .tools. in the middle. This map uses the real
 * convention; the docblock comments in those files are now slightly
 * inconsistent with the registry and worth fixing next time those files
 * are touched, not silently left to look authoritative.
 */

const FILES = [
  ['lib/agent-tools/index.js',                      'nexus.lib.agent-tools',
    ['nexus.cortex.core.raid', 'nexus.lib.agent-tools.tools.browser-action', 'nexus.lib.agent-tools.tools.capability-tools',
     'nexus.lib.agent-tools.tools.diagnose', 'nexus.lib.agent-tools.tools.faculty-tools', 'nexus.lib.agent-tools.tools.forge-tool',
     'nexus.lib.agent-tools.tools.loom-scan', 'nexus.lib.agent-tools.tools.nexus-heal', 'nexus.lib.agent-tools.tools.nexus-status',
     'nexus.lib.agent-tools.tools.query-recall', 'nexus.lib.agent-tools.tools.raid-snr', 'nexus.lib.agent-tools.tools.register-trigger',
     'nexus.lib.agent-tools.tools.rewind-replay', 'nexus.lib.agent-tools.tools.schedule-task', 'nexus.lib.agent-tools.tools.ui-tools']],
     // §2026-08-12 — registers 6 new tools this session (raid-snr, rewind-replay, schedule-task,
     // register-trigger, nexus-heal, loom-scan) alongside the pre-existing 22; edge list trimmed to
     // the load-bearing/new ones, not all 28 — matches observability-map's own non-exhaustive convention.

  ['lib/agent-tools/tool-guide.js',                  'nexus.lib.agent-tools.tool-guide',
    ['nexus.lib.agent-tools']],   // requires ./index.js's TOOLS map for _forgedNote's coverage check

  ['lib/agent-tools/tools/governance/schedule-task.js',         'nexus.lib.agent-tools.tools.schedule-task',
    ['nexus.lib.scheduler']],   // thin wrapper — all scheduling/governance/persistence logic stays in lib/scheduler.js

  ['lib/agent-tools/tools/governance/register-trigger.js',      'nexus.lib.agent-tools.tools.register-trigger',
    ['nexus.lib.triggers']],    // thin wrapper — same shape as schedule-task, reactive twin

  ['lib/agent-tools/tools/diagnostic/nexus-heal.js',            'nexus.lib.agent-tools.tools.nexus-heal',
    []],   // HTTP-only to nexus-healer :3755 (propose/list/evaluate) — no internal require edge, real network wire not a code wire

  ['lib/agent-tools/tools/diagnostic/loom-scan.js',             'nexus.lib.agent-tools.tools.loom-scan',
    ['nexus.loom.scanners.phasemap-map']],   // in-process requires of capability-map/dangling-report/spec-map/source-map/closed-door
     // (those four scanners are not yet individually loom-mapped themselves — phasemap-map is, reused here as the one real edge)

  ['lib/agent-tools/tools/governance/raid-snr.js',              'nexus.lib.agent-tools.tools.raid-snr',
    ['nexus.cortex.core.raid.snr-filter', 'nexus.cortex.core.raid.tunables', 'nexus.cortex.jaa-db']],

  ['lib/agent-tools/tools/sandbox/rewind-replay.js',         'nexus.lib.agent-tools.tools.rewind-replay',
    ['nexus.clear-glass.src.rewind.engine']],   // via clear-glass's direct HTTP /rewind routes, not the gate path

  ['lib/agent-tools/tools/browser/browser-action.js',        'nexus.lib.agent-tools.tools.browser-action',
    ['nexus.guardian.clear-glass-bridge', 'nexus.clear-glass.src.driver.url-listener']],

  // §BUILT 2026-09-19 — James: "update loom component registry." Four
  // real files built this session, registered here; one directly-
  // adjacent orphan (idearium/spec-engine/index.js — compiler-t0.js's
  // own real dependency, never itself declared) closed alongside them,
  // matching this session's own established practice for mastermind.js/
  // lib/node-index.js earlier.
  ['lib/agent-tools/tools/mesh/agent-mesh-route.js', 'nexus.lib.agent-tools.tools.agent-mesh-route',
    ['nexus.guardian.clear-glass-bridge']],
  // §BUILT 2026-09-19 (second batch) — bookmarks/accounts/history/site-
  // settings/autofill agent-tools, all built same session, same real
  // Guardian-job dispatch pattern as agent-mesh-route.js above.
  ['lib/agent-tools/tools/bookmarks/bookmarks-manage.js', 'nexus.lib.agent-tools.tools.bookmarks-manage',
    ['nexus.guardian.clear-glass-bridge']],
  ['lib/agent-tools/tools/accounts/account-manage.js', 'nexus.lib.agent-tools.tools.account-manage',
    ['nexus.guardian.clear-glass-bridge']],
  ['lib/agent-tools/tools/history/history-manage.js', 'nexus.lib.agent-tools.tools.history-manage',
    ['nexus.guardian.clear-glass-bridge']],
  ['lib/agent-tools/tools/site-settings/site-settings-manage.js', 'nexus.lib.agent-tools.tools.site-settings-manage',
    ['nexus.guardian.clear-glass-bridge']],
  ['lib/agent-tools/tools/autofill/autofill-manage.js', 'nexus.lib.agent-tools.tools.autofill-manage',
    ['nexus.guardian.clear-glass-bridge', 'nexus.clear-glass.src.autofill.matcher']],
  ['lib/agent-tools/tools/clear-glass/stream-bridge.js', 'nexus.lib.agent-tools.tools.clear-glass-stream-bridge',
    ['nexus.lib.clear-glass-stream-bridge']],
  ['lib/agent-tools/tools/clear-glass/search-engine.js', 'nexus.lib.agent-tools.tools.clearglass-search-engine', []],
  ['lib/clear-glass-stream-bridge.js', 'nexus.lib.clear-glass-stream-bridge', []],
  ['clear-glass/src/autofill/store.js', 'nexus.clear-glass.src.autofill.store', []],
  ['clear-glass/src/autofill/matcher.js', 'nexus.clear-glass.src.autofill.matcher',
    ['nexus.clear-glass.src.autofill.store']],
  ['lib/extract-code.js', 'nexus.lib.extract-code', []],
  ['idearium/spec-engine/index.js', 'nexus.idearium.spec-engine', []],
  ['idearium/spec-engine/compiler-t0.js', 'nexus.idearium.spec-engine.compiler-t0',
    ['nexus.idearium.spec-engine']],
  ['copilot/lib/inject-config.js', 'nexus.copilot.lib.inject-config',
    ['nexus.lib.node-export', 'nexus.lib.node-index', 'nexus.lib.node-schemas', 'nexus.guardian.jaa-store']],

  // §2026-08-23 — real, on top of both the tools above, not parallel to them.
  // §MOVED 2026-08-24 — path corrected: this file itself moved from tools/
  // automation/ to tools/clear-glass/ earlier this same session (matching
  // dom-archaeology.js/userscripts.js/tab-visibility.js/provider-deploy.js,
  // all real, already registered under this same nexus.lib.agent-tools.
  // tools.* convention) — this specific loom entry was missed at the time,
  // confirmed live via a real boot log's own dangling-hook gap
  // (nexus.lib.agent-tools.tools.clear-glass.macro.import), not guessed.
  ['lib/agent-tools/tools/clear-glass/macro.js',               'nexus.lib.agent-tools.tools.macro',
    ['nexus.lib.agent-tools.tools.browser-action', 'nexus.lib.agent-tools.tools.rewind-replay', 'nexus.cortex.jaa-db', 'nexus.clear-glass.wire.nexus-wire']],
     // §2026-08-12 — REAL_ACTIONS event-type strings fixed this session (5 of 6 didn't match any real
     // clear-glass gate signature — see the file's own header); url_listen/url_unlisten added (P5),
     // reaching url-listener.js's real, already-registered gates for the first time.

  ['copilot/config.js', 'nexus.copilot.config', ['nexus.lib.version']],
  ['copilot/server.js',                              'nexus.copilot.server',
    ['nexus.copilot.adaptive-fulfillment', 'nexus.copilot.capability-extend', 'nexus.lib.scheduler', 'nexus.lib.triggers',
     'nexus.copilot.nexus-awareness', 'nexus.copilot.self-model', 'nexus.copilot.tool-runtime', 'nexus.cortex.jaa-db', 'nexus.copilot.config',
     'nexus.copilot.lib.inject-config']],
     // §2026-08-12 — two edges added to the ALREADY-registered nexus.copilot.server this session:
     // capability-extend (P2, wired as adaptive-fulfillment's true last resort) and scheduler/triggers
     // (boot-time .start() call, commit e4fbebd — the fix for tasks/triggers persisting but never firing).
  ['lib/agent-tools/tools/identity/copilot-identity.js',      'nexus.lib.agent-tools.tools.copilot-identity',
    ['nexus.copilot.self-model']],   // getIdentityName/setIdentityName — new this session, same commit

  ['lib/agent-tools/tools/diagnostic/resource-monitor.js',      'nexus.lib.agent-tools.tools.resource-monitor',
    []],   // os builtin (no internal edge) + cos/watchdog/{proc-stats,monitor}.js in-process + ollama :3749/health over HTTP — no code edge into RAID's _fitness on purpose, see file header

  ['lib/agent-tools/tools/query/agent-chat-search.js',     'nexus.lib.agent-tools.tools.agent-chat-search',
    ['nexus.cortex.jaa-db']],   // reads chat_log + guardian_chat_log directly — deliberately NOT wired to push-recall (see file header)

  ['lib/agent-tools/tools/query/nexus-help.js',            'nexus.lib.agent-tools.tools.nexus-help',
    ['nexus.copilot.nexus-awareness']],   // rundown/diagnose/ask wrap nexus-awareness; search_docs is new, no internal edge (fs only)

  ['lib/agent-tools/tools/sandbox/cos-compartment.js',       'nexus.lib.agent-tools.tools.cos-compartment',
    []],   // reuses cos/cli/commands/{create,start,stop,destroy,list,status}.js's real programmatic functions in-process, cos/ has no registered component yet

  ['lib/agent-tools/tools/sandbox/cos-simulate.js',          'nexus.lib.agent-tools.tools.cos-simulate',
    ['nexus.cortex.jaa-db']],   // in-process require of cos/playground/llm-lab.js (unregistered) + guardian :7820/command over HTTP (real network wire, not a code edge)

  ['lib/agent-tools/tools/query/meta-query.js',            'nexus.lib.agent-tools.tools.meta-query',
    []],   // in-process requires of 7 meta/ subsystems (alk, alk-perception, bda, cfr, gap, lattice, liminal), none registered as loom components yet — rfr2 deliberately excluded, see file header

  ['lib/nerve-ollama-bridge.js',                     'nexus.lib.nerve-ollama-bridge',
    ['nexus.lib.nerve', 'nexus.ollama.server']],   // P7c — reads Nerve's snapshot, PUTs to ollama's new context route

  ['lib/agent-tools/tools/execution/run-chain.js',             'nexus.lib.agent-tools.tools.run-chain',
    []],   // in-process require of lib/chains.js (unregistered) — closes P6 of nexus-live-mind-phasemap.spec ("a workflow executes")

  ['cortex/contract/index.js',                       'nexus.cortex.contract',
    []],   // §2026-08-12 — added 5 console contracts (claude/chatgpt/gemini/mistral/perplexity), closing the RAID-denial root cause behind "dispatch failed: unknown"

  ['copilot/tool-runtime.js',                        'nexus.copilot.tool-runtime',
    ['nexus.lib.agent-tools', 'nexus.copilot.lifeline']],   // §2026-08-13 — new makeNcpCallModel/runViaAgent give NCP-driven agents (claude/chatgpt/gemini/mistral/perplexity) the same tool loop ollama already had

  ['lib/hat-forge.js',                                'nexus.lib.hat-forge',
    ['nexus.lib.agent-tools']],   // §2026-08-13 (P8) — named, reusable hats: base agent + scoped tools + persona, verified-composition philosophy mirrored from lib/tool-forge.js

  // §2026-08-13 — hat-forge shipped with an empty store: list() returned [].
  // hat-seed forges the four real hats at copilot boot, validating every
  // tool name in each scope against the live agent-tools registry first.
  ['lib/hat-seed.js',                                 'nexus.lib.hat-seed',
    ['nexus.lib.hat-forge', 'nexus.lib.agent-tools']],

  // §2026-08-23 — real, separate seed set: one hat per real
  // ollama/abliterated-catalog.js entry, for model personalities rather
  // than the four operational roles above. Real dependency on hat-forge
  // (forge/bySeedKey) and the catalog itself; no tool-registry dependency
  // since these hats deliberately don't restrict toolScope.
  ['lib/hat-seed-ollama-personalities.js',             'nexus.lib.hat-seed-ollama-personalities',
    ['nexus.lib.hat-forge', 'nexus.ollama.abliterated-catalog']],

  // §2026-08-23 — found genuinely unregistered by precommit while fixing
  // real orchestrator.js/orchestrator-contract.json path references
  // inside these files during BL11's move.
  ['lib/nexus-config.js', 'nexus.lib.nexus-config', []],
  ['lib/file-integrity.js', 'nexus.lib.file-integrity', []],
  ['lib/system-check.js', 'nexus.lib.system-check', ['nexus.lib.gap-field']],

  // §2026-08-23 — found genuinely unregistered by precommit while
  // amending BL12's move of service/nexus-heal-loop.js (which this file
  // documents as a real, correct consumer of). No real internal
  // dependency of its own — only Node's builtin http.
  ['lib/gap-relay.js',                                 'nexus.lib.gap-relay', []],

  // §2026-08-13 — generates copilot's user guide from the real tool registry
  // and tool-guide notes rather than a hand-written list that would drift.
  ['lib/agent-tools/user-guide-generator.js',         'nexus.lib.agent-tools.user-guide-generator',
    ['nexus.lib.agent-tools']],

  ['lib/agent-tools/tools/identity/hat-forge.js',              'nexus.lib.agent-tools.tools.hat-forge',
    ['nexus.lib.hat-forge', 'nexus.copilot.self-model']],

  ['lib/agent-capability-profile.js',                 'nexus.lib.agent-capability-profile',
    ['nexus.cortex.jaa-db', 'nexus.cortex.core.raid']],   // §2026-08-13 — real measured per-agent stats from chat_log (live) + guardian_chat_log (historical, no writer) + RAID health, not hardcoded constraints

  ['lib/agent-tools/tools/coordination/agent-capability.js',       'nexus.lib.agent-tools.tools.agent-capability',
    ['nexus.lib.agent-capability-profile']],

  ['lib/agent-notes.js', 'nexus.lib.agent-notes', ['nexus.cortex.jaa-db']],   // §2026-08-22 — real, editable per-agent constraint log
  ['lib/agent-tools/tools/coordination/agent-notes.js',       'nexus.lib.agent-tools.tools.agent-notes',
    ['nexus.lib.agent-notes']],

  ['lib/nexus-wake-events.js', 'nexus.lib.nexus-wake-events', ['nexus.cortex.jaa-db']],   // §2026-08-22 — real, persistent "hey nexus" event record
  ['lib/agent-tools/tools/coordination/nexus-wake-events.js',       'nexus.lib.agent-tools.tools.nexus-wake-events',
    ['nexus.lib.nexus-wake-events']],

  ['intelligence/framework-builder.js', 'nexus.intelligence.framework-builder', ['nexus.lib.agent-tools', 'nexus.lib.chunk-service']],
  ['lib/agent-tools/tools/coordination/framework-builder.js', 'nexus.lib.agent-tools.tools.framework-builder', ['nexus.intelligence.framework-builder']],
  ['lib/agent-tools/tools/coordination/intelligence-query.js', 'nexus.lib.agent-tools.tools.intelligence-query', ['nexus.intelligence.index', 'nexus.intelligence.server']],
  ['lib/agent-tools/tools/clear-glass/dom-archaeology.js', 'nexus.lib.agent-tools.tools.dom-archaeology', []],
  ['lib/agent-tools/tools/clear-glass/userscripts.js', 'nexus.lib.agent-tools.tools.clear-glass-userscripts', []],
  ['lib/agent-tools/tools/clear-glass/tab-visibility.js', 'nexus.lib.agent-tools.tools.clear-glass-tab-visibility', []],
  ['lib/agent-tools/tools/clear-glass/provider-deploy.js', 'nexus.lib.agent-tools.tools.clear-glass-provider-deploy', []],
  // §NEW 2026-09-06 — real, confirmed gaps found while mapping tool
  // coverage for guardian/ncp/agent-mesh (clear-glass and macros
  // already had real tools; erosmancer already reachable through
  // macro.js's own /eros/* proxy).
  ['lib/agent-tools/tools/guardian/dispatch.js', 'nexus.lib.agent-tools.tools.guardian-dispatch', ['nexus.guardian.server']],
  ['lib/agent-tools/tools/ncp/status.js', 'nexus.lib.agent-tools.tools.ncp-status', ['nexus.guardian.server']],
  ['lib/agent-tools/tools/agent-mesh/route.js', 'nexus.lib.agent-tools.tools.agent-mesh-route', ['nexus.clear-glass.main']],
  ['intelligence/server.js', 'nexus.intelligence.server', ['nexus.intelligence.index', 'nexus.intelligence.cfr', 'nexus.intelligence.framework-builder', 'nexus.intelligence.routes', 'nexus.intelligence.field-provider']],
  ['intelligence/registry-components.js', 'nexus.intelligence.registry', []],
  ['intelligence/routes.js', 'nexus.intelligence.routes', ['nexus.intelligence.index']],
  ['intelligence/field-provider.js', 'nexus.intelligence.field-provider', ['nexus.intelligence.cfr']],
  ['hooks/intelligence.hooks.js', 'nexus.hooks.intelligence', []],
  ['intelligence/consumer.js', 'nexus.intelligence.consumer', ['nexus.lib.contract-queue', 'nexus.intelligence.framework-builder']],
  ['intelligence/schemas.js', 'nexus.intelligence.schemas', []],
  ['intelligence/config.js', 'nexus.intelligence.config', []],
  // §BUILT 2026-09-19 — James: "each node type needs a schema to make
  // sure they stay consistent." lib/node-index.js was a real, load-
  // bearing shared module (guardian/lib/node-registry.js's own queryable
  // index layer) that had never been declared as a component at all —
  // found while wiring domain-nodes.js into it, closed here alongside
  // the new real work rather than left as a second orphan.
  ['lib/node-index.js', 'nexus.lib.node-index', ['nexus.cortex.jaa-db']],
  ['intelligence/lib/domain-nodes.js', 'nexus.intelligence.domain-nodes',
    ['nexus.lib.node-export', 'nexus.lib.node-index', 'nexus.lib.node-schemas', 'nexus.guardian.jaa-store']],
  // intelligence/mastermind.js was referenced as a dependency target by
  // observability-map.js and other components (nexus.intelligence.mastermind)
  // but never itself declared — a real, pre-existing orphan-target gap,
  // closed here while wiring its own new real dependency on domain-nodes.js.
  ['intelligence/mastermind.js', 'nexus.intelligence.mastermind', ['nexus.intelligence.domain-nodes']],

  ['lib/account-identity-index.js', 'nexus.lib.account-identity-index', ['nexus.cortex.jaa-db']],   // §2026-08-22 — stable UUID per (agent, account)

  ['lib/safe-apply.js',                               'nexus.lib.safe-apply',
    ['nexus.cortex.jaa-db', 'nexus.copilot.self-model']],   // §2026-08-13 — real verify-before-merge on COS's branch/sandbox primitives, closes the nexus-healer merge stub gap the honest way

  ['lib/agent-tools/tools/execution/safe-apply.js',             'nexus.lib.agent-tools.tools.safe-apply',
    ['nexus.lib.safe-apply']],

  ['lib/agent-council.js',                            'nexus.lib.agent-council',
    ['nexus.copilot.tool-runtime', 'nexus.copilot.lifeline']],   // §2026-08-13 — independent multi-agent deliberation; only collects verdicts, RAID governs the actual decision

  ['lib/agent-tools/tools/coordination/agent-council.js',          'nexus.lib.agent-tools.tools.agent-council',
    ['nexus.lib.agent-council', 'nexus.lib.hat-forge']],

  ['lib/fault-log.js',                                'nexus.lib.fault-log',
    ['nexus.cortex.self-heal.fault-taxonomy', 'nexus.nexus-cfr-influence']],   // §2026-08-13 — universal richly-tagged fault logging, extends fault-taxonomy's single-writer discipline, attaches CFR's real conditions snapshot
  ['lib/chat-logger.js', 'nexus.lib.chat-logger', ['nexus.intelligence.bda']],

  ['lib/agent-tools/tools/query/fault-log.js',               'nexus.lib.agent-tools.tools.fault-log',
    ['nexus.lib.fault-log']],

  ['lib/roundtable.js',                                'nexus.lib.roundtable',
    ['nexus.cortex.jaa-db', 'nexus.copilot.tool-runtime']],   // §2026-08-13 — shared multi-party thread, deliberate opposite of agent-council's independence

  ['lib/agent-tools/tools/coordination/roundtable.js',              'nexus.lib.agent-tools.tools.roundtable',
    ['nexus.lib.roundtable', 'nexus.lib.hat-forge']],

  ['lib/parallel-dispatch.js',                          'nexus.lib.parallel-dispatch',
    ['nexus.copilot.self-model', 'nexus.cortex.jaa-db']],   // §2026-08-13 P9 — real concurrent multi-agent dispatch, each independently governed, real concurrency cap

  ['lib/agent-tools/tools/coordination/parallel-dispatch.js',        'nexus.lib.agent-tools.tools.parallel-dispatch',
    ['nexus.lib.parallel-dispatch', 'nexus.lib.hat-forge']],

  ['lib/emergence.js',                                  'nexus.lib.emergence',
    ['nexus.lib.safe-apply', 'nexus.lib.fault-log']],   // §2026-08-13 — axioms+end-state iterative propose/verify/refine, pivots METHOD after repeated same-method failure

  ['lib/agent-tools/tools/execution/emergence.js',                'nexus.lib.agent-tools.tools.emergence',
    ['nexus.lib.emergence', 'nexus.lib.safe-apply', 'nexus.copilot.tool-runtime']],
];

// nexus.copilot.self-model already exists (observability-map.js) — no
// component entry needed for it here, only the new wire above and the new
// copilot_identity component/hooks, both handled by PRE_EXISTING below.

module.exports = { mapCopilotCapability, FILES };

function mapCopilotCapability(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };

  // §FIXED after first live run 2026-08-12 — nexus.lib.agent-tools,
  // nexus.lib.agent-tools.tool-guide, nexus.lib.agent-tools.tools.browser-action,
  // and nexus.copilot.server already existed in the registry from before this
  // session (confirmed against loom/data/registry.json directly). The first
  // run of this map tried to re-declare them with fresh UUIDs and correctly
  // hit loom.unique-id — SISO's collision-is-hard-error law working as
  // designed, not a bug, but noisy and avoidable: skip component/hook
  // declares for ids that already exist, since re-declaring adds nothing.
  // Wires still cover every edge below regardless — those succeeded on the
  // first run precisely because the pre-existing hooks already satisfied
  // loom.wire-endpoints-exist.
  const PRE_EXISTING = new Set([
    'nexus.lib.agent-tools', 'nexus.lib.agent-tools.tool-guide',
    'nexus.lib.agent-tools.tools.browser-action', 'nexus.copilot.server',
  ]);

  // Pass 1 — components (one per file), skipping pre-existing ids.
  for (const [file, id] of FILES) {
    if (PRE_EXISTING.has(id)) continue;
    const r = driver.declare('component', {
      id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0',
      uuid: `nexus-loom-map-${id}-v1-0000-2026-0812-001`,
    });
    (r.ok ? results.components : results.failures).push({ id, r });
  }

  const requiredBy = new Set();
  for (const [, , requires] of FILES) for (const dep of requires) requiredBy.add(dep);

  // Pass 2 — hooks, skipping pre-existing ids (they already have export/import hooks).
  for (const [, id, requires] of FILES) {
    if (PRE_EXISTING.has(id)) continue;
    if (requiredBy.has(id)) {
      const r = driver.declare('hook', {
        id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out',
        uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0812-001`,
      });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r });
    }
    if (requires.length > 0) {
      const r = driver.declare('hook', {
        id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in',
        uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0812-001`,
      });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }

  // Pass 3 — wires: dependency's .export → dependant's .import (real require/HTTP edges)
  let wireN = 0;
  for (const [, id, requires] of FILES) {
    for (const dep of requires) {
      wireN++;
      const r = driver.declare('wire', {
        id: `copilot-capability.wire.${wireN}.${dep}--${id}`,
        from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`,
        uuid: `nexus-loom-map-cc-wire-${wireN}-v1-0000-2026-0812-001`,
      });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }

  return results;
}
