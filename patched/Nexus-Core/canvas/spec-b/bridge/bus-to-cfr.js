// ═══════════════════════════════════════════════════
// NEXUS — Bus→CFR Bridge
// canvas/spec-b/bridge/bus-to-cfr.js
// UUID: nexus-canvas-cfr-bridge-0000-4000-000000000001
//
// Translates NEXUS bus events into CFR physics node
// mutations. CFR code (CrystalBall modules/ALK/modules/cfr/)
// is UNCHANGED — this is a pure bus subscriber.
//
// DESIGN:
//   The CFR renderer works with a node graph where each
//   node has: entropy (float 0-1), fidelity (float 0-1),
//   type (string), and optional visual state flags.
//
//   Entropy:  disorder/risk — rises on failure, falls on heal
//   Fidelity: alignment/trust — rises on pass, falls on gap
//
//   This module maintains a local node registry so it
//   can accumulate state across events rather than
//   blindly setting absolute values. All mutations are
//   clamped to [0, 1].
//
// AXIOMS: §5.7 (event bus only), §5.2 (bridge impl)
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const { uid } = require('../../memory/jaa-db');

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

class BusToCFR {
  constructor({ nexusKernel, cfr }) {
    this._nk  = nexusKernel;
    this._cfr = cfr;          // CFR renderer instance (from CrystalBall)
    this._nodes = new Map();  // nodeId → { entropy, fidelity, type, state }
  }

  attach() {
    const nk = this._nk;

    // ── Gate events ──────────────────────────────────
    nk.on('gate.passed', e => {
      const id = e.payload?.nodeId ?? e.payload?.manifestNodeId;
      if (id) this._mutate(id, { fidelity: +0.2, type: 'gate' }, e.id);
    });

    nk.on('gate.failed', e => {
      const id = e.payload?.nodeId ?? e.payload?.manifestNodeId;
      if (id) this._mutate(id, { entropy: +0.5, type: 'gate_fail' }, e.id);
    });

    // ── Gap events ────────────────────────────────────
    nk.on('gap.found', e => {
      const id = e.payload?.uuid ?? e.payload?.manifestNodeId ?? uid();
      this._spawn(id, {
        entropy:  0.8,
        fidelity: 0.1,
        type:     'gap',
        sourceId: e.payload?.manifestNodeId,
        label:    e.payload?.type ?? 'gap',
      }, e.id);
    });

    // ── Healer events ─────────────────────────────────
    nk.on('healer.resolved', e => {
      const id = e.payload?.gapId ?? e.payload?.gap?.uuid;
      if (id) this._mutate(id, { entropy: -0.4, fidelity: +0.3 }, e.id);
    });

    nk.on('healer.exhausted', e => {
      const id = e.payload?.gapId ?? e.payload?.gap?.uuid;
      if (id) this._setFlag(id, 'red', e.id);
    });

    // ── Agent events ──────────────────────────────────
    nk.on('agent.response.received', e => {
      const id = e.payload?.agentId;
      if (id) this._pulse(id, 'attention', e.id);
    });

    nk.on('agent.rate_limited', e => {
      const id = e.payload?.agentId;
      if (id) this._mutate(id, { entropy: +0.3, type: 'agent_limited' }, e.id);
    });

    nk.on('usage.exhausted', e => {
      const id = e.payload?.agentId;
      if (id) this._expel(id, e.id);
    });

    // ── Manifest / Ollama ─────────────────────────────
    nk.on('manifest.ready', e => {
      this._fidelityField(e.id);
    });

    nk.on('ollama.ping.ok', e => {
      this._pulse('ollama', 'green', e.id);
    });

    nk.on('ollama.unavailable', e => {
      this._globalDrift(e.id);
    });

    // ── CrystalBall events ────────────────────────────
    nk.on('crystalball.crystal.formed', e => {
      this._spawn(`crystal-${e.payload?.crystalId ?? uid()}`, {
        entropy:  0.1,
        fidelity: 0.9,
        type:     'crystal',
        stable:   true,
        label:    `crystal (${e.payload?.fields?.length ?? 0} fields)`,
      }, e.id);
    });

    nk.on('crystalball.bep.matched', e => {
      const id = e.payload?.patternId;
      if (id) this._pulse(id, 'wires', e.id);
    });

    nk.on('crystalball.bep.degrading', e => {
      const id = e.payload?.patternId;
      if (id) this._mutate(id, { entropy: +0.2 }, e.id);
    });

    // ── Automation events ─────────────────────────────
    nk.on('automation.workflow.started', e => {
      const id = `workflow-${e.payload?.runId ?? uid()}`;
      this._spawn(id, { entropy: 0.3, type: 'workflow', label: e.payload?.name }, e.id);
    });

    nk.on('automation.workflow.complete', e => {
      const id = `workflow-${e.payload?.runId}`;
      const ok  = e.payload?.status === 'pass';
      this._mutate(id, { entropy: ok ? -0.3 : +0.2, fidelity: ok ? +0.3 : -0.1 }, e.id);
    });

    this._nk.emit('cfr_bridge.ready', {
      uuid: 'nexus-canvas-cfr-bridge-0000-4000-000000000001',
    });
  }

