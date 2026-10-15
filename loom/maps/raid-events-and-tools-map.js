'use strict';
/**
 * loom/maps/raid-events-and-tools-map.js — registers this session's own
 * real, new/touched components (RAID's real event-taxonomy + ledger
 * wiring, and the browser-agent tool-call parser) into LOOM's component/
 * hook/wire registry — mirroring loom/maps/observability-map.js exactly.
 * comp_id: nexus.loom.maps.raid-events-and-tools
 * UUID: nexus-loom-map-raid-events-and-tools-v1-0000-2026-0831-001
 *
 * WHY (James, 2026-08-31): "get the taxonomy done" (RAID's own event-
 * taxonomy + real ledger wiring) and the real, automated tool-call loop
 * for browser-based agents were both built this session, and precommit's
 * own real check flagged both as "not referenced in any loom/maps/*.js"
 * — real registration debt from the session's own work, closed here
 * rather than left to accumulate (James's own registration-discipline
 * principle: every new file/tool/module gets registered).
 *
 * Edge rule (same as observability-map): node builtins don't count; only
 * real internal NEXUS require() edges are wires, verified against each
 * file's actual source, not recalled. lib/compartment-engine.js — a real
 * require() of contract-intake.js — is deliberately NOT wired to here:
 * checked directly and it has no existing registered component id of its
 * own anywhere in loom/maps (confirmed by grep), and this map declares
 * wires only to ids that already exist, same discipline observability-
 * map's own header states for its external-but-real targets.
 */

