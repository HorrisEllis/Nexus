'use strict';
/**
 * lib/pipeline-nodes.js — 0.60.162: the build pipeline's units as persisted nodes (.phase, .graph, .gate).
 * comp_id: nexus.lib.pipeline-nodes
 *
 * James, 2026-10-19: "it should all be persistent." · "look at the node taxonomy." The phasemap text, the dependency graph
 * (DG2) and the contract gates (GM1) were in-memory or loose files; the node taxonomy had chunk/run/step_gate/contract/response
 * but not phase/graph/gate. These builders turn each into a node-export envelope (lib/node-export.js), so a plan, its graph and
 * its gates survive a restart, show in the store, and the dag can be read per phase/contract/spec/chunk.
 *
 *   phaseNode({ id, map, repo, layer, status, files, depends_on, blocks, spec, graph }) → envelope (type .phase)
 *   graphNode(graph, { repo, kind }) → envelope (type .graph) — graph is lib/phase-graph.js graphFor()'s result
 *   gateNode({ gate, contract, repo, status, packetHash, context, response, evidence, at, attempts }) → envelope (type .gate)
 *
 * Builders only — the caller writes them through lib/node-export.js exportToFile / a system's node registry. No side effects.
 */
const NE = require('./node-export.js');

const MODULE_ID = 'nexus.lib.pipeline-nodes';
const VERSION = '1.0.0';

const _id = (s) => String(s || '').replace(/[^\w.:-]+/g, '_').slice(0, 120);
const _arr = (v) => Array.isArray(v) ? v : (v == null ? [] : [v]);

/** a phasemap phase as a .phase node */
function phaseNode({ id, map, repo = null, layer = null, status = 'OPEN', files = [], depends_on = [], blocks = [], spec = null, graph = null } = {}) {
  if (!id || !map) throw new Error('phaseNode: id and map are required');
  const nid = `${_id(map)}::${_id(id)}`;
  return NE.wrap('phase', nid, {
    id, map, repo, layer, status,
    files: _arr(files).map(String), depends_on: _arr(depends_on).map(String), blocks: _arr(blocks).map(String),
    spec, graph,
  }, { system: repo ? null : 'idearium', context: `pipeline phase ${id} of ${map}`, summary: `${id} (${layer || '?'}) — ${_arr(files).length} file(s)` });
}

/** a dependency graph (DG2) as a .graph node — from lib/phase-graph.js graphFor() */
function graphNode(graph = {}, { repo = null, kind = 'phase' } = {}) {
  const forId = graph.phase || graph.for || graph.contract || graph.id;
  if (!forId) throw new Error('graphNode: the graph names nothing it is for');
  if (!graph.hash) throw new Error('graphNode: the graph has no hash');
  const nid = `${kind}:${_id(forId)}:${graph.hash}`;
  const nodes = _arr(graph.nodes).map(n => ({ path: n.path, role: n.role, exists: n.exists !== false, system: n.system || null }));
  return NE.wrap('graph', nid, {
    for: forId, kind, repo, hash: graph.hash,
    nodes, edges: _arr(graph.edges), crossings: _arr(graph.crossings), ready: graph.ready !== false,
    // §2026-10-20 PS1 (docs/substrate.spec MOD-PHASE-SPECS) — the phase's place in the whole DAG (phase-dag slice) was attached
    // by the build (0.60.172) but dropped here, so the persisted node lost it
    ...(graph.dag ? { dag: graph.dag } : {}),
  }, { system: repo ? null : 'idearium', context: `dependency graph of ${kind} ${forId}`, summary: `${nodes.length} node(s), ${_arr(graph.crossings).length} crossing(s)${graph.ready === false ? ' — not ready' : ''}` });
}

/** a contract gate record (GM1) as a .gate node */
function gateNode({ gate, contract = null, repo = null, status, packetHash = null, context = [], response = null, evidence = [], at = {}, attempts = 0 } = {}) {
  if (!gate) throw new Error('gateNode: gate (the gate key) is required');
  if (!status) throw new Error('gateNode: status is required');
  return NE.wrap('gate', _id(gate), {
    gate, contract, repo, status, packetHash,
    context: _arr(context), response, evidence: _arr(evidence), at: at || {}, attempts: Number(attempts) || 0,
  }, { system: repo ? null : 'cortex', context: `gate ${gate} — ${status}`, summary: `${gate}: ${status} (attempt ${attempts || 0})` });
}

/**
 * writeNode(envelope, destDir) -> the file path written (destDir/<id>.<type>).
 * The builders above already wrap through node-export (NE.wrap), so this writes the finished envelope
 * directly with NE.toYaml — calling NE.exportToFile would wrap the envelope a second time. Overwrite is
 * correct here: a .graph is keyed by its hash (immutable), and a .phase / .gate records a lifecycle whose
 * latest state must be the one on disk (same reasoning as idearium/lib/chunk-nodes.js §OVERWRITE IS CORRECT).
 * §1.2: a failure is returned, never thrown into the build — the pipeline node is observability, not the build.
 */
function writeNode(envelope, destDir) {
  const fs = require('fs'); const path = require('path');
  NE.validate(envelope);
  fs.mkdirSync(destDir, { recursive: true });
  const filePath = path.join(destDir, `${NE.fileIdOf(envelope.id)}.${envelope.type}`);   // §0.60.170 RC3 — Windows-safe, the one mapping
  fs.writeFileSync(filePath, NE.toYaml(envelope), 'utf8');
  return filePath;
}

module.exports = { MODULE_ID, VERSION, phaseNode, graphNode, gateNode, writeNode };
