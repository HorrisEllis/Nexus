/**
 * idearium/repo/architecture.js — a repo's own component registry and wiring map, in loom's shape.
 * §0.39.284 W7 · Map: docs/2026-09-30-idearium-coding-flow-phasemap.spec (W7_next_mapped_2026_09_30, item 2)
 * UUID: nexus-idearium-repo-architecture-v1-0000-2026-0930-jamesbrooks-001
 *
 * James: "the architect tab should be the component registry and loom style map for the wiring … identicle to what
 * nexus and loom has, a full map for wiring, ids, types, relation, consumers, orphans, node types, data dir, full
 * architecture map" · "anything from the lib folder we should use?"
 *
 * Reuse, not a second scanner (§8.6): the repo's code-intel index (lib/code-intel — built when the repo is chunked)
 * already holds every file, its language and lines, and every chunk's exports and resolved imports/uses with the file
 * they point at. This projects that into loom's registry vocabulary (loom/schema: component · hook · wire), with loom's
 * id rule (loom/scanners/source-map.js idFor: path → dotted id, index collapsed), so a repo's map reads like NEXUS's.
 *
 *   architecture(intel, { repoName }) -> { components, hooks, wires, externals, orphans, dataDirs, nodeTypes, layers, stats }
 *   A projection — it stores nothing; POST …/architecture writes it into the repo as ARCHITECTURE.json (versioned).
 */
import path from 'path';

const NODE_EXT = /\.(spec|chunk|inject|agent|hat|tool|command|capability|system|event|intent|response|node|filetree|architecture|gap|rule|step_gate|phasemap)$/i;
const DATA_DIR = /(^|\/)(data|store|stores|db|database|fixtures|seed|seeds|migrations|assets)(\/|$)/i;
const ENTRY = /(^|\/)(index|main|app|server|cli|bin\/[^/]+|boot|start)\.(m?js|cjs|ts|tsx|jsx|py)$/i;
const TEST = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$/i;

/** idFor — loom's rule (loom/scanners/source-map.js), under the repo's own namespace */
export function idFor(rel, ns = 'repo') {
  let p = String(rel).replace(/\\/g, '/').replace(/\.(m?js|cjs|ts|tsx|jsx|py|go|rs|java|rb)$/i, '').replace(/\/index$/, '');
  return `${ns}.${p.split('/').filter(Boolean).map(x => x.replace(/[^\w-]/g, '_')).join('.')}`;
}