// [file, namespace.id, requires (real internal edges, verified against source)]
const FILES = [
  ['cortex/core/raid/contract-intake.js', 'nexus.cortex.core.raid.contract-intake',
    ['nexus.cortex.jaa-db', 'nexus.intelligence.cfr.ledger', 'nexus.cortex.core.raid.event-taxonomy']],
  ['cortex/core/raid/event-taxonomy.js',  'nexus.cortex.core.raid.event-taxonomy', []],
  // §ADDED 2026-09-02 — James: "did you finish the synthesis for the
  // contracts. thats top priority." The real, agent-synthesized
  // contract module (B1's own second half). Real deps: lib/intake.js
  // (no registered id found — checked, not assumed; left out per this
  // map's own established convention for unregistered dependencies
  // elsewhere in this file), lib/hat-forge.js (same, unregistered),
  // and contract-intake.js's own submitContract, already registered
  // directly above.
  ['cortex/core/raid/officiator.js', 'nexus.cortex.core.raid.officiator',
    ['nexus.cortex.core.raid.contract-intake']],
  // §ADDED 2026-09-03 — merged from a parallel session's real work
  // (context-gate.js, context-synthesis.js — the primitive/invariant
  // boundary-check pieces of docs/contracts/context-synthesis-
  // pipeline.spec's own real pipeline). Registered here even though
  // precommit-check.js's own orphan scan didn't flag either — matching
  // established discipline rather than relying on that scan's own
  // possibly-incomplete coverage.
  ['cortex/core/raid/context-gate.js', 'nexus.cortex.core.raid.context-gate',
    ['nexus.cortex.core.raid.contract-boundary']],
  ['cortex/core/raid/context-synthesis.js', 'nexus.cortex.core.raid.context-synthesis', []],
  // §ADDED 2026-09-02 — precommit-check.js flagged this as a real
  // orphan (CLAUDE.md rule 3) once this session's intuition/mastermind/
  // synthesize_contract tools touched it. Genuinely never registered
  // before — its own id (nexus.lib.agent-tools.tools.faculty-tools) was
  // already referenced as a DEPENDENCY elsewhere (loom/maps/copilot-
  // capability-map.js), which is why a plain grep for the id looked
  // like coverage — but the FILE itself was never declared as a real
  // component with that id, which is what precommit's own check
  // actually looks for. Real dep: cortex/core/raid/officiator.js,
  // registered directly above, via synthesize_contract's own new call.
  ['lib/agent-tools/tools/faculty/faculty-tools.js', 'nexus.lib.agent-tools.tools.faculty-tools',
    ['nexus.cortex.core.raid.officiator']],
  ['lib/agent-tool-call.js',              'nexus.lib.agent-tool-call', []],
  // 0.60.15/0.60.18 — .contract v2 (contract-gates: the evaluator, packets, chunking, the scheduler) and its EX0 adapters
  // (contract-adapters: the agent executor, phase plan → contract, checkpoints, audit). contract-gates was never mapped
  // when it landed in 0.60.15 — registration debt, closed here. Real edges, read from source: contract-gates requires
  // lib/node-export.js, lib/agent-tools (its default executor), cortex/memory/jaa-db.js (Boundaries) and
  // lib/import-checks.js (no registered id — left out, this map's convention); contract-adapters requires
  // contract-gates, lib/model-door.js (doorRoute) and lib/phase-plan.js (depsOf). model-door's own requires
  // (pipeline-routing, reasoning-route) have no registered ids yet — left out, said.
  ['cortex/core/raid/contract-gates.js',    'nexus.cortex.core.raid.contract-gates',
    ['nexus.lib.node-export', 'nexus.lib.agent-tools', 'nexus.cortex.jaa-db']],
  // 0.60.31 RT1 — the door now requires lib/route-eligibility.js (eligibility, then preference); route-eligibility reads
  // the window Nexus gives Ollama (lib/ollama-activity.js) and Guardian's provider facts (guardian/lib/agent-facts.js —
  // GA1, never mapped until now: node-export + agent-facts-hash; guardian/server.js serves it at /api/providers)
  ['lib/model-door.js',                     'nexus.lib.model-door', ['nexus.lib.route-eligibility']],
  ['lib/route-eligibility.js',              'nexus.lib.route-eligibility', ['nexus.lib.ollama-activity', 'nexus.guardian.lib.agent-facts']],
  ['guardian/lib/agent-facts.js',           'nexus.guardian.lib.agent-facts', ['nexus.lib.node-export', 'nexus.lib.agent-facts-hash']],
  // 0.60.32 PF1 — a tab per account profile: guardian/lib/profile-lanes.js (hat → account → tab and lane; reads ncp's
  // PROFILE_TAB) and clear-glass/src/providers/profile-tabs.js (an account's own tab in its own session; session-hub's
  // isAuthCookie). Consumers: the dispatcher and guardian/server.js (/api/accounts/profiles); Clear Glass main (its routes).
  ['guardian/lib/profile-lanes.js',         'nexus.guardian.lib.profile-lanes', ['nexus.guardian.lib.ncp']],
  ['clear-glass/src/providers/profile-tabs.js', 'nexus.clear-glass.src.providers.profile-tabs', ['nexus.clear-glass.src.cookies.session-hub']],
  // 0.60.33 QA1 — the catalogue runs: lib/check-catalogue.js loads cos/spec/check-catalogue.spec and runs lib/checks/*
  // (CK-230 reads lib/shadow.js); contract-gates checkCondition and idearium/api (checks.list / checks.run) consume it
  ['lib/check-catalogue.js',                'nexus.lib.check-catalogue', ['nexus.lib.checks.ck-230-shadow', 'nexus.lib.checks.ck-233-deny', 'nexus.lib.checks.ck-248-toolchain', 'nexus.lib.checks.ck-253-versions']],
  ['lib/checks/ck-230-shadow.js',           'nexus.lib.checks.ck-230-shadow', ['nexus.lib.shadow']],
  ['lib/checks/ck-233-deny.js',             'nexus.lib.checks.ck-233-deny', []],
  ['lib/checks/ck-248-toolchain.js',        'nexus.lib.checks.ck-248-toolchain', []],
  // 0.60.34 VR1 — one version everywhere: lib/release-version.js (the release, where it is stated, what a zip carries)
  // reads lib/version.js; CK-253 runs it; scripts/release-zip.js builds the GitHub release asset with it; idearium/api
  // serves /api/version and stamps/reads zips with it
  ['lib/release-version.js',                'nexus.lib.release-version', ['nexus.lib.version']],
  ['lib/checks/ck-253-versions.js',         'nexus.lib.checks.ck-253-versions', ['nexus.lib.release-version']],
  ['scripts/release-zip.js',                'nexus.scripts.release-zip', ['nexus.lib.release-version']],
  ['lib/phase-plan.js',                     'nexus.lib.phase-plan', []],
  ['cortex/core/raid/contract-adapters.js', 'nexus.cortex.core.raid.contract-adapters',
    ['nexus.cortex.core.raid.contract-gates', 'nexus.lib.model-door', 'nexus.lib.phase-plan']],
];
// consumers declared in other maps that require components declared here: [consumer id, dependency id]
// (idearium/api/index.js's _phaseBuild runs a held plan through contract-adapters + contract-gates, 0.60.18 EX0e)
const CONSUMERS = [
  ['nexus.idearium.api', 'nexus.cortex.core.raid.contract-adapters'],
  ['nexus.idearium.api', 'nexus.cortex.core.raid.contract-gates'],
  ['nexus.idearium.api', 'nexus.lib.phase-plan'],
  ['nexus.guardian.server', 'nexus.guardian.lib.agent-facts'],   // 0.60.31 — GET /api/providers, /providers (GA1)
  ['nexus.guardian.lib.dispatcher', 'nexus.guardian.lib.profile-lanes'],          // 0.60.32 PF1 — the lane before the pool
  ['nexus.guardian.server', 'nexus.guardian.lib.profile-lanes'],                  // 0.60.32 PF1 — /api/accounts/profiles, /route
  ['nexus.clear-glass.src.main', 'nexus.clear-glass.src.providers.profile-tabs'],  // 0.60.32 PF1 — :7702/providers/:id/profile(s)
  ['nexus.cortex.core.raid.contract-gates', 'nexus.lib.check-catalogue'],          // 0.60.33 QA1 — { check: CK-nnn } conditions
  ['nexus.idearium.api', 'nexus.lib.check-catalogue'],                             // 0.60.33 QA1 — /api/checks
  ['nexus.idearium.api', 'nexus.lib.release-version'],                             // 0.60.34 VR1 — /api/version, zip import/export
];

