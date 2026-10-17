'use strict';
/**
 * diagnostic/registry-components.js — diagnostic's registry: the healer's capabilities first (0.60.136)
 * comp_id: nexus.diagnostic.registry
 * Same shape as architect/registry-components.js and idearium/registry-components.js.
 *
 * James, 2026-10-17: "diagnostic and nexus healer should be one system." Generated for nexus-healer by
 * loom/templates/system-scaffold.js (2026-07-14); moved here whole when the healer joined diagnostic. Its routes are served by
 * diagnostic's own server under /healer (diagnostic/nexus-diagnostic.js), on diagnostic's port. Diagnostic's other routes are
 * declared in diagnostic/interaction-contract.json; bringing them into this registry is DB16 (a registry per system).
 */
const V = '0.2.0'; const NS = 'diagnostic';
function _c(id, method, path, desc, opts = {}) {
  return {
    id: `${NS}.${id}`, namespace: NS, name: id, version: V,
    route: { method, path }, description: desc,
    params: opts.params || [], tags: [NS, ...(opts.tags || [])],
    permissions: opts.permissions || ['system'],
  };
}
module.exports = [
  _c('healer.propose', 'POST', '/healer/proposals', "Record a proposed self-improvement.", { params: ["text","causedBy"] }),
  _c('healer.list', 'GET', '/healer/proposals', "List all proposals and their current status.", { params: [] }),
  _c('healer.evaluate', 'POST', '/healer/proposals/:id/evaluate', "Generate a real patch via forge (RAID-routed) for the given targetFile, run against the isolated evaluation pipeline.", { params: ["id","targetFile"] }),
  _c('healer.merge', 'POST', '/healer/proposals/:id/merge', "Deliberate, explicit commit.", { params: ["id"] }),
  _c('healer.archive', 'POST', '/healer/proposals/:id/archive', "Mark a proposal as rejected.", { params: ["id"] }),
];

// §0.60.136 — diagnostic's own routes, declared once in its interaction contract, are its registry's too: read from the
// contract (never copied), so the registry is diagnostic's whole door. Without this, the healer's 5 rows would have been all
// lib/system-nodes.js saw, and diagnostic's 30 contract capabilities would have gone from its nodes.
const _contract = (() => { try { return require('./interaction-contract.json'); } catch (_) { return { routes: [] }; } })();
const _have = new Set(module.exports.map(r => `${r.route.method} ${r.route.path}`));
for (const r of _contract.routes || []) {
  if (!r || !r.path || _have.has(`${r.method} ${r.path}`)) continue;
  const id = r.path.replace(/^\//, '').replace(/[:/]+/g, '.').replace(/\.+$/, '') || 'root';
  module.exports.push(_c(`${String(r.method).toLowerCase()}.${id}`, r.method, r.path, r.description || '', { tags: ['contract'] }));
}

