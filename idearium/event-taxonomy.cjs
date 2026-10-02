'use strict';
// idearium/event-taxonomy.cjs — idearium's own event taxonomy, in lib/event-taxonomy-pattern.js's ET1 shape. (.cjs: idearium/ is "type": "module".)
// §0.39.302 — begun with the delivery checker (docs/2026-10-02-emerge-field-memory-build-phasemap.spec PR1, E14).
// §HONEST SCOPE — idearium already emits many events through getIdeaOS().emit(...) (idearium.repo.phase.run,
// idearium.repo.roadmap.updated, idearium.nexus-self.applied, …) that are NOT declared here yet: declaring every one
// of them, read from its real emit call, is EV0 of the same map. Until then this file holds what was added with it,
// and nothing is invented.

module.exports = Object.freeze({
  // ── idearium/api/index.js repo.deliver.check — idearium/repo/proof-run.js ─────────────────────────────────────
  IDEARIUM_PROOF_RUN_SETTLED: {
    description: 'A delivery check ran a repo\'s end-state conditions: how many were met, the verdict, the failure modes, and where the proof report was written.',
    payloadShape: ['repoUuid', 'verdict', 'met', 'total', 'modes', 'report'],
    severity: 'info',
  },
});

// Validated against the shared ET1 shape on load, as clear-glass's is — a malformed entry fails loudly here.
{
  const r = require('../lib/event-taxonomy-pattern.js').validateTaxonomy(module.exports);
  if (!r.ok) throw new Error(`[idearium/event-taxonomy] ${r.errors.join('; ')}`);
}