function mapRaidEventsAndTools(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };

  // Pass 1 — components (one per file)
  for (const [file, id] of FILES) {
    const r = driver.declare('component', {
      id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0',
      uuid: `nexus-loom-map-${id}-v1-0000-2026-0831-001`,
    });
    (r.ok ? results.components : results.failures).push({ id, r });
  }

  // which ids are required by at least one file here → need an .export hook
  const requiredBy = new Set();
  for (const [, , requires] of FILES) for (const dep of requires) requiredBy.add(dep);
  for (const [, dep] of CONSUMERS) requiredBy.add(dep);

  // Pass 2 — hooks (export if required elsewhere, import if this file requires others)
  for (const [, id, requires] of FILES) {
    if (requiredBy.has(id)) {
      const r = driver.declare('hook', {
        id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out',
        uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0831-001`,
      });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r });
    }
    if (requires.length > 0) {
      const r = driver.declare('hook', {
        id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in',
        uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0831-001`,
      });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }

  // Pass 3 — wires: dependency's .export → dependant's .import (real require edges).
  // jaa-db and cfr.ledger are real, pre-existing components (registered by
  // session-2026-08-14-map.js and observability-map.js respectively) —
  // this only wires TO their already-declared .export hooks, it doesn't
  // redeclare them.
  let wireN = 0;
  for (const [, id, requires] of FILES) {
    for (const dep of requires) {
      wireN++;
      const r = driver.declare('wire', {
        id: `raid-events-and-tools.wire.${wireN}.${dep}--${id}`,
        from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`,
        uuid: `nexus-loom-map-raid-tools-wire-${wireN}-v1-0000-2026-0831-001`,
      });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }

  for (const [consumer, dep] of CONSUMERS) {
    wireN++;
    const r = driver.declare('wire', {
      id: `raid-events-and-tools.wire.${wireN}.${dep}--${consumer}`,
      from_hook_id: `${dep}.export`, to_hook_id: `${consumer}.import`,
      uuid: `nexus-loom-map-raid-tools-wire-${wireN}-v1-0000-2026-0831-001`,
    });
    (r.ok ? results.wires : results.failures).push({ from: dep, to: consumer, r });
  }

  return results;
}

module.exports = { mapRaidEventsAndTools, FILES, CONSUMERS };
