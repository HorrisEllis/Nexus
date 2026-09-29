'use strict';
/**
 * cortex/registry-components.js
 * comp_id: nexus.cortex.registry
 * uuid: nexus-cortex-registry-v1-0000-2026-0627-jamesbrooks-001
 */
const V = '3.6.0'; const NS = 'cortex';   // 0.39.282: 3.5.0 -> 3.6.0 (raid status route, /sse broadcast, officiator via RAID). §5.4 fix 2026-08-08 — was 3.2.0, drifted from canonical lib/version.js's services.cortex (3.5.0)
function _c(id, method, path, desc, opts={}) {
  return { id:`${NS}.${id}`, namespace:NS, name:id, version:V,
    grammar: opts.grammar||[id.replace(/\./g,' ')],
    route:{method,path}, description:desc,
    params:opts.params||[], tags:[NS,...(opts.tags||[])],
    permissions:opts.permissions||['system'], hooks:opts.hooks||{} };
}
module.exports = [
  // ── Health ─────────────────────────────────────────────────────────────
  _c('health',                'GET',  '/health',                       'Cortex health + JAA stats'),
  _c('contract',              'GET',  '/contract',                     'Cortex interaction contract'),
  _c('events',                'GET',  '/events',                       'SSE — all cortex events', {tags:['stream']}),
  // ── Memory ─────────────────────────────────────────────────────────────
  _c('memory.browse',         'GET',  '/api/memory',                   'Browse any JAA table', {tags:['memory']}),
  _c('memory.insert',         'POST', '/api/memory/insert',            'Insert row into any JAA table', {tags:['memory'],
    hooks:{in:[{id:'cortex.memory.insert.receive',intent:['persist','write','log'],contract:'nexus-interaction-contract-v1::cortex',tags:['memory']}]}}),
  _c('memory.search',         'POST', '/api/memory/search',            'Semantic search across memory', {tags:['memory']}),
  _c('memory.forget',         'POST', '/api/memory/forget',            'Archive memory row (never delete)', {tags:['memory']}),
  _c('memory.working',        'GET',  '/api/memory/working',           'Working memory snapshot'),
  // ── Gaps ───────────────────────────────────────────────────────────────
  _c('gaps.list',             'GET',  '/api/gaps',                     'Open gaps by severity'),
  _c('gaps.open',             'POST', '/api/gaps',                     'Open a new gap', {tags:['gaps']}),
  // ── Events / CFR ───────────────────────────────────────────────────────
  _c('events.log',            'GET',  '/api/events',                   'Query event log'),
  _c('events.write',          'POST', '/api/event',                    'Write event to JAA event_log', {tags:['ledger']}),
  // Intelligence routes (status/context/patterns/failures/rca/reuse/event/intuition/mastermind)
  // moved to the sovereign intelligence system 2026-09-19 — registered by
  // intelligence/registry-components.js and announced to RAID by intelligence/server.js.
  // (intelligence.predict and intelligence.confidence were registered here but NEVER had a
  // handler in cortex/boot.js — phantom capabilities, dropped rather than moved.)
  // ── RAID ───────────────────────────────────────────────────────────────
  _c('raid.decide',           'POST', '/api/raid/decide',              'Route intent to best agent/component', {
    tags:['routing'],
    hooks:{
      in:[{id:'cortex.raid.receive',intent:['build','ask','forge','classify'],contract:'nexus-interaction-contract-v1::cortex',tags:['raid']}],
      out:[{id:'cortex.raid.feedback',wires_to:['ollama.jobs.dispatch.receive','guardian.job.dispatch.receive'],tags:['routing']}],
    }}),
  _c('raid.health',           'GET',  '/api/raid/health',              'RAID agent health + weights'),
  // ── Snapshots ──────────────────────────────────────────────────────────
  _c('snapshot.list',         'GET',  '/api/snapshots',                'Snapshot list'),
  _c('snapshot.create',       'POST', '/api/snapshots/create',         'Create snapshot', {tags:['snapshot']}),
  _c('snapshot.rollback',     'POST', '/api/snapshots/rollback',       'Rollback to snapshot', {tags:['snapshot']}),
  // ── Versionium ─────────────────────────────────────────────────────────
  // §0.39.271 V1 — kept, not deleted (§0.3): cortex answers this with "moved to versionium
  // :3754" since §VS1. The list lives at versionium GET /api/versionium/history.
  _c('versionium.log',        'GET',  '/api/versionium/log',           'MOVED to versionium :3754 GET /api/versionium/history — cortex answers with a moved notice'),
  // ── Chat log ───────────────────────────────────────────────────────────
  _c('chat.log',              'GET',  '/api/chat-log',                 'Co-pilot conversation log'),
  // ── Search ─────────────────────────────────────────────────────────────
  _c('search',                'GET',  '/api/search',                   'Cross-table search'),
  _c('search.context',        'POST', '/api/search/context',           'Context assembly for search query'),
  // ── Tags ───────────────────────────────────────────────────────────────
  _c('tags.list',             'GET',  '/api/tags',                     'All tags in memory'),
  _c('tags.add',              'POST', '/api/tags',                     'Add tag'),
];
