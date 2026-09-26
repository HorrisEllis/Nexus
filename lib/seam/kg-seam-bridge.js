'use strict';
/**
 * lib/seam/kg-seam-bridge.js — KG → Seam Registry Bridge
 * UUID: nexus-seam-kg-bridge-v1-0000-2026-0705-jamesbrooks-001
 * Version: 1.0.0
 *
 * The missing link identified against runtime.spec: emerge/compiler already
 * turns a .spec file's `modules:`/`schemas:` arrays into a real
 * KnowledgeGraph with computed specDepth/generationReadiness/confidence/
 * blastRadius/deps per node (kg-builder.js), and tier-contract.js already
 * decides T0/T1/T2/SKIP/BLOCKED/MISSING per node from that graph. Neither
 * of those emits a seam record — lib/seam/spec-parser.js's SEAMQueue
 * pipeline (ollama → chatgpt escalation, sigma/delta Detector scoring)
 * never receives per-module units, because nothing bridges the two.
 *
 * This is that bridge. It does not re-parse the spec — it reads the
 * *already-computed* graph + tierMap that emerge/compiler/pipeline.js's
 * compile() returns, and emits one seam record per KGNode, in the same
 * comp_id/seam_uuid/contract shape already used for MOD-TIER-CONTRACT.
 *
 * §1.1 — nothing here re-derives readiness/tier. Those numbers already
 *        exist, computed once, by kg-builder.js and tier-contract.js.
 *        Re-deriving them here would be a second source of truth — the
 *        exact drift risk that caused the SEAM_001 comp_id mismatch.
 * §CC-002 — T0/T1 nodes call zero LLM APIs. buildSeamRegistry() carries
 *        that forward as `requiresLLM` on every record — ClassifyGate
 *        (lib/seam/gates.js) is what actually enforces it: T0/T1 records
 *        route to `seam.mechanical` and never reach a dispatchable state.
 */

let _seamCounter = 0;
function _compId(name) {
  _seamCounter += 1;
  return `comp_${name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${String(_seamCounter).padStart(4, '0')}`;
}

/**
 * buildSeamRecord — one KGNode + its TierDecision → one seam record.
 * Pure function of its inputs — same node+decision always yields the
 * same record shape (only comp_id's counter differs across processes;
 * callers that need a stable comp_id should pass one in via opts.compId).
 */
function buildSeamRecord(node, decision, opts = {}) {
  if (!node || !node.id) {
    throw new Error('[kg-seam-bridge] buildSeamRecord: node.id is required');
  }

  const seam_id   = node.id;                     // MOD-TIER-CONTRACT
  const seam_uuid = node.uuid || `no-uuid:${node.id}`;
  const comp_id   = opts.compId || _compId(node.name || node.id);

  return {
    seam_id,
    file:        opts.file || 'runtime.spec',
    comp_id,
    comp_type:   node.kind === 'schema' ? 'SCHEMA' : 'MODULE',
    seam_uuid,
    version:     opts.version || '1.0.0',

    // ── identity fields carried straight through, not re-derived ──────────
    name:                node.name,
    description:         node.description,
    specDepth:           node.specDepth,
    effectiveSpecDepth:  node.effectiveSpecDepth,
    generationReadiness: node.generationReadiness,
    confidence:          node.confidence,
    isBlack:             node.isBlack,

    // ── the actual contract a dispatched agent must satisfy ───────────────
    contract: {
      exports:              node.exports || [],
      gate_pipeline:         node.gatePipeline || [],
      behavioral_contracts:  node.behavioralContracts || [],
      error_paths:           node.errorPaths || [],
    },

    // ── tier decision, straight from tier-contract.js — never re-decided ──
    decision: decision ? {
      tier:        decision.tier,
      action:      decision.action,
      label:       decision.label,
      reason:      decision.reason,
      readiness:   decision.readiness,
      requiresLLM: !!decision.requiresLLM,
      emits:       decision.emits || [],
    } : null,

    // ── the DAG — this is Idearium's torrent piece-map, unmodified ────────
    deps:        (node.deps || []).map(d => d.id || d.name),
    downstream:  (node.blastRadius || []).map(d => d.id || d.name),

    gaps:        node.gaps || [],
    generatedAt: Date.now(),
  };
}

/**
 * buildSeamRegistry — walk a compile() result's graph + tierMap and emit
 * one seam record per node. `compileResult` is exactly what
 * emerge/compiler/pipeline.js's compile() returns — no adaptation needed
 * on the caller's side.
 */
function buildSeamRegistry(compileResult, opts = {}) {
  if (!compileResult || !compileResult.graph || !compileResult.tierMap) {
    throw new Error('[kg-seam-bridge] buildSeamRegistry requires {graph, tierMap} — pass emerge compile() output directly');
  }

  // tierMap is { t2: [{node, decision}], t1: [...], t0: [...], skip: [...],
  // blocked: [...], missing: [...] } — flatten it back to one lookup by id.
  const decisionById = new Map();
  for (const bucket of Object.values(compileResult.tierMap)) {
    for (const entry of bucket) {
      decisionById.set(entry.node.id, entry.decision);
    }
  }

  const records = [];
  for (const [id, node] of compileResult.graph.nodes) {
    const decision = decisionById.get(id) || null;
    records.push(buildSeamRecord(node, decision, {
      file:    opts.file || compileResult.moduleName ? `${compileResult.moduleName}.spec` : undefined,
      version: opts.version,
    }));
  }
  return records;
}

module.exports = { buildSeamRecord, buildSeamRegistry };
