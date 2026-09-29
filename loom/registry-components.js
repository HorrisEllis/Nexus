'use strict';
/**
 * loom/registry-components.js
 * comp_id: nexus.loom.registry
 * uuid: nexus-loom-registry-v1-0000-2026-0725-001
 * Declares every LOOM capability to the orchestrator on boot.
 *
 * §2026-07-25 — loom is THE registry authority (builds and maps NEXUS, owns the
 * hook/wire/component registry) and yet registered `components: []` and had no
 * declaration file: 0 of its own capabilities in the registry. The mapmaker was
 * not on the map. This file declares loom's real routes (mirrored from its own
 * /health route list, loom/server.js:301-304) so loom appears in its own
 * registry and RAID can route to it. Bare-array export — matches the shape
 * guardian/architect/cortex use.
 */

const V = '1.5.1';
const NS = 'loom';
function _c(id, method, path, desc, opts = {}) {
  return {
    id: `${NS}.${id}`, namespace: NS, name: id, version: V,
    grammar: opts.grammar || [id.replace(/\./g, ' '), id.replace(/\./g, '-')],
    route: { method, path },
    description: desc,
    params:      opts.params || [],
    tags:        [NS, ...(opts.tags || [])],
    permissions: opts.permissions || ['system'],
  };
}

module.exports = [
  // ── Health / introspection ─────────────────────────────────────────────
  _c('health',            'GET',  '/health',                 'Loom health — hooks.total + components.total it owns'),

  // ── Hook registry (WRITE AUTHORITY) ────────────────────────────────────
  _c('hooks.list',        'GET',  '/api/hooks',              'List hooks — the registry loom is write authority for'),
  _c('hooks.create',      'POST', '/api/hooks',              'Create/update a hook (write authority)', { tags: ['write'] }),
  _c('hooks.wire',        'POST', '/api/hooks/wire',         'Wire a hook→hook binding (fromId→toId) — the consumer-edge write path', { tags: ['write', 'wire'] }),
  _c('hooks.unwire',      'POST', '/api/hooks/unwire',       'Remove a hook binding', { tags: ['write', 'wire'] }),

  // ── Component / seam registry ──────────────────────────────────────────
  _c('registry.get',      'GET',  '/api/registry/:kind/:id', 'Read a registry entry (component/seam/wire)'),
  _c('registry.put',      'POST', '/api/registry/:kind',     'Write a registry entry', { tags: ['write'] }),

  // ── Graph / impact (what the brain view + what-if read) ────────────────
  _c('graph',             'GET',  '/api/graph',              'The wire graph — nodes and edges of NEXUS'),
  _c('context.graph',     'GET',  '/api/context-graph',      'Context graph for a scope'),
  _c('impact',            'GET',  '/api/impact/:id',         'Blast-radius / impact query for a component', { tags: ['analysis'] }),

  // ── Build surfaces ─────────────────────────────────────────────────────
  _c('ingest',            'POST', '/api/ingest',             'Ingest a component descriptor into the registry', { tags: ['write'] }),
  _c('ingest.upload',     'POST', '/api/ingest-upload',      'Ingest via file upload', { tags: ['write'] }),
  _c('scaffold',          'POST', '/api/scaffold',           'Scaffold a new system from a spec', { tags: ['write', 'build'] }),
  _c('contracts.create',  'POST', '/api/contracts',          'Create an interaction contract', { tags: ['write'] }),
  _c('contracts.handoff', 'POST', '/api/contracts/:id/handoff', 'Hand off a contract', { tags: ['write'] }),
  _c('contracts.close',   'POST', '/api/contracts/:id/close',   'Close a contract', { tags: ['write'] }),

  // ── History ────────────────────────────────────────────────────────────
  _c('revisions.list',    'GET',  '/api/revisions',          'List registry revisions'),
  _c('revisions.get',     'GET',  '/api/revisions/:id',      'Read one revision'),
  _c('templates',         'GET',  '/api/templates',          'Available scaffold templates'),

  // ── Roadmap (LP3 — what each system is BECOMING, not just what it is) ───
  _c('phasemap',          'GET',  '/api/phasemap',           'Every phase across every phasemap, tagged by system + status'),
  _c('phasemap.system',   'GET',  '/api/phasemap/:system',   'One system\'s roadmap — done/pending phase breakdown', { tags: ['analysis'] }),

  // ── Gap field (2026-08-09 — where NEXUS is currently uncertain about itself) ─
  _c('gaps',               'GET', '/api/gaps',               'Every open gap, system + user-model domains, agnostic pipeline'),
  _c('gaps.domain',        'GET', '/api/gaps/:domain',       'Open gaps for one domain (system | user-model)', { tags: ['analysis'] }),

  // ── Friction + tension (2026-08-09 — live-proxied from the real diagnostic kernel) ─
  _c('friction',           'GET', '/api/friction',           'Per-system friction score, proxied live from the diagnostic kernel (:7825)', { tags: ['analysis'] }),
  _c('tension',            'GET', '/api/tension',            'Per-system tension (friction + gap accumulation), proxied live from the diagnostic kernel', { tags: ['analysis'] }),
];
