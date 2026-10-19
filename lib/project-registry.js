'use strict';
/**
 * lib/project-registry.js — CR1 (0.60.164): the built project's component registry (the spine).
 * comp_id: nexus.lib.project-registry
 *
 * James, 2026-10-19: "the component registry is vital for each project becuase its the spine that makes components dumb."
 * · "ollama first … as long as local and free can handle it."
 *
 * The contract build path (cortex/core/raid/contract-adapters.js fromPhasePlan → bricks) never joined the component store,
 * so a contract-built project had NO registry/spine — looking-glass-bundle-v0.4 shipped with none (no component.json, no
 * graph). This wires every built file into the project's component store (lib/component-store.js put) with its RESOLVED
 * require edges — the same store the legacy chunk path already uses (reuse before build, §8.6). With the spine holding the
 * wiring, each component can stay dumb, so a small local model only has to write one simple component. Rule 3 (wire the
 * registry with real edges), applied to every BUILT project, not only to Nexus itself.
 *
 *   wireBuilt({ project, repoUuid, phase, files, read, agent }) -> { stored, created, resolved, unresolved, standalone }
 *     files: paths in DEPENDENCY ORDER (plan.order) so a dependency is in the store before its consumer and the edge
 *            resolves; read(path) -> the file's built content ('' / falsy to skip).
 *     standalone: built files with no dependency, nothing unresolved, and no sibling that depends on them, that are not an
 *            entry/config/constants leaf — a component the registry holds as an isolated dot (rule 3: a dot with no wire).
 *
 * §1.2 — one file's store failure never fails the build; it is skipped, counted, not thrown. Builders/wiring only.
 */
const CS = require('./component-store.js');

const MODULE_ID = 'nexus.lib.project-registry';
const VERSION = '1.0.0';

// a file that legitimately stands alone (an entry/config/constants/type leaf) — not an "isolated dot" defect
const _LEAF = /(?:^|\/)(index|main|app|config|constants|types|schema)\.[\w.]+$/i;

function wireBuilt({ project = null, repoUuid = null, phase = null, files = [], read = null, agent = null } = {}) {
  if (!project) throw new Error('project-registry.wireBuilt: project is required');
  if (typeof read !== 'function') throw new Error('project-registry.wireBuilt: read(path) is required');
  const order = Array.isArray(files) ? files : [];
  let stored = 0, created = 0, resolved = 0, unresolved = 0;
  const components = [];   // { path, id, deps:[id], unresolved:n }
  for (const f of order) {
    const fp = (typeof f === 'string') ? f : (f && f.path);
    if (!fp) continue;
    let content = ''; try { content = String(read(fp) || ''); } catch (_) { content = ''; }
    if (!content) continue;
    try {
      const r = CS.put({ project, path: fp, content,
        contract: { path: fp, layer: '', purpose: '' },
        builtBy: { repoUuid, phase, agent: agent || null, source: 'contract-build' } });
      stored++; if (r.created) created++;
      const deps = Object.keys(r.dependencies || {});
      resolved += deps.length; unresolved += (r.unresolved || []).length;
      components.push({ path: fp, id: r.id, deps, unresolved: (r.unresolved || []).length });
    } catch (_) { /* §1.2 — one file's store failure never fails the build */ }
  }
  // a component is wired when it requires something (a dependency) OR a sibling in this phase requires it (a consumer).
  const consumed = new Set();
  for (const c of components) for (const d of c.deps) consumed.add(d);
  const standalone = components
    .filter(c => c.deps.length === 0 && c.unresolved === 0 && !consumed.has(c.id) && !_LEAF.test(c.path))
    .map(c => c.path);
  return { stored, created, resolved, unresolved, standalone };
}

module.exports = { MODULE_ID, VERSION, wireBuilt };