/** layerOf — the same bottom-up layers the plan uses (idearium/repo/spec-plan.js LAYERS) */
export function layerOf(rel) {
  const p = String(rel).toLowerCase();
  if (TEST.test(p)) return 'test';
  if (/(^|\/)(ui|views?|pages?|components|public|web|frontend|client|styles?)\/|\.(css|html|vue|svelte|tsx|jsx)$/.test(p)) return 'ui';
  if (/(^|\/)(cli|bin|commands?)\/|(^|\/)cli\.[a-z]+$/.test(p)) return 'cli';
  if (/(^|\/)(api|routes?|server|handlers?|controllers?|http|rpc)\/|(^|\/)(server|routes?)\.[a-z]+$/.test(p)) return 'api';
  if (/(^|\/)(jobs?|workers?|schedul\w*|cron|loops?|daemons?|automation|pipelines?)\//.test(p)) return 'automation';
  if (/(^|\/)(types?|schemas?|models?|config|constants?|kernel|core|primitives?)\/|(^|\/)(types?|schema|config|constants?)\.[a-z]+$/.test(p)) return 'foundation';
  return 'library';
}
const LAYER_ORDER = ['foundation', 'library', 'api', 'cli', 'automation', 'ui', 'test'];

export function architecture(intel, { repoName = 'repo' } = {}) {
  if (!intel || intel.error) return { error: (intel && intel.error) || 'no code index' };
  const ns = String(repoName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'repo';
  const files = intel.files || [];
  const cards = Object.values(intel.cards || {});
  const byFile = new Map();
  for (const f of files) byFile.set(f.path, { file: f.path, id: idFor(f.path, ns), language: f.language || null, lines: f.lineCount || 0,
    layer: layerOf(f.path), type: NODE_EXT.test(f.path) ? 'node' : TEST.test(f.path) ? 'test' : /\.(json|ya?ml|toml|ini|env)$/i.test(f.path) ? 'config' : /\.(md|txt|rst)$/i.test(f.path) ? 'doc' : 'module',
    exports: [], imports: [], consumers: new Set(), deps: new Set(), entry: ENTRY.test(f.path) });
  const externals = new Map();
  for (const c of cards) {
    const me = byFile.get(c.file); if (!me) continue;
    if (c.exported && c.name) me.exports.push(c.name);
    for (const s of c.imports || []) {
      const spec = String(s);
      if (!/^[./]/.test(spec)) { const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]; if (!externals.has(pkg)) externals.set(pkg, new Set()); externals.get(pkg).add(c.file); }
    }
    for (const u of c.uses || []) {
      if (!u.file || u.file === c.file || u.basis !== 'import') continue;
      const dep = byFile.get(u.file); if (!dep) continue;
      me.deps.add(u.file); dep.consumers.add(c.file);
    }
  }
  const comps = [...byFile.values()].map(x => ({ ...x, exports: [...new Set(x.exports)].slice(0, 40), consumers: [...x.consumers].sort(), deps: [...x.deps].sort(), imports: undefined }));
  const hooks = [], wires = [];
  for (const c of comps) {
    if (c.consumers.length) hooks.push({ id: `${c.id}.export`, component_id: c.id, name: 'export', direction: 'out', type: 'direct' });
    if (c.deps.length) hooks.push({ id: `${c.id}.import`, component_id: c.id, name: 'import', direction: 'in', type: 'direct' });
  }
  let n = 0;
  for (const c of comps) for (const d of c.deps) { const dep = byFile.get(d); wires.push({ id: `${ns}.wire.${++n}.${dep.id}--${c.id}`, from_hook_id: `${dep.id}.export`, to_hook_id: `${c.id}.import`, from: dep.file, to: c.file, relation: 'requires' }); }
  // orphans: code nothing uses and that uses nothing — entry points, tests, docs and config are not orphans by nature
  const orphans = comps.filter(c => c.type === 'module' && !c.entry && !c.consumers.length && !c.deps.length).map(c => c.file);
  const dataDirs = [...new Set(files.map(f => f.path).filter(p => DATA_DIR.test(p)).map(p => { const m = p.match(DATA_DIR); return p.slice(0, m.index + m[0].replace(/\/$/, '').length); }))].sort();
  const nodeTypes = {}; for (const f of files) { const m = f.path.match(NODE_EXT); if (m) nodeTypes[m[1].toLowerCase()] = (nodeTypes[m[1].toLowerCase()] || 0) + 1; }
  const layers = {}; for (const c of comps) (layers[c.layer] = layers[c.layer] || []).push(c.file);
  // bottom-up breaches: a lower layer requiring a higher one (§3.1)
  const rank = (l) => LAYER_ORDER.indexOf(l);
  const breaches = wires.filter(w => { const a = byFile.get(w.to), b = byFile.get(w.from); return rank(a.layer) < rank(b.layer) && a.layer !== 'test' && b.layer !== 'test'; }).map(w => ({ consumer: w.to, dependency: w.from }));
  return {
    namespace: ns, components: comps.sort((a, b) => rank(a.layer) - rank(b.layer) || a.file.localeCompare(b.file)), hooks, wires,
    externals: [...externals.entries()].map(([name, used]) => ({ name, usedBy: [...used].sort() })).sort((a, b) => b.usedBy.length - a.usedBy.length),
    orphans, dataDirs, nodeTypes, layers, breaches,
    stats: { components: comps.length, hooks: hooks.length, wires: wires.length, externals: externals.size, orphans: orphans.length, breaches: breaches.length, lines: comps.reduce((s, c) => s + c.lines, 0) },
    layerOrder: LAYER_ORDER,
  };
}
