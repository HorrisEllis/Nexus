'use strict';
/**
 * hooks/cortex.hooks.js — Cortex System Hook Map
 * UUID: cortex-hooks-map-v1-0000-4000
 * Status: pre-release
 * System: Cortex :3748
 * Status: living
 */

const CORTEX_HOOKS = [
  {
    id: 'cx-hook-event-ingest-0001', name: 'cortex-event-ingest',
    intent: 'Receive events from all systems and write them to JAA event_log so nothing is lost',
    type: 'api', direction: 'sink',
    from: { surface:'*', layer:0 }, to: { surface:'cortex', layer:1, port:3748 },
    ui: { panel:'CORTEX > EVENTS', element:'Event ledger rows', action:'POST /api/event' },
    config: { path:'/api/event', method:'POST', schema:'{ type, payload, source, causedBy?, ts }' },
    contract: { axioms:['§2.1','§1.2'], sideEffects:['jaa.insert("event_log")','sigma.record()','delta.record()'], idempotent:false, replayable:true },
    references: { files:['cortex/foundation/admin-server.js → POST /api/event'] },
    seam: null, status:'active', updatedAt:'2026-06-11T17:30:00Z',
  },
  {
    id: 'cx-hook-intelligence-context-0002', name: 'cortex-intelligence-context',
    intent: 'Return pre-request context (failure modes, reuse candidates, patterns) so agents never start cold',
    type: 'api', direction: 'bidirectional',
    from: { surface:'*', layer:0 }, to: { surface:'cortex', layer:1, port:3748 },
    ui: { panel:'CORTEX > INTELLIGENCE > STATUS', element:'Intelligence status panel', action:'GET /api/intelligence/context' },
    config: { path:'/api/intelligence/context', queryParams:['intent','command','provider'], timeout:3000 },
    contract: { axioms:['§CC-001','§US-04'], sideEffects:[], idempotent:true },
    references: { files:['cortex/intelligence/index.js → getContext()', 'cortex/foundation/admin-server.js → registerIntelligence()'] },
    seam: { componentId:'cortex-intelligence-context-query', intentId:'return-pre-request-context-to-agents' },
    status:'active', updatedAt:'2026-06-11T17:30:00Z',
  },
  {
    id: 'cx-hook-snapshot-create-0003', name: 'cortex-snapshot-create',
    intent: 'Archive full JAA table state to a .nex snapshot so the system can rewind to any prior state',
    type: 'api', direction: 'unidirectional',
    from: { surface:'orchestrator', layer:1 }, to: { surface:'cortex', layer:1 },
    ui: { panel:'CORTEX > SNAPSHOTS', element:'Snapshot list + Create button', action:'POST /api/snapshots/create' },
    config: { path:'/api/snapshots/create', method:'POST', schema:'{ message? }', returns:'{ ok, snapId }' },
    contract: { axioms:['§2.1','§2.3'], sideEffects:['writes .nex file to data/snapshots/','jaa.insert("versionium_commits")'], idempotent:false, replayable:false },
    references: { files:['cortex/snapshot/index.js','cortex/foundation/admin-server.js → POST /api/snapshots/create'] },
    seam: null, status:'active', updatedAt:'2026-06-11T17:30:00Z',
  },
  {
    id: 'cx-hook-snapshot-rollback-0004', name: 'cortex-snapshot-rollback',
    intent: 'Restore all JAA tables to a prior snapshot state — the rewind button',
    type: 'api', direction: 'unidirectional',
    from: { surface:'orchestrator', layer:1 }, to: { surface:'cortex', layer:1 },
    ui: { panel:'CORTEX > SNAPSHOTS', element:'⏪ Rewind button on each snapshot row', action:'POST /api/snapshots/rollback' },
    config: { path:'/api/snapshots/rollback', method:'POST', schema:'{ snapId, apply:true }', warning:'restores JAA tables only — files on disk unchanged' },
    contract: { axioms:['§2.1'], sideEffects:['replaces all JAA table contents'], idempotent:false, replayable:false },
    references: { files:['cortex/snapshot/index.js → rollback()'] },
    seam: null, status:'active', updatedAt:'2026-06-11T17:30:00Z',
  },
  {
    id: 'cx-hook-jaa-memory-0005', name: 'cortex-jaa-memory-query',
    intent: 'Expose JAA table contents for browsing and search so the system is fully observable',
    type: 'api', direction: 'bidirectional',
    from: { surface:'*', layer:0 }, to: { surface:'cortex', layer:1 },
    ui: { panel:'CORTEX > MEMORY + CORTEX > TABLES', element:'Table selector, row browser, filter', action:'GET /api/memory?table=X&n=200' },
    config: { path:'/api/memory', queryParams:['table','n'], maxRows:500 },
    contract: { axioms:['§2.3'], sideEffects:[], idempotent:true },
    references: { files:['cortex/foundation/admin-server.js → GET /api/memory'] },
    seam: null, status:'active', updatedAt:'2026-06-11T17:30:00Z',
  },
  {
    id: 'cx-hook-gap-write-0006', name: 'cortex-gap-write',
    intent: 'Record a named gap in JAA so nothing is unnamed and all gaps are observable and actionable',
    type: 'api', direction: 'unidirectional',
    from: { surface:'*', layer:0 }, to: { surface:'cortex', layer:1 },
    ui: { panel:'CORTEX > GAPS', element:'Gap list with severity badges', action:'POST /api/gaps or event cortex.gap.found' },
    config: { path:'/api/gaps', method:'POST', schema:'{ type, severity, description, source, path?, body? }' },
    contract: { axioms:['§1.2','§F-GAP-01'], sideEffects:['jaa.insert("gaps")'], idempotent:false },
    references: { files:['cortex/foundation/admin-server.js → POST /api/gaps'] },
    seam: null, status:'active', updatedAt:'2026-06-11T17:30:00Z',
  },
  {
    id: 'cx-hook-self-heal-0007', name: 'cortex-self-heal',
    intent: 'Trigger autonomous gap analysis and patch generation so the system repairs itself without operator intervention',
    type: 'gate', direction: 'unidirectional',
    from: { surface:'cortex-healer', layer:1 }, to: { surface:'cortex', layer:1 },
    ui: { panel:'CORTEX > SELF-HEAL', element:'HEAL button + self-heal status', action:'POST /api/self-heal/run' },
    config: { path:'/api/self-heal/run', scanInterval:'30s', maxPatchesPerRun:3 },
    contract: { axioms:['§1.2','§HEALER-01'], sideEffects:['opens gaps','emits cortex.healer.patched','may dispatch guardian jobs'], idempotent:false },
    references: { files:['cortex/healer/index.js','cortex/self-heal/index.js'] },
    seam: null, status:'active', updatedAt:'2026-06-11T17:30:00Z',
  },
];

module.exports = {
  systemId:'cortex', port:3748, version:'3.0.0', updatedAt:'2026-06-11T17:30:00Z', hooks:CORTEX_HOOKS,
  byId:(id)=>CORTEX_HOOKS.find(h=>h.id===id), byName:(n)=>CORTEX_HOOKS.find(h=>h.name===n),
  byType:(t)=>CORTEX_HOOKS.filter(h=>h.type===t), withSEAM:()=>CORTEX_HOOKS.filter(h=>h.seam!==null), active:()=>CORTEX_HOOKS.filter(h=>h.status==='active'),
};
