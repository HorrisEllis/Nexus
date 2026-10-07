'use strict';
/**
 * loom/maps/declare-map.js — §0.39.367: the one declare loop a hand map needs. Every map under loom/maps re-implemented
 * the same steps (a component per file, an export hook where something depends on it, an import hook where it depends
 * on something, a wire per edge); a new map passes its data here instead. Older maps are unchanged.
 * comp_id: nexus.loom.maps.declare-map
 *
 * declareMap(driver, { key, uuidTag, files: [[file, id, [depId…]]], consumers: [[consumerId, depId, why]] })
 *   files      — components this map owns (the scanner skips them: list them in loom/bootstrap.js's hand-mapped FILES)
 *   consumers  — edges from a component mapped elsewhere (scanned or another map) to a dependency: the edges a scanner
 *                cannot read (createRequire's _require, an await import(), HTTP from a page script)
 * -> { components, hooks, wires, failures }
 */
function declareMap(driver, { key, uuidTag, files = [], consumers = [] } = {}) {
  const out = { components: [], hooks: [], wires: [], failures: [] };
  const put = (kind, spec, bucket, label) => { const r = driver.declare(kind, spec); (r.ok ? out[bucket] : out.failures).push({ id: label || spec.id, r }); return r; };
  const hook = (id, dir) => put('hook', { id: `${id}.${dir === 'out' ? 'export' : 'import'}`, component_id: id, name: dir === 'out' ? 'export' : 'import', type: 'direct', direction: dir, uuid: `nexus-loom-map-${id}-${dir === 'out' ? 'export' : 'import'}-v1-0000-${uuidTag}` }, 'hooks');
  for (const [file, id] of files) put('component', { id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0', uuid: `nexus-loom-map-${id}-v1-0000-${uuidTag}` }, 'components');
  const own = new Set(files.map(f => f[1]));
  const depended = new Set([...files.flatMap(f => f[2] || []), ...consumers.map(c => c[1])]);
  for (const [, id, req = []] of files) { if (depended.has(id)) hook(id, 'out'); if (req.length) hook(id, 'in'); }
  let n = 0;
  const wire = (dep, to) => { n++; put('wire', { id: `${key}.wire.${n}.${dep}--${to}`, from_hook_id: `${dep}.export`, to_hook_id: `${to}.import`, uuid: `nexus-loom-map-${key}-wire-${n}-v1-0000-${uuidTag}`, external: !own.has(dep) }, 'wires', `${dep}->${to}`); };
  for (const [, id, req = []] of files) for (const dep of req) wire(dep, id);
  for (const [consumer, dep] of consumers) wire(dep, consumer);
  return out;
}

module.exports = { declareMap };
