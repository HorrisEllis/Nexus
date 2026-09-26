// idearium/spec-engine/manifest/graph.js
// UUID: nexus-idearium-manifest-graph-v1-0000-2026-0925-jamesbrooks-001
// Intent: resolve depends[] to real entries, then derive dependents, layers
// and a bottom-up order. Reports cycles and unresolved refs as data — the
// caller decides whether that is fatal. compiler-t0's _topoOrder uses order().

/** order(nodes) — nodes: [{ id, depends: [id] }] (all ids resolved).
 *  Kahn's algorithm, ties sorted for a reproducible order.
 *  → { order: [id], layers: [[id]], stuck: [id], dependents: Map } */
export function order(nodes) {
  const dependents = new Map(nodes.map(n => [n.id, []]));
  const remaining = new Map(nodes.map(n => [n.id, n.depends.length]));
  for (const n of nodes) for (const d of n.depends) if (dependents.has(d)) dependents.get(d).push(n.id);
  const out = [], layers = [];
  let frontier = nodes.filter(n => n.depends.length === 0).map(n => n.id);
  while (frontier.length) {
    frontier.sort();
    layers.push(frontier);
    const next = [];
    for (const id of frontier) {
      out.push(id);
      for (const dep of dependents.get(id)) {
        remaining.set(dep, remaining.get(dep) - 1);
        if (remaining.get(dep) === 0) next.push(dep);
      }
    }
    frontier = next;
  }
  const done = new Set(out);
  return { order: out, layers, stuck: nodes.map(n => n.id).filter(id => !done.has(id)), dependents };
}

/** cycles(nodes) — every distinct cycle among the stuck nodes, as id paths. */
export function cycles(nodes) {
  const adj = new Map(nodes.map(n => [n.id, n.depends]));
  const state = new Map(), found = [], seen = new Set();
  const visit = (id, stack) => {
    state.set(id, 1); stack.push(id);
    for (const d of adj.get(id) || []) {
      if (state.get(d) === 1) {
        const cyc = stack.slice(stack.indexOf(d));
        const sig = [...cyc].sort().join('|');
        if (!seen.has(sig)) { seen.add(sig); found.push([...cyc, d]); }
      } else if (!state.get(d)) visit(d, stack);
    }
    stack.pop(); state.set(id, 2);
  };
  for (const n of nodes) if (!state.get(n.id)) visit(n.id, []);
  return found;
}

/** resolve(files) — maps each depends/related ref (full uuid, uuid prefix, key
 *  or path) to an entry key. → { nodes, unresolved: [{from, ref, field}] } */
export function resolve(files) {
  const index = new Map();
  for (const f of files) {
    for (const k of [f.key, f.uuid, f.path, f.uuid && f.uuid.slice(0, 6)]) if (k && !index.has(k)) index.set(k, f.key);
  }
  const unresolved = [];
  const pick = (from, refs, field) => refs.map(r => {
    const hit = index.get(r);
    if (!hit) unresolved.push({ from, ref: r, field });
    return hit;
  }).filter(Boolean);
  const nodes = files.map(f => ({ id: f.key, depends: [...new Set(pick(f.key, f.depends, 'depends'))],
    related: [...new Set(pick(f.key, f.related, 'related'))] }));
  return { nodes, unresolved };
}
