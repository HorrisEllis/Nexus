'use strict';
/**
 * diagnostic/wire-integrity.js — which loom hooks are dangling, and which of
 * those are worth a gap. Pure: graph in, classification out.
 * comp_id: nexus.diagnostic.wire-integrity
 *
 * §0.39.260 — James: "can we fix some of these dangling hooks." The boot log
 * announced 545 dangling-hook gaps. ~530 were `<file>.import` / `<file>.export`
 * hooks, which loom/scanners/source-map.js and the loom/maps/* hand maps DERIVE
 * from the static require() graph, one pair per file. An unwired end of one of
 * those is a root file (a test, a script, a server: nothing requires it), a
 * file whose requires are all dynamic or external, or registry-build residue.
 * None of that is "an emit with no listener" or "a caller that was never
 * wired", which is what a dangling-hook gap claims. Named contract hooks
 * (event/IPC/HTTP, e.g. copilot.prompt.reply, loom.hook.declare) keep the
 * original rules unchanged.
 */

/** A hook derived from the require graph: `<component_id>.import|.export`, type direct. */
function isDerivedHook(n) {
  return !!n && n.type === 'direct' && !!n.component_id &&
    (n.id === `${n.component_id}.import` || n.id === `${n.component_id}.export`);
}

/**
 * classify(graph) -> { dangling: [node + {isOrphanOut}], derivedUnwired, liveIds, byId }
 *   dangling       — contract hooks with no wire, same rules as before 0.39.260
 *   derivedUnwired — count of require-graph hooks with no wire (not gaps)
 */
function classify(graph) {
  const nodes = (graph && graph.nodes) || [];
  const edges = (graph && graph.edges) || [];
  const wiredFrom = new Set(edges.map(e => e.from));
  const wiredTo   = new Set(edges.map(e => e.to));
  const dangling = [];
  let derivedUnwired = 0;
  for (const node of nodes) {
    if (!node.direction) continue; // components have no direction; only hooks do
    // A webserver/api in-hook is called by an external client (a browser), so
    // nothing inside the declared graph wires into it (§CORRECTED 2026-07-11).
    const isEntryPoint = node.direction === 'in' && (node.type === 'webserver' || node.type === 'api');
    const isOrphanOut = node.direction === 'out' && !wiredFrom.has(node.id);
    const isOrphanIn  = node.direction === 'in'  && !isEntryPoint && !wiredTo.has(node.id);
    if (!isOrphanOut && !isOrphanIn) continue;
    if (isDerivedHook(node)) { derivedUnwired++; continue; }
    dangling.push({ ...node, isOrphanOut });
  }
  return {
    dangling, derivedUnwired,
    liveIds: new Set(nodes.map(n => n.id)),
    byId: new Map(nodes.map(n => [n.id, n])),
  };
}

/** Why a previously-open dangling-hook gap no longer qualifies, or null if it still does. */
function closeReason(hookId, cls) {
  if (cls.dangling.some(n => n.id === hookId)) return null;
  if (!cls.liveIds.has(hookId)) return 'hook no longer in the loom registry';
  if (isDerivedHook(cls.byId.get(hookId))) return 'require-graph hook (derived from source, not a declared contract)';
  return 'hook is now wired';
}

module.exports = { isDerivedHook, classify, closeReason };
