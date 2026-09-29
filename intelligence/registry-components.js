'use strict';
/**
 * intelligence/registry-components.js
 * comp_id: nexus.intelligence.registry
 * uuid: nexus-intelligence-registry-v1-0000-2026-0822-jamesbrooks-001
 * Matches emerge/registry-components.js's exact, established pattern —
 * checked directly before building this, not assumed.
 */
const V = '1.0.0'; const NS = 'intelligence';
function _c(id, method, path, desc, opts = {}) {
  return {
    id: `${NS}.${id}`, namespace: NS, name: id, version: V,
    grammar: opts.grammar || [id.replace(/\./g, ' '), 'intelligence ' + id.split('.')[0]],
    route: { method, path }, description: desc,
    params: opts.params || [], tags: [NS, ...(opts.tags || [])],
    permissions: opts.permissions || ['system'], hooks: opts.hooks || {},
  };
}
module.exports = [
  _c('health',       'GET',  '/health',                            'Intelligence system health'),
  _c('topo-kernel',  'GET',  '/api/intelligence/topo-kernel/stats', 'Sovereign SISO topology kernel — signal/field/shape/trust stats'),
  _c('telemetry',    'GET',  '/api/intelligence/telemetry/status',  'Telemetry-codec runtime module status'),
  _c('patterns',     'GET',  '/api/intelligence/patterns',          'Crystallised behavioral patterns'),
  _c('context',      'GET',  '/api/intelligence/context',           'Assembled intelligence context'),
  _c('status',       'GET',  '/api/intelligence/status',            'Intelligence subsystem health'),
  // §0.39.282 — served by intelligence/index.js since the 2026-09-19 move, never declared (test-intelligence-organs-move IOM-007).
  _c('event',        'POST', '/api/intelligence/event',             'Feed an event for immediate analysis (event_log row + failure scan on errors)'),
  _c('failures',     'GET',  '/api/intelligence/failures',          'Failure mode index'),
  _c('reuse',        'GET',  '/api/intelligence/reuse',             'Reuse index'),
  _c('map',          'GET',  '/api/intelligence/map',               'Real, live loom map'),
  _c('adversarial',  'POST', '/api/adversarial',                    'Inner-critic: reconcile intuition vs mastermind'),
  // §BUILT 2026-09-19 — routes moved here from cortex (cortex->intelligence consolidation).
  _c('intuition',    'POST', '/api/intelligence/intuition',        'INTUITION fast-path answer', {tags:['cognition'],
    hooks:{out:[{id:'intelligence.intuition.answer',wires_to:['copilot.prompt.receive_result'],tags:['answer']}]}}),
  _c('mastermind',   'POST', '/api/intelligence/mastermind',       'MASTERMIND strategic/causal analysis', {tags:['cognition']}),
  _c('mastermind.patterns', 'POST', '/api/intelligence/mastermind/patterns', 'Recurring causal-shape detection (RFR2 delta engine)', {tags:['cognition']}),
  _c('faculties.adversarial', 'POST', '/api/intelligence/adversarial', 'Inner-critic over intuition vs mastermind (cortex-compatible path)', {tags:['cognition']}),
  _c('rca',          'GET',  '/api/intelligence/rca',              'Root cause analysis entries over open gaps'),
  _c('query',        'GET',  '/api/intelligence/query',            'Unified query surface: what is happening with <about>'),
  _c('lattice',      'GET',  '/api/intelligence/lattice',          'System associative lattice: co-activation neighbours/clusters'),
  _c('liminal-space.status', 'GET', '/api/liminal-space/status',   'Liminal-space status: unresolved in-between items per focal point'),
  _c('liminal-space.list',   'GET', '/api/liminal-space/list',     'Liminal-space items (optionally by focalPoint)'),
  _c('bus',          'POST', '/api/intelligence/bus',              'Allowlisted event intake for in-process organs (liminal-space)'),
  _c('crystals',     'GET',  '/api/intelligence/crystals',         'Crystals-derived pattern list (precursor/outcome/count/confidence)'),
  _c('cfr.field',    'GET',  '/cfr/field',                          'CFR field state (coherence/friction/resonance/entropy)'),
  _c('cfr.health',   'GET',  '/cfr/health',                         'CFR ledger health'),
  _c('cfr.events',   'GET',  '/cfr/events',                         'CFR event ledger, tail', { tags: ['ledger'] }),
  _c('cfr.sse',      'GET',  '/cfr/sse',                            'Real-time CFR event stream', { tags: ['sse'] }),
  _c('framework.create', 'POST', '/api/framework/create',           'Generate a real WARP-based framework skeleton', {
    tags: ['build'],
    hooks: { in: [{ id: 'intelligence.framework.receive', intent: ['create', 'build', 'framework'], tags: ['framework-builder'] }] },
  }),
  _c('sse',          'GET',  '/sse',                                'General intelligence event stream', { tags: ['sse'] }),
  _c('commands',     'GET',  '/api/commands',                       'Real, dynamic command list — this registry, live'),
  _c('commands.history', 'GET', '/api/commands/history',            'Real, persistent, queryable log of every command actually invoked — distinct from the static list above'),

  // §BUILT — first HTTP surface for previously-unwired intelligence submodules.
  _c('liminal.analyze', 'POST', '/api/intelligence/liminal/analyze', 'Liminal — 12 domain-agnostic gap detectors (code/assumption/contrastive/structural/shadow/negative_space/relational/oscillatory/existential/field/music/reversal)', {tags:['gap-detection']}),
  _c('gap.status',   'GET',  '/api/intelligence/gap/status',      'Gap-lifecycle ledger stats + registered predicate types', {tags:['gap-detection']}),
  _c('gap.hunt',     'POST', '/api/intelligence/gap/hunt',        'GapHunter v3 — 8-type gap taxonomy applied to a text', {tags:['gap-detection']}),
  _c('gap.enrich',   'POST', '/api/intelligence/gap/enrich',      'Attach a checkable predicate + truth-floor to a raw gap', {tags:['gap-detection']}),
  _c('gap.verify',   'POST', '/api/intelligence/gap/verify',      'Verify closure of a gap (predicate + artifact, both required)', {tags:['gap-detection']}),
  _c('bda.status',   'GET',  '/api/intelligence/bda/status',      'Behavioral Drift Analyzer — current per-role pendulum/regime state', {tags:['cognition']}),
  _c('bda.observe',  'POST', '/api/intelligence/bda/observe',     'Feed one utterance to BDA — signals, regime, drift/gap events', {tags:['cognition']}),
  _c('bda.reset',    'POST', '/api/intelligence/bda/reset',       'Reset BDA session state', {tags:['cognition']}),
  _c('causal.anomalies', 'GET', '/api/intelligence/causal/anomalies', 'Anomaly Engine — missing/unexpected event, timeout, causal_gap, path_mismatch', {tags:['causal']}),
  _c('causal.compound',  'POST','/api/intelligence/causal/compound',  'Compounding Effects Engine — classify ripple/wave/tidal cascades from a ledger entry', {tags:['causal']}),
  _c('alk.stats',      'GET',  '/api/intelligence/alk/stats',      'ALK — decision counts by actor/intent, reversal count', {tags:['alk']}),
  _c('alk.decisions',  'GET',  '/api/intelligence/alk/decisions',  'ALK — query decisions by actor/intent/time window', {tags:['alk']}),
  _c('alk.ancestors',  'GET',  '/api/intelligence/alk/ancestors',  'ALK — causedBy chain, nearest-first', {tags:['alk']}),
  _c('alk.descendants','GET',  '/api/intelligence/alk/descendants','ALK — decisions caused by this one', {tags:['alk']}),
  _c('alk.record',     'POST', '/api/intelligence/alk/record',     'ALK — record a decision node {actor,intent,payload,causedBy}', {tags:['alk']}),
  _c('alk.resolve',    'POST', '/api/intelligence/alk/resolve',    'ALK — attach an outcome to a decision', {tags:['alk']}),
  _c('alk.rewind',     'POST', '/api/intelligence/alk/rewind',     'ALK — control-Z a decision (immutable original, reversedBy marker)', {tags:['alk']}),
  _c('perception',     'GET',  '/api/intelligence/perception',     'ALK-Perception — composite behavioral state (COGNITIVE_LOAD/GENUINE_FLOW/CONCEALMENT/etc) from live CFR+gap telemetry', {tags:['perception']}),
  _c('telemetry.frame','GET',  '/api/intelligence/telemetry/frame','Telemetry-codec Slope/Stability/Oscillation/Drift frame over the CFR field\'s own 4 dimensions', {tags:['telemetry']}),
  _c('rfr2.stats',   'GET', '/api/intelligence/rfr2/stats',       'RFR2 live kernel stats — event/edge counts since this process started listening', {tags:['rfr2']}),
  _c('rfr2.query',   'GET', '/api/intelligence/rfr2/query',       'RFR2 Causal Query Language (CQL) — FIND events|edges|chains WHERE ...', {tags:['rfr2']}),
  _c('rfr2.trace',   'GET', '/api/intelligence/rfr2/trace',       'RFR2 relationship traversal — trace an event to its causal root', {tags:['rfr2']}),
  _c('rfr2.descendants','GET','/api/intelligence/rfr2/descendants','RFR2 relationship traversal — all events caused by this one', {tags:['rfr2']}),
  _c('rfr2.children','GET', '/api/intelligence/rfr2/children',    'RFR2 relationship traversal — direct children of an event', {tags:['rfr2']}),
];
