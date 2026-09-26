// idearium/spec-engine/manifest/registry.js
// UUID: nexus-idearium-manifest-registry-v1-0000-2026-0925-jamesbrooks-001
// Intent: emit the manifest and the component registry from a checked file
// list. Deterministic: same input, byte-identical output (no timestamps inside).

export function buildManifest(files, graph, source = null) {
  const byKey = new Map(files.map(f => [f.key, f]));
  const layerOf = new Map();
  graph.layers.forEach((ids, i) => ids.forEach(id => layerOf.set(id, i)));
  const buildIndex = new Map(graph.order.map((id, i) => [id, i]));
  const entries = graph.nodes.map(n => {
    const f = byKey.get(n.id);
    return { id: n.id, uuid: f.uuid, file: f.path, intent: f.intent,
      depends: n.depends, dependents: (graph.dependents.get(n.id) || []).slice().sort(), related: n.related,
      emits: f.emits, consumes: f.consumes,
      layer: layerOf.has(n.id) ? layerOf.get(n.id) : null, buildIndex: buildIndex.has(n.id) ? buildIndex.get(n.id) : null };
  }).sort((a, b) => (a.buildIndex ?? 1e9) - (b.buildIndex ?? 1e9) || a.id.localeCompare(b.id));
  return { manifestVersion: 1, source, count: entries.length,
    buildOrder: graph.order, layers: graph.layers, entries };
}

/** Component registry: id → where it lives and what it needs. Generated, never hand-edited. */
export function buildRegistry(manifest) {
  const components = {};
  for (const e of manifest.entries) components[e.id] = { file: e.file, uuid: e.uuid, intent: e.intent, depends: e.depends };
  return { registryVersion: 1, generatedFrom: 'manifest', count: manifest.count, components };
}

/** I5: a chunk's context is its own entry plus its direct neighbours' entries — nothing else. */
export function chunkContext(manifest, id) {
  const byId = new Map(manifest.entries.map(e => [e.id, e]));
  const self = byId.get(id) || manifest.entries.find(e => e.file === id || e.uuid === id);
  if (!self) return null;
  const brief = e => ({ id: e.id, file: e.file, intent: e.intent, emits: e.emits, consumes: e.consumes });
  return { self, neighbours: self.depends.map(d => brief(byId.get(d))) };
}