  // ── Mutation operations ────────────────────────────

  _mutate(id, delta, causedBy) {
    const node = this._ensure(id);
    if (delta.entropy  != null) node.entropy  = clamp(node.entropy  + delta.entropy);
    if (delta.fidelity != null) node.fidelity = clamp(node.fidelity + delta.fidelity);
    if (delta.type)             node.type     = delta.type;

    this._cfr?.updateNode?.(id, {
      entropy:  node.entropy,
      fidelity: node.fidelity,
      type:     node.type,
    });

    this._emitState(id, causedBy);
  }

  _spawn(id, props, causedBy) {
    const node = this._ensure(id);
    if (props.entropy  != null) node.entropy  = clamp(props.entropy);
    if (props.fidelity != null) node.fidelity = clamp(props.fidelity);
    if (props.type)             node.type     = props.type;
    if (props.label)            node.label    = props.label;
    if (props.stable  != null)  node.stable   = props.stable;

    this._cfr?.spawnNode?.({
      id,
      entropy:  node.entropy,
      fidelity: node.fidelity,
      type:     node.type,
      label:    node.label,
      stable:   node.stable,
      sourceId: props.sourceId,
    });

    this._emitState(id, causedBy);
  }

  _setFlag(id, flag, causedBy) {
    const node = this._ensure(id);
    node.flags = node.flags ?? new Set();
    node.flags.add(flag);

    if (flag === 'red') {
      node.entropy = 1.0;
      this._cfr?.setNodeRed?.(id);
    }

    this._emitState(id, causedBy);
  }

  _pulse(id, pulseType, causedBy) {
    this._ensure(id);
    if (pulseType === 'green')     this._cfr?.pulseGreen?.(id);
    else if (pulseType === 'wires') this._cfr?.wiresPulse?.(id);
    else                            this._cfr?.attentionPulse?.(id);
    this._emitState(id, causedBy);
  }

  _expel(id, causedBy) {
    this._nodes.delete(id);
    this._cfr?.expelNode?.(id);
    this._nk.emit('cfr_bridge.node_expelled', { nodeId: id }, { causedBy });
  }

  _fidelityField(causedBy) {
    this._cfr?.fidelityField?.();
    // Nudge all existing nodes toward higher fidelity
    for (const [id, node] of this._nodes) {
      node.fidelity = clamp(node.fidelity + 0.05);
    }
    this._nk.emit('cfr_bridge.fidelity_field', {}, { causedBy });
  }

  _globalDrift(causedBy) {
    this._cfr?.globalDrift?.();
    // Nudge all nodes toward higher entropy
    for (const [id, node] of this._nodes) {
      node.entropy = clamp(node.entropy + 0.1);
    }
    this._nk.emit('cfr_bridge.global_drift', {}, { causedBy });
  }

  _ensure(id) {
    if (!this._nodes.has(id)) {
      this._nodes.set(id, { id, entropy: 0.3, fidelity: 0.5, type: 'node' });
    }
    return this._nodes.get(id);
  }

  _emitState(id, causedBy) {
    const node = this._nodes.get(id);
    if (!node) return;
    this._nk.emit('crystalball.cfr.updated', {
      nodeId:   id,
      entropy:  node.entropy,
      fidelity: node.fidelity,
      type:     node.type,
    }, { causedBy });
  }

  // ── Admin / debug ─────────────────────────────────
  get nodeSnapshot() {
    const out = {};
    for (const [id, node] of this._nodes) out[id] = { ...node };
    return out;
  }

  get stats() {
    const nodes = [...this._nodes.values()];
    return {
      totalNodes:    nodes.length,
      highEntropy:   nodes.filter(n => n.entropy  > 0.7).length,
      highFidelity:  nodes.filter(n => n.fidelity > 0.7).length,
      stableNodes:   nodes.filter(n => n.stable).length,
    };
  }
}

module.exports = { BusToCFR };
