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

  return results;
}

module.exports = { mapRaidEventsAndTools, FILES };
