'use strict';
/**
 * lib/agent-tools/tools/meta-query.js — copilot's access to meta's real
 * analytical subsystems.
 * comp_id: nexus.lib.agent-tools.tools.meta-query
 * UUID: nexus-tool-meta-query-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12 (P9 of docs/copilot-full-capability-phasemap.spec).
 * Real export inventory done BEFORE wrapping, not assumed — grepped every
 * module.exports across all 11 meta/ subsystems first. Result:
 *
 * §HONEST SCOPE, decided from that inventory —
 *   WRAPPED (7): alk, alk-perception, bda, cfr, gap, lattice, liminal — each
 *     has a real, callable, pure/side-effect-bounded function this tool
 *     exposes directly (§16.5 — wrap, don't reimplement).
 *   DELIBERATELY NOT WRAPPED (1): rfr2 — already reachable through
 *     lib/agent-tools/tools/query-intelligence.js's "mastermind" action,
 *     which reaches it via mastermind.js's own lib/rfr2-bridge.js (that
 *     tool's own header: "no separate RFR2 action exists because RFR2 has
 *     no HTTP surface of its own"). Wrapping rfr2 here too would be exactly
 *     the second-path problem this whole session has repeatedly refused
 *     (§10.3) — same reasoning as raid_snr staying read-only for RAID.
 *   NOT YET WRAPPED (3): spatial, telemetry-codec, topo-kernel — their real
 *     exports are STATEFUL CLASSES (LatticeEngine, SigmaEngine,
 *     TelemetryRuntime, SlopeEngine, TopoKernel, SNREngine, SISOBus), not
 *     one-shot pure functions. Wrapping a class safely as a tool action
 *     needs instance lifecycle management (create/use/dispose), the same
 *     shape cos_simulate's LabManager needed — a real, separate piece of
 *     work, not a same-session add-on to a pure-function query tool.
 *     Flagged honestly as remaining, not silently skipped.
 */

const ACTIONS = {
  alk_query: (a) => {
    const { query } = require('../../../../intelligence/alk/index.js');
    return { ok: true, result: query({ actor: a.actor, intent: a.intent, since: a.since, until: a.until, limit: a.limit }) };
  },
  alk_stats: () => {
    const { stats } = require('../../../../intelligence/alk/index.js');
    return { ok: true, result: stats() };
  },
  alk_perception_classify: (a) => {
    if (!a.telemetry) return { error: 'alk_perception_classify needs telemetry' };
    const { classify } = require('../../../../intelligence/alk-perception/index.js');
    return { ok: true, result: classify(a.telemetry) };
  },
  bda_compute: (a) => {
    if (!Array.isArray(a.observations)) return { error: 'bda_compute needs observations (array)' };
    const { compute } = require('../../../../intelligence/bda/index.js');
    return { ok: true, result: compute(a.observations) };
  },
  bda_detect: (a) => {
    if (!a.text) return { error: 'bda_detect needs text' };
    const { detect } = require('../../../../intelligence/bda/index.js');
    return { ok: true, result: detect(a.text, a.signals || {}, a.role) };
  },
  cfr_sigma: (a) => {
    if (!a.event) return { error: 'cfr_sigma needs event' };
    const { computeSigma } = require('../../../../intelligence/cfr/index.js');
    return { ok: true, result: computeSigma(a.event, a.baseline || {}, a.cfrState || {}, a.intervalMs || 0) };
  },
  cfr_regime: (a) => {
    if (!a.field) return { error: 'cfr_regime needs field: { coherence, friction, resonance, entropy }' };
    const { computeRegime } = require('../../../../intelligence/cfr/index.js');
    return { ok: true, result: computeRegime(a.field) };
  },
  cfr_delta: (a) => {
    if (!a.prev || !a.curr) return { error: 'cfr_delta needs prev and curr' };
    const { computeDelta } = require('../../../../intelligence/cfr/index.js');
    return { ok: true, result: computeDelta(a.prev, a.curr) };
  },
  gap_analyze: (a) => {
    if (!a.text) return { error: 'gap_analyze needs text' };
    const hunter = require('../../../../intelligence/gap/hunter.js');
    return { ok: true, result: hunter.analyze(a.text, a.opts || {}) };
  },
  lattice_get_edge: (a) => {
    if (!a.from || !a.to) return { error: 'lattice_get_edge needs from and to' };
    const { getEdge } = require('../../../../intelligence/lattice/associative-lattice.js');
    return { ok: true, result: getEdge(a.from, a.to) };
  },
  liminal_analyze: (a) => {
    if (!a.input) return { error: 'liminal_analyze needs input' };
    const { analyze } = require('../../../../intelligence/liminal/index.js');
    return { ok: true, result: analyze(a.input, a.opts || {}) };
  },
};

module.exports = {
  name: 'meta_query',
  description:
    'Real analytical/perception subsystems: alk_query/alk_stats (causal ledger — record/resolve/rewind ' +
    'history), alk_perception_classify (telemetry -> state classification), bda_compute (pendulum regime ' +
    'from observations)/bda_detect (gap detection in text), cfr_sigma/cfr_regime/cfr_delta (causal field ' +
    'math — sigma, regime from coherence/friction/resonance/entropy, delta between two states), ' +
    'gap_analyze (the real gap-hunter — logical/evidential/temporal/etc gap taxonomy on a text), ' +
    'lattice_get_edge (associative lattice — real edge weight between two nodes), liminal_analyze ' +
    '(code/text/field/music/relational gap detection — the broadest analyzer). RFR2 is deliberately not ' +
    'here — reach it via nexus_intelligence\'s "mastermind" action, its one real bridge; a second path ' +
    'to it here would compete with that. spatial/telemetry-codec/topo-kernel are stateful engine classes, ' +
    'not one-shot functions — not yet wrapped, needs instance lifecycle management like cos_simulate has.',
  parameters: {
    type: 'object',
    properties: {
      action:      { type: 'string', enum: Object.keys(ACTIONS) },
      actor:       { type: 'string', description: 'for alk_query' },
      intent:      { type: 'string', description: 'for alk_query' },
      since:       { type: 'number', description: 'for alk_query' },
      until:       { type: 'number', description: 'for alk_query' },
      limit:       { type: 'number', description: 'for alk_query' },
      telemetry:   { type: 'object', description: 'for alk_perception_classify' },
      observations:{ type: 'array', description: 'for bda_compute' },
      text:        { type: 'string', description: 'for bda_detect, gap_analyze' },
      signals:     { type: 'object', description: 'for bda_detect' },
      role:        { type: 'string', description: 'for bda_detect' },
      event:       { type: 'object', description: 'for cfr_sigma' },
      baseline:    { type: 'object', description: 'for cfr_sigma' },
      cfrState:    { type: 'object', description: 'for cfr_sigma' },
      intervalMs:  { type: 'number', description: 'for cfr_sigma' },
      field:       { type: 'object', description: 'for cfr_regime — { coherence, friction, resonance, entropy }' },
      prev:        { type: 'object', description: 'for cfr_delta' },
      curr:        { type: 'object', description: 'for cfr_delta' },
      opts:        { type: 'object', description: 'for gap_analyze, liminal_analyze' },
      from:        { type: 'string', description: 'for lattice_get_edge' },
      to:          { type: 'string', description: 'for lattice_get_edge' },
      input:       { type: 'string', description: 'for liminal_analyze' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `meta_query ${args.action} failed: ${e.message}` }; }
  },
};
