'use strict';
/**
 * versionium/registry-components.js
 * comp_id: nexus.versionium.registry
 * uuid: nexus-versionium-registry-v1-0000-2026-0902-jamesbrooks-001
 */
const NS = 'versionium', V = '3.0.0';
function _c(id, method, path, desc, opts = {}) {
  return {
    id: `${NS}.${id}`, namespace: NS, name: id, version: V,
    grammar: opts.grammar || [NS + ' ' + id.replace(/\./g, ' ')],
    route: { method, path }, description: desc,
    params: opts.params || [], tags: [NS, ...(opts.tags || [])],
    permissions: opts.permissions || ['system'], hooks: opts.hooks || {},
  };
}
const components = [
  _c('commit.create', 'POST', '/api/versionium/commit', 'Real commit — manual or agent-mesh dispatched', {
    grammar: ['versionium commit', 'vc'], tags: ['commit'],
    hooks: {
      in: [{ id: 'versionium.commit.receive', intent: ['build', 'write', 'forge'], contract: 'nexus-interaction-contract-v1::versionium', tags: ['commit'] }],
      out: [{ id: 'versionium.commit.complete', wires_to: ['cortex.intelligence.pattern'], tags: ['result'] }],
    },
  }),
  _c('history.list', 'GET', '/api/versionium/history', 'Real commit history, optionally filtered by system', { grammar: ['versionium history', 'vh'] }),
  _c('restore.read', 'GET', '/api/versionium/restore/:commitId', 'Real temporal replay — read-only', { grammar: ['versionium restore'] }),
  _c('state.read', 'GET', '/api/versionium/state/:commitId', 'Direct-restore read of a commit\'s stored state', { grammar: ['versionium state'] }),
  _c('calendar.read', 'GET', '/api/versionium/calendar/:date', 'Real calendar playback for a given date', { grammar: ['versionium calendar'] }),
  // §MCO-B 2026-09-20 — the per-file layer (versionium/spec/versionium.file-versioning.spec).
  // The phasemap's file.snapshot / file.delta capabilities are one route here:
  // record() decides full copy vs delta per file (and proves any delta), so a
  // caller never has to know which one it got.
  _c('files.limits', 'GET', '/api/versionium/files/limits', 'Per-file size cap, per-record cap and keyframe interval', { grammar: ['versionium files limits'], tags: ['files'] }),
  _c('files.plan', 'POST', '/api/versionium/files/plan', 'Which file contents versionium needs for a repo tree, and which paths were deleted', { grammar: ['versionium files plan'], tags: ['files'] }),
  _c('files.record', 'POST', '/api/versionium/files/record', 'Attach a repo tree\'s files (full copy or proven delta) to an existing repo-snapshot commit', { grammar: ['versionium files record'], tags: ['files'] }),
  _c('files.tree', 'GET', '/api/versionium/files/tree', 'Files (path, sha256, bytes) and tree hash as of a commit', { grammar: ['versionium files tree'], tags: ['files'] }),
  _c('files.content', 'GET', '/api/versionium/files/content', 'One file\'s exact bytes as of a commit, every chain step verified', { grammar: ['versionium files content'], tags: ['files'] }),
  _c('health', 'GET', '/health', 'Versionium health', { grammar: ['versionium health'] }),
];
module.exports = {
  systemId: NS, version: V, port: 3754,
  label: 'VERSIONIUM', purpose: 'Sovereign causal version control — commit/restore/calendar/state, real per-system history.',
  components,
  events: {
    emits: ['versionium.committed', 'versionium.restore.requested', 'versionium.restore.failed', 'versionium.state.requested', 'versionium.autocommit.triggered'],
    handles: ['orchestrator.shutdown'],
  },
};
