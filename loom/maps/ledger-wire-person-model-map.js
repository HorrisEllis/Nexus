'use strict';
/**
 * loom/maps/ledger-wire-person-model-map.js — maps the 2026-08-17 session
 * (cross-process ledger wire + the co-pilot's model of the user) into LOOM's
 * component/hook/wire registry. One component per FILE, wired only by REAL
 * require() edges — mirroring loom/maps/observability-map.js exactly.
 *
 * comp_id: nexus.loom.maps.ledger-wire-person-model
 * UUID: nexus-loom-map-ledger-wire-person-model-v1-0000-2026-0817-001
 *
 * WHY THIS FILE EXISTS — the pre-commit hook (CLAUDE.md rule 3) flagged every
 * new file in this session as unreferenced by any loom map: real, test-covered
 * components with zero wires, isolated dots in the registry's own connection
 * graph. Exactly the condition observability-map.js was written to close, and
 * exactly the condition this session's ledger work is about — a thing that
 * moves but cannot be located in the architecture.
 *
 * §EDGES ARE REAL — every dependency below is an actual require() in the named
 * file, checked by reading it, not inferred from the module's purpose. Where a
 * dependency is lazy (component-ledger and ledger-fanin are both required
 * inside try/catch at call time rather than at module top, so a missing store
 * degrades instead of throwing), the edge is still real: the require executes.
 * Noted here so the laziness is not later mistaken for a fabricated wire.
 *
 * §ONE EDGE DELIBERATELY ABSENT — copilot/lib/person-model does NOT require
 * copilot/lib/user-model.js. They are complementary (user-model holds decaying
 * hypotheses; person-model holds a typed lattice with provenance), and a wire
 * between them would be an intention, not a require. Recording an intended
 * edge as a real one is the precise failure this map format exists to prevent.
 */

const FILES = [
  // ── the cross-process ledger wire ─────────────────────────────────────────
  ['lib/ledger-sse.js', 'nexus.lib.ledger-sse',
    ['nexus.lib.ledger-fanin']],                       // lazy require, real at call time

  ['lib/error-log.js', 'nexus.lib.error-log',
    ['nexus.lib.ledger-sse']],                         // toLedgerRow — one schema, two readers

  // ── the person model ──────────────────────────────────────────────────────
  ['copilot/lib/person-model/lattice.js', 'nexus.copilot.person-model.lattice', []],

  ['copilot/lib/person-model/index.js', 'nexus.copilot.person-model',
    ['nexus.copilot.person-model.lattice', 'nexus.cortex.jaa-db', 'nexus.lib.component-ledger']],

  ['copilot/ui/person-model.html', 'nexus.copilot.ui.person-model',
    ['nexus.copilot.person-model']],                   // fetches /api/person-model/* on :3750

  // §DECOMPOSED 2026-08-28/wired 2026-08-29 — the 12 person_model.*
  // routes, previously inline in copilot/server.js (unwired the whole
  // time, same as every other route this session found lacking a real
  // loom entry), extracted verbatim to their own real file. Depends on
  // person-model itself (the module it requires) — not on server.js,
  // since server.js's role after the extraction is just delegation.
  ['copilot/routes/person-model.js', 'nexus.copilot.routes.person-model',
    ['nexus.copilot.person-model']],

  // ── session history ───────────────────────────────────────────────────────
  ['tools/record-session-2026-08-17.js', 'nexus.tools.record-session-2026-08-17',
    ['nexus.lib.component-ledger']],
];

/**
 * Consumers that ALREADY existed and now depend on the new components. Listed
 * separately because these files are already registered under their own ids —
 * declaring them again as components would duplicate them. Only the wires are
 * new, and a wire pointing at a component this map did not create is exactly
 * the case the driver must be allowed to refuse rather than silently accept.
 */
const CONSUMER_EDGES = [
  ['nexus.lib.ledger-sse',   'nexus.autopilot'],        // attachAll() — consumes 5 remote streams
  ['nexus.lib.error-log',    'nexus.autopilot'],        // attach(fanin) — data/error.log sink
  ['nexus.lib.ledger-sse',   'nexus.copilot.server'],   // mount() on /ledger/stream
  ['nexus.lib.component-ledger', 'nexus.copilot.server'],// broadcast() now also ledgers
  ['nexus.lib.ledger-sse',   'nexus.service.nexus-diagnostic'],
  ['nexus.lib.component-ledger', 'nexus.cos.kernel'],   // 3 compartment transitions
  ['nexus.copilot.person-model', 'nexus.copilot.server'],// 12 /api/person-model routes
];

function mapLedgerWirePersonModel(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [], skipped: [] };

  // Pass 1 — components (one per file)
  for (const [file, id] of FILES) {
    const r = driver.declare('component', {
      id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0',
      uuid: `nexus-loom-map-${id}-v1-0000-2026-0817-001`,
    });
    (r.ok ? results.components : results.failures).push({ id, r });
  }

  // which ids are required by at least one file → need an .export hook
  const requiredBy = new Set();
  for (const [, , requires] of FILES) for (const dep of requires) requiredBy.add(dep);
  for (const [dep] of CONSUMER_EDGES) requiredBy.add(dep);

  // Pass 2 — hooks
  for (const [, id, requires] of FILES) {
    if (requiredBy.has(id)) {
      const r = driver.declare('hook', {
        id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out',
        uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0817-001`,
      });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r });
    }
    if (requires.length > 0) {
      const r = driver.declare('hook', {
        id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in',
        uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0817-001`,
      });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }

  // Pass 3 — wires from real require() edges within this session's files
  let wireN = 0;
  for (const [, id, requires] of FILES) {
    for (const dep of requires) {
      wireN++;
      const r = driver.declare('wire', {
        id: `ledger-wire-pm.wire.${wireN}.${dep}--${id}`,
        from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`,
        uuid: `nexus-loom-map-lwpm-wire-${wireN}-v1-0000-2026-0817-001`,
      });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }

  // Pass 4 — wires into PRE-EXISTING consumers. A refusal here is expected and
  // informative rather than a failure: it means the consumer's id is not what
  // this map assumed, which is worth seeing rather than papering over. They are
  // collected in `skipped`, not `failures`, so a real failure stays legible.
  for (const [dep, consumer] of CONSUMER_EDGES) {
    wireN++;
    const r = driver.declare('wire', {
      id: `ledger-wire-pm.wire.${wireN}.${dep}--${consumer}`,
      from_hook_id: `${dep}.export`, to_hook_id: `${consumer}.import`,
      uuid: `nexus-loom-map-lwpm-wire-${wireN}-v1-0000-2026-0817-001`,
    });
    if (r.ok) results.wires.push({ from: dep, to: consumer, r });
    else results.skipped.push({ from: dep, to: consumer, reason: r.error || 'consumer hook not registered', r });
  }

  return results;
}

module.exports = { mapLedgerWirePersonModel, FILES, CONSUMER_EDGES };
